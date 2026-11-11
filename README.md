# HydrantRoute SP

App para cadastrar hidrantes (manual, CSV ou importando a tabela do CB SP), geocodificar os endereços e gerar uma rota otimizada no Google Maps.

- **Backend:** FastAPI + MongoDB (`backend/server.py`)
- **Frontend:** React (CRA/craco) + Leaflet + Tailwind (`frontend/`)
- Sem chaves de API: usa ArcGIS/Photon/Nominatim (geocodificação), OSRM (distâncias) e links do Google Maps.

Em produção é **um único serviço**: o `Dockerfile` builda o React e o FastAPI serve o site e a API (`/api`) na mesma porta. Não é preciso configurar CORS nem `REACT_APP_BACKEND_URL`.

## Variáveis de ambiente

| Variável      | Obrigatória | Exemplo                                   |
|---------------|-------------|-------------------------------------------|
| `MONGO_URL`   | sim         | `mongodb+srv://user:senha@cluster.mongodb.net` |
| `DB_NAME`     | sim         | `hydrantroute`                            |
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

> Rode com **1 instância/worker**: o progresso da geocodificação em segundo plano fica na memória do processo.

## Desenvolvimento sem Docker

```bash
# Backend (Python 3.11+)
cd backend
cp .env.example .env               # ajuste MONGO_URL
pip install -r requirements-dev.txt
uvicorn server:app --reload --port 8001

# Frontend (Node 20+)
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

Alternativa: rode `yarn build` no frontend e só o `uvicorn` acima. O backend serve `frontend/build` automaticamente.

## Testes

São testes de integração que chamam uma instância rodando:

```bash
cd backend
REACT_APP_BACKEND_URL=http://localhost:8000 pytest
```

⚠️ Eles chamam `/api/hydrants/reimport`, que **apaga todos os hidrantes**. Rode só contra um banco descartável, nunca contra produção.
