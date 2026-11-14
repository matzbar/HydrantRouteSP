"""Cabeçalhos de segurança aplicados a todas as respostas (site e API)."""
from typing import Dict

# Content Security Policy: de onde a página pode carregar cada tipo de recurso.
#  - scripts: só do próprio site (o build do Vite não tem scripts inline);
#  - estilos: do próprio site e do Google Fonts; 'unsafe-inline' porque os marcadores do mapa (Leaflet) e os
#    avisos (sonner) usam estilo direto no HTML;
#  - fontes: Google Fonts; imagens: próprio site, data: (ícones do Leaflet no CSS) e os mapas (MapTiler ou,
#    sem chave, OpenStreetMap);
#  - conexões: só a própria API; e a página não pode ser embutida em outro site.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://api.maptiler.com https://*.tile.openstreetmap.org",
    "connect-src 'self'",
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


def security_headers(forwarded_proto: str) -> Dict[str, str]:
    headers = dict(SECURITY_HEADERS)
    if forwarded_proto.split(",")[0].strip().lower() == "https":
        headers["Strict-Transport-Security"] = HSTS
    return headers
