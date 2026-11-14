# Como colocar o HydrantRoute SP no ar (passo a passo para iniciantes)

Tempo estimado: **40 a 50 minutos** na primeira vez. Custo: **R$ 0** (planos gratuitos).
Você não precisa instalar nada no computador, só ter um navegador.

Vamos usar 4 serviços gratuitos:

| Serviço | Para que serve | Obrigatório? |
|---------|----------------|--------------|
| **GitHub** | Guarda o código do app | sim |
| **Render** | O "servidor" que deixa o app no ar com um endereço `https://...` | sim |
| **MapTiler** | O mapa de fundo | recomendado (sem ele, o app usa o OpenStreetMap, que limita o zoom) |
| **MongoDB Atlas** | Guarda as coordenadas dos poucos hidrantes localizados pelo endereço | recomendado (sem ele, o app funciona, mas refaz essa busca a cada reinício) |

> 💡 Dica: abra um bloco de notas para ir guardando as senhas, chaves e endereços que vão aparecer no caminho. **Não cole senhas em conversas, e-mails ou mensagens.**

O que o app faz, em resumo: você escolhe uma estação de bombeiros, ele lê ao vivo os hidrantes pendentes de vistoria no site do CB SP, mostra cada um na **posição oficial do mapa do CB SP** e monta uma rota otimizada pelo tempo real de carro, que abre no Google Maps.

---

## Parte 1 — O código no GitHub (2 min)

O código fica no repositório **`matzbar/HydrantRouteSP`** no GitHub. Não é preciso subir arquivos à mão.

1. Abra o repositório no site do GitHub.
2. Confira que, na raiz (junto com as pastas `backend` e `frontend`), aparece o arquivo **`Dockerfile`**. É ele que o Render usa para montar o app.

**Como as mudanças chegam ao app no ar:**

1. Cada mudança é feita numa *branch* separada e enviada como um **pull request** (PR).
2. O GitHub roda os testes automáticos (**CI**: testes do backend, verificação de segurança das dependências, lint e build do frontend). O PR só deve entrar se tudo ficar verde ✅.
3. Ao fazer o **merge** do PR na branch `main`, o Render faz o deploy sozinho em 5 a 15 minutos.

> Se você copiar o projeto para outro repositório, ajuste o endereço do repositório no `backend/config.py` (`USER_AGENT`) e as origens permitidas no MapTiler (Parte 3).

---

## Parte 2 — Banco de dados no MongoDB Atlas (10 min, recomendado)

O app **não guarda os hidrantes**: eles vêm do site do CB SP na hora. O banco guarda só as coordenadas dos hidrantes que não estão no mapa oficial e precisam ser localizados pelo endereço (hoje são raros). Pode pular esta parte e voltar depois.

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
   Substitua `<db_password>` (incluindo os sinais `<` `>`) pela senha que você anotou. Esse é o seu **MONGO_URL**.
7. **Liberar o acesso** (passo importante, muita gente esquece):
   - No menu da esquerda, clique em **Network Access** (ou "Security → Network Access").
   - Clique em **Add IP Address** → **Allow Access from Anywhere** (preenche `0.0.0.0/0`) → **Confirm**.
   - Espere o status ficar **Active** (1 a 2 minutos).

   > Por que isso? O Render muda de endereço IP, então o banco precisa aceitar conexões de qualquer lugar. Quem protege o banco é a senha do usuário.

Pronto. Não precisa criar tabelas, o app faz isso sozinho.

---

## Parte 3 — Chave do mapa no MapTiler (5 min, recomendado)

Sem chave, o app usa o mapa do OpenStreetMap, que **recusa zoom alto** (a partir do zoom 15) para apps em produção. Com a chave do MapTiler, todos os zooms funcionam.

1. Crie uma conta em **https://www.maptiler.com** (o plano gratuito basta).
2. No painel, vá em **API Keys** e crie uma chave nova.
3. Preencha as restrições da chave:
   - **Allowed HTTP Origins:** um domínio por linha, **sem `https://`, sem porta e sem caminho**:
     ```
     hydrantroute-sp.onrender.com
     localhost
     127.0.0.1
     ```
     Troque a primeira linha pelo endereço do seu app no Render, se for outro. Não use `?` (ele libera qualquer origem).
   - **Allowed user-agent header:** deixe **vazio**.
4. Copie a chave. Ela é o seu **MAPTILER_KEY**.
5. O plano gratuito não tem alerta de consumo. Confira o uso no painel do MapTiler **uma vez por mês**. Se a cota acabar, o app troca sozinho para o OpenStreetMap e mostra um aviso no mapa.

