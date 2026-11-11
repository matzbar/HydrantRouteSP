# Como colocar o HydrantRoute SP no ar (passo a passo para iniciantes)

Tempo estimado: **30 a 40 minutos**. Custo: **R$ 0** (planos gratuitos).
Você não precisa instalar nada no computador, só ter um navegador.

Vamos usar 3 serviços gratuitos:

| Serviço | Para que serve |
|---------|----------------|
| **GitHub** | Guarda o código do app (você já tem o repositório) |
| **MongoDB Atlas** | O banco de dados onde ficam os hidrantes |
| **Render** | O "servidor" que deixa o app no ar com um endereço `https://...` |

> 💡 Dica: abra um bloco de notas para ir guardando as senhas e endereços que vão aparecer no caminho.

---

## Parte 1 — Atualizar o código no GitHub (5 min)

O zip que você recebeu tem a versão nova do projeto. Ela precisa estar no seu repositório do GitHub.

1. Descompacte o zip no seu computador. **Windows:** botão direito no zip → **Extrair tudo…** → **Extrair**. **Linux:** botão direito → **Extrair aqui**.
2. Confira se aparecem os arquivos que começam com ponto (`.gitignore`, `.dockerignore`):
   - **Windows:** já aparecem normalmente.
   - **Linux:** ficam escondidos; no gerenciador de arquivos aperte **Ctrl + H**.
   - **Mac:** aperte **Cmd + Shift + .** (ponto) no Finder.
3. Abra seu repositório no site do GitHub.
4. Clique em **Add file → Upload files**.
5. **Arraste todo o conteúdo da pasta descompactada** (as pastas `backend`, `frontend`, e os arquivos `Dockerfile`, `docker-compose.yml`, `README.md`, `DEPLOY.md`, `.gitignore`, `.dockerignore`...) para a área de upload. Os arquivos com o mesmo nome serão substituídos, é isso mesmo que queremos.
6. Lá embaixo, em "Commit changes", escreva algo como `Preparar deploy` e clique em **Commit changes**.
7. Confira: na página inicial do repositório agora deve aparecer o arquivo **`Dockerfile`** na raiz (junto com as pastas `backend` e `frontend`). Se ele estiver dentro de outra pasta, o deploy não vai funcionar.

> Se você já usa `git` no terminal, pode simplesmente copiar os arquivos por cima da sua pasta local, fazer `git add -A`, `git commit` e `git push`.

---

## Parte 2 — Criar o banco de dados no MongoDB Atlas (10 min)

1. Acesse **https://www.mongodb.com/cloud/atlas/register** e crie uma conta (pode entrar com o Google).
2. Ele vai perguntar algumas coisas sobre você. Responda qualquer coisa, não importa.
3. Na tela de criar o cluster (o "servidor do banco"):
   - Escolha o plano **M0 / Free** (gratuito).
   - Provider: **AWS**. Região: **São Paulo (sa-east-1)** se aparecer, senão qualquer uma.
   - Clique em **Create Deployment**.
4. Vai aparecer uma janela **"Connect to Cluster"** pedindo para criar um usuário do banco:
   - **Username:** `hydrant`
   - **Password:** clique em **Autogenerate** ou crie uma **só com letras e números** (sem `@`, `#`, `/`, `:`... esses caracteres quebram a conexão).
   - **Anote a senha!**
   - Clique em **Create Database User**.
5. Ainda nessa janela, clique em **Choose a connection method → Drivers**.
6. Vai aparecer um endereço parecido com este. **Copie e guarde**:
   ```
   mongodb+srv://hydrant:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
   Substitua `<db_password>` (incluindo os sinais `<` `>`) pela senha que você anotou. Exemplo:
   ```
   mongodb+srv://hydrant:Abc123xyz@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
   Esse é o seu **MONGO_URL**.
7. **Liberar o acesso** (passo importante, muita gente esquece):
   - No menu da esquerda, clique em **Network Access** (ou "Security → Network Access").
   - Clique em **Add IP Address**.
   - Clique em **Allow Access from Anywhere** (vai preencher `0.0.0.0/0`).
   - Clique em **Confirm**. Espere o status ficar **Active** (1 a 2 minutos).

   > Por que isso? O Render muda de endereço IP, então precisamos deixar o banco aceitar conexões de qualquer lugar. Quem protege o banco é a senha do usuário.

Pronto, o banco está criado. Não precisa criar tabelas, o app faz isso sozinho.

---

## Parte 3 — Colocar o app no ar no Render (10 min + espera)

1. Acesse **https://render.com** e clique em **Get Started**. Entre com a sua conta do **GitHub** (fica mais fácil).
2. No painel, clique em **+ New → Web Service**.
3. Na lista de repositórios, escolha o do HydrantRoute e clique em **Connect**.
   - Se o repositório não aparecer, clique em **Configure account** / "Configure GitHub" e dê permissão ao Render para ver esse repositório.
