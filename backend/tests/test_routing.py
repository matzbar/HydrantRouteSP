"""Otimizador de rota: compara com a força bruta em instâncias pequenas."""
import itertools
import random

import pytest

from routing import estimated_matrices, nearest_neighbor, optimize_open_path, path_cost


def brute_force(cost, n_select, fixed_first=None):
    nodes = [i for i in range(1, len(cost)) if i != fixed_first]
    k = n_select - (1 if fixed_first is not None else 0)
    best = None
    for combo in itertools.permutations(nodes, k):
        path = ([fixed_first] if fixed_first is not None else []) + list(combo)
        c = path_cost(cost, path)
        if best is None or c < best[0]:
            best = (c, path)
    return best


def random_matrix(rng, n, asymmetric=True):
    pts = [(rng.uniform(-23.6, -23.5), rng.uniform(-46.7, -46.5)) for _ in range(n)]
    dur, _ = estimated_matrices(pts)
    if asymmetric:  # mão única, semáforos: ida e volta com tempos diferentes
        dur = [[v * rng.uniform(0.8, 1.3) for v in row] for row in dur]
    return dur


@pytest.mark.parametrize("seed", range(20))
def test_matches_or_beats_nearest_neighbor_and_is_near_optimal(seed):
    rng = random.Random(seed)
    cost = random_matrix(rng, 9)  # origem + 8 hidrantes
    n_select = rng.choice([4, 6, 8])
    fixed = rng.choice([None, 3])
    nn = nearest_neighbor(cost, range(1, 9), n_select, fixed)
    opt = optimize_open_path(cost, n_select, fixed)
    best_cost, _ = brute_force(cost, n_select, fixed)
    assert len(opt) == n_select and len(set(opt)) == n_select
    if fixed is not None:
        assert opt[0] == fixed
    assert path_cost(cost, opt) <= path_cost(cost, nn) + 1e-6
    assert path_cost(cost, opt) <= best_cost * 1.05  # busca local: no máximo 5% acima do ótimo


def test_average_gain_over_nearest_neighbor_on_larger_instances():
    rng = random.Random(42)
    gains = []
    for _ in range(10):
        cost = random_matrix(rng, 41)
        nn = path_cost(cost, nearest_neighbor(cost, range(1, 41), 40))
        opt = path_cost(cost, optimize_open_path(cost, 40))
        assert opt <= nn + 1e-6
        gains.append(1 - opt / nn)
    assert sum(gains) / len(gains) > 0.05  # em média, rotas pelo menos 5% mais curtas


def test_edge_cases():
    cost = [[0, 1], [1, 0]]
    assert optimize_open_path(cost, 1) == [1]
    assert optimize_open_path(cost, 0) == []
    assert optimize_open_path([[0]], 3) == []
    assert optimize_open_path(cost, 1, fixed_first=1) == [1]
