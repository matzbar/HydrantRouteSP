"""HydrantRoute SP API regression tests (iteration 2 schema: code,type,address,municipality,last_inspection,status,sector)."""
import io
import math
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ORIGIN = {"origin_lat": -23.5612, "origin_lon": -46.6558}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    for i in ids:
        requests.delete(f"{BASE_URL}/api/hydrants/{i}")


# --- Listing / schema
class TestList:
    def test_list_50_real_hydrants(self, s):
        r = s.get(f"{BASE_URL}/api/hydrants")
        assert r.status_code == 200
        data = [h for h in r.json() if not h["code"].startswith("TEST_")]
        assert len(data) == 50
        for h in data:
            for k in ("code", "type", "address", "municipality", "last_inspection", "status", "sector", "lat", "lon", "geocoded", "id"):
                assert k in h
            assert "_id" not in h
            assert h["type"] in ("subterraneo", "coluna")
            assert h["status"] in ("possivel_de_uso", "inoperante", "nao_localizado")
            if h["last_inspection"]:
                assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", h["last_inspection"]), h["last_inspection"]

    def test_geocode_status(self, s):
        r = s.get(f"{BASE_URL}/api/hydrants/geocode-status")
        assert r.status_code == 200
        d = r.json()
        for k in ("running", "total", "geocoded", "failed", "pending"):
            assert k in d
        assert d["total"] == d["geocoded"] + d["failed"] + d["pending"]


# --- Scrape idempotency
class TestScrape:
    def test_scrape_idempotent(self, s):
        r = s.post(f"{BASE_URL}/api/hydrants/scrape", timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fetched"] == 50
        assert d["inserted"] == 0
        assert d["skipped"] == 50
        lst = [h for h in s.get(f"{BASE_URL}/api/hydrants").json() if not h["code"].startswith("TEST_")]
        assert len(lst) == 50


# --- Manual CRUD
class TestManual:
    def test_create_duplicate_update_delete(self, s, created_ids):
        code = f"TEST_{uuid.uuid4().hex[:6]}"
        payload = {"code": code, "type": "subterraneo", "address": "Avenida Paulista 1000",
                   "municipality": "São Paulo", "last_inspection": "2025-06-10",
                   "status": "inoperante", "sector": "9999"}
        r = s.post(f"{BASE_URL}/api/hydrants", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        h = r.json()
        created_ids.append(h["id"])
        assert h["code"] == code and h["type"] == "subterraneo" and h["status"] == "inoperante"
        assert h["last_inspection"] == "2025-06-10" and h["sector"] == "9999"
        assert h["geocoded"] is True and h["lat"] is not None
        lst = s.get(f"{BASE_URL}/api/hydrants").json()
        assert any(x["id"] == h["id"] for x in lst)
        # duplicate
        r2 = s.post(f"{BASE_URL}/api/hydrants", json=payload, timeout=60)
        assert r2.status_code == 400
        # update
        r3 = s.put(f"{BASE_URL}/api/hydrants/{h['id']}", json={"status": "possivel_de_uso", "type": "coluna"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "possivel_de_uso" and r3.json()["type"] == "coluna"
        # delete
        r4 = s.delete(f"{BASE_URL}/api/hydrants/{h['id']}")
        assert r4.status_code == 200
        created_ids.remove(h["id"])
        assert not any(x["id"] == h["id"] for x in s.get(f"{BASE_URL}/api/hydrants").json())
        assert s.delete(f"{BASE_URL}/api/hydrants/{h['id']}").status_code == 404

    def test_update_to_duplicate_code(self, s, created_ids):
        """Update code to an existing code should be 400, not 500"""
        code = f"TEST_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE_URL}/api/hydrants", json={"code": code, "type": "coluna", "address": "Rua Augusta 500",
                                                     "status": "possivel_de_uso"}, timeout=60)
        assert r.status_code == 200
        created_ids.append(r.json()["id"])
        existing = next(h for h in s.get(f"{BASE_URL}/api/hydrants").json() if not h["code"].startswith("TEST_"))
        r2 = s.put(f"{BASE_URL}/api/hydrants/{r.json()['id']}", json={"code": existing["code"]})
        assert r2.status_code == 400, f"got {r2.status_code}"


# --- Bulk CSV
class TestBulk:
    def test_bulk_csv(self, s, created_ids):
        c1, c2 = f"TEST_{uuid.uuid4().hex[:6]}", f"TEST_{uuid.uuid4().hex[:6]}"
        csv_text = ("code,type,address,municipality,last_inspection,status,sector\n"
                    f"{c1},subterraneo,Rua Augusta 100,São Paulo,20250115,inoperante,1111\n"
                    f"{c2},coluna,Avenida Brigadeiro Faria Lima 500,São Paulo,2025-02-20,possivel_de_uso,2222\n")
        files = {"file": ("t.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        r = s.post(f"{BASE_URL}/api/hydrants/bulk", files=files, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d) == 2
        for h in d:
            created_ids.append(h["id"])
        m = {h["code"]: h for h in d}
        assert m[c1]["type"] == "subterraneo" and m[c1]["status"] == "inoperante"
        assert m[c1]["last_inspection"] == "2025-01-15" and m[c1]["sector"] == "1111"
        assert m[c2]["type"] == "coluna" and m[c2]["status"] == "possivel_de_uso"
        # re-upload is skipped
        files = {"file": ("t.csv", io.BytesIO(csv_text.encode()), "text/csv")}
        assert s.post(f"{BASE_URL}/api/hydrants/bulk", files=files).json() == []


# --- Route optimize
class TestRoute:
    @pytest.mark.parametrize("n", [1, 5, 10, 11, 15, 25])
    def test_route_n_stops(self, s, n):
        ids = [h["id"] for h in s.get(f"{BASE_URL}/api/hydrants").json()
               if h["geocoded"] and not h["code"].startswith("TEST_")]
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**ORIGIN, "hydrant_ids": ids, "max_stops": n}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["stops"]) == n
        assert [st["order"] for st in d["stops"]] == list(range(1, n + 1))
        assert len(d["google_maps_segments"]) == math.ceil(n / 10)
        assert d["google_maps_url"].startswith("https://www.google.com/maps/dir/")
        assert d["total_distance_km"] > 0
        if n > 10:
            assert d["google_maps_url"] == d["google_maps_segments"][0]

    def test_route_without_ids(self, s):
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**ORIGIN, "max_stops": 3}, timeout=90)
        assert r.status_code == 200
        assert len(r.json()["stops"]) == 3

    def test_route_invalid_max_stops(self, s):
        """max_stops=0 should be rejected (400/422) rather than returning stops"""
        r = s.post(f"{BASE_URL}/api/route/optimize", json={**ORIGIN, "max_stops": 0}, timeout=90)
        assert r.status_code in (400, 422), f"got {r.status_code} with {len(r.json().get('stops', []))} stops"
