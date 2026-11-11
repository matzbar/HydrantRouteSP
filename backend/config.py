"""Endereços dos serviços externos e limites do app."""
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hydrantroute")

USER_AGENT = "Mozilla/5.0 (compatible; HydrantRouteBR/1.0)"
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

# Roteamento.
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving"
OSRM_TABLE_MAX = 100  # limite de coordenadas por matriz no servidor público do OSRM

STATION_CODE_PATTERN = r"^\d{9}$"
INDEX_TTL_S = 60 * 60  # o índice de estações muda pouco
STATION_TTL_S = 5 * 60  # página de uma estação: evita bater no site do CB a cada consulta da tela
OFFICIAL_TTL_S = 60 * 60  # posição oficial dos hidrantes muda raramente
OFFICIAL_CHUNK = 500  # IDs por consulta ao ArcGIS
SP_BOUNDS = (-25.6, -19.5, -53.4, -44.0)  # lat mín/máx, lon mín/máx do estado de SP (descarta pontos inválidos)
MAX_ROUTE_POINTS = 500
