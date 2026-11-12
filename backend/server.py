"""HydrantRoute SP: API.

Lê ao vivo as páginas públicas do Corpo de Bombeiros (CB SP): o índice de estações e a tabela de
"hidrantes pendentes de vistoria" de cada estação. Nada da página do CB SP é armazenado; o único dado
persistido (opcionalmente, no MongoDB) é o cache de coordenadas dos endereços geocodificados.

Módulos: cb_sp (dados do CB SP), geocoding (endereço → coordenadas), osrm (tempos de carro),
routing (otimização da ordem das paradas).
"""
import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import List, Optional
from urllib.parse import urljoin

from fastapi import APIRouter, FastAPI, HTTPException, Path as PathParam, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

import cb_sp
import geocoding
import osrm
from config import (CB_INDEX_URL, MAX_ROUTE_POINTS, OSRM_TABLE_MAX, RATE_LIMIT_PER_MIN, ROUTE_RATE_LIMIT_PER_MIN,
                    STATION_CODE_PATTERN)
from ratelimit import RateLimiter
from routing import (build_google_maps_url, estimated_matrices, haversine_km, nearest_neighbor, optimize_open_path,
                     path_cost)

ROOT_DIR = Path(__file__).parent


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    geocoding.GEOCACHE.connect(os.environ.get("MONGO_URL"), os.environ.get("DB_NAME", "hydrantroute"))
    index_task = asyncio.create_task(geocoding.GEOCACHE.ensure_index())
    geocoding.GEOCODER.start()
    try:
        yield
    finally:
        await geocoding.GEOCODER.stop()
        index_task.cancel()
        with suppress(asyncio.CancelledError):
            await index_task
        geocoding.GEOCACHE.close()


app = FastAPI(title="HydrantRoute SP", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

API_LIMITER = RateLimiter(RATE_LIMIT_PER_MIN)
ROUTE_LIMITER = RateLimiter(ROUTE_RATE_LIMIT_PER_MIN)
TOO_MANY = "Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente."


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    """Protege a API (e os serviços externos que ela consulta) de uso abusivo, por IP."""
    path = request.url.path
    if path.startswith("/api"):
        ip = request.client.host if request.client else "desconhecido"
        limiters = [API_LIMITER] + ([ROUTE_LIMITER] if path == "/api/route/optimize" else [])
        for limiter in limiters:
            wait = limiter.hit(ip)
            if wait is not None:
                return JSONResponse(status_code=429, content={"detail": TOO_MANY},
                                    headers={"Retry-After": str(int(wait) + 1)})
    return await call_next(request)


@api_router.get("/")
async def root():
    return {"message": "HydrantRoute SP API", "status": "ok"}


@api_router.get("/stations")
async def list_stations():
    return await cb_sp.get_stations()


@api_router.get("/stations/{code}/hydrants")
async def station_hydrants(code: str = PathParam(..., pattern=STATION_CODE_PATTERN)):
    page = await cb_sp.get_station_page(code)
    station = {"code": code}
    with suppress(HTTPException):  # o índice só enriquece a resposta; a página da estação basta
        station = next((s for s in await cb_sp.get_stations() if s["code"] == code), station)
    official = await cb_sp.get_official_coords(code, [h["code"] for h in page["hydrants"]])
    hydrants, counts = await geocoding.attach_coords(page["hydrants"], official)
    return {
        "station": {**station, "url": urljoin(CB_INDEX_URL, f"{code}.html")},
        "cycle": page["cycle"],
        "hydrants": hydrants,
        "geocode": counts,
    }


@api_router.post("/stations/{code}/geocode-retry")
async def station_geocode_retry(code: str = PathParam(..., pattern=STATION_CODE_PATTERN)):
    page = await cb_sp.get_station_page(code)
    for h in page["hydrants"]:
        geocoding.GEO_FAILED.discard(geocoding.geo_key(h["address"], h["municipality"]))
    official = await cb_sp.get_official_coords(code, [h["code"] for h in page["hydrants"]])
    _, counts = await geocoding.attach_coords(page["hydrants"], official)
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

    matrix = await osrm.osrm_table(coords)
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
        route_data = await osrm.osrm_route([origin] + ordered_coords) or {}
        legs = route_data.get("routes", [{}])[0].get("legs", []) if route_data.get("code") == "Ok" else []
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
