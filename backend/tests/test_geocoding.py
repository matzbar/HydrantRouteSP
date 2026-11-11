"""Cache de coordenadas: resultados do ArcGIS World não vão para o banco (termos de uso)."""
import asyncio

import geocoding


class FakeCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, flt, update, upsert=False):
        self.docs[flt["key"]] = dict(update["$set"])

    async def find_one(self, flt, projection=None):
        doc = self.docs.get(flt["key"])
        if doc and doc.get("provider") in flt["provider"]["$in"]:
            return {"lat": doc["lat"], "lon": doc["lon"]}
        return None


def run(coro):
    return asyncio.run(coro)


def test_arcgis_results_stay_in_memory_only():
    cache = geocoding.GeoCache()
    cache.coll = FakeCollection()
    run(cache.set("a", {"lat": 1.0, "lon": 2.0, "provider": "arcgis"}))
    run(cache.set("b", {"lat": 3.0, "lon": 4.0, "provider": "photon"}))
    run(cache.set("c", {"lat": 5.0, "lon": 6.0, "provider": "nominatim"}))
    assert set(cache.coll.docs) == {"b", "c"}
    assert cache.coll.docs["b"] == {"key": "b", "lat": 3.0, "lon": 4.0, "provider": "photon"}
    assert run(cache.get("a")) == {"lat": 1.0, "lon": 2.0}  # ainda útil enquanto o processo vive


def test_old_records_without_provider_are_ignored():
    cache = geocoding.GeoCache()
    cache.coll = FakeCollection()
    cache.coll.docs["antigo"] = {"key": "antigo", "lat": 1.0, "lon": 2.0}  # gravado antes, origem desconhecida
    assert run(cache.get("antigo")) is None
