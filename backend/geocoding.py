"""Localização pelo endereço (alternativa à posição oficial): ArcGIS → Photon → Nominatim.

Os resultados ficam em cache na memória. Se houver MONGO_URL, os do Photon e do Nominatim (dados abertos do
OpenStreetMap) também vão para o MongoDB. Os do ArcGIS World ficam só na memória: os termos dele não
permitem guardar resultados sem conta paga.
"""
import asyncio
import difflib
import re
from contextlib import suppress
from typing import Dict, List, Optional, Tuple

import httpx

from cb_sp import fold
from config import ARCGIS_URL, DEFAULT_STATE, NOMINATIM_URL, PHOTON_URL, USER_AGENT, logger


PERSISTABLE_PROVIDERS = {"photon", "nominatim"}  # dados do OpenStreetMap (ODbL): podem ser guardados


class GeoCache:
    """Coordenadas por endereço: memória do processo + MongoDB opcional (sobrevive a reinícios)."""

    def __init__(self):
        self.mem: Dict[str, dict] = {}
        self.coll = None
        self.client = None

    def connect(self, mongo_url: Optional[str], db_name: str) -> None:
        if not mongo_url:
            logger.info("MONGO_URL não definida: cache de coordenadas só em memória")
            return
        from motor.motor_asyncio import AsyncIOMotorClient
        self.client = AsyncIOMotorClient(mongo_url)
        self.coll = self.client[db_name]["geocache"]

    async def ensure_index(self) -> None:
        if self.coll is None:
            return
        try:
            await self.coll.create_index("key", name="key_unique", unique=True)
        except Exception as exc:
            logger.error("geocache index: %s", exc)

    async def get(self, key: str) -> Optional[dict]:
        if key in self.mem:
            return self.mem[key]
        if self.coll is None:
            return None
        try:
            # Só registros com origem conhecida e que podem ser guardados (ignora os antigos, sem "provider").
            doc = await self.coll.find_one({"key": key, "provider": {"$in": sorted(PERSISTABLE_PROVIDERS)}},
                                           {"_id": 0, "lat": 1, "lon": 1})
        except Exception as exc:
            logger.warning("geocache read failed: %s", exc)
            return None
        if doc:
            self.mem[key] = {"lat": doc["lat"], "lon": doc["lon"]}
            return self.mem[key]
        return None

    async def set(self, key: str, coords: dict) -> None:
        self.mem[key] = {"lat": coords["lat"], "lon": coords["lon"]}
        provider = coords.get("provider")
        if self.coll is None or provider not in PERSISTABLE_PROVIDERS:
            return
        try:
            doc = {"key": key, **self.mem[key], "provider": provider}
            await self.coll.update_one({"key": key}, {"$set": doc}, upsert=True)
        except Exception as exc:  # inclui DuplicateKeyError de upserts concorrentes
            logger.warning("geocache write failed: %s", exc)

    def close(self) -> None:
        if self.client is not None:
            self.client.close()


GEOCACHE = GeoCache()
GEO_FAILED: set = set()
GEO_INFLIGHT: set = set()
_NOMINATIM_LOCK: Optional[asyncio.Lock] = None


def nominatim_lock() -> asyncio.Lock:
    global _NOMINATIM_LOCK
    if _NOMINATIM_LOCK is None:  # criado dentro do event loop
        _NOMINATIM_LOCK = asyncio.Lock()
    return _NOMINATIM_LOCK


def geo_key(address: str, municipality: str) -> str:
    # Mesmo formato de chave da versão anterior, para reaproveitar o cache já existente no MongoDB.
    return f"{fold(address.strip())}|{fold(municipality)}"


SPLIT_RE = re.compile(
    r"\s+(?:PR[OÓ]X(?:IMO)?\.?\s+(?:DA|DO|A|AO|AOS|DOS|DAS)?\s*(?:ESQUINA\s+(?:COM|DA|DO)\s+)?"
    r"|ESQUINA\s+(?:COM|DA|DO)?\s*|NO\s+FINAL\s+DA\s+|DEFRONTE\s+(?:A|AO|COM)?\s*|E[MN]\s?FRENTE\s+(?:A|AO)?\s*"
    r"|ENTRE\s+(?:A|O)?\s*|E\s+(?:A|O)\s+)",
    re.IGNORECASE,
)


def address_candidates(address: str) -> List[str]:
    parts = [p.strip() for p in SPLIT_RE.split(address) if p and p.strip()]
    cleaned = []
    for p in parts:
        p = re.sub(r"^(A|O)\s+", "", p, flags=re.IGNORECASE)
        p = re.sub(r"^AV\.?\s+", "AVENIDA ", p, flags=re.IGNORECASE)
        p = re.sub(r"\s+\d+\b.*$", "", p)  # remove número e observações finais
        p = re.sub(r"\s+", " ", p).strip(" ,.")
        if len(p) > 4 and p.upper() not in ("RUA", "PRACA", "PRAÇA"):
            cleaned.append(p)
    return cleaned or [address]


