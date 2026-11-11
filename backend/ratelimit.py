"""Limite de requisições por IP, com janela deslizante, em memória (o app roda com 1 processo)."""
import time
from collections import deque
from typing import Deque, Dict, Optional


class RateLimiter:
    def __init__(self, per_window: int, window_s: float = 60.0):
        self.limit = per_window
        self.window_s = window_s
        self.hits: Dict[str, Deque[float]] = {}
        self._last_sweep = time.monotonic()

    def hit(self, key: str) -> Optional[float]:
        """Registra uma requisição. Devolve None se permitida, ou quantos segundos esperar."""
        now = time.monotonic()
        self._sweep(now)
        q = self.hits.setdefault(key, deque())
        while q and now - q[0] >= self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return self.window_s - (now - q[0])
        q.append(now)
        return None

    def _sweep(self, now: float) -> None:
        """Esquece IPs inativos de vez em quando, para a memória não crescer sem limite."""
        if now - self._last_sweep < self.window_s * 5:
            return
        self._last_sweep = now
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] >= self.window_s]:
            del self.hits[key]

    def reset(self) -> None:
        self.hits.clear()