4. Preencha a tela de configuração:
   - **Name:** `hydrantroute-sp` (esse nome vira parte do endereço do site).
   - **Language / Runtime:** **Docker**. Ele costuma detectar sozinho por causa do arquivo `Dockerfile`.
   - **Branch:** `main`.
   - **Region:** qualquer uma (ex.: Ohio ou Virginia).
   - **Root Directory:** deixe **em branco**.
   - **Instance Type:** **Free**.
5. Desça até **Environment Variables** e adicione **duas** variáveis (botão **+ Add Environment Variable**):

   | NAME | VALUE |
   |------|-------|
   | `MONGO_URL` | o endereço completo que você montou na Parte 2, passo 6 |
   | `DB_NAME` | `hydrantroute` |

   Atenção para não deixar espaços sobrando antes ou depois do valor.
6. Clique em **Deploy Web Service** (ou "Create Web Service").
7. Agora é esperar. O Render vai mostrar um log com muitas linhas passando. **O primeiro deploy demora de 5 a 15 minutos.** Quando terminar, aparece **"Your service is live 🎉"** e o status fica verde (**Live**).
8. No topo da página tem o endereço do seu app, algo como:
   ```
   https://hydrantroute-sp.onrender.com
   ```
   Clique nele. 🎉

---

## Parte 4 — Testar se está tudo funcionando (5 min)

1. Abra o endereço do app. O navegador vai pedir permissão de **localização**: clique em **Permitir** (é o GPS usado como ponto de partida da rota).
2. Na caixa **Cadastro**, clique na aba **CB SP** e depois em **Importar da Página CB SP**.
3. Os hidrantes vão aparecer na lista, e uma barra mostra **"Geocodificando endereços · X/Y"**. Espere chegar ao total (leva 1 a 3 minutos). Os pontos vão surgindo no mapa.
4. Em **Ações**, escolha a quantidade de hidrantes e clique em **Gerar Rota Otimizada**.
5. Clique em **Abrir Rota no Google Maps**. Se abriu a rota, está tudo certo! ✅

No celular é só abrir o mesmo endereço. Dica: no navegador do celular, use "Adicionar à tela inicial" para ele aparecer como um app.

---

## Coisas importantes de saber

- **O plano gratuito do Render "dorme"** depois de 15 minutos sem ninguém usar. No próximo acesso, a primeira abertura demora **uns 30 a 60 segundos**. Depois fica rápido. Isso é normal, não é erro. Se quiser que fique sempre acordado, dá para pagar o plano Starter (cerca de US$ 7/mês) no próprio Render.
- **Os dados ficam salvos no MongoDB Atlas**, então o app dormir ou reiniciar **não apaga** os hidrantes.
- **Atualizações automáticas:** toda vez que você mudar algo no GitHub (na branch `main`), o Render faz o deploy de novo sozinho.
- **Não rode os testes automáticos (`pytest`) apontando para o endereço de produção.** Eles apagam todos os hidrantes.

---

## Deu problema? Veja aqui

| O que aparece | O que fazer |
|---------------|-------------|
| No log do Render: `KeyError: 'MONGO_URL'` | A variável não foi criada ou o nome está errado. Vá em **Environment** no Render, confira se o nome é exatamente `MONGO_URL` (maiúsculo) e clique em **Save, rebuild and deploy**. |
| No log: `ServerSelectionTimeoutError` ou o app abre mas diz **"Falha ao carregar hidrantes"** | O banco está bloqueando o acesso. Refaça a **Parte 2, passo 7** (Network Access → `0.0.0.0/0`) e espere ficar Active. |
| No log: `bad auth` / `Authentication failed` | Senha errada no `MONGO_URL`. Confira se trocou o `<db_password>` inteiro (sem `<` `>`). Se a senha tiver símbolos, crie outra só com letras e números em **Database Access** no Atlas. |
| No Render: `failed to read dockerfile` / `Dockerfile not found` | O `Dockerfile` não está na raiz do repositório. Refaça a Parte 1, passo 7. |
| O site demora quase 1 minuto para abrir | É o plano gratuito acordando. Normal. |
| A importação do CB SP dá erro | O site do Corpo de Bombeiros pode estar fora do ar. Tente de novo mais tarde. |
| O GPS não funciona | Confira se você permitiu a localização no navegador (ícone de cadeado ao lado do endereço). Sem GPS, o app usa o centro de SP como ponto de partida. |

Para ver o log no Render: abra o serviço → menu **Logs**. Se travar, copie as últimas linhas vermelhas do log e mande para quem puder ajudar.
