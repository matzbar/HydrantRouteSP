"""Otimização da ordem das paradas: caminho aberto que parte da origem (GPS) e não retorna.

Problema: dada uma matriz de custos (tempo de carro em segundos) com o índice 0 = origem e 1..M = hidrantes
candidatos, escolher `n_select` hidrantes e a ordem de visita que minimizam o custo total do caminho.

Método: solução inicial por vizinho mais próximo e refinamento por busca local até não haver melhora
(ou até o limite de tempo):
  - 2-opt: inverte um trecho do caminho (custo calculado para matriz assimétrica);
  - Or-opt: move um bloco de 1 a 3 paradas consecutivas para outra posição;
  - troca: substitui uma parada por um hidrante não escolhido (quando n_select < M).
Uma primeira parada fixa (`fixed_first`) nunca sai da posição 1.
"""
import math
import time
from typing import List, Optional, Sequence, Tuple

Matrix = Sequence[Sequence[float]]

ROAD_FACTOR = 1.35  # ruas não são linha reta
ESTIMATE_SPEED_KMH = 30.0  # velocidade média urbana usada só na estimativa


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def estimated_matrices(coords: Sequence[Tuple[float, float]]) -> Tuple[List[List[float]], List[List[float]]]:
    """(durações em s, distâncias em m) estimadas pela linha reta × fator de ruas, quando o OSRM não responde."""
    n = len(coords)
    dist = [[0.0] * n for _ in range(n)]
    dur = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                m = haversine_km(*coords[i], *coords[j]) * ROAD_FACTOR * 1000.0
                dist[i][j] = m
                dur[i][j] = m / (ESTIMATE_SPEED_KMH / 3.6)
    return dur, dist


def path_cost(cost: Matrix, path: Sequence[int]) -> float:
    """Custo de 0 → path[0] → path[1] → ..."""
    full = [0, *path]
    return sum(cost[full[i]][full[i + 1]] for i in range(len(full) - 1))


def nearest_neighbor(cost: Matrix, candidates: Sequence[int], n_select: int,
                     fixed_first: Optional[int] = None) -> List[int]:
    remaining = [c for c in candidates if c != fixed_first]
    path: List[int] = [fixed_first] if fixed_first is not None else []
    curr = fixed_first if fixed_first is not None else 0
    while remaining and len(path) < n_select:
        best = min(remaining, key=lambda c: cost[curr][c])
        path.append(best)
        remaining.remove(best)
        curr = best
    return path


def _two_opt(cost: Matrix, p: List[int], lo: int) -> bool:
    """p inclui a origem em p[0]. Inverte p[i..j] (i >= lo). Primeira melhora encontrada."""
    n = len(p)
    if n - lo < 2:
        return False
    # prefixos dos custos no sentido do caminho (fwd) e no sentido inverso (bwd)
    fwd = [0.0] * n
    bwd = [0.0] * n
    for t in range(1, n):
        fwd[t] = fwd[t - 1] + cost[p[t - 1]][p[t]]
        bwd[t] = bwd[t - 1] + cost[p[t]][p[t - 1]]
    for i in range(lo, n - 1):
        a = p[i - 1]
        for j in range(i + 1, n):
            b = p[j + 1] if j + 1 < n else None
            old = cost[a][p[i]] + (fwd[j] - fwd[i]) + (cost[p[j]][b] if b is not None else 0.0)
            new = cost[a][p[j]] + (bwd[j] - bwd[i]) + (cost[p[i]][b] if b is not None else 0.0)
            if new < old - 1e-9:
                p[i:j + 1] = reversed(p[i:j + 1])
                return True
    return False


