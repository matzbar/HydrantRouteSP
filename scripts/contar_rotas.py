"""Conta, pelos logs do Render, quantas rotas o HydrantRouteSP gerou por dia (últimos 7 dias).

Uso:  python3 scripts/contar_rotas.py

Precisa de uma chave da API do Render (Account Settings → API Keys), lida da variável RENDER_API_KEY ou do
arquivo ~/.config/render/api_key. A chave dá acesso total à conta: apague-a no Render quando não for mais usar.
Só usa a biblioteca padrão do Python. O plano grátis do Render guarda cerca de 7 dias de logs.
"""
import collections
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.render.com/v1"
SERVICE_NAME = "hydrantroute-sp"
KEY_FILE = os.path.expanduser("~/.config/render/api_key")
BRT = dt.timezone(dt.timedelta(hours=-3))
# O que contar: trecho procurado no log → nome na tabela.
PATHS = {"/api/route/optimize": "rotas", "/api/config": "aberturas", "/api/stations": "estações"}


def api_key() -> str:
    key = os.environ.get("RENDER_API_KEY", "").strip()
    if not key and os.path.exists(KEY_FILE):
        with open(KEY_FILE) as f:
            key = f.read().strip()
    if not key:
        sys.exit(f"Sem chave do Render: defina RENDER_API_KEY ou grave a chave em {KEY_FILE}.")
    return key


def get(path: str, params: list, key: str):
    req = urllib.request.Request(f"{API}{path}?{urllib.parse.urlencode(params)}",
                                 headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as exc:
        sys.exit(f"O Render recusou a consulta (HTTP {exc.code}). A chave foi apagada ou está errada?")


def find_service(key: str):
    for item in get("/services", [("limit", "50")], key):
        s = item["service"]
        if s["name"] == SERVICE_NAME:
            return s["ownerId"], s["id"]
    sys.exit(f"Serviço {SERVICE_NAME!r} não encontrado nesta conta do Render.")


def fetch_logs(key: str, owner: str, service: str, text: str, start: str, end: str) -> list:
    """Todas as linhas que contêm `text` no período, seguindo a paginação da API."""
    logs = []
    while True:
        d = get("/logs", [("ownerId", owner), ("resource", service), ("text", text), ("limit", "100"),
                          ("startTime", start), ("endTime", end), ("direction", "backward")], key)
        logs += [log for log in d.get("logs", []) if text in log.get("message", "")]
        if not d.get("hasMore"):
            return logs
        end = d["nextEndTime"]


def status_of(message: str) -> str:
    """Status HTTP de uma linha de acesso do uvicorn: ... "POST /api/... HTTP/1.1" 200 OK."""
    tail = message.rsplit('"', 1)
    return tail[-1].split()[0] if len(tail) > 1 and tail[-1].split() else "?"


def main() -> None:
    key = api_key()
    owner, service = find_service(key)
    now = dt.datetime.now(dt.timezone.utc)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    start, end = (now - dt.timedelta(days=7) + dt.timedelta(minutes=5)).strftime(fmt), now.strftime(fmt)

    per_day = collections.defaultdict(collections.Counter)
    for text, label in PATHS.items():
        logs = fetch_logs(key, owner, service, text, start, end)
        for log in logs:
            day = dt.datetime.fromisoformat(log["timestamp"][:19] + "+00:00").astimezone(BRT).date()
            per_day[day][label] += 1
        if label == "rotas":
            routes = logs

    print(f"{'dia':<12}" + "".join(f"{label:>12}" for label in PATHS.values()))
    for day in sorted(per_day):
        print(f"{day.strftime('%d/%m'):<12}" + "".join(f"{per_day[day][label]:>12}" for label in PATHS.values()))

    total = len(routes)
    codes = collections.Counter(status_of(log["message"]) for log in routes)
    minutes = collections.Counter(log["timestamp"][:16] for log in routes)
    print(f"\nRotas nos últimos 7 dias: {total}  (status: {dict(codes)})")
    if minutes:
        print(f"Pico: {max(minutes.values())} rota(s) num mesmo minuto")
    print("Aberturas = /api/config. Datas no horário de Brasília.")


if __name__ == "__main__":
    main()
