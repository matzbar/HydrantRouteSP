"""Cliente do OSRM (roteamento de carro): matriz de tempos/distâncias e trechos de uma rota."""
from typing import List, Optional, Tuple

import httpx

from config import OSRM_TABLE_MAX, OSRM_TABLE_URL, OSRM_URL, USER_AGENT, logger
from routing import estimated_matrices


def _describe(exc: Exception) -> str:
    """Erro sem a URL: ela contém as coordenadas, inclusive a localização do usuário."""
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    return type(exc).__name__


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
        logger.warning("osrm table failed: %s", _describe(exc))
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
        logger.warning("osrm failed: %s", _describe(exc))
    return None
