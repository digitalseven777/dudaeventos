# Duda Festas e Eventos

Site público com um centro de controle privado para leads, eventos, agenda e financeiro opcional.

## Iniciar localmente

Requer Node.js 20 ou superior. No PowerShell, configure uma senha administrativa forte e uma chave aleatória de sessão com pelo menos 32 caracteres:

```powershell
$env:ADMIN_PASSWORD = "defina-uma-senha-forte"
$env:SESSION_SECRET = "defina-uma-chave-aleatoria-de-32-caracteres-ou-mais"
npm start
```

Acesse o site em `http://localhost:3000` e o painel em `http://localhost:3000/admin`.

## O que o painel permite

- Cada envio do formulário público é gravado como lead **Nova** antes de tentar abrir o WhatsApp. Se o visitante não abrir o WhatsApp, o contato continua salvo para acompanhamento futuro.
- Leads podem ser pesquisados, filtrados, atualizados, anotados, editados e exportados em CSV.
- A responsável pode cadastrar no painel reservas fechadas fora do site.
- Solicitações de lead ou cadastros manuais não bloqueiam datas automaticamente. A responsável decide quando bloquear/liberar cada data no calendário.
- Financeiro é opcional: permite lançar receitas e despesas, vencimentos, situação de pagamento e vínculo com eventos.

## Publicação e armazenamento

O servidor salva agenda, eventos e lançamentos em arquivos JSON dentro de `data/` ou no caminho definido em `DATA_DIR`. Esse diretório está ignorado pelo Git para manter os dados dos clientes privados. Faça backup regular dos dados.

A hospedagem precisa executar Node.js e oferecer armazenamento persistente; configure `ADMIN_PASSWORD`, `SESSION_SECRET` e `DATA_DIR` nas variáveis de ambiente. GitHub Pages é hospedagem estática e não executa este painel nem armazena seus leads. Em produção, use HTTPS. A sessão usa cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.

## Conteúdo do site

- WhatsApp: `WHATSAPP_NUMBER` em `app.js`.
- Textos, endereço, FAQ e links sociais: `index.html`.
- Estilos públicos: `style.css`.
