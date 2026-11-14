"""Endereços dos serviços externos e limites do app."""
import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hydrantroute")
# O httpx registra a URL de cada requisição em INFO; na do OSRM vai a localização do usuário. Não registrar.
logging.getLogger("httpx").setLevel(logging.WARNING)

# Identificação nas requisições a serviços externos (exigida pela política do Nominatim/OpenStreetMap).
USER_AGENT = "HydrantRouteSP/1.0 (+https://github.com/matzbar/HydrantRouteSP)"
DEFAULT_STATE = "SP"

# Site do Corpo de Bombeiros: índice de estações e página de cada estação.
CB_INDEX_URL = "https://cbaplang.corpodebombeiros.sp.gov.br/hidrantes/07estacao/"
# Camada pública de hidrantes do mapa oficial do CB SP (ArcGIS "CBPMESP OPERACIONAL"): posição oficial por ID.
CB_HYDRANTS_LAYER_URL = ("https://services8.arcgis.com/8fjb2AtW3vRitLCB/arcgis/rest/services/"
                         "cbpmesp_hidrantes/FeatureServer/0/query")

# Geocodificação pelo endereço (alternativa quando não há posição oficial).
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
ARCGIS_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

# Roteamento. O servidor público do OSRM é para uso leve; para trocar por um próprio ou comercial,
# defina OSRM_BASE_URL (e OSRM_TABLE_MAX, se o novo servidor aceitar matrizes maiores).
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
OSRM_URL = f"{OSRM_BASE_URL}/route/v1/driving"
OSRM_TABLE_URL = f"{OSRM_BASE_URL}/table/v1/driving"
OSRM_TABLE_MAX = int(os.environ.get("OSRM_TABLE_MAX", "100"))  # limite de coordenadas por matriz

# Proteção contra abuso: requisições por minuto por IP.
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "120"))
ROUTE_RATE_LIMIT_PER_MIN = int(os.environ.get("ROUTE_RATE_LIMIT_PER_MIN", "20"))  # cálculo de rota (usa o OSRM)
# IP do usuário para o limite de requisições (veja ratelimit.client_ip). O Render define RENDER=true.
ON_RENDER = bool(os.environ.get("RENDER"))
# Cabeçalho com o IP do visitante escrito por um proxy confiável. No Render, que fica atrás da Cloudflare, é o
# CF-Connecting-IP: a Cloudflare o reescreve na borda, então o cliente não consegue falsificá-lo.
CLIENT_IP_HEADER = os.environ.get("CLIENT_IP_HEADER", "cf-connecting-ip" if ON_RENDER else "").strip().lower()
# Alternativa: quantos proxies confiáveis acrescentam IPs ao X-Forwarded-For. Fora do Render, 0: vale o IP da conexão.
TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", "2" if ON_RENDER else "0"))
# Versão em execução (o Render define RENDER_GIT_COMMIT), exibida no endpoint de status.
BUILD_COMMIT = (os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("GIT_COMMIT") or "")[:7] or None

STATION_CODE_PATTERN = r"^\d{9}$"
INDEX_TTL_S = 60 * 60  # o índice de estações muda pouco
STATION_TTL_S = 5 * 60  # página de uma estação: evita bater no site do CB a cada consulta da tela
OFFICIAL_TTL_S = 60 * 60  # posição oficial dos hidrantes muda raramente
OFFICIAL_CHUNK = 500  # IDs por consulta ao ArcGIS
SP_BOUNDS = (-25.6, -19.5, -53.4, -44.0)  # lat mín/máx, lon mín/máx do estado de SP (descarta pontos inválidos)
MAX_ROUTE_POINTS = 500

# Mapa de fundo. Com MAPTILER_KEY, o frontend usa o MapTiler (chave restrita por origem no painel do MapTiler);
# sem ela, o OpenStreetMap. A chave é pública por natureza (vai para o navegador), mas não fica no repositório.
MAPTILER_KEY = os.environ.get("MAPTILER_KEY", "").strip()
_style = os.environ.get("MAPTILER_STYLE", "streets-v2").strip()
MAPTILER_STYLE = _style if re.fullmatch(r"[a-z0-9-]{1,40}", _style) else "streets-v2"
