"""Testes unitários: não acessam a rede nem banco (páginas do CB SP salvas em tests/fixtures)."""
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import cb_sp
import geocoding
import osrm
import routing
import server

FIXTURES = Path(__file__).parent / "fixtures"
INDEX_HTML = (FIXTURES / "stations_index.html").read_text(encoding="utf-8-sig")
VILA_FORMOSA_HTML = (FIXTURES / "station_701031102.html").read_text(encoding="utf-8-sig")
SEM_PENDENTES_HTML = (FIXTURES / "station_701011201_sem_pendentes.html").read_text(encoding="utf-8-sig")


# ----------------------------- Parsing -----------------------------
def test_parse_station_index():
    stations = cb_sp.parse_station_index(INDEX_HTML)
    assert len(stations) == 264
    vf = next(s for s in stations if s["code"] == "701031102")
    assert vf == {"code": "701031102", "name": "SP - VILA FORMOSA", "cmd": "CBM", "gb": "03", "sgb": "1",
                  "gb_sgb": "03.1", "percent_done": vf["percent_done"]}
    assert {s["cmd"] for s in stations} == {"CBM", "CBI-1", "CBI-2", "CBI-3"}
    assert all(s["gb"].isdigit() and s["sgb"] for s in stations)


def test_parse_station_index_rejects_unknown_layout():
    with pytest.raises(HTTPException) as exc:
        cb_sp.parse_station_index("<html><body><table><tr><td>x</td></tr></table></body></html>")
    assert exc.value.status_code == 502


def test_parse_station_page_pending_table():
    page = cb_sp.parse_station_page(VILA_FORMOSA_HTML, "https://example.test/07estacao/701031102.html")
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
    page = cb_sp.parse_station_page(SEM_PENDENTES_HTML)
    assert page == {"cycle": "2026 2º SEM", "hydrants": []}


def test_parse_station_page_unknown_layout():
    with pytest.raises(HTTPException) as exc:
        cb_sp.parse_station_page("<html><body><p>Manutenção</p></body></html>")
    assert exc.value.status_code == 502


@pytest.mark.parametrize("raw,expected", [
    ("POSSIVEL DE USO", "possivel_de_uso"), ("INOPERANTE", "inoperante"),
    ("NÃO LOCALIZADO", "nao_localizado"), ("SEM VISTORIA", "sem_vistoria"), ("???", "outro"),
])
def test_norm_status(raw, expected):
    assert cb_sp.norm_status(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("SUBTERRANEO", "subterraneo"), ("SUBTERRÂNEO", "subterraneo"), ("COLUNA", "coluna"), ("BICA", "bica"),
    ("", "outro"),
])
def test_norm_type(raw, expected):
    assert cb_sp.norm_type(raw) == expected


# ----------------------------- Routing helpers -----------------------------
def test_google_maps_url():
    url = routing.build_google_maps_url((1.0, 2.0), [(3.0, 4.0), (5.0, 6.0)])
    assert "origin=1.0%2C2.0" in url and "destination=5.0%2C6.0" in url and "waypoints=3.0%2C4.0" in url
    assert routing.build_google_maps_url((1.0, 2.0), []) == ""


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

    async def no_table(coords):
        return None

    async def no_official(codes):
        return {}

    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(cb_sp, "fetch_html", fake_fetch)
    monkeypatch.setattr(geocoding, "geocode_remote", fake_geocode)
    monkeypatch.setattr(osrm, "osrm_route", no_osrm)
    monkeypatch.setattr(osrm, "osrm_table", no_table)
    monkeypatch.setattr(cb_sp, "fetch_official_coords", no_official)
    cb_sp.INDEX_CACHE.clear()
    cb_sp.STATION_CACHE.clear()
    server.API_LIMITER.reset()
    server.ROUTE_LIMITER.reset()
    cb_sp.OFFICIAL_CACHE.clear()
    geocoding.GEOCACHE.mem.clear()
    geocoding.GEO_FAILED.clear()
    geocoding.GEO_INFLIGHT.clear()
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


def test_route_reports_optimization(client):
    d = client.post("/api/route/optimize", json={**ORIGIN, "points": POINTS, "max_stops": 5}).json()
    opt = d["optimization"]
    assert opt["source"] == "estimativa" and opt["candidates"] == 25
    assert opt["optimized_min"] <= opt["nearest_neighbor_min"]


def test_route_uses_osrm_matrix_and_beats_nearest_neighbor(client, monkeypatch):
    """Matriz em que o vizinho mais próximo erra.

    "a" é o mais perto da origem, mas fica longe de "b" e "c". O vizinho mais próximo faz
    origem→a→b→c = 1 + 11 + 1 = 13. Como c→a é curto, o ótimo é origem→b→c→a = 2 + 1 + 2 = 5.
    """
    dur = [
        [0, 1, 2, 3],
        [1, 0, 11, 11],
        [2, 11, 0, 1],
        [3, 2, 1, 0],
    ]
    dist = [[v * 100 for v in row] for row in dur]
    pts = [{"id": "a", "lat": -23.50, "lon": -46.60}, {"id": "b", "lat": -23.51, "lon": -46.60},
           {"id": "c", "lat": -23.52, "lon": -46.60}]

    async def fake_table(coords):
        assert len(coords) == 4
        return [r[:] for r in dur], [r[:] for r in dist]

    monkeypatch.setattr(osrm, "osrm_table", fake_table)
    d = client.post("/api/route/optimize", json={**ORIGIN, "points": pts}).json()
    assert [s["id"] for s in d["stops"]] == ["b", "c", "a"]
    assert d["optimization"]["source"] == "osrm"
    assert d["optimization"]["nearest_neighbor_min"] == round(13 / 60, 1)
    assert d["total_duration_min"] == round(5 / 60, 1)
    assert [s["distance_from_prev_km"] for s in d["stops"]] == [0.2, 0.1, 0.2]


