import asyncio
import csv
import difflib
import io
import logging
import math
import os
import re
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from pymongo import ASCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

DEFAULT_MUNICIPALITY = "São Paulo"
DEFAULT_STATE = "SP"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
USER_AGENT = "Mozilla/5.0 (compatible; HydrantRouteBR/1.0)"
CB_SCRAPE_URL = "https://cbaplang.corpodebombeiros.sp.gov.br/hidrantes/07estacao/701031102.html"
CB_TABLE_HEADING = "HIDRANTES PENDENTES DE VISTORIA - CICLO 2026 2º SEM"

INDEXES: dict[str, list[IndexModel]] = {
    "hydrants": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code_unique", unique=True),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error(
                    "ensure_indexes(%s.%s): %s", collection, model.document["name"], exc
                )


app = FastAPI()
api_router = APIRouter(prefix="/api")


# ----------------------------- Models -----------------------------
TYPE_VALUES = {"subterraneo", "coluna"}
STATUS_VALUES = {"possivel_de_uso", "inoperante"}


def norm_type(v: str) -> str:
    s = (v or "").lower().strip()
    if "subterr" in s:
        return "subterraneo"
    if "coluna" in s:
        return "coluna"
    raise HTTPException(422, f"Tipo inválido: {v}")


def norm_status(v: str) -> str:
    s = (v or "").lower().strip()
    s = s.replace("í", "i").replace("ó", "o").replace("á", "a").replace("_", " ")
    if "inoper" in s:
        return "inoperante"
    if "possivel" in s:
        return "possivel_de_uso"
    raise HTTPException(422, f"Situação inválida: {v}")


def parse_date_str(v: str) -> Optional[str]:
    if not v:
        return None
    v = v.strip()
    if re.fullmatch(r"\d{8}", v):
        return f"{v[0:4]}-{v[4:6]}-{v[6:8]}"
    return v or None


class HydrantBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str = Field(..., description="Código/ID do hidrante")
    type: str = Field(..., description="subterraneo | coluna")
    address: str
    municipality: str = DEFAULT_MUNICIPALITY
    last_inspection: Optional[str] = None
    status: str = Field(..., description="possivel_de_uso | inoperante")
    sector: Optional[str] = None


class HydrantCreate(HydrantBase):
    pass


class HydrantUpdate(BaseModel):
    code: Optional[str] = None
    type: Optional[str] = None
    address: Optional[str] = None
    municipality: Optional[str] = None
    last_inspection: Optional[str] = None
    status: Optional[str] = None
    sector: Optional[str] = None


