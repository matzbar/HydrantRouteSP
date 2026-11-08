# Iteration 3: start_hydrant_id route option + reimport endpoint + nao_localizado status
import os
import time
import pytest
import requests
from urllib.parse import unquote

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SP = {"origin_lat": -23.5612, "origin_lon": -46.6558}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    return ss


def _hyd(s):
    r = s.get(f"{BASE_URL}/api/hydrants", timeout=30)
    assert r.status_code == 200
    return r.json()


def _by_code(s, code):
    return next((h for h in _hyd(s) if h["code"] == code), None)


# --- Reimport (runs first in this module) ---
class TestAReimport:
    def test_reimport_restores_50(self, s):
        r = s.post(f"{BASE_URL}/api/hydrants/reimport", timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fetched"] == 50
        assert d["inserted"] == 50
        assert d["skipped"] == 0
        t0 = time.time()
        st = None
        while time.time() - t0 < 30:
            st = s.get(f"{BASE_URL}/api/hydrants/geocode-status", timeout=15).json()
            if st["total"] == 50 and st["geocoded"] == st["total"]:
                break
            time.sleep(2)
        print("geocode status", st, "elapsed", round(time.time() - t0, 1))
        assert st["total"] == 50
        assert st["geocoded"] == 50
        assert time.time() - t0 < 15

    def test_list_after_reimport(self, s):
        hs = _hyd(s)
        assert len(hs) == 50
        assert len({h["code"] for h in hs}) == 50
        assert all(h["status"] in ("possivel_de_uso", "inoperante", "nao_localizado") for h in hs)
        print("status counts", {st: sum(h["status"] == st for h in hs) for st in ("possivel_de_uso", "inoperante", "nao_localizado")})


class TestNormStatus:
    def test_create_nao_localizado(self, s):
        r = s.post(f"{BASE_URL}/api/hydrants", json={"code": "TEST_NL1", "type": "coluna", "address": "Avenida Paulista 1000",
                                                     "status": "NÃO LOCALIZADO"}, timeout=60)
        assert r.status_code == 200, r.text
        hid = r.json()["id"]
        try:
            assert r.json()["status"] == "nao_localizado"
        finally:
            s.delete(f"{BASE_URL}/api/hydrants/{hid}")


# --- Route with start hydrant ---
class TestStartRoute:
    @pytest.mark.parametrize("n", [6, 3])
    def test_start_hydrant_first(self, s, n):
        start = _by_code(s, "15214")
        assert start and start["geocoded"]
        ids = [h["id"] for h in _hyd(s) if h["geocoded"]]
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "hydrant_ids": ids, "max_stops": n,
                                                            "start_hydrant_id": start["id"]}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["stops"]) == n
        assert d["stops"][0]["hydrant"]["code"] == "15214"
        assert d["stops"][0]["distance_from_prev_km"] == 0
        assert [st["order"] for st in d["stops"]] == list(range(1, n + 1))
        assert len({st["hydrant"]["id"] for st in d["stops"]}) == n
        url = unquote(d["google_maps_url"])
        assert f"origin={start['lat']},{start['lon']}" in url

    def test_start_without_ids(self, s):
        start = _by_code(s, "15214")
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "max_stops": 4, "start_hydrant_id": start["id"]}, timeout=60)
        assert r.status_code == 200
        assert r.json()["stops"][0]["hydrant"]["code"] == "15214"
        assert len(r.json()["stops"]) == 4

    def test_max_stops_1(self, s):
        start = _by_code(s, "15214")
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "max_stops": 1, "start_hydrant_id": start["id"]}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["stops"]) == 1
        assert d["stops"][0]["hydrant"]["code"] == "15214"
        assert d["total_distance_km"] == 0
        assert d["google_maps_url"].startswith("https://www.google.com/maps")
        print("max1 url", d["google_maps_url"])

    def test_invalid_start(self, s):
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "max_stops": 3, "start_hydrant_id": "nope-123"}, timeout=60)
        assert r.status_code == 400
        assert "detail" in r.json()

    def test_start_not_in_ids(self, s):
        hs = [h for h in _hyd(s) if h["geocoded"]]
        start = next(h for h in hs if h["code"] == "15214")
        ids = [h["id"] for h in hs if h["id"] != start["id"]][:5]
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "hydrant_ids": ids, "max_stops": 3,
                                                            "start_hydrant_id": start["id"]}, timeout=60)
        print("start not in ids ->", r.status_code, r.text[:150])
        assert r.status_code in (200, 400)

    def test_without_start_uses_origin(self, s):
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "max_stops": 5}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert len(d["stops"]) == 5
        assert f"origin={SP['origin_lat']},{SP['origin_lon']}" in unquote(d["google_maps_url"])
        assert d["stops"][0]["distance_from_prev_km"] > 0

    def test_start_no_max_stops(self, s):
        start = _by_code(s, "15214")
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**SP, "start_hydrant_id": start["id"]}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        geo = sum(1 for h in _hyd(s) if h["geocoded"])
        assert len(d["stops"]) == geo
        assert d["stops"][0]["hydrant"]["code"] == "15214"
        assert len(d["google_maps_segments"]) >= 1
