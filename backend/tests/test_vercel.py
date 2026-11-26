"""Confere o vercel.json: na Vercel o site é servido pela CDN, sem passar pelo FastAPI, então os cabeçalhos de
segurança e de cache dos arquivos do site precisam estar lá, iguais aos de security.py."""
import json
from pathlib import Path

import security

VERCEL = json.loads((Path(__file__).resolve().parents[2] / "vercel.json").read_text(encoding="utf-8"))


def _headers(source):
    rule = next(r for r in VERCEL["headers"] if r["source"] == source)
    return {h["key"]: h["value"] for h in rule["headers"]}


def test_security_headers_match_backend():
    expected = {**security.SECURITY_HEADERS, "Strict-Transport-Security": security.HSTS}
    assert _headers("/(.*)") == expected


def test_cache_headers_match_backend():
    assert _headers("/assets/(.*)")["Cache-Control"] == security.CACHE_ASSETS
    assert _headers("/(|index.html|sw.js|manifest.webmanifest)")["Cache-Control"] == security.CACHE_PAGE
    icons = next(r for r in VERCEL["headers"] if "favicon" in r["source"])
    assert icons["headers"][0]["value"] == security.CACHE_OTHER


def test_api_goes_to_python_function():
    assert {"source": "/api/(.*)", "destination": "/api/index"} in VERCEL["rewrites"]
    assert VERCEL["outputDirectory"] == "frontend/build"


def test_vercel_entrypoint_exposes_app():
    import importlib.util

    import server

    path = Path(__file__).resolve().parents[2] / "api" / "index.py"
    spec = importlib.util.spec_from_file_location("vercel_index", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.app is server.app


def test_first_request_starts_services_without_lifespan(monkeypatch):
    """Na Vercel o lifespan pode não rodar: a primeira requisição liga o banco e a fila de localização."""
    from fastapi.testclient import TestClient

    import geocoding
    import server

    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(server, "SERVICES", server.Services())
    monkeypatch.setattr(geocoding, "GEOCODER", geocoding.GeocodeWorker())
    client = TestClient(server.app)  # sem "with": o lifespan não roda, como numa função serverless
    assert client.get("/api/").status_code == 200
    assert server.SERVICES.started
    assert geocoding.GEOCODER.task is not None


def test_root_requirements_match_backend():
    """A Vercel instala o requirements.txt da raiz; ele precisa ter as mesmas versões do backend."""
    root = Path(__file__).resolve().parents[2]

    def pins(path):
        lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
        return sorted(line for line in lines if line and not line.startswith("#"))

    assert pins(root / "requirements.txt") == pins(root / "backend" / "requirements.txt")