class Hydrant(HydrantBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lat: Optional[float] = None
    lon: Optional[float] = None
    geocoded: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    hydrant_ids: Optional[List[str]] = None
    max_stops: Optional[int] = Field(None, ge=1)


class RouteStop(BaseModel):
    order: int
    hydrant: Hydrant
    distance_from_prev_km: float
    duration_from_prev_min: float


class RouteResponse(BaseModel):
    total_distance_km: float
    total_duration_min: float
    stops: List[RouteStop]
    google_maps_url: str
    google_maps_segments: List[str] = []
    unreachable: List[str] = []


class ScrapeResponse(BaseModel):
    fetched: int
    inserted: int
    skipped: int
    geocoded: int


# ----------------------------- Helpers -----------------------------
NOMINATIM_LOCK = asyncio.Lock()
GEOCODE_CACHE: dict[str, Optional[dict]] = {}
GEOCODE_STATE = {"running": False}
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
        p = re.sub(r"\s+\d+\b.*$", "", p)  # drop house number and trailing notes
        p = re.sub(r"\s+", " ", p).strip(" ,.")
        if len(p) > 4 and p.upper() not in ("RUA", "PRACA", "PRAÇA"):
            cleaned.append(p)
    return cleaned or [address]


async def nominatim_query(hc: httpx.AsyncClient, q: str) -> Optional[dict]:
    if q in GEOCODE_CACHE:
        return GEOCODE_CACHE[q]
    params = {"q": q, "format": "json", "limit": 1, "countrycodes": "br"}
    for attempt in range(1):
        async with NOMINATIM_LOCK:
            r = await hc.get(NOMINATIM_URL, params=params)
            await asyncio.sleep(1.1)  # Nominatim policy: max 1 req/s
        if r.status_code == 429:
            return None
        if r.status_code != 200:
            return None
        data = r.json()
        result = {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"])} if data else None
        GEOCODE_CACHE[q] = result
        return result
    return None


PHOTON_URL = "https://photon.komoot.io/api/"


def _fold(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")


async def photon_query(hc: httpx.AsyncClient, street: str, municipality: str) -> Optional[dict]:
    key = f"photon|{street}|{municipality}"
    if key in GEOCODE_CACHE:
        return GEOCODE_CACHE[key]
    params = {"q": f"{street}, {municipality}", "limit": 5, "lat": -23.55, "lon": -46.63}
    try:
        r = await hc.get(PHOTON_URL, params=params)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    feats = [f for f in r.json().get("features", []) if f["properties"].get("countrycode") == "BR"]
    city = _fold(municipality)
    match = next((f for f in feats if _fold(f["properties"].get("city", "")) == city), None)
    result = None
    if match:
        lon, lat = match["geometry"]["coordinates"]
        score = difflib.SequenceMatcher(None, _fold(street), _fold(match["properties"].get("name", ""))).ratio()
        result = {"lat": lat, "lon": lon, "score": score}
    GEOCODE_CACHE[key] = result
    return result


ARCGIS_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"


async def arcgis_query(hc: httpx.AsyncClient, single_line: str) -> Optional[dict]:
    key = f"arcgis|{single_line}"
    if key in GEOCODE_CACHE:
        return GEOCODE_CACHE[key]
    params = {"SingleLine": single_line, "f": "json", "maxLocations": 1, "countryCode": "BRA"}
    try:
        r = await hc.get(ARCGIS_URL, params=params)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    cands = r.json().get("candidates", [])
    result = None
    if cands and cands[0].get("score", 0) >= 80:
        loc = cands[0]["location"]
        result = {"lat": loc["y"], "lon": loc["x"]}
    GEOCODE_CACHE[key] = result
    return result


async def geocode_address(address: str, municipality: str) -> Optional[dict]:
    """Geocode: ArcGIS (supports 'X & Y' intersections) → Photon → Nominatim."""
    address = (address or "").strip()
    if not address:
        return None
    full_city = f"{municipality}, {DEFAULT_STATE}, Brasil"
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
                res = await nominatim_query(hc, f"{c}, {full_city}")
                if res:
                    return res
    except Exception as exc:
        logging.getLogger(__name__).warning("geocode failed for %s: %s", address, exc)
    return None


async def geocode_pending() -> None:
    if GEOCODE_STATE["running"]:
        return
    GEOCODE_STATE["running"] = True
    try:
        docs = await db.hydrants.find({"geocoded": False, "geocode_failed": {"$ne": True}}, {"_id": 0}).to_list(5000)
        for d in docs:
            coords = await geocode_address(d.get("address", ""), d.get("municipality") or DEFAULT_MUNICIPALITY)
            upd = {"lat": coords["lat"], "lon": coords["lon"], "geocoded": True} if coords else {"geocode_failed": True}
            await db.hydrants.update_one({"id": d["id"]}, {"$set": upd})
    finally:
        GEOCODE_STATE["running"] = False


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def nearest_neighbor_order(origin: tuple[float, float], points: List[tuple[float, float]], limit: Optional[int] = None) -> List[int]:
    remaining = list(range(len(points)))
    order = []
    curr = origin
    while remaining:
        best = min(remaining, key=lambda i: haversine_km(curr[0], curr[1], points[i][0], points[i][1]))
        order.append(best)
        curr = points[best]
        remaining.remove(best)
        if limit is not None and len(order) >= limit:
            break
    return order


async def osrm_route(coords: List[tuple[float, float]]) -> Optional[dict]:
    if len(coords) < 2:
        return None
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coords)
    url = f"{OSRM_URL}/{coord_str}"
    params = {"overview": "false", "steps": "false"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as hc:
            r = await hc.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logging.getLogger(__name__).warning("osrm failed: %s", exc)
    return None


def build_google_maps_url(origin: tuple[float, float], stops: List[tuple[float, float]]) -> str:
    if not stops:
        return ""
    base = "https://www.google.com/maps/dir/?api=1&travelmode=driving"
    origin_str = f"{origin[0]},{origin[1]}"
    dest = f"{stops[-1][0]},{stops[-1][1]}"
    waypoints = stops[:-1]
    url = f"{base}&origin={quote(origin_str)}&destination={quote(dest)}"
    if waypoints:
        wp = "|".join(f"{lat},{lon}" for lat, lon in waypoints)
        url += f"&waypoints={quote(wp)}"
    return url


def doc_to_hydrant(doc: dict) -> Hydrant:
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return Hydrant(**doc)


def hydrant_to_doc(h: Hydrant) -> dict:
    d = h.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    return d


# ----------------------------- Routes -----------------------------
@api_router.get("/")
async def root():
    return {"message": "HydrantRoute SP API", "status": "ok"}


@api_router.post("/hydrants", response_model=Hydrant)
async def create_hydrant(payload: HydrantCreate):
    payload.type = norm_type(payload.type)
    payload.status = norm_status(payload.status)
    payload.last_inspection = parse_date_str(payload.last_inspection) if payload.last_inspection else None
    h = Hydrant(**payload.model_dump())
    # unique code enforcement
    existing = await db.hydrants.find_one({"code": h.code})
    if existing:
        raise HTTPException(400, f"Código {h.code} já cadastrado")
    coords = await geocode_address(h.address, h.municipality)
    if coords:
        h.lat = coords["lat"]
        h.lon = coords["lon"]
        h.geocoded = True
    try:
        await db.hydrants.insert_one(hydrant_to_doc(h))
    except DuplicateKeyError:
        raise HTTPException(400, f"Código {h.code} já cadastrado")
    return h


@api_router.get("/hydrants", response_model=List[Hydrant])
async def list_hydrants():
    docs = await db.hydrants.find({}, {"_id": 0}).to_list(5000)
    items = [doc_to_hydrant(d) for d in docs]
    items.sort(key=lambda h: (0, int(h.code), "") if h.code.isdigit() else (1, 0, h.code))
    return items


@api_router.put("/hydrants/{hydrant_id}", response_model=Hydrant)
async def update_hydrant(hydrant_id: str, payload: HydrantUpdate):
    doc = await db.hydrants.find_one({"id": hydrant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Hidrante não encontrado")
    h = doc_to_hydrant(doc)
    updates = payload.model_dump(exclude_unset=True)
    if "type" in updates:
        updates["type"] = norm_type(updates["type"])
    if "status" in updates:
        updates["status"] = norm_status(updates["status"])
    if "last_inspection" in updates and updates["last_inspection"]:
        updates["last_inspection"] = parse_date_str(updates["last_inspection"])
    if "code" in updates and await db.hydrants.find_one({"code": updates["code"], "id": {"$ne": hydrant_id}}):
        raise HTTPException(400, f"Código {updates['code']} já cadastrado")
    addr_changed = any(k in updates for k in ("address", "municipality"))
    for k, v in updates.items():
        setattr(h, k, v)
    if addr_changed:
        coords = await geocode_address(h.address, h.municipality)
        h.lat = coords["lat"] if coords else None
        h.lon = coords["lon"] if coords else None
        h.geocoded = bool(coords)
    try:
        await db.hydrants.replace_one({"id": hydrant_id}, hydrant_to_doc(h))
    except DuplicateKeyError:
        raise HTTPException(400, f"Código {h.code} já cadastrado")
    return h


@api_router.delete("/hydrants/{hydrant_id}")
async def delete_hydrant(hydrant_id: str):
    res = await db.hydrants.delete_one({"id": hydrant_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Hidrante não encontrado")
    return {"ok": True}


@api_router.delete("/hydrants")
async def delete_all_hydrants():
    res = await db.hydrants.delete_many({})
    return {"ok": True, "deleted": res.deleted_count}


@api_router.post("/hydrants/bulk", response_model=List[Hydrant])
async def bulk_create_hydrants(file: UploadFile = File(...)):
    """CSV columns: code,type,address,municipality,last_inspection,status,sector"""
    content = (await file.read()).decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    created: List[Hydrant] = []

    async def process(row: dict):
        norm = {(k or "").lower().strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        code = norm.get("code") or norm.get("id") or norm.get("codigo") or ""
        address = norm.get("address") or norm.get("endereco") or norm.get("endereço") or norm.get("rua") or ""
        if not code or not address:
            return None
        try:
            h = Hydrant(
                code=code,
                type=norm_type(norm.get("type") or norm.get("tipo") or "coluna"),
                address=address,
                municipality=norm.get("municipality") or norm.get("municipio") or norm.get("município") or DEFAULT_MUNICIPALITY,
                last_inspection=parse_date_str(norm.get("last_inspection") or norm.get("ultima_vistoria") or norm.get("última_vistoria") or ""),
                status=norm_status(norm.get("status") or norm.get("situacao") or norm.get("situação") or "possivel_de_uso"),
                sector=norm.get("sector") or norm.get("setor") or None,
            )
        except Exception:
            return None
        return h

    for row in reader:
        h = await process(row)
        if h is None or await db.hydrants.find_one({"code": h.code}):
            continue
        await db.hydrants.insert_one(hydrant_to_doc(h))
        created.append(h)
    asyncio.create_task(geocode_pending())
    return created


@api_router.post("/hydrants/scrape", response_model=ScrapeResponse)
async def scrape_hydrants():
    """Fetch hydrants from the Corpo de Bombeiros SP page and insert pending-inspection list."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"}
    async with httpx.AsyncClient(timeout=30.0, headers=headers, follow_redirects=True) as hc:
        r = await hc.get(CB_SCRAPE_URL)
        r.raise_for_status()
        html = r.text

    soup = BeautifulSoup(html, "lxml")
    target_h = None
    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        if "PENDENTES DE VISTORIA" in h.get_text().upper() and "2026" in h.get_text():
            target_h = h
            break
    if not target_h:
        raise HTTPException(500, "Tabela 'HIDRANTES PENDENTES DE VISTORIA - CICLO 2026 2º SEM' não encontrada")

    table = target_h.find_next("table")
    if not table:
        raise HTTPException(500, "Tabela não encontrada após o cabeçalho")

    headers_th = [th.get_text(strip=True).upper() for th in table.select("thead th")]
    idx = {name: headers_th.index(name) for name in headers_th}

    rows = table.select("tbody tr")
    fetched = len(rows)
    inserted = 0
    skipped = 0

    async def process(cells: List[str]):
        nonlocal inserted, skipped
        try:
            code = cells[idx["ID"]].strip()
            if not code:
                return
            existing = await db.hydrants.find_one({"code": code})
            if existing:
                skipped += 1
                return
            h = Hydrant(
                code=code,
                type=norm_type(cells[idx["TIPO"]]),
                address=cells[idx["ENDERECO"]].strip(),
                municipality=cells[idx["MUNICIPIO"]].strip().title() or DEFAULT_MUNICIPALITY,
                last_inspection=parse_date_str(cells[idx["ULTIMA VISTORIA CB"]]),
                status=norm_status(cells[idx["SITUACAO"]]),
                sector=cells[idx["SETOR"]].strip() if "SETOR" in idx else None,
            )
            await db.hydrants.insert_one(hydrant_to_doc(h))
            inserted += 1
        except Exception as exc:
            logging.getLogger(__name__).warning("scrape row failed: %s", exc)

    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all("td")]
        if len(cells) >= len(headers_th):
            await process(cells)
    asyncio.create_task(geocode_pending())
    geocoded_count = await db.hydrants.count_documents({"geocoded": True})
    return ScrapeResponse(fetched=fetched, inserted=inserted, skipped=skipped, geocoded=geocoded_count)


@api_router.get("/hydrants/geocode-status")
async def geocode_status():
    total = await db.hydrants.count_documents({})
    geocoded = await db.hydrants.count_documents({"geocoded": True})
    failed = await db.hydrants.count_documents({"geocode_failed": True})
    return {"running": GEOCODE_STATE["running"], "total": total, "geocoded": geocoded, "failed": failed,
            "pending": total - geocoded - failed}


@api_router.post("/hydrants/geocode-retry")
async def geocode_retry():
    await db.hydrants.update_many({"geocode_failed": True}, {"$unset": {"geocode_failed": ""}})
    asyncio.create_task(geocode_pending())
    return {"ok": True}


@api_router.post("/route/optimize", response_model=RouteResponse)
async def optimize_route(req: RouteRequest):
    if req.hydrant_ids:
        docs = await db.hydrants.find({"id": {"$in": req.hydrant_ids}}, {"_id": 0}).to_list(2000)
    else:
        docs = await db.hydrants.find({"geocoded": True}, {"_id": 0}).to_list(2000)
    hydrants = [doc_to_hydrant(d) for d in docs]
    geocoded = [h for h in hydrants if h.lat is not None and h.lon is not None]
    unreachable = [h.code for h in hydrants if h.lat is None or h.lon is None]

    if not geocoded:
        raise HTTPException(400, "Nenhum hidrante possui coordenadas geocodificadas")

    origin = (req.origin_lat, req.origin_lon)
    points = [(h.lat, h.lon) for h in geocoded]
    order = nearest_neighbor_order(origin, points, limit=req.max_stops)
    ordered_hydrants = [geocoded[i] for i in order]
    ordered_coords = [(h.lat, h.lon) for h in ordered_hydrants]

    route_coords = [origin] + ordered_coords
    osrm = await osrm_route(route_coords)
    legs_dist_km, legs_dur_min = [], []
    if osrm and osrm.get("code") == "Ok" and osrm.get("routes"):
        for leg in osrm["routes"][0].get("legs", []):
            legs_dist_km.append(leg.get("distance", 0) / 1000.0)
            legs_dur_min.append(leg.get("duration", 0) / 60.0)
    if not legs_dist_km:
        for i in range(len(route_coords) - 1):
            d = haversine_km(route_coords[i][0], route_coords[i][1], route_coords[i + 1][0], route_coords[i + 1][1])
            legs_dist_km.append(d)
            legs_dur_min.append((d / 40.0) * 60.0)

    stops = []
    for idx_, h in enumerate(ordered_hydrants):
        stops.append(RouteStop(
            order=idx_ + 1,
            hydrant=h,
            distance_from_prev_km=round(legs_dist_km[idx_], 2) if idx_ < len(legs_dist_km) else 0,
            duration_from_prev_min=round(legs_dur_min[idx_], 1) if idx_ < len(legs_dur_min) else 0,
        ))

    gmaps_url = build_google_maps_url(origin, ordered_coords)
    # Google Maps allows ~9 waypoints per link: split long routes into chained segments of 10 stops
    segments, seg_origin = [], origin
    for i in range(0, len(ordered_coords), 10):
        chunk = ordered_coords[i:i + 10]
        segments.append(build_google_maps_url(seg_origin, chunk))
        seg_origin = chunk[-1]
    return RouteResponse(
        total_distance_km=round(sum(legs_dist_km), 2),
        total_duration_min=round(sum(legs_dur_min), 1),
        stops=stops,
        google_maps_url=segments[0] if len(segments) > 1 else gmaps_url,
        google_maps_segments=segments,
        unreachable=unreachable,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
