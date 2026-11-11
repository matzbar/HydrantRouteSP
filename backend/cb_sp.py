"""Dados do Corpo de Bombeiros (CB SP): páginas do site de hidrantes e posição oficial no mapa (ArcGIS).

Nada é gravado em banco: as páginas e posições ficam só em cache na memória.
"""
import asyncio
import re
import time
import unicodedata
from contextlib import suppress
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException

from config import (CB_HYDRANTS_LAYER_URL, CB_INDEX_URL, INDEX_TTL_S, OFFICIAL_CHUNK, OFFICIAL_TTL_S, SP_BOUNDS,
                    STATION_TTL_S, USER_AGENT, logger)


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
