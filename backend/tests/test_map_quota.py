"""Corte do MapTiler pelo consumo informado pelo maptiler-usage-monitor (sem rede: o httpx é simulado)."""
import asyncio
import datetime as dt

import httpx
import pytest

import map_quota
import server
from map_quota import MAX_AGE_S, REFRESH_S, QuotaGuard, over_cutoff

T0 = dt.datetime(2026, 11, 16, 12, 0, tzinfo=dt.timezone.utc)


def usage(requests=50.0, sessions=10.0, status="ok"):
    return {"status": status, "requests": {"used": 1, "quota": 2, "percent": requests},
            "sessions": {"used": 1, "quota": 2, "percent": sessions}}


class Clock:
    def __init__(self):
        self.now = T0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += dt.timedelta(seconds=seconds)


class FakeColl:
    """O mínimo de uma coleção do Motor que o QuotaGuard usa."""

    def __init__(self, doc=None):
        self.doc = doc

    async def find_one(self, _filter):
        return self.doc

    async def replace_one(self, _filter, doc, upsert):
        self.doc = {"_id": map_quota.STATE_ID, **doc}


@pytest.fixture
def monitor(monkeypatch):
    """Simula o monitor: `responses` é a fila do que ele devolve (dict = JSON 200, int = status de erro)."""
    state = {"responses": [], "calls": []}

    def handler(request):
        state["calls"].append(request)
        item = state["responses"].pop(0)
        if isinstance(item, Exception):
            raise item
        if isinstance(item, int):
            return httpx.Response(item, json={"detail": "erro"})
        return httpx.Response(200, json=item)

    real_client = httpx.AsyncClient

    def fake_client(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(map_quota.httpx, "AsyncClient", fake_client)
    return state


def guard(clock, coll=None, cutoff=99.0):
    g = QuotaGuard("https://monitor.test/", "mum_chave", cutoff, clock=clock)
    g.coll = coll
    return g


# ----------------------------- Regra dos 99% -----------------------------
@pytest.mark.parametrize("data, expected", [
    (usage(98.9, 50), False),
    (usage(99.0, 50), True),
    (usage(50, 99.5), True),  # sessions também conta
    (usage(100.0, 0), True),
    (usage(99.5, 0, status="stale"), False),  # dado antigo ou de período encerrado: fica no MapTiler
    ({"status": "unavailable", "requests": None, "sessions": None}, False),
    ({"status": "ok"}, False),
    ({"status": "ok", "requests": {"percent": "99"}}, False),
    ({"status": "ok", "requests": {"percent": True}}, False),
    ([], False),
])
def test_over_cutoff(data, expected):
    assert over_cutoff(data, 99.0) is expected


# ----------------------------- Consulta ao monitor -----------------------------
def test_refresh_switches_to_osm_at_cutoff_and_sends_key(monitor):
    clock = Clock()
    g = guard(clock)
    monitor["responses"] = [usage(99.2)]
    asyncio.run(g.refresh())
    req = monitor["calls"][0]
    assert str(req.url) == "https://monitor.test/v1/usage"
    assert req.headers["authorization"] == "Bearer mum_chave"
    assert g.over is True


def test_refresh_at_most_every_6_hours(monitor):
    clock = Clock()
    g = guard(clock)
    monitor["responses"] = [usage(10), usage(99.9)]
    asyncio.run(g.refresh())
    clock.advance(REFRESH_S - 1)
    asyncio.run(g.refresh())
    assert len(monitor["calls"]) == 1 and g.over is False
    clock.advance(1)
    asyncio.run(g.refresh())
    assert len(monitor["calls"]) == 2 and g.over is True


def test_failure_keeps_previous_decision_then_expires(monitor):
    clock = Clock()
    g = guard(clock)

    async def decision_after(seconds):
        clock.advance(seconds)
        await g.refresh()
        return g.use_osm()

    async def scenario():
        await g.refresh()
        assert g.use_osm() is True
        assert await decision_after(REFRESH_S) is True  # monitor fora do ar: mantém a decisão recente
        assert await decision_after(MAX_AGE_S - REFRESH_S) is False  # sem dado confiável há muito: MapTiler

    monitor["responses"] = [usage(99.5), 503, httpx.ConnectTimeout("lento")]
    asyncio.run(scenario())


def test_recovers_after_period_renews(monitor):
    clock = Clock()
    g = guard(clock)
    monitor["responses"] = [usage(99.5), usage(0.3)]
    asyncio.run(g.refresh())
    assert g.over is True
    clock.advance(REFRESH_S)
    asyncio.run(g.refresh())
    assert g.over is False


def test_not_configured_never_calls_monitor(monitor):
    g = QuotaGuard("", "", 99.0)
    asyncio.run(g.refresh())
    assert g.use_osm() is False and monitor["calls"] == []


# ----------------------------- Decisão guardada no MongoDB -----------------------------
def test_saved_recent_decision_avoids_waking_the_monitor(monitor):
    clock = Clock()
    coll = FakeColl({"_id": "maptiler", "attempted_at": (T0 - dt.timedelta(hours=1)).replace(tzinfo=None),
                     "succeeded_at": (T0 - dt.timedelta(hours=1)).replace(tzinfo=None), "over": True})
    g = guard(clock, coll)
    asyncio.run(g.refresh())
    assert monitor["calls"] == [] and g.over is True


def test_decision_is_saved(monitor):
    clock = Clock()
    coll = FakeColl()
    g = guard(clock, coll)
    monitor["responses"] = [usage(99.1)]
    asyncio.run(g.refresh())
    assert coll.doc["over"] is True and coll.doc["succeeded_at"] == T0 and coll.doc["attempted_at"] == T0


def test_database_failure_does_not_break(monitor):
    class Broken:
        async def find_one(self, _filter):
            raise RuntimeError("fora do ar")

        async def replace_one(self, *_args, **_kwargs):
            raise RuntimeError("fora do ar")

    g = guard(Clock(), Broken())
    monitor["responses"] = [usage(99.9)]
    asyncio.run(g.refresh())
    assert g.over is True


# ----------------------------- /api/config -----------------------------
@pytest.fixture
def config_client(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(server, "MAPTILER_KEY", "chave-do-mapa")
    with TestClient(server.app) as c:
        yield c


def test_config_switches_to_osm_when_over_cutoff(config_client, monkeypatch):
    monkeypatch.setattr(server.MAP_QUOTA, "use_osm", lambda: True)
    assert config_client.get("/api/config").json()["map"]["provider"] == "osm"
    assert config_client.get("/api/config").json()["map"]["maptiler_key"] is None


def test_config_keeps_maptiler_below_cutoff(config_client, monkeypatch):
    monkeypatch.setattr(server.MAP_QUOTA, "use_osm", lambda: False)
    m = config_client.get("/api/config").json()["map"]
    assert m["provider"] == "maptiler" and m["maptiler_key"] == "chave-do-mapa"


def test_use_osm_never_waits_and_refreshes_in_background(monitor):
    clock = Clock()
    g = guard(clock)

    async def scenario():
        assert g.use_osm() is False  # primeira chamada: responde na hora, a consulta corre em segundo plano
        await g._task
        assert g.use_osm() is True
        assert len(monitor["calls"]) == 1  # decisão recente: nenhuma consulta nova

    monitor["responses"] = [usage(99.0)]
    asyncio.run(scenario())
