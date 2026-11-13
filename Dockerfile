# Imagem única: builda o React e serve tudo (API + site) pelo FastAPI na mesma porta.

# ---------- 1) Frontend ----------
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --network-timeout 600000
COPY frontend/ ./
# Sem VITE_BACKEND_URL o frontend chama /api na mesma origem.
RUN yarn build

# ---------- 2) Backend ----------
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
# Usuário sem privilégios: o app não roda como root. Os arquivos ficam com o root (só leitura para o app).
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY backend/ backend/
COPY --from=frontend /app/frontend/build frontend/build
WORKDIR /app/backend
USER app
EXPOSE 8000
# O Docker marca o contêiner como "unhealthy" se a API parar de responder.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/' % os.environ.get('PORT', '8000'), timeout=4)"
# 1 worker: caches, fila de localização e limite de requisições ficam na memória do processo.
# Sem --forwarded-allow-ips='*': o IP do usuário é lido pelo app só das entradas do X-Forwarded-For escritas pelos
# proxies confiáveis (TRUSTED_PROXY_HOPS, em config.py), e nunca da parte que o próprio cliente pode inventar.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
