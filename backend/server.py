"""HydrantRoute SP API.

Lê ao vivo as páginas públicas do Corpo de Bombeiros (CB SP): o índice de estações e a tabela de
"hidrantes pendentes de vistoria" de cada estação. Nada da página do CB SP é armazenado; o único dado
persistido (opcionalmente, no MongoDB) é o cache de coordenadas dos endereços geocodificados.
"""
import asyncio
import difflib
import logging
import os
import re
import time
import unicodedata
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote, urljoin

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Path as PathParam
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from routing import estimated_matrices, haversine_km, nearest_neighbor, optimize_open_path, path_cost

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hydrantroute")

DEFAULT_STATE = "SP"
CB_INDEX_URL = "https://cbaplang.corpodebombeiros.sp.gov.br/hidrantes/07estacao/"
# Camada pública de hidrantes do mapa oficial do CB SP (ArcGIS "CBPMESP OPERACIONAL"): posição oficial por ID.
CB_HYDRANTS_LAYER_URL = ("https://services8.arcgis.com/8fjb2AtW3vRitLCB/arcgis/rest/services/"
                         "cbpmesp_hidrantes/FeatureServer/0/query")
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
ARCGIS_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving"
OSRM_TABLE_MAX = 100  # limite de coordenadas por matriz no servidor público do OSRM
USER_AGENT = "Mozilla/5.0 (compatible; HydrantRouteBR/1.0)"

STATION_CODE_PATTERN = r"^\d{9}$"
INDEX_TTL_S = 60 * 60  # o índice de estações muda pouco
STATION_TTL_S = 5 * 60  # página de uma estação: evita bater no site do CB a cada consulta da tela
OFFICIAL_TTL_S = 60 * 60  # posição oficial dos hidrantes muda raramente
OFFICIAL_CHUNK = 500  # IDs por consulta ao ArcGIS
SP_BOUNDS = (-25.6, -19.5, -53.4, -44.0)  # lat mín/máx, lon mín/máx do estado de SP (descarta pontos inválidos)
MAX_ROUTE_POINTS = 500


# ----------------------------- Text helpers -----------------------------
def fold(s: str) -> str:
    """Minúsculas e sem acentos, para comparar textos do CB SP com tolerância."""
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")


def norm_header(s: str) -> str:
    return re.sub(r"\s+", " ", fold(s)).strip().upper()


TYPE_KEYS = (("subterr", "subterraneo"), ("coluna", "coluna"), ("bica", "bica"))
STATUS_KEYS = (("inoper", "inoperante"), ("possivel", "possivel_de_uso"), ("nao localizado", "nao_localizado"),
               ("sem vistoria", "sem_vistoria"))


def norm_type(v: str) -> str:
    s = fold(v)
    return next((key for frag, key in TYPE_KEYS if frag in s), "outro")


def norm_status(v: str) -> str:
    s = fold(v).replace("_", " ")
    return next((key for frag, key in STATUS_KEYS if frag in s), "outro")


def parse_date_str(v: str) -> Optional[str]:
    v = (v or "").strip()
    if re.fullmatch(r"\d{8}", v):
        return f"{v[0:4]}-{v[4:6]}-{v[6:8]}"
    return v or None


def clean_cell(v: str) -> Optional[str]:
    v = re.sub(r"\s+", " ", v or "").strip()
    return None if v in ("", "None", "-") else v


# ----------------------------- CB SP pages -----------------------------
async def fetch_html(url: str) -> str:
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"}
    try:
        async with httpx.AsyncClient(timeout=30.0, headers=headers, follow_redirects=True) as hc:
            r = await hc.get(url)
            r.raise_for_status()
            return r.text
    except httpx.HTTPError as exc:
        logger.warning("CB SP fetch failed for %s: %s", url, exc)
        raise HTTPException(502, "Página do CB SP indisponível no momento. Tente novamente em instantes.")


def _table_headers(table) -> List[str]:
    return [norm_header(th.get_text(" ", strip=True)) for th in table.select("thead th")]


