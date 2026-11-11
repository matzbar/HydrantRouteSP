# HydrantRoute SP

App para escolher uma estação de bombeiros (CMD Regional → GB → SGB → Estação), ver os hidrantes **pendentes de vistoria** dela direto do site do CB SP, localizar os endereços no mapa e gerar uma rota otimizada no Google Maps.

Os dados dos hidrantes são lidos ao vivo do site do CB SP (com cache de 5 minutos) e **não são armazenados**. O único dado guardado é o cache de coordenadas dos endereços. A estação padrão é **CBM · 03º GB · SGB 03.1 · SP - VILA FORMOSA**.

- **Backend:** FastAPI + MongoDB (`backend/server.py`)
- **Frontend:** React (CRA/craco) + Leaflet + Tailwind (`frontend/`)
- Sem chaves de API: usa ArcGIS/Photon/Nominatim (geocodificação), OSRM (distâncias) e links do Google Maps.

Em produção é **um único serviço**: o `Dockerfile` builda o React e o FastAPI serve o site e a API (`/api`) na mesma porta. Não é preciso configurar CORS nem `REACT_APP_BACKEND_URL`.

## Variáveis de ambiente

| Variável      | Obrigatória | Exemplo                                   |
|---------------|-------------|-------------------------------------------|
| `MONGO_URL`   | não (recomendada) | `mongodb+srv://user:senha@cluster.mongodb.net` |
| `DB_NAME`     | não (`hydrantroute`) | `hydrantroute`                       |
| `PORT`        | não (8000)  | definida automaticamente pelo Render/Railway |
| `CORS_ORIGINS`| não (`*`)   | só se o frontend ficar em outro domínio   |

## Rodar com Docker (local ou VPS)

```bash
docker compose up -d --build        # app + MongoDB
# abre em http://localhost:8000  (PORT=8080 docker compose up -d para outra porta)
```

## Deploy na nuvem (grátis)

👉 **Passo a passo detalhado para iniciantes: [DEPLOY.md](DEPLOY.md)**

1. **Banco:** crie um cluster gratuito (M0) no [MongoDB Atlas](https://www.mongodb.com/atlas), libere acesso de `0.0.0.0/0` e copie a connection string.
2. **App:** no [Render](https://render.com) (ou Railway/Fly.io), crie um *Web Service* apontando para este repositório. Ele detecta o `Dockerfile` sozinho.
3. Configure `MONGO_URL` e `DB_NAME`. Pronto: o site e a API sobem na mesma URL.

> Sem `MONGO_URL` o app funciona, mas o cache de coordenadas fica só na memória: a cada reinício os endereços são localizados de novo (leva de alguns segundos a poucos minutos por estação).

> Rode com **1 instância/worker**: o progresso da geocodificação em segundo plano fica na memória do processo.

## Desenvolvimento sem Docker

```bash
# Backend (Python 3.11+)
cd backend
# opcional: crie backend/.env com MONGO_URL=... e DB_NAME=...
pip install -r requirements-dev.txt
uvicorn server:app --reload --port 8001

# Frontend (Node 20+)
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

Alternativa: rode `yarn build` no frontend e só o `uvicorn` acima. O backend serve `frontend/build` automaticamente.

## Testes

Testes unitários, sem rede e sem banco (usam cópias das páginas do CB SP em `backend/tests/fixtures`):

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```
