"""Limite de requisições por IP, com janela deslizante, em memória (o app roda com 1 processo)."""
import time
from collections import OrderedDict, deque
from typing import Deque, Mapping, Optional


def client_ip(headers: Mapping[str, str], peer: Optional[str], trusted_hops: int) -> str:
    """IP do usuário, sem confiar no que o próprio cliente pode escrever.

    Cada proxy confiável acrescenta, à direita do X-Forwarded-For, o IP de quem falou com ele. O que o cliente
    mandar fica à esquerda e é ignorado. No Render a cadeia é Cloudflare → Render, então o IP real é o 2º a
    contar da direita (trusted_hops=2). Sem proxy na frente (trusted_hops=0), vale o IP da conexão.
    """
    if trusted_hops > 0:
        chain = [p.strip() for p in headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(chain) >= trusted_hops:
            return chain[-trusted_hops]
    # Cadeia menor que o esperado: a requisição não veio pelos proxies; o cabeçalho não é confiável.
    return peer or "desconhecido"


class RateLimiter:
    def __init__(self, per_window: int, window_s: float = 60.0, max_keys: int = 10_000):
        self.limit = per_window
        self.window_s = window_s
        self.max_keys = max_keys  # teto de IPs guardados: a memória não cresce sem limite
        self.hits: "OrderedDict[str, Deque[float]]" = OrderedDict()
        self._last_sweep = time.monotonic()

    def hit(self, key: str) -> Optional[float]:
        """Registra uma requisição. Devolve None se permitida, ou quantos segundos esperar."""
        now = time.monotonic()
        self._sweep(now)
        q = self.hits.get(key)
        if q is None:
            q = self.hits[key] = deque()
            while len(self.hits) > self.max_keys:
                self.hits.popitem(last=False)  # esquece o IP usado há mais tempo
        else:
            self.hits.move_to_end(key)
        while q and now - q[0] >= self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return self.window_s - (now - q[0])
        q.append(now)
        return None

    def _sweep(self, now: float) -> None:
        """Esquece IPs inativos de vez em quando."""
        if now - self._last_sweep < self.window_s * 5:
            return
        self._last_sweep = now
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] >= self.window_s]:
            del self.hits[key]

    def reset(self) -> None:
        self.hits.clear()