def _or_opt(cost: Matrix, p: List[int], lo: int) -> bool:
    """Move o bloco p[i..i+L-1] para depois de p[k]. Primeira melhora encontrada."""
    n = len(p)
    for seg_len in (1, 2, 3):
        for i in range(lo, n - seg_len + 1):
            s0, s1 = p[i], p[i + seg_len - 1]
            a = p[i - 1]
            b = p[i + seg_len] if i + seg_len < n else None
            removed = cost[a][s0] + (cost[s1][b] - cost[a][b] if b is not None else 0.0)
            for k in range(lo - 1, n):
                if i - 1 <= k <= i + seg_len - 1:
                    continue
                x = p[k]
                y = p[k + 1] if k + 1 < n else None
                added = cost[x][s0] + (cost[s1][y] - cost[x][y] if y is not None else 0.0)
                if added < removed - 1e-9:
                    seg = p[i:i + seg_len]
                    del p[i:i + seg_len]
                    k2 = k if k < i else k - seg_len
                    p[k2 + 1:k2 + 1] = seg
                    return True
    return False


def _swap_in(cost: Matrix, p: List[int], lo: int, outside: List[int]) -> bool:
    """Tira uma parada p[i] e coloca um hidrante de fora na melhor posição do caminho."""
    n = len(p)
    for i in range(lo, n):
        a, v = p[i - 1], p[i]
        b = p[i + 1] if i + 1 < n else None
        saved = cost[a][v] + (cost[v][b] - cost[a][b] if b is not None else 0.0)
        q = p[:i] + p[i + 1:]
        for oi, u in enumerate(outside):
            best_k, best_add = None, saved - 1e-9
            for k in range(lo - 1, len(q)):
                x = q[k]
                y = q[k + 1] if k + 1 < len(q) else None
                add = cost[x][u] + (cost[u][y] - cost[x][y] if y is not None else 0.0)
                if add < best_add:
                    best_k, best_add = k, add
            if best_k is not None:
                q.insert(best_k + 1, u)
                p[:] = q
                outside[oi] = v
                return True
    return False


def _local_search(cost: Matrix, path: List[int], candidates: List[int], lo: int, deadline: float) -> List[int]:
    p = [0, *path]
    chosen = set(path)
    outside = [c for c in candidates if c not in chosen]
    while time.perf_counter() < deadline:
        if _two_opt(cost, p, lo) or _or_opt(cost, p, lo) or (outside and _swap_in(cost, p, lo, outside)):
            continue
        break
    return p[1:]


def optimize_open_path(cost: Matrix, n_select: Optional[int] = None, fixed_first: Optional[int] = None,
                       time_limit_s: float = 2.0, starts: int = 8) -> List[int]:
    """Devolve a ordem dos índices (1..M) a visitar, sem a origem.

    Roda a busca local a partir de várias soluções iniciais (vizinho mais próximo começando por cada um
    dos hidrantes mais próximos da partida) e fica com a melhor.
    """
    m = len(cost) - 1
    if m <= 0:
        return []
    n_select = m if n_select is None else max(0, min(n_select, m))
    if n_select == 0:
        return []
    candidates = list(range(1, m + 1))
    lo = 2 if fixed_first is not None else 1  # posição mais baixa que pode mudar
    prefix = [fixed_first] if fixed_first is not None else []
    anchor = fixed_first if fixed_first is not None else 0

    initial = [nearest_neighbor(cost, candidates, n_select, fixed_first)]
    if n_select > len(prefix):
        firsts = sorted((c for c in candidates if c != fixed_first), key=lambda c: cost[anchor][c])
        for c in firsts[:max(0, starts - 1)]:
            # caminho de tamanho n_select - len(prefix), começando por c
            rest = nearest_neighbor(cost, [x for x in candidates if x not in prefix], n_select - len(prefix), c)
            initial.append(prefix + rest)

    t0 = time.perf_counter()
    best = None
    for idx, start in enumerate(initial):
        share = (time_limit_s - (time.perf_counter() - t0)) / (len(initial) - idx)
        if share <= 0 and best is not None:
            break
        path = _local_search(cost, list(start), candidates, lo, time.perf_counter() + max(share, 0.05))
        c = path_cost(cost, path)
        if best is None or c < best[0] - 1e-9:
            best = (c, path)
    return best[1]
