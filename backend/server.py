import asyncio
import csv
import io
import logging
import math
import os
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from pymongo import ASCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

DEFAULT_CITY = "São Paulo, SP, Brasil"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
USER_AGENT = "Mozilla/5.0 (compatible; HydrantRouteBR/1.0)"

INDEXES: dict[str, list[IndexModel]] = {
    "hydrants": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code"),
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
class HydrantBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str = Field(..., description="Código/ID do hidrante")
    type: str = Field(..., description="subterraneo | coluna")
    status: str = Field(..., description="operacional | inoperante")
    street: str
    number: str
    city: str = DEFAULT_CITY


class HydrantCreate(HydrantBase):
    pass


class Hydrant(HydrantBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lat: Optional[float] = None
    lon: Optional[float] = None
    geocoded: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HydrantUpdate(BaseModel):
    code: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    city: Optional[str] = None


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    hydrant_ids: List[str]


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
    unreachable: List[str] = []


# ----------------------------- Helpers -----------------------------
async def geocode_address(street: str, number: str, city: str) -> Optional[dict]:
    """Query Nominatim to get lat/lon for an address."""
    query = f"{street}, {number}, {city}"
    params = {"q": query, "format": "json", "limit": 1, "countrycodes": "br"}
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": "https://hydrant-route.local/",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, headers=headers, follow_redirects=True) as hc:
            r = await hc.get(NOMINATIM_URL, params=params)
            r.raise_for_status()
            data = r.json()
            if not data:
                # Retry without number
                params["q"] = f"{street}, {city}"
                r2 = await hc.get(NOMINATIM_URL, params=params)
                r2.raise_for_status()
                data = r2.json()
            if data:
                return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"])}
    except Exception as exc:
        logging.getLogger(__name__).warning("geocode failed for %s: %s", query, exc)
    return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def nearest_neighbor_order(origin: tuple[float, float], points: List[tuple[float, float]]) -> List[int]:
    """Return ordering indexes of points using nearest-neighbor from origin."""
    remaining = list(range(len(points)))
    order = []
    curr = origin
    while remaining:
        best = min(remaining, key=lambda i: haversine_km(curr[0], curr[1], points[i][0], points[i][1]))
        order.append(best)
        curr = points[best]
        remaining.remove(best)
    return order


async def osrm_route(coords: List[tuple[float, float]]) -> Optional[dict]:
    """Call OSRM for a route. coords is list of (lat, lon). Returns legs info."""
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
    h = Hydrant(**payload.model_dump())
    coords = await geocode_address(h.street, h.number, h.city)
    if coords:
        h.lat = coords["lat"]
        h.lon = coords["lon"]
        h.geocoded = True
    await db.hydrants.insert_one(hydrant_to_doc(h))
    return h


@api_router.get("/hydrants", response_model=List[Hydrant])
async def list_hydrants():
    docs = await db.hydrants.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [doc_to_hydrant(d) for d in docs]


@api_router.put("/hydrants/{hydrant_id}", response_model=Hydrant)
async def update_hydrant(hydrant_id: str, payload: HydrantUpdate):
    doc = await db.hydrants.find_one({"id": hydrant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Hidrante não encontrado")
    h = doc_to_hydrant(doc)
    updates = payload.model_dump(exclude_unset=True)
    addr_changed = any(k in updates for k in ("street", "number", "city"))
    for k, v in updates.items():
        setattr(h, k, v)
    if addr_changed:
        coords = await geocode_address(h.street, h.number, h.city)
        if coords:
            h.lat = coords["lat"]
            h.lon = coords["lon"]
            h.geocoded = True
        else:
            h.geocoded = False
            h.lat = None
            h.lon = None
    await db.hydrants.replace_one({"id": hydrant_id}, hydrant_to_doc(h))
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
    """Upload CSV with columns: code,type,status,street,number[,city]"""
    content = (await file.read()).decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    created: List[Hydrant] = []
    sem = asyncio.Semaphore(4)

    async def process(row: dict):
        norm = {k.lower().strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        try:
            h = Hydrant(
                code=norm.get("code") or norm.get("codigo") or norm.get("código") or "",
                type=(norm.get("type") or norm.get("tipo") or "coluna").lower(),
                status=(norm.get("status") or norm.get("estado") or "operacional").lower(),
                street=norm.get("street") or norm.get("rua") or "",
                number=norm.get("number") or norm.get("numero") or norm.get("número") or "",
                city=norm.get("city") or norm.get("cidade") or DEFAULT_CITY,
            )
        except Exception:
            return None
        if not h.code or not h.street:
            return None
        async with sem:
            coords = await geocode_address(h.street, h.number, h.city)
            if coords:
                h.lat = coords["lat"]
                h.lon = coords["lon"]
                h.geocoded = True
        return h

    tasks = [process(row) for row in reader]
    results = await asyncio.gather(*tasks)
    for h in results:
        if h is None:
            continue
        await db.hydrants.insert_one(hydrant_to_doc(h))
        created.append(h)
    return created


@api_router.post("/hydrants/seed", response_model=List[Hydrant])
async def seed_sample_hydrants():
    """Seed sample hydrants in São Paulo for demo."""
    samples = [
        {"code": "HDR-001", "type": "coluna", "status": "operacional", "street": "Avenida Paulista", "number": "1578"},
        {"code": "HDR-002", "type": "subterraneo", "status": "operacional", "street": "Rua da Consolação", "number": "930"},
        {"code": "HDR-003", "type": "coluna", "status": "inoperante", "street": "Praça da Sé", "number": "1"},
        {"code": "HDR-004", "type": "subterraneo", "status": "operacional", "street": "Avenida Brigadeiro Luís Antônio", "number": "2344"},
        {"code": "HDR-005", "type": "coluna", "status": "operacional", "street": "Rua Augusta", "number": "1200"},
        {"code": "HDR-006", "type": "subterraneo", "status": "inoperante", "street": "Avenida Rebouças", "number": "600"},
    ]
    created = []
    for s in samples:
        existing = await db.hydrants.find_one({"code": s["code"]})
        if existing:
            continue
        h = Hydrant(**s)
        coords = await geocode_address(h.street, h.number, h.city)
        if coords:
            h.lat = coords["lat"]
            h.lon = coords["lon"]
            h.geocoded = True
        await db.hydrants.insert_one(hydrant_to_doc(h))
        created.append(h)
    return created


@api_router.post("/route/optimize", response_model=RouteResponse)
async def optimize_route(req: RouteRequest):
    if not req.hydrant_ids:
        raise HTTPException(400, "Lista de hidrantes vazia")
    docs = await db.hydrants.find({"id": {"$in": req.hydrant_ids}}, {"_id": 0}).to_list(1000)
    hydrants_by_id = {d["id"]: doc_to_hydrant(d) for d in docs}

    geocoded, unreachable = [], []
    for hid in req.hydrant_ids:
        h = hydrants_by_id.get(hid)
        if not h:
            unreachable.append(hid)
        elif h.lat is None or h.lon is None:
            unreachable.append(h.code)
        else:
            geocoded.append(h)

    if not geocoded:
        raise HTTPException(400, "Nenhum hidrante possui coordenadas geocodificadas")

    origin = (req.origin_lat, req.origin_lon)
    points = [(h.lat, h.lon) for h in geocoded]
    order = nearest_neighbor_order(origin, points)
    ordered_hydrants = [geocoded[i] for i in order]
    ordered_coords = [(h.lat, h.lon) for h in ordered_hydrants]

    # Try OSRM for real road distances
    route_coords = [origin] + ordered_coords
    osrm = await osrm_route(route_coords)
    legs_dist_km = []
    legs_dur_min = []
    if osrm and osrm.get("code") == "Ok" and osrm.get("routes"):
        legs = osrm["routes"][0].get("legs", [])
        for leg in legs:
            legs_dist_km.append(leg.get("distance", 0) / 1000.0)
            legs_dur_min.append(leg.get("duration", 0) / 60.0)
    if not legs_dist_km:
        # fallback to haversine
        for i in range(len(route_coords) - 1):
            d = haversine_km(route_coords[i][0], route_coords[i][1], route_coords[i + 1][0], route_coords[i + 1][1])
            legs_dist_km.append(d)
            legs_dur_min.append((d / 40.0) * 60.0)  # assume 40km/h

    stops = []
    for idx, h in enumerate(ordered_hydrants):
        stops.append(RouteStop(
            order=idx + 1,
            hydrant=h,
            distance_from_prev_km=round(legs_dist_km[idx], 2) if idx < len(legs_dist_km) else 0,
            duration_from_prev_min=round(legs_dur_min[idx], 1) if idx < len(legs_dur_min) else 0,
        ))

    gmaps_url = build_google_maps_url(origin, ordered_coords)
    return RouteResponse(
        total_distance_km=round(sum(legs_dist_km), 2),
        total_duration_min=round(sum(legs_dur_min), 1),
        stops=stops,
        google_maps_url=gmaps_url,
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
