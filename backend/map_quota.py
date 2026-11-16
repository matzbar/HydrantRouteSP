"""Corte do MapTiler perto do fim da cota, pelo maptiler-usage-monitor.

Quando o monitor informa que a conta do MapTiler chegou a MAPTILER_CUTOFF_PERCENT (padrão 99%) de requests ou de
sessions, o /api/config passa a indicar o OpenStreetMap. Na dúvida (monitor fora do ar, sem dado recente, dado de
um período já encerrado), fica no MapTiler: o OpenStreetMap não é para uso em produção, e a troca do frontend
quando o MapTiler recusa a chave continua valendo como última proteção.

Cada consulta acorda o monitor (plano gratuito do Render, horas somadas entre os serviços). Por isso ela acontece
no máximo a cada REFRESH_S, em segundo plano (o /api/config nunca espera o monitor acordar), e o resultado fica
guardado no MongoDB, quando houver: o HydrantRouteSP também dorme, e sem isso cada vez que ele acorda faria uma
consulta nova.
"""
import asyncio
import datetime as dt
from contextlib import suppress
from typing import Callable, Optional

import httpx

from config import USER_AGENT, logger

REFRESH_S = 6 * 60 * 60  # o monitor só atualiza o número algumas vezes por dia
# Sem consulta bem-sucedida por mais que isso, a decisão anterior perde a validade e o mapa volta ao MapTiler.
MAX_AGE_S = 2 * REFRESH_S
TIMEOUT_S = 90.0  # o monitor dormindo leva cerca de 1 minuto para acordar
STATE_ID = "maptiler"


def over_cutoff(usage: object, cutoff: float) -> bool:
    """True só com dado atual do monitor (status ok) e requests ou sessions em `cutoff`% ou mais."""
    if not isinstance(usage, dict) or usage.get("status") != "ok":
        return False
    for metric in (usage.get("requests"), usage.get("sessions")):
        percent = metric.get("percent") if isinstance(metric, dict) else None
        if isinstance(percent, (int, float)) and not isinstance(percent, bool) and percent >= cutoff:
            return True
    return False


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _aware(value: Optional[dt.datetime]) -> Optional[dt.datetime]:
    """O MongoDB devolve datas sem fuso (em UTC)."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value


class QuotaGuard:
    def __init__(self, monitor_url: str, client_key: str, cutoff: float,
                 clock: Callable[[], dt.datetime] = _utcnow):
        self.url = f"{monitor_url.rstrip('/')}/v1/usage" if monitor_url else ""
        self.key = client_key
        self.cutoff = cutoff
        self.clock = clock
        self.coll = None  # coleção do MongoDB onde a decisão fica guardada (opcional)
        self.attempted_at: Optional[dt.datetime] = None  # última consulta, com ou sem sucesso
        self.succeeded_at: Optional[dt.datetime] = None  # última consulta bem-sucedida
        self.over = False
        self._task: Optional[asyncio.Task] = None
        self._loaded = False

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def use_osm(self) -> bool:
        """Decisão para o /api/config, sem esperar nada. Agenda uma consulta se a última for antiga."""
        if not self.configured:
            return False
        self.refresh_in_background()
        now = self.clock()
        return self.over and self.succeeded_at is not None and (now - self.succeeded_at).total_seconds() < MAX_AGE_S

    def refresh_in_background(self) -> None:
        if self.configured and (self._task is None or self._task.done()):
            if self._loaded and not self._due():
                return
            self._task = asyncio.get_running_loop().create_task(self.refresh())

    def _due(self) -> bool:
        return self.attempted_at is None or (self.clock() - self.attempted_at).total_seconds() >= REFRESH_S

    async def refresh(self) -> None:
        """Lê a decisão guardada e, se ela for antiga, consulta o monitor. Nunca levanta exceção."""
        if not self.configured:
            return
        if not self._loaded:
            await self._load()
            self._loaded = True
        if not self._due():
            return
        self.attempted_at = self.clock()
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_S, headers={"User-Agent": USER_AGENT}) as hc:
                r = await hc.get(self.url, headers={"Authorization": f"Bearer {self.key}"})
                r.raise_for_status()
                usage = r.json()
        except Exception as exc:  # erro sem a chave: só o tipo ou o status
            detail = f"HTTP {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
            logger.warning("monitor do MapTiler indisponível (%s): o mapa segue a decisão anterior", detail)
        else:
            over = over_cutoff(usage, self.cutoff)
            if over != self.over:
                logger.warning("consumo do MapTiler %s %s%%: mapa de fundo passa a ser o %s",
                               "chegou a" if over else "abaixo de", self.cutoff,
                               "OpenStreetMap" if over else "MapTiler")
            self.over, self.succeeded_at = over, self.attempted_at
        await self._save()

    async def _load(self) -> None:
        if self.coll is None:
            return
        try:
            doc = await self.coll.find_one({"_id": STATE_ID})
        except Exception as exc:
            logger.warning("map_quota read failed: %s", type(exc).__name__)
            return
        if doc:
            self.attempted_at = _aware(doc.get("attempted_at"))
            self.succeeded_at = _aware(doc.get("succeeded_at"))
            self.over = bool(doc.get("over"))

    async def _save(self) -> None:
        if self.coll is None:
            return
        try:
            await self.coll.replace_one(
                {"_id": STATE_ID},
                {"attempted_at": self.attempted_at, "succeeded_at": self.succeeded_at, "over": self.over},
                upsert=True)
        except Exception as exc:
            logger.warning("map_quota write failed: %s", type(exc).__name__)

    async def stop(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