async def arcgis_query(hc: httpx.AsyncClient, single_line: str) -> Optional[dict]:
    params = {"SingleLine": single_line, "f": "json", "maxLocations": 1, "countryCode": "BRA"}
    try:
        r = await hc.get(ARCGIS_URL, params=params)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    cands = r.json().get("candidates", [])
    if cands and cands[0].get("score", 0) >= 80:
        loc = cands[0]["location"]
        return {"lat": loc["y"], "lon": loc["x"]}
    return None


async def photon_query(hc: httpx.AsyncClient, street: str, municipality: str) -> Optional[dict]:
    params = {"q": f"{street}, {municipality}", "limit": 5, "lat": -23.55, "lon": -46.63}
    try:
        r = await hc.get(PHOTON_URL, params=params)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    feats = [f for f in r.json().get("features", []) if f.get("properties", {}).get("countrycode") == "BR"]
    city = fold(municipality)
    match = next((f for f in feats if fold(f["properties"].get("city", "")) == city), None)
    if not match:
        return None
    lon, lat = match["geometry"]["coordinates"]
    score = difflib.SequenceMatcher(None, fold(street), fold(match["properties"].get("name", ""))).ratio()
    return {"lat": lat, "lon": lon, "score": score}


async def nominatim_query(hc: httpx.AsyncClient, q: str) -> Optional[dict]:
    params = {"q": q, "format": "json", "limit": 1, "countrycodes": "br"}
    async with nominatim_lock():
        try:
            r = await hc.get(NOMINATIM_URL, params=params)
        except httpx.HTTPError:
            return None
        finally:
            await asyncio.sleep(1.1)  # política do Nominatim: no máximo 1 req/s
    if r.status_code != 200:
        return None
    data = r.json()
    return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"])} if data else None


async def geocode_remote(address: str, municipality: str) -> Optional[dict]:
    """ArcGIS (aceita cruzamentos "X & Y") → Photon → Nominatim."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Language": "pt-BR,pt;q=0.9"}
    candidates = address_candidates(address)
    try:
        async with httpx.AsyncClient(timeout=20.0, headers=headers, follow_redirects=True) as hc:
            arc_queries = ([" & ".join(candidates[:2])] if len(candidates) >= 2 else []) + candidates
            for q in arc_queries:
                res = await arcgis_query(hc, f"{q}, {municipality}, {DEFAULT_STATE}")
                if res:
                    return {**res, "provider": "arcgis"}
            found = [r for r in [await photon_query(hc, c, municipality) for c in candidates] if r]
            if found:
                best = next((r for r in found if r["score"] >= 0.85), max(found, key=lambda r: r["score"]))
                return {"lat": best["lat"], "lon": best["lon"], "provider": "photon"}
            for c in candidates:
                res = await nominatim_query(hc, f"{c}, {municipality}, {DEFAULT_STATE}, Brasil")
                if res:
                    return {**res, "provider": "nominatim"}
    except Exception as exc:
        logger.warning("geocode failed for %s: %s", address, exc)
    return None


class GeocodeWorker:
    """Uma fila única processada em segundo plano, um endereço por vez."""

    def __init__(self):
        self.queue: Optional[asyncio.Queue] = None
        self.task: Optional[asyncio.Task] = None

    def start(self) -> None:
        self.queue = asyncio.Queue()
        self.task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task

    def enqueue(self, key: str, address: str, municipality: str) -> None:
        if self.queue is None or key in GEO_INFLIGHT or key in GEO_FAILED:
            return
        GEO_INFLIGHT.add(key)
        self.queue.put_nowait((key, address, municipality))

    async def _run(self) -> None:
        while True:
            key, address, municipality = await self.queue.get()
            try:
                coords = await geocode_remote(address, municipality)
                if coords:
                    await GEOCACHE.set(key, coords)
                else:
                    GEO_FAILED.add(key)
            except Exception as exc:
                logger.warning("geocode worker error for %s: %s", address, exc)
                GEO_FAILED.add(key)
            finally:
                GEO_INFLIGHT.discard(key)
                self.queue.task_done()


GEOCODER = GeocodeWorker()


async def attach_coords(hydrants: List[dict], official: Optional[Dict[str, dict]] = None) -> Tuple[List[dict], dict]:
    """Usa a posição oficial do CB SP; sem ela, o cache de endereços; e enfileira o que ainda falta."""
    official = official or {}
    out = []
    counts = {"total": len(hydrants), "geocoded": 0, "pending": 0, "failed": 0, "official": 0}
    for h in hydrants:
        coords = official.get(h["code"])
        source = "oficial" if coords else None
        state = "ok" if coords else None
        if not coords:
            key = geo_key(h["address"], h["municipality"])
            coords = await GEOCACHE.get(key)
            if coords:
                state, source = "ok", "endereco"
            elif key in GEO_FAILED:
                state = "failed"
            else:
                state = "pending"
                GEOCODER.enqueue(key, h["address"], h["municipality"])
        counts["geocoded" if state == "ok" else state] += 1
        counts["official"] += source == "oficial"
        out.append({**h, "lat": coords["lat"] if coords else None, "lon": coords["lon"] if coords else None,
                    "geocoded": bool(coords), "geocode_state": state, "location_source": source})
    return out, counts
