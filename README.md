# Duda Festas e Eventos

Site público e painel administrativo com leads, eventos, disponibilidade e financeiro opcional. O backend funciona localmente em Node.js e como Vercel Function; o armazenamento de produção usa Cloud Firestore.

## Desenvolvimento local

Requer Node.js 22 ou superior. Sem credenciais Firebase, o servidor usa arquivos JSON em `data/` para desenvolvimento local. Esse diretório é ignorado pelo Git.

No PowerShell, defina uma senha administrativa com pelo menos 12 caracteres e uma chave de sessão aleatória com pelo menos 32 caracteres antes de iniciar:

```powershell
$env:ADMIN_PASSWORD = "defina-uma-senha-forte"
$env:SESSION_SECRET = "defina-uma-chave-aleatoria-de-32-caracteres-ou-mais"
npm start
```

Abra `http://localhost:3000` para o site e `http://localhost:3000/admin` para o painel. O painel tem apenas senha; não há nome de usuário.

Para testar localmente usando Firestore, configure também `FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT` no ambiente. Não salve a chave privada no projeto.

## Configurar Firebase e Vercel

1. No projeto Firebase da cliente, crie ou selecione um banco Cloud Firestore.
2. Crie uma conta de serviço para o servidor e conceda a função IAM **Cloud Datastore User** (`roles/datastore.user`). O Admin SDK usa IAM e credenciais privadas; essas credenciais nunca devem ir para o navegador ou para o Git. [Documentação oficial do Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
3. No painel da Vercel, abra **Settings → Environment Variables** e configure:
   - `FIREBASE_PROJECT_ID`: ID do projeto Firebase.
   - `FIREBASE_SERVICE_ACCOUNT`: conteúdo JSON completo da chave privada da conta de serviço.
   - `ADMIN_PASSWORD`: senha forte com pelo menos 12 caracteres para o painel.
   - `SESSION_SECRET`: chave aleatória com pelo menos 32 caracteres.
   - `FIREBASE_COLLECTION_PREFIX`: opcional; o padrão é `duda`.
4. Ative essas variáveis no ambiente **Production** e faça um novo deploy.
5. Abra `/admin` no domínio do site. O painel não usa credenciais Firebase no navegador.
6. Para remover automaticamente documentos antigos de sessões e tentativas de login, configure TTL no Firestore usando o campo `expiresAt` nas collection groups `duda_sessions` e `byAddress`. [Configuração de TTL no Firestore](https://firebase.google.com/docs/firestore/ttl)

O backend usa as coleções `duda_events`, `duda_finance`, `duda_appData`, `duda_security` e `duda_sessions`; a disponibilidade fica no documento `duda_appData/availability`. O prefixo permite manter os dados do site separados das outras coleções da cliente. Os dados locais existentes em `data/` não são copiados automaticamente para Firestore.

O arquivo `api/index.js` publica os endpoints do servidor como uma Function da Vercel; as rotas `/api/*` são encaminhadas para ela por `vercel.json`. Esse arquivo também configura URLs limpas, o álbum e cabeçalhos de segurança. As solicitações do formulário público são gravadas no Firestore antes de abrir o WhatsApp.

Quando o domínio for comprado na Hostinger, mantenha a hospedagem na Vercel e aponte os registros DNS solicitados pela Vercel. Depois adicione o domínio ao projeto Vercel e aguarde a validação do HTTPS.

## Recursos do painel

- Leads do formulário público, busca, filtros, notas, edição, exclusão e exportação CSV.
- Cadastro de eventos fechados, atualização de status e agenda com bloqueio manual das datas.
- Financeiro opcional com receitas, despesas, situação de pagamento, vínculo com eventos e exportação CSV.
- Sessões administrativas assinadas, protegidas por cookie `HttpOnly`, `SameSite=Strict` e `Secure` quando servido por HTTPS; logout revoga a sessão no banco.
- O login limita tentativas por endereço usando o armazenamento compartilhado do Firestore; o formulário público também recebe limite de consultas para reduzir spam.

## Conteúdo do site

- WhatsApp: `WHATSAPP_NUMBER` em `app.js`.
- Textos, endereço, FAQ e redes sociais: `index.html`.
- Estilos do site e do painel: `style.css` e `admin.css`.
