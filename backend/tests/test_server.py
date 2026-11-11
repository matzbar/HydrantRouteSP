"""Testes unitários: não acessam a rede nem banco (páginas do CB SP salvas em tests/fixtures)."""
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import server

FIXTURES = Path(__file__).parent / "fixtures"
INDEX_HTML = (FIXTURES / "stations_index.html").read_text(encoding="utf-8-sig")
VILA_FORMOSA_HTML = (FIXTURES / "station_701031102.html").read_text(encoding="utf-8-sig")
SEM_PENDENTES_HTML = (FIXTURES / "station_701011201_sem_pendentes.html").read_text(encoding="utf-8-sig")


# ----------------------------- Parsing -----------------------------
def test_parse_station_index():
    stations = server.parse_station_index(INDEX_HTML)
    assert len(stations) == 264
    vf = next(s for s in stations if s["code"] == "701031102")
    assert vf == {"code": "701031102", "name": "SP - VILA FORMOSA", "cmd": "CBM", "gb": "03", "sgb": "1",
                  "gb_sgb": "03.1", "percent_done": vf["percent_done"]}
    assert {s["cmd"] for s in stations} == {"CBM", "CBI-1", "CBI-2", "CBI-3"}
    assert all(s["gb"].isdigit() and s["sgb"] for s in stations)


def test_parse_station_index_rejects_unknown_layout():
    with pytest.raises(HTTPException) as exc:
        server.parse_station_index("<html><body><table><tr><td>x</td></tr></table></body></html>")
    assert exc.value.status_code == 502


def test_parse_station_page_pending_table():
    page = server.parse_station_page(VILA_FORMOSA_HTML, "https://example.test/07estacao/701031102.html")
    assert page["cycle"] == "2026 2º SEM"
    hs = page["hydrants"]
    assert len(hs) == 36
    assert len({h["code"] for h in hs}) == 36
    assert {h["status"] for h in hs} <= {"possivel_de_uso", "inoperante", "nao_localizado"}
    assert {h["type"] for h in hs} == {"subterraneo", "coluna"}
    h = hs[0]
    assert h["id"] == h["code"]
    assert h["municipality"] == "São Paulo"
    assert h["last_inspection"] is None or len(h["last_inspection"]) == 10
    assert h["maintenance"] is None  # "None" na página vira null
    assert h["url"].startswith("https://cbaplang.corpodebombeiros.sp.gov.br/hidrantes/03individual/")


def test_parse_station_page_without_pending_table():
    page = server.parse_station_page(SEM_PENDENTES_HTML)
    assert page == {"cycle": "2026 2º SEM", "hydrants": []}


def test_parse_station_page_unknown_layout():
    with pytest.raises(HTTPException) as exc:
        server.parse_station_page("<html><body><p>Manutenção</p></body></html>")
    assert exc.value.status_code == 502


@pytest.mark.parametrize("raw,expected", [
    ("POSSIVEL DE USO", "possivel_de_uso"), ("INOPERANTE", "inoperante"),
    ("NÃO LOCALIZADO", "nao_localizado"), ("SEM VISTORIA", "sem_vistoria"), ("???", "outro"),
])
def test_norm_status(raw, expected):
    assert server.norm_status(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("SUBTERRANEO", "subterraneo"), ("SUBTERRÂNEO", "subterraneo"), ("COLUNA", "coluna"), ("BICA", "bica"),
    ("", "outro"),
])
def test_norm_type(raw, expected):
    assert server.norm_type(raw) == expected


# ----------------------------- Routing helpers -----------------------------
def test_nearest_neighbor_order_and_limit():
    pts = [(0.0, 3.0), (0.0, 1.0), (0.0, 2.0)]
    assert server.nearest_neighbor_order((0.0, 0.0), pts) == [1, 2, 0]
    assert server.nearest_neighbor_order((0.0, 0.0), pts, limit=2) == [1, 2]


def test_google_maps_url():
    url = server.build_google_maps_url((1.0, 2.0), [(3.0, 4.0), (5.0, 6.0)])
    assert "origin=1.0%2C2.0" in url and "destination=5.0%2C6.0" in url and "waypoints=3.0%2C4.0" in url
    assert server.build_google_maps_url((1.0, 2.0), []) == ""


# ----------------------------- API -----------------------------
@pytest.fixture
def client(monkeypatch):
    pages = {
        server.CB_INDEX_URL: INDEX_HTML,
        server.CB_INDEX_URL + "701031102.html": VILA_FORMOSA_HTML,
        server.CB_INDEX_URL + "701011201.html": SEM_PENDENTES_HTML,
    }
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        if url not in pages:
            raise HTTPException(502, "indisponível")
        return pages[url]

    async def fake_geocode(address, municipality):
        if "ESQUINA" in address:
            return None  # simula endereços não localizados
        return {"lat": -23.55 - len(address) / 10000, "lon": -46.55 + len(address) / 10000}

    async def no_osrm(coords):
        return None

    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(server, "fetch_html", fake_fetch)
    monkeypatch.setattr(server, "geocode_remote", fake_geocode)
    monkeypatch.setattr(server, "osrm_route", no_osrm)
    server.INDEX_CACHE.clear()
    server.STATION_CACHE.clear()
    server.GEOCACHE.mem.clear()
    server.GEO_FAILED.clear()
    server.GEO_INFLIGHT.clear()
    with TestClient(server.app) as c:
        c.fetch_calls = calls
        yield c