> A chave do mapa aparece para quem abre o app (é o navegador que baixa o mapa). Isso é normal. O que impede outra pessoa de usar a sua cota é a lista de origens do passo 3.

---

## Parte 4 — Colocar o app no ar no Render (10 min + espera)

1. Acesse **https://render.com** e entre com a sua conta do **GitHub**.
2. No painel, clique em **+ New → Web Service**.
3. Escolha o repositório do HydrantRoute e clique em **Connect**.
   - Se ele não aparecer, clique em **Configure account** / "Configure GitHub" e dê permissão ao Render para ver o repositório.
4. Preencha a configuração:
   - **Name:** `hydrantroute-sp` (vira parte do endereço do site).
   - **Language / Runtime:** **Docker** (ele detecta sozinho por causa do `Dockerfile`).
   - **Branch:** `main`.
   - **Region:** qualquer uma.
   - **Root Directory:** deixe **em branco**.
   - **Instance Type:** **Free**.
5. Em **Environment Variables**, adicione (botão **+ Add Environment Variable**):

   | NAME | VALUE | |
   |------|-------|---|
   | `MAPTILER_KEY` | a chave da Parte 3 | recomendado |
   | `MONGO_URL` | o endereço da Parte 2, passo 6 | recomendado |
   | `DB_NAME` | `hydrantroute` | junto com o `MONGO_URL` |
   | `MAPTILER_STYLE` | `streets-v4` (ou outro estilo do MapTiler) | opcional; padrão `streets-v2` |

   Atenção para não deixar espaços sobrando antes ou depois do valor. Outras configurações (limites de requisições, de paradas etc.) estão no `README.md` e têm valores padrão que já funcionam.
6. Em **Advanced** (ou depois, em **Settings**), preencha **Health Check Path** com `/api/`. Assim o Render sabe se o app travou.
7. Clique em **Deploy Web Service**.
8. Agora é esperar. **O primeiro deploy demora de 5 a 15 minutos.** Quando terminar, aparece **"Your service is live 🎉"** e o status fica verde (**Live**).
9. No topo da página tem o endereço do seu app, algo como `https://hydrantroute-sp.onrender.com`. Clique nele. 🎉

> Mudou uma variável depois? Em **Environment**, clique em **Save Changes** e escolha **Save and deploy**: o app lê as variáveis ao iniciar, então precisa reiniciar para aplicar.

---

## Parte 5 — Testar se está tudo funcionando (5 min)

1. Abra o endereço do app. O navegador vai pedir permissão de **localização**: clique em **Permitir** (o GPS é o ponto de partida da rota; sem ele, o app usa o centro de SP).
2. A caixa **Estação de Bombeiros** já vem com **CBM · 03º GB · 1 (03.1) · SP - VILA FORMOSA**. Para outra estação, troque o CMD Regional, o GB, o SGB e a Estação.
3. O cartão da estação mostra o ciclo e o **% realizado** (verde em 100%, vermelho abaixo disso).
4. Os hidrantes pendentes aparecem no mapa e na lista em poucos segundos. Clique num marcador: o popup deve dizer **"Posição oficial (mapa do CB SP)"**. O canto do mapa deve mostrar **"© MapTiler"** (se aparecer só OpenStreetMap, veja "Deu problema?").
5. Na lista, teste os filtros (por exemplo **INOP**): o mapa e a rota passam a considerar só os hidrantes do filtro.
6. Em **Rota**, escolha a quantidade de hidrantes (**até 25 paradas por rota**; a rota escolhe as melhores entre todos os hidrantes do mapa) e, se quiser, uma **primeira parada**. Clique em **Gerar Rota Otimizada**.
7. Clique em **Abrir Rota no Google Maps** (ou em **Abrir trecho 1, 2, 3**: o Google Maps aceita até 10 paradas por link). Se abriu a rota, está tudo certo! ✅

No celular é só abrir o mesmo endereço. Dica: no navegador do celular, use "Adicionar à tela inicial" para ele aparecer como um app.

**Para conferir qual versão está no ar:** abra `https://SEU-APP.onrender.com/api/`. O campo `build` mostra o commit em execução, que deve ser o último da branch `main` no GitHub.

---

## Coisas importantes de saber