def parse_station_index(html: str) -> List[dict]:
    """Lê a tabela CMD REGIONAL | GB.SGB | CODIGO | ESTAÇÃO | PERCENTUAL do índice de estações."""
    soup = BeautifulSoup(html, "lxml")
    table = next((t for t in soup.find_all("table")
                  if {"CMD REGIONAL", "GB.SGB", "CODIGO", "ESTACAO"} <= set(_table_headers(t))), None)
    if table is None:
        raise HTTPException(502, "Lista de estações não encontrada na página do CB SP")
    headers = _table_headers(table)
    idx = {h: i for i, h in enumerate(headers)}
    pct_i = next((i for i, h in enumerate(headers) if h.startswith("PERCENTUAL")), None)

    stations, seen = [], set()
    for tr in table.select("tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < len(headers):
            continue
        cells = [td.get_text(" ", strip=True) for td in tds]
        code = cells[idx["CODIGO"]]
        if not re.fullmatch(r"\d{9}", code) or code in seen:
            continue
        seen.add(code)
        gb_sgb = cells[idx["GB.SGB"]]
        gb, _, sgb = gb_sgb.partition(".")
        pct = None
        if pct_i is not None:
            m = re.search(r"[\d.,]+", cells[pct_i])
            with suppress(ValueError):
                pct = float(m.group(0).replace(",", ".")) if m else None
        stations.append({
            "code": code,
            "name": cells[idx["ESTACAO"]],
            "cmd": cells[idx["CMD REGIONAL"]],
            "gb": gb.strip(),
            "sgb": sgb.strip(),
            "gb_sgb": gb_sgb,
            "percent_done": pct,
        })
    if not stations:
        raise HTTPException(502, "Nenhuma estação encontrada na página do CB SP")
    return stations


REQUIRED_STATION_COLUMNS = ["ID", "TIPO", "ENDERECO", "MUNICIPIO", "SITUACAO"]


def parse_station_page(html: str, page_url: str = CB_INDEX_URL) -> dict:
    """Lê a tabela "HIDRANTES PENDENTES DE VISTORIA" de uma estação.

    Estações com 100% vistoriado não têm essa tabela: devolve lista vazia, sem erro.
    """
    soup = BeautifulSoup(html, "lxml")
    headings = [h for h in soup.find_all(["h1", "h2", "h3", "h4", "h5"]) if "CICLO" in norm_header(h.get_text())]
    pending_h = next((h for h in headings if "PENDENTES DE VISTORIA" in norm_header(h.get_text())), None)
    any_h = pending_h or (headings[0] if headings else None)
    if any_h is None:
        raise HTTPException(502, "Página da estação em formato não reconhecido")
    cycle_m = re.search(r"CICLO\s+(.+)$", any_h.get_text(" ", strip=True), re.IGNORECASE)
    cycle = cycle_m.group(1).strip() if cycle_m else None
    if pending_h is None:
        return {"cycle": cycle, "hydrants": []}

    table = pending_h.find_next("table")
    headers = _table_headers(table) if table else []
    missing = [c for c in REQUIRED_STATION_COLUMNS if c not in headers]
    if missing:
        raise HTTPException(502, f"Colunas ausentes na tabela do CB SP: {', '.join(missing)}")
    idx = {h: i for i, h in enumerate(headers)}

    def col(cells: List[str], name: str) -> Optional[str]:
        i = idx.get(name)
        return clean_cell(cells[i]) if i is not None and i < len(cells) else None

    hydrants, seen = [], set()
    for tr in table.select("tbody tr"):
        tds = tr.find_all("td")
        cells = [td.get_text(" ", strip=True) for td in tds]
        code = col(cells, "ID")
        address = col(cells, "ENDERECO")
        if not code or not address or code in seen:
            continue
        seen.add(code)
        link = tds[idx["ID"]].find("a", href=True)
        type_label = col(cells, "TIPO") or ""
        status_label = col(cells, "SITUACAO") or ""
        hydrants.append({
            "id": code,
            "code": code,
            "type": norm_type(type_label),
            "type_label": type_label,
            "address": address,
            "municipality": (col(cells, "MUNICIPIO") or "São Paulo").title(),
            "last_inspection": parse_date_str(col(cells, "ULTIMA VISTORIA CB") or ""),
            "status": norm_status(status_label),
            "status_label": status_label,
            "flow": col(cells, "VAZAO"),
            "maintenance": col(cells, "MANUTENCAO"),
            "sector": col(cells, "SETOR"),
            "url": urljoin(page_url, link["href"]) if link else None,
        })
    return {"cycle": cycle, "hydrants": hydrants}


class TTLCache:
    """Cache em memória com validade, com um lock por chave para não buscar a mesma página em paralelo."""

    def __init__(self, ttl_s: float):
        self.ttl_s = ttl_s
        self.data: Dict[str, Tuple[float, object]] = {}
        self.locks: Dict[str, asyncio.Lock] = {}

    async def get_or_load(self, key: str, loader):
        hit = self.data.get(key)
        if hit and time.monotonic() - hit[0] < self.ttl_s:
            return hit[1]
        lock = self.locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = self.data.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl_s:
                return hit[1]
            value = await loader()
            self.data[key] = (time.monotonic(), value)
            return value

    def clear(self) -> None:
        self.data.clear()


INDEX_CACHE = TTLCache(INDEX_TTL_S)
STATION_CACHE = TTLCache(STATION_TTL_S)
OFFICIAL_CACHE = TTLCache(OFFICIAL_TTL_S)


async def get_stations() -> List[dict]:
    async def load():
        return parse_station_index(await fetch_html(CB_INDEX_URL))
    return await INDEX_CACHE.get_or_load("index", load)


async def get_station_page(code: str) -> dict:
    url = urljoin(CB_INDEX_URL, f"{code}.html")

    async def load():
        return parse_station_page(await fetch_html(url), url)
    return await STATION_CACHE.get_or_load(code, load)


# ----------------------------- Geocoding -----------------------------
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
            doc = await self.coll.find_one({"key": key}, {"_id": 0, "lat": 1, "lon": 1})
        except Exception as exc:
            logger.warning("geocache read failed: %s", exc)
            return None
        if doc:
            self.mem[key] = {"lat": doc["lat"], "lon": doc["lon"]}
            return self.mem[key]
        return None

    async def set(self, key: str, coords: dict) -> None:
        self.mem[key] = {"lat": coords["lat"], "lon": coords["lon"]}
        if self.coll is None:
            return
        try:
            await self.coll.update_one({"key": key}, {"$set": {"key": key, **self.mem[key]}}, upsert=True)
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
                    return res
            found = [r for r in [await photon_query(hc, c, municipality) for c in candidates] if r]
            if found:
                best = next((r for r in found if r["score"] >= 0.85), max(found, key=lambda r: r["score"]))
                return {"lat": best["lat"], "lon": best["lon"]}
            for c in candidates:
                res = await nominatim_query(hc, f"{c}, {municipality}, {DEFAULT_STATE}, Brasil")
                if res:
                    return res
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


# ----------------------------- Posição oficial (mapa do CB SP) -----------------------------
def parse_official_features(data: dict) -> Dict[str, dict]:
    """{código: {lat, lon}} a partir da resposta de query da camada de hidrantes do ArcGIS."""
    if "error" in data:
        raise ValueError(f"ArcGIS: {data['error']}")
    out: Dict[str, dict] = {}
    lat_min, lat_max, lon_min, lon_max = SP_BOUNDS
    for f in data.get("features", []):
        attrs, geom = f.get("attributes") or {}, f.get("geometry") or {}
        try:
            code = str(int(attrs["ID"]))
            lat, lon = float(geom["y"]), float(geom["x"])
        except (KeyError, TypeError, ValueError):
            continue
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            out[code] = {"lat": lat, "lon": lon}
    return out


async def fetch_official_coords(codes: List[str]) -> Dict[str, dict]:
    ids = sorted({str(int(c)) for c in codes if c.isdigit()})
    out: Dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": USER_AGENT}) as hc:
        for i in range(0, len(ids), OFFICIAL_CHUNK):
            chunk = ids[i:i + OFFICIAL_CHUNK]
            r = await hc.post(CB_HYDRANTS_LAYER_URL, data={
                "where": f"ID IN ({','.join(chunk)})", "outFields": "ID", "returnGeometry": "true",
                "outSR": "4326", "f": "json",
            })
            r.raise_for_status()
            out.update(parse_official_features(r.json()))
    return out


async def get_official_coords(station_code: str, codes: List[str]) -> Dict[str, dict]:
    """Posições oficiais da estação (cache de 1 h). Se o ArcGIS falhar, devolve {} e o app usa o endereço."""
    if not codes:
        return {}
    key = f"{station_code}:{hash(tuple(sorted(codes)))}"
    try:
        return await OFFICIAL_CACHE.get_or_load(key, lambda: fetch_official_coords(codes))
    except Exception as exc:
        logger.warning("posição oficial indisponível para %s: %s", station_code, exc)
        return {}


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


# ----------------------------- Routing -----------------------------
def _coord_str(coords: List[Tuple[float, float]]) -> str:
    return ";".join(f"{lon},{lat}" for lat, lon in coords)


async def osrm_table(coords: List[Tuple[float, float]]) -> Optional[Tuple[List[List[float]], List[List[float]]]]:
    """Matriz de tempos (s) e distâncias (m) de carro entre todos os pontos, pelo OSRM."""
    if len(coords) < 2 or len(coords) > OSRM_TABLE_MAX:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": USER_AGENT}) as hc:
            r = await hc.get(f"{OSRM_TABLE_URL}/{_coord_str(coords)}", params={"annotations": "duration,distance"})
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("osrm table failed: %s", exc)
        return None
    dur, dist = data.get("durations"), data.get("distances")
    n = len(coords)
    if data.get("code") != "Ok" or not dur or not dist or len(dur) != n or any(len(row) != n for row in dur + dist):
        return None
    # Pares sem rota (None): usa a estimativa, com penalidade, para o otimizador evitar esse trecho.
    est_dur, est_dist = estimated_matrices(coords)
    for i in range(n):
        for j in range(n):
            if dur[i][j] is None or dist[i][j] is None:
                dur[i][j], dist[i][j] = est_dur[i][j] * 2, est_dist[i][j] * 2
    return dur, dist


async def osrm_route(coords: List[Tuple[float, float]]) -> Optional[dict]:
    if len(coords) < 2:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": USER_AGENT}) as hc:
            r = await hc.get(f"{OSRM_URL}/{_coord_str(coords)}", params={"overview": "false", "steps": "false"})
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("osrm failed: %s", exc)
    return None


def build_google_maps_url(origin: Tuple[float, float], stops: List[Tuple[float, float]]) -> str:
    if not stops:
        return ""
    base = "https://www.google.com/maps/dir/?api=1&travelmode=driving"
    url = f"{base}&origin={quote(f'{origin[0]},{origin[1]}')}&destination={quote(f'{stops[-1][0]},{stops[-1][1]}')}"
    if len(stops) > 1:
        url += f"&waypoints={quote('|'.join(f'{lat},{lon}' for lat, lon in stops[:-1]))}"
    return url


# ----------------------------- API models -----------------------------
class RoutePoint(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class RouteRequest(BaseModel):
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lon: float = Field(..., ge=-180, le=180)
    points: List[RoutePoint] = Field(..., min_length=1, max_length=MAX_ROUTE_POINTS)
    max_stops: Optional[int] = Field(None, ge=1, le=MAX_ROUTE_POINTS)
    start_id: Optional[str] = Field(None, max_length=64)


class RouteStop(BaseModel):
    order: int
    id: str
    distance_from_prev_km: float
    duration_from_prev_min: float


class RouteOptimization(BaseModel):
    source: str = Field(..., description="osrm (tempos reais de carro) | estimativa (linha reta × fator de ruas)")
    candidates: int
    nearest_neighbor_min: float
    optimized_min: float
    saved_min: float


class RouteResponse(BaseModel):
    total_distance_km: float
    total_duration_min: float
    stops: List[RouteStop]
    google_maps_url: str
    google_maps_segments: List[str] = []
    optimization: Optional[RouteOptimization] = None


# ----------------------------- App & routes -----------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    GEOCACHE.connect(os.environ.get("MONGO_URL"), os.environ.get("DB_NAME", "hydrantroute"))
    index_task = asyncio.create_task(GEOCACHE.ensure_index())
    GEOCODER.start()
    try:
        yield
    finally:
        await GEOCODER.stop()
        index_task.cancel()
        with suppress(asyncio.CancelledError):
            await index_task
        GEOCACHE.close()


app = FastAPI(title="HydrantRoute SP", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "HydrantRoute SP API", "status": "ok"}


@api_router.get("/stations")
async def list_stations():
    return await get_stations()


@api_router.get("/stations/{code}/hydrants")
async def station_hydrants(code: str = PathParam(..., pattern=STATION_CODE_PATTERN)):
    page = await get_station_page(code)
    station = {"code": code}
    with suppress(HTTPException):  # o índice só enriquece a resposta; a página da estação basta
        station = next((s for s in await get_stations() if s["code"] == code), station)
    official = await get_official_coords(code, [h["code"] for h in page["hydrants"]])
    hydrants, counts = await attach_coords(page["hydrants"], official)
    return {
        "station": {**station, "url": urljoin(CB_INDEX_URL, f"{code}.html")},
        "cycle": page["cycle"],
        "hydrants": hydrants,
        "geocode": counts,
    }


@api_router.post("/stations/{code}/geocode-retry")
async def station_geocode_retry(code: str = PathParam(..., pattern=STATION_CODE_PATTERN)):
    page = await get_station_page(code)
    for h in page["hydrants"]:
        GEO_FAILED.discard(geo_key(h["address"], h["municipality"]))
    official = await get_official_coords(code, [h["code"] for h in page["hydrants"]])
    _, counts = await attach_coords(page["hydrants"], official)
    return {"ok": True, "geocode": counts}


@api_router.post("/route/optimize", response_model=RouteResponse)
async def optimize_route(req: RouteRequest):
    points = list({p.id: p for p in req.points}.values())  # ignora ids repetidos
    # A partida é sempre a localização do usuário (GPS). Se um hidrante foi escolhido, ele é a 1ª parada fixa.
    origin = (req.origin_lat, req.origin_lon)
    start = None
    if req.start_id:
        start = next((p for p in points if p.id == req.start_id), None)
        if not start:
            raise HTTPException(400, "Hidrante escolhido como primeira parada não encontrado ou sem coordenadas")
    n_select = min(req.max_stops or len(points), len(points))

    # A matriz do OSRM aceita até 100 coordenadas (origem + 99 hidrantes). Com mais hidrantes do que isso,
    # e se a rota pedida couber, usa os mais próximos da partida como candidatos.
    budget = OSRM_TABLE_MAX - 1
    candidates = points
    if len(points) > budget and n_select <= budget:
        anchor = (start.lat, start.lon) if start else origin
        others = sorted((p for p in points if p is not start), key=lambda p: haversine_km(*anchor, p.lat, p.lon))
        candidates = ([start] if start else []) + others[:budget - (1 if start else 0)]
    coords = [origin] + [(p.lat, p.lon) for p in candidates]

    matrix = await osrm_table(coords)
    source = "osrm" if matrix else "estimativa"
    dur, dist = matrix or estimated_matrices(coords)
    fixed = candidates.index(start) + 1 if start else None

    baseline = nearest_neighbor(dur, range(1, len(coords)), n_select, fixed)
    order = await asyncio.to_thread(optimize_open_path, dur, n_select, fixed, 2.0)
    ordered = [candidates[i - 1] for i in order]
    ordered_coords = [(p.lat, p.lon) for p in ordered]

    full = [0, *order]
    legs_km = [dist[full[i]][full[i + 1]] / 1000.0 for i in range(len(order))]
    legs_min = [dur[full[i]][full[i + 1]] / 60.0 for i in range(len(order))]
    if source == "estimativa":  # sem matriz real: tenta ao menos os trechos reais da rota escolhida
        osrm = await osrm_route([origin] + ordered_coords)
        legs = (osrm or {}).get("routes", [{}])[0].get("legs", []) if (osrm or {}).get("code") == "Ok" else []
        if len(legs) == len(order):
            legs_km = [leg.get("distance", 0) / 1000.0 for leg in legs]
            legs_min = [leg.get("duration", 0) / 60.0 for leg in legs]

    stops = [
        RouteStop(order=i + 1, id=p.id, distance_from_prev_km=round(legs_km[i], 2),
                  duration_from_prev_min=round(legs_min[i], 1))
        for i, p in enumerate(ordered)
    ]
    nn_min, opt_min = path_cost(dur, baseline) / 60.0, path_cost(dur, order) / 60.0
    optimization = RouteOptimization(source=source, candidates=len(candidates),
                                     nearest_neighbor_min=round(nn_min, 1), optimized_min=round(opt_min, 1),
                                     saved_min=round(max(0.0, nn_min - opt_min), 1))

    # O Google Maps aceita ~9 pontos intermediários por link: trechos encadeados de 10 paradas.
    segments, seg_origin = [], origin
    for i in range(0, len(ordered_coords), 10):
        chunk = ordered_coords[i:i + 10]
        segments.append(build_google_maps_url(seg_origin, chunk))
        seg_origin = chunk[-1]
    gmaps_url = segments[0] if segments else f"https://www.google.com/maps/search/?api=1&query={origin[0]},{origin[1]}"
    return RouteResponse(
        total_distance_km=round(sum(legs_km), 2),
        total_duration_min=round(sum(legs_min), 1),
        stops=stops,
        google_maps_url=gmaps_url,
        google_maps_segments=segments,
        optimization=optimization,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Serve o React compilado no mesmo serviço quando disponível (imagem Docker / deploy único).
STATIC_DIR = Path(os.environ.get("STATIC_DIR", ROOT_DIR.parent / "frontend" / "build"))
if (STATIC_DIR / "index.html").is_file():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