def test_route_preselects_candidates_when_many_points(client, monkeypatch):
    seen = {}

    async def fake_table(coords):
        seen["n"] = len(coords)
        return None

    monkeypatch.setattr(osrm, "osrm_table", fake_table)
    many = [{"id": str(i), "lat": -23.5 - i / 1000, "lon": -46.6} for i in range(150)]
    d = client.post("/api/route/optimize", json={**ORIGIN, "points": many, "max_stops": 10}).json()
    assert seen["n"] == server.OSRM_TABLE_MAX
    assert d["optimization"]["candidates"] == server.OSRM_TABLE_MAX - 1
    assert len(d["stops"]) == 10


# ----------------------------- Posição oficial (ArcGIS do CB SP) -----------------------------
def test_parse_official_features():
    data = {"features": [
        {"attributes": {"ID": 973.0}, "geometry": {"x": -46.523992, "y": -23.588755}},
        {"attributes": {"ID": 1}, "geometry": {"x": 0, "y": 0}},  # fora de SP: descartado
        {"attributes": {"ID": None}, "geometry": {"x": -46.5, "y": -23.5}},  # sem ID: descartado
        {"attributes": {"ID": 2}, "geometry": None},  # sem geometria: descartado
    ]}
    assert cb_sp.parse_official_features(data) == {"973": {"lat": -23.588755, "lon": -46.523992}}
    with pytest.raises(ValueError):
        cb_sp.parse_official_features({"error": {"code": 400}})


def test_official_position_wins_and_skips_geocoding(client, monkeypatch):
    geocoded = []

    async def official(codes):
        return {c: {"lat": -23.6, "lon": -46.5} for c in codes if c != "15214"}

    async def tracking_geocode(address, municipality):
        geocoded.append(address)
        return {"lat": -23.55, "lon": -46.55}

    monkeypatch.setattr(cb_sp, "fetch_official_coords", official)
    monkeypatch.setattr(geocoding, "geocode_remote", tracking_geocode)
    d = _wait_geocoding(client)
    by_code = {h["code"]: h for h in d["hydrants"]}
    assert d["geocode"]["official"] == 35 and d["geocode"]["geocoded"] == 36
    others = [h for c, h in by_code.items() if c != "15214"]
    assert all(h["location_source"] == "oficial" and h["lat"] == -23.6 for h in others)
    assert by_code["15214"]["location_source"] == "endereco"
    assert len(geocoded) == 1  # só o hidrante sem posição oficial passa pela geocodificação


def test_official_service_down_falls_back_to_address(client, monkeypatch):
    async def broken(codes):
        raise RuntimeError("ArcGIS fora do ar")

    monkeypatch.setattr(cb_sp, "fetch_official_coords", broken)
    d = _wait_geocoding(client)
    assert d["geocode"]["official"] == 0
    assert all(h["location_source"] in ("endereco", None) for h in d["hydrants"])


# ----------------------------- Limite de requisições -----------------------------
def test_route_rate_limit(client):
    body = {**ORIGIN, "points": POINTS[:3]}
    codes = [client.post("/api/route/optimize", json=body).status_code for _ in range(server.ROUTE_LIMITER.limit + 1)]
    assert codes[:-1] == [200] * server.ROUTE_LIMITER.limit
    r = client.post("/api/route/optimize", json=body)
    assert r.status_code == 429 and "Aguarde" in r.json()["detail"] and int(r.headers["Retry-After"]) >= 1
    assert client.get("/api/").status_code == 200  # o limite da rota não bloqueia o resto da API


def test_rate_limiter_window():
    from ratelimit import RateLimiter

    lim = RateLimiter(2, window_s=0.05)
    assert lim.hit("ip") is None and lim.hit("ip") is None
    assert lim.hit("ip") > 0 and lim.hit("outro-ip") is None
    import time
    time.sleep(0.06)
    assert lim.hit("ip") is None


def test_osrm_errors_do_not_log_coordinates(caplog):
    import asyncio

    import httpx

    def handler(request):
        return httpx.Response(502, request=request)

    real_client = httpx.AsyncClient

    class MockClient(real_client):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            super().__init__(*a, **kw)

    httpx.AsyncClient = MockClient
    try:
        with caplog.at_level("INFO"):
            assert asyncio.run(osrm.osrm_table([(-23.5612, -46.6558), (-23.6, -46.5)])) is None
            assert asyncio.run(osrm.osrm_route([(-23.5612, -46.6558), (-23.6, -46.5)])) is None
    finally:
        httpx.AsyncClient = real_client
    assert "HTTP 502" in caplog.text
    assert "-23.5612" not in caplog.text and "-46.6558" not in caplog.text