- **O plano gratuito do Render "dorme"** depois de 15 minutos sem ninguém usar. A primeira abertura seguinte demora **uns 30 a 60 segundos**. É normal. Para ficar sempre acordado, há o plano Starter (cerca de US$ 7/mês).
- **Os hidrantes não ficam salvos no app.** Eles vêm do site do CB SP na hora, e as posições, do mapa oficial do CB SP. Se o site do CB SP sair do ar, o app mostra um aviso e você pode tentar de novo depois.
- **Atualizações automáticas:** todo merge na branch `main` faz o Render publicar a nova versão sozinho.
- **Proteções embutidas:** cada usuário pode fazer até 120 consultas e 20 rotas por minuto; o app aceita no máximo 300 rotas por minuto no total e só calcula rotas dentro do estado de SP. O uso normal nunca chega perto desses limites.
- **Segurança:**
  - Se uma senha do banco ou outra credencial aparecer em algum lugar público (conversa, e-mail, print), **troque-a** no Atlas (*Database Access → Edit → Edit Password*) e atualize o `MONGO_URL` no Render.
  - Mantenha a chave do MapTiler restrita às origens da Parte 3.
- O plano gratuito do MapTiler não tem alerta de consumo: confira o uso no painel dele **uma vez por mês**. Se a cota acabar, o app troca sozinho para o OpenStreetMap e avisa no mapa.
- **Limpeza de bancos antigos:** se o banco foi criado por uma versão antiga do app, rode uma vez o script `backend/scripts/limpar_banco.py` (instruções no `README.md`) para apagar dados que não são mais usados.

---

## Deu problema? Veja aqui

| O que aparece | O que fazer |
|---------------|-------------|
| No Render: `failed to read dockerfile` / `Dockerfile not found` | O `Dockerfile` não está na raiz do repositório. Confira a Parte 1. |
| O site demora quase 1 minuto para abrir | É o plano gratuito acordando. Normal. |
| O mapa mostra o aviso **"Mapa alternativo em uso (OpenStreetMap)"** | O MapTiler recusou a chave e o app trocou sozinho para o OpenStreetMap (que tem menos zoom). Causas comuns: **cota gratuita esgotada** (confira o uso no painel do MapTiler; volta no mês seguinte ou com outro plano), endereço do app fora de **Allowed HTTP Origins** (escrito **sem `https://`**) ou `MAPTILER_KEY` errado no Render. Depois de corrigir, recarregue a página. |
| O mapa aparece, mas o crédito diz só **OpenStreetMap** e o zoom alto falha | O app não recebeu a chave. Crie o `MAPTILER_KEY` no Render e use **Save and deploy**. |
| Aparece **"Página do CB SP indisponível"** | O site do Corpo de Bombeiros pode estar fora do ar. Clique em **Tentar novamente** mais tarde. |
| Aparece **"Esta estação não tem hidrantes pendentes de vistoria"** | A estação já completou as vistorias do ciclo (o cartão mostra 100% em verde). Não é erro. |
| A rota não gera e aparece **"Nenhum hidrante corresponde aos filtros da lista"** | Algum filtro ou busca da lista está escondendo todos os hidrantes. Limpe a busca e volte os filtros para **Todos / Todas**. |
| Aparece **"Muitas requisições em pouco tempo"** | O limite por usuário foi atingido. Espere um minuto. Se acontecer no uso normal, aumente `RATE_LIMIT_PER_MIN` ou `ROUTE_RATE_LIMIT_PER_MIN` no Render. |
| Aparece **"O cálculo de rotas está muito requisitado"** | O limite total de rotas por minuto foi atingido. Espere um minuto. |
| Aparece **"Sua localização está fora do estado de São Paulo"** | O app só calcula rotas dentro do estado de SP. Desative o GPS para usar o centro de SP como partida. |
| O GPS não funciona | Confira se você permitiu a localização no navegador (ícone de cadeado ao lado do endereço). Sem GPS, o app usa o centro de SP como ponto de partida. |
| No log: `MONGO_URL não definida` | O app funciona, mas sem guardar as coordenadas localizadas pelo endereço. Crie o `MONGO_URL` em **Environment** e use **Save and deploy**. |
| No log: `ServerSelectionTimeoutError` ou `geocache read failed` | O banco está bloqueando o acesso. Refaça a **Parte 2, passo 7** (Network Access → `0.0.0.0/0`) e espere ficar Active. |
| No log: `bad auth` / `Authentication failed` | Senha errada no `MONGO_URL`. Confira se trocou o `<db_password>` inteiro (sem `<` `>`). Se a senha tiver símbolos, crie outra só com letras e números em **Database Access** no Atlas. |
| Um PR mostra ❌ no GitHub | Algum teste automático falhou. Abra o PR → **Checks** para ver qual. Não faça o merge até ficar ✅. |

Para ver o log no Render: abra o serviço → menu **Logs**. Se travar, copie as últimas linhas vermelhas do log e mande para quem puder ajudar.
