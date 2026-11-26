# Migrar o HydrantRoute SP do Render para a Vercel (passo a passo)

Tempo estimado: **15 a 20 minutos**. Custo: **R$ 0** (plano gratuito *Hobby* da Vercel).
O banco (MongoDB Atlas) e a chave do mapa (MapTiler) **continuam os mesmos**: só o "servidor" muda.

> 💡 Não apague o serviço no Render antes de terminar a **Parte 4**. Assim o app continua no ar durante a troca.

## Como fica o app na Vercel

| No Render | Na Vercel |
|-----------|-----------|
| Um contêiner Docker serve o site e a API | O site (React) vai para a CDN da Vercel; a API (FastAPI) vira uma **função Python** (`api/index.py`) |
| Dorme depois de 15 min sem uso (30–60 s para acordar) | Não dorme; a primeira chamada depois de um tempo parado leva só 1–2 s |
| Configuração no painel | Configuração no arquivo `vercel.json` (já está no repositório) |

O que já está pronto no repositório:

- `vercel.json`: como montar o site, para onde vai cada `/api/...`, região **São Paulo (`gru1`)**, cabeçalhos de segurança e de cache (os mesmos de `backend/security.py`; um teste confere).
- `api/index.py`: o ponto de entrada da API, que usa o mesmo código de `backend/`.
- `requirements.txt` na raiz: as dependências Python (cópia de `backend/requirements.txt`; um teste confere que são iguais, e o Dependabot atualiza as duas juntas).
- O backend reconhece a Vercel sozinho: lê o IP do usuário do cabeçalho `X-Real-IP` (que a Vercel reescreve, então o cliente não consegue falsificar) e mostra o commit em `/api/`.

O `Dockerfile` continua funcionando para rodar localmente ou numa VPS.

---

## Parte 1 — Criar o projeto na Vercel (5 min)

1. Acesse **https://vercel.com/signup** e entre com a sua conta do **GitHub** (plano **Hobby**).
2. Clique em **Add New… → Project**.
3. Na lista, encontre **HydrantRouteSP** e clique em **Import**.
   - Se ele não aparecer, clique em **Adjust GitHub App Permissions** e dê acesso ao repositório.
4. Na tela de configuração:
   - **Framework Preset:** **Other** (o `vercel.json` já diz como montar).
   - **Root Directory:** deixe `./` (a raiz do repositório). **Não** escolha `frontend`.
   - **Build and Output Settings:** não mexa (vem do `vercel.json`).
5. Abra **Environment Variables** e adicione as mesmas variáveis que estão no Render
   (no Render: serviço → **Environment**, copie os valores):

   | Key | Value | |
   |-----|-------|---|
   | `MAPTILER_KEY` | a chave do MapTiler | recomendado |
   | `MONGO_URL` | o endereço do MongoDB Atlas | recomendado |
   | `DB_NAME` | `hydrantroute` | junto com o `MONGO_URL` |
   | `MAPTILER_STYLE` | o mesmo do Render, se houver | opcional |
   | `MONITOR_URL`, `MONITOR_CLIENT_KEY`, `MAPTILER_CUTOFF_PERCENT` | os mesmos do Render, se houver | opcional |

   Atenção para não deixar espaços sobrando. **Não** copie `PORT`, `CLIENT_IP_HEADER` nem `TRUSTED_PROXY_HOPS`
   do Render: na Vercel o app escolhe sozinho.
6. Clique em **Deploy** e espere (2 a 4 minutos). No fim aparece **"Congratulations!"** com o endereço,
   algo como `https://hydrantroute-sp.vercel.app`.

> Mudou uma variável depois? Em **Settings → Environment Variables**, salve e depois vá em **Deployments →
> ⋯ (no deploy mais recente) → Redeploy**. Variáveis novas só valem num deploy novo.

---

## Parte 2 — Liberar o novo endereço no MapTiler (2 min)

A chave do MapTiler só funciona nos endereços liberados. Sem este passo, o mapa cai para o OpenStreetMap.

1. Entre em **https://cloud.maptiler.com** → **API keys** → clique na chave do app.
2. Em **Allowed HTTP Origins**, **adicione** o endereço da Vercel **sem `https://`**, por exemplo
   `hydrantroute-sp.vercel.app`. Mantenha o do Render até terminar a migração.
3. Salve.

O MongoDB Atlas não precisa de mudança: o acesso já está liberado para `0.0.0.0/0`.

---

## Parte 3 — Testar (5 min)

1. Abra `https://SEU-APP.vercel.app/api/`. Deve aparecer `"status": "ok"`, `"vercel": true`,
   `"header": "x-real-ip"` e `"header_present": true`. O campo `build` mostra o commit em execução.
2. Abra `https://SEU-APP.vercel.app` e faça o teste completo da **Parte 5 do [DEPLOY.md](DEPLOY.md)**:
   estação, hidrantes no mapa ("Posição oficial"), **© MapTiler** no canto do mapa, gerar rota e abrir no Google Maps.
3. Se algo falhar: no painel da Vercel, abra o projeto → **Logs** (os erros da API aparecem lá).

---

## Parte 4 — Trocar de vez (5 min)

1. **Domínio próprio (se você tiver):** na Vercel, **Settings → Domains → Add**, e siga as instruções de DNS
   (a Vercel mostra o registro `A` ou `CNAME` a criar). Depois, adicione esse domínio também no MapTiler.
2. Avise os usuários do endereço novo. Quem instalou o app no celular ("Adicionar à tela inicial") precisa
   instalar de novo pelo endereço novo.
3. No MapTiler, **remova** a origem `...onrender.com`.
4. No Render, abra o serviço → **Settings** → no fim da página, **Suspend Web Service** (pode reativar se precisar)
   e, depois de alguns dias sem problema, **Delete Web Service**. Isso também para os deploys automáticos de lá.

A partir daqui, todo merge na `main` publica sozinho na Vercel, e cada pull request ganha um endereço de
pré-visualização (*Preview*) para testar antes do merge.

---

## Coisas importantes de saber

- **Região:** a API roda em São Paulo (`gru1`, definido no `vercel.json`), perto do site do CB SP e dos usuários.
- **Limite de tempo:** cada chamada à API pode levar até 60 s (`maxDuration` no `vercel.json`). O uso normal leva poucos segundos.
- **Memória do processo:** a Vercel pode rodar mais de uma cópia da função ao mesmo tempo e desligar cópias paradas.
  Por isso:
  - os **limites de requisições por minuto** valem por cópia, não para o app inteiro. Para um limite rígido,
    use também o **Firewall** da Vercel (projeto → **Firewall → Add Rule → Rate Limit** em `/api/route/optimize`);
  - com o **MongoDB** configurado, as coordenadas localizadas pelo endereço ficam salvas e todas as cópias as
    aproveitam. Sem ele, cada cópia refaz essa busca. Na Vercel, o `MONGO_URL` é ainda mais recomendado.
- **Pré-visualizações:** os endereços de *Preview* mudam a cada PR. Eles não estão liberados no MapTiler, então
  nelas o mapa usa o OpenStreetMap. É esperado.
- **Contagem de rotas:** o `scripts/contar_rotas.py` lê os logs do Render e não funciona com a Vercel. Na Vercel,
  veja o uso em **Observability** e **Logs** no painel do projeto.
