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
COPY backend/ backend/
COPY --from=frontend /app/frontend/build frontend/build
WORKDIR /app/backend
EXPOSE 8000
# 1 worker: caches, fila de localização e limite de requisições ficam na memória do processo.
# Sem --forwarded-allow-ips='*': o IP do usuário é lido pelo app só das entradas do X-Forwarded-For escritas pelos
# proxies confiáveis (TRUSTED_PROXY_HOPS, em config.py), e nunca da parte que o próprio cliente pode inventar.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
