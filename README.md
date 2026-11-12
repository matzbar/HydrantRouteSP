# HydrantRoute SP

App para escolher uma estação de bombeiros (CMD Regional → GB → SGB → Estação), ver os hidrantes **pendentes de vistoria** dela direto do site do CB SP, mostrá-los no mapa e gerar uma rota otimizada no Google Maps.

- Os hidrantes são lidos ao vivo do site do CB SP (cache de 5 minutos) e **não são armazenados**.
- A posição de cada hidrante vem do **mapa oficial do CB SP** (camada pública do ArcGIS). Só quando um hidrante não está lá é que o app localiza pelo endereço.
- A rota parte do GPS e a ordem das paradas é otimizada pelo **tempo real de carro** (OSRM).
- Estação padrão: **CBM · 03º GB · SGB 03.1 · SP - VILA FORMOSA**.

Sem chaves de API: usa o ArcGIS do CB SP (posição oficial), ArcGIS/Photon/Nominatim (localização pelo endereço), OSRM (tempos de carro) e links do Google Maps.

## Estrutura

```
backend/
  server.py      API FastAPI (rotas /api/...) e entrega do site compilado
  cb_sp.py       páginas do CB SP (estações, hidrantes pendentes) e posição oficial no ArcGIS
  geocoding.py   localização pelo endereço, com cache (memória + MongoDB opcional)
  osrm.py        tempos e distâncias de carro (OSRM)
  routing.py     otimização da ordem das paradas e links do Google Maps
  ratelimit.py   limite de requisições por IP
  config.py      endereços dos serviços e limites
  tests/         testes unitários (sem rede nem banco)
frontend/        React (Vite) + Leaflet + Tailwind
```

Em produção é **um único serviço**: o `Dockerfile` compila o React e o FastAPI serve o site e a API (`/api`) na mesma porta. Não é preciso configurar CORS nem `VITE_BACKEND_URL`.

## Variáveis de ambiente

Todas opcionais. Modelo em [`backend/.env.example`](backend/.env.example).

| Variável       | Padrão         | Para que serve |
|----------------|----------------|----------------|
| `MONGO_URL`    | (sem banco)    | Guarda as coordenadas obtidas pelo endereço entre reinícios. Recomendada. |
| `DB_NAME`      | `hydrantroute` | Nome do banco no MongoDB |
| `PORT`         | `8000`         | Definida automaticamente pelo Render/Railway |
| `CORS_ORIGINS` | `*`            | Só se o frontend ficar em outro domínio |
| `OSRM_BASE_URL` | servidor público do OSRM | Para usar um OSRM próprio ou comercial (o público é para uso leve) |
| `OSRM_TABLE_MAX` | `100`         | Máximo de pontos por matriz aceito pelo seu OSRM |
| `RATE_LIMIT_PER_MIN` | `120`     | Requisições por minuto por IP na API |
| `ROUTE_RATE_LIMIT_PER_MIN` | `20` | Cálculos de rota por minuto por IP |

## Rodar com Docker (local ou VPS)

```bash
docker compose up -d --build        # app + MongoDB
# abre em http://localhost:8000  (PORT=8080 docker compose up -d para outra porta)
```

## Deploy na nuvem (grátis)

👉 **Passo a passo detalhado para iniciantes: [DEPLOY.md](DEPLOY.md)**

1. **Banco (opcional):** crie um cluster gratuito (M0) no [MongoDB Atlas](https://www.mongodb.com/atlas), libere acesso de `0.0.0.0/0` e copie a connection string.
2. **App:** no [Render](https://render.com) (ou Railway/Fly.io), crie um *Web Service* apontando para este repositório. Ele detecta o `Dockerfile` sozinho.
3. Configure `MONGO_URL` e `DB_NAME`. Pronto: o site e a API sobem na mesma URL.

> Rode com **1 instância/worker**: a fila de localização pelo endereço e os caches ficam na memória do processo.

## Desenvolvimento sem Docker

Requer Python 3.12 e Node 24.

```bash
# Backend
cd backend
cp .env.example .env               # opcional: ajuste MONGO_URL
pip install -r requirements-dev.txt
uvicorn server:app --reload --port 8001

# Frontend (em outro terminal): http://localhost:3000, com /api redirecionado ao backend na 8001
cd frontend
corepack enable
yarn install --frozen-lockfile
yarn dev
```

Outros comandos do frontend: `yarn lint` (ESLint) e `yarn build` (gera `frontend/build`).

Alternativa: rode `yarn build` no frontend e só o `uvicorn` acima. O backend serve `frontend/build` automaticamente.

## Testes

Testes unitários, sem rede e sem banco (usam cópias das páginas do CB SP em `backend/tests/fixtures`):

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

As dependências têm versões fixas (`requirements.txt` e `frontend/yarn.lock`). Ao atualizar, rode `pytest` e `pip-audit -r requirements.txt`.

O GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda os testes, o `pip-audit`, o lint e o build do frontend em todo pull request.

## Privacidade e serviços externos

- A localização do usuário (GPS) só sai do navegador ao gerar a rota: vai ao OSRM e ao link do Google Maps. O app não a grava nem a registra em log.
- Resultados do geocodificador ArcGIS World ficam só na memória (os termos dele não permitem guardá-los sem conta paga). Os do Photon/Nominatim (OpenStreetMap) podem ir para o MongoDB.
- Bancos criados por versões antigas podem ter registros sem origem no `geocache` (parte do ArcGIS World) e a coleção `hydrants` do cadastro antigo. O script `backend/scripts/limpar_banco.py` remove os dois. Ele só simula por padrão; use `--aplicar` para apagar:

  ```bash
  docker compose run --rm -e MONGO_URL='mongodb+srv://...' -e DB_NAME=hydrantroute \
      app python scripts/limpar_banco.py            # simulação; depois repita com --aplicar
  ```
- As requisições se identificam com o User-Agent `HydrantRouteSP/1.0 (+https://github.com/matzbar/HydrantRouteSP)`, como pede a política do Nominatim.
