"""Cabeçalhos de segurança aplicados a todas as respostas (site e API)."""
from typing import Dict, Optional

# Content Security Policy: de onde a página pode carregar cada tipo de recurso.
#  - scripts: só do próprio site (o build do Vite não tem scripts inline);
#  - estilos: só do próprio site; 'unsafe-inline' porque os marcadores do mapa (Leaflet) e os avisos (sonner)
#    usam estilo direto no HTML;
#  - fontes: só do próprio site (embutidas no app);
#  - imagens: próprio site, data: (ícones do Leaflet no CSS) e os mapas (MapTiler ou, sem chave, OpenStreetMap);
#  - conexões: a própria API e o MapTiler (o app consulta um bloco de teste para saber se a chave do mapa foi
#    aceita e, se não, troca para o OpenStreetMap); e a página não pode ser embutida em outro site.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://api.maptiler.com https://*.tile.openstreetmap.org",
    "connect-src 'self' https://api.maptiler.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

SECURITY_HEADERS: Dict[str, str] = {
    "Content-Security-Policy": CSP,
    "X-Frame-Options": "DENY",  # o mesmo que frame-ancestors 'none', para navegadores antigos
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # O GPS é usado pela própria página; câmera, microfone e afins, por ninguém.
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
}

HSTS = "max-age=31536000"  # só em HTTPS: o navegador passa a recusar a versão sem criptografia por 1 ano


# Cache dos arquivos do site. Os de assets/ têm um hash no nome que muda a cada versão: podem ficar guardados no
# navegador por 1 ano sem risco de servir versão velha. A página (index.html) é sempre conferida, para que uma
# versão nova chegue na hora. As respostas da API não entram aqui.
CACHE_ASSETS = "public, max-age=31536000, immutable"
CACHE_PAGE = "no-cache"
CACHE_OTHER = "public, max-age=86400"  # ícone do site e afins: 1 dia


def cache_control(path: str) -> Optional[str]:
    """Cache-Control para um arquivo do site servido em `path`; None para a API."""
    if path.startswith("/api"):
        return None
    if path.startswith("/assets/"):
        return CACHE_ASSETS
    if path == "/" or path.endswith(".html"):
        return CACHE_PAGE
    return CACHE_OTHER


def security_headers(forwarded_proto: str) -> Dict[str, str]:
    headers = dict(SECURITY_HEADERS)
    if forwarded_proto.split(",")[0].strip().lower() == "https":
        headers["Strict-Transport-Security"] = HSTS
    return headers