def _wait_geocoding(client, code="701031102"):
    import time
    for _ in range(100):
        d = client.get(f"/api/stations/{code}/hydrants").json()
        if d["geocode"]["pending"] == 0:
            return d
        time.sleep(0.02)
    raise AssertionError("geocoding did not finish")


def test_api_stations(client):
    r = client.get("/api/stations")
    assert r.status_code == 200
    assert any(s["code"] == "701031102" for s in r.json())


def test_api_station_hydrants_and_background_geocoding(client):
    r = client.get("/api/stations/701031102/hydrants")
    assert r.status_code == 200
    d = r.json()
    assert d["station"]["name"] == "SP - VILA FORMOSA"
    assert d["station"]["cmd"] == "CBM" and d["station"]["gb_sgb"] == "03.1"
    assert d["cycle"] == "2026 2º SEM"
    assert d["geocode"]["total"] == 36
    d = _wait_geocoding(client)
    g = d["geocode"]
    assert g["geocoded"] > 0 and g["failed"] > 0 and g["geocoded"] + g["failed"] == 36
    ok = [h for h in d["hydrants"] if h["geocoded"]]
    assert all(h["lat"] is not None and h["geocode_state"] == "ok" for h in ok)
    # a página da estação fica em cache: a tela consulta várias vezes sem bater no site do CB SP
    assert client.fetch_calls.count(server.CB_INDEX_URL + "701031102.html") == 1


def test_api_geocode_retry(client):
    _wait_geocoding(client)
    r = client.post("/api/stations/701031102/geocode-retry")
    assert r.status_code == 200
    assert r.json()["geocode"]["failed"] == 0  # falhas voltam para a fila


def test_api_station_without_pending(client):
    d = client.get("/api/stations/701011201/hydrants").json()
    assert d["hydrants"] == [] and d["geocode"]["total"] == 0


@pytest.mark.parametrize("code", ["123", "70103110a", "..%2Findex"])
def test_api_rejects_invalid_station_code(client, code):
    assert client.get(f"/api/stations/{code}/hydrants").status_code in (404, 422)


def test_api_station_source_down(client):
    assert client.get("/api/stations/999999999/hydrants").status_code == 502


POINTS = [{"id": str(i), "lat": -23.5 - i / 100, "lon": -46.6} for i in range(25)]
ORIGIN = {"origin_lat": -23.49, "origin_lon": -46.6}


@pytest.mark.parametrize("n", [1, 5, 10, 11, 25])
def test_route_n_stops(client, n):
    r = client.post("/api/route/optimize", json={**ORIGIN, "points": POINTS, "max_stops": n})
    assert r.status_code == 200, r.text
    d = r.json()
    assert [s["order"] for s in d["stops"]] == list(range(1, n + 1))
    assert [s["id"] for s in d["stops"]] == [str(i) for i in range(n)]
    assert len(d["google_maps_segments"]) == -(-n // 10)
    assert d["google_maps_url"] == d["google_maps_segments"][0]
    assert d["total_distance_km"] > 0


def test_route_with_first_stop_keeps_gps_origin(client):
    r = client.post("/api/route/optimize", json={**ORIGIN, "points": POINTS, "max_stops": 3, "start_id": "24"})
    d = r.json()
    assert [s["id"] for s in d["stops"]] == ["24", "23", "22"]
    assert d["stops"][0]["order"] == 1
    assert d["stops"][0]["distance_from_prev_km"] > 0  # trecho GPS → 1ª parada
    assert "origin=-23.49%2C-46.6" in d["google_maps_url"]  # a partida continua sendo o GPS
    assert "waypoints=-23.74%2C-46.6" in d["google_maps_url"]  # 1ª parada = hidrante escolhido


def test_route_first_stop_only(client):
    d = client.post("/api/route/optimize", json={**ORIGIN, "points": POINTS, "max_stops": 1, "start_id": "3"}).json()
    assert [s["id"] for s in d["stops"]] == ["3"]
    url = d["google_maps_url"]
    assert url.startswith("https://www.google.com/maps/dir/")
    assert "origin=-23.49%2C-46.6" in url and "destination=-23.53%2C-46.6" in url


@pytest.mark.parametrize("body", [
    {**ORIGIN, "points": POINTS, "max_stops": 0},
    {**ORIGIN, "points": []},
    {**ORIGIN, "points": [{"id": "x", "lat": 200, "lon": 0}]},
    {**ORIGIN, "points": [{"id": str(i), "lat": 0, "lon": 0} for i in range(server.MAX_ROUTE_POINTS + 1)]},
])
def test_route_validation(client, body):
    assert client.post("/api/route/optimize", json=body).status_code == 422


def test_route_unknown_start(client):
    assert client.post("/api/route/optimize", json={**ORIGIN, "points": POINTS, "start_id": "nope"}).status_code == 400


def test_removed_write_endpoints(client):
    assert client.delete("/api/hydrants").status_code in (404, 405)
    assert client.post("/api/hydrants/reimport").status_code in (404, 405)
