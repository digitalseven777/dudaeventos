const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DATES_FILE = path.join(DATA_DIR, "blocked-dates.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const FINANCE_FILE = path.join(DATA_DIR, "finance.json");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "duda_admin_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;
const STATUSES = ["Nova", "Em atendimento", "Aguardando retorno", "Confirmado", "Cancelado"];
const PUBLIC_EVENT_TYPES = ["Aniversário", "Casamento", "Chá de bebê / revelação", "Confraternização", "Evento corporativo", "Festa particular"];
const PUBLIC_PERIODS = ["Diurno", "Noturno", "Dia completo"];
const PUBLIC_TABLES = ["Não preciso", "Quero incluir como opcional"];
if (!ADMIN_PASSWORD || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("Configure ADMIN_PASSWORD e SESSION_SECRET (mínimo 32 caracteres) no ambiente.");
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
function saveJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}
function cleanText(value, maxLength = 500) { return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, maxLength) : ""; }
function isValidDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
function loadDates() { const dates = loadJson(DATES_FILE, []); return Array.isArray(dates) ? dates.filter(isValidDate).sort() : []; }
function saveDates(dates) { saveJson(DATES_FILE, [...new Set(dates)].sort()); }
function loadEvents() { const items = loadJson(EVENTS_FILE, []); return Array.isArray(items) ? items : []; }
function saveEvents(items) { saveJson(EVENTS_FILE, items); }
function loadTransactions() { const items = loadJson(FINANCE_FILE, []); return Array.isArray(items) ? items : []; }
function saveTransactions(items) { saveJson(FINANCE_FILE, items); }
function normalizeEvent(body) {
  const event = { name: cleanText(body.name, 100), phone: cleanText(body.phone, 40), type: cleanText(body.type, 80), date: body.date, period: cleanText(body.period, 40), guests: Number(body.guests), tables: cleanText(body.tables, 80) };
  if (!event.name || !event.phone || !event.type || !isValidDate(event.date) || !event.period || !Number.isInteger(event.guests) || event.guests < 1 || event.guests > 150 || !event.tables) return null;
  return event;
}
function publicEvent(body) {
  const event = normalizeEvent(body);
  if (!event || !PUBLIC_EVENT_TYPES.includes(event.type) || !PUBLIC_PERIODS.includes(event.period) || !PUBLIC_TABLES.includes(event.tables)) return null;
  return event;
}
function normalizeTransaction(body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !isValidDate(body.date) || !["Receita", "Despesa"].includes(body.type) || !["Pago", "Pendente"].includes(body.status) || !cleanText(body.description, 120)) return null;
  return { description: cleanText(body.description, 120), type: body.type, eventId: cleanText(body.eventId, 80), date: body.date, amount: Math.round(amount * 100) / 100, status: body.status, notes: cleanText(body.notes, 1000) };
}
function sign(value) { return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url"); }
function createSession() {
  const payload = Buffer.from(JSON.stringify({ expires: Date.now() + SESSION_TTL })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function hasSession(request) {
  const cookies = Object.fromEntries((request.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
  const token = cookies[SESSION_COOKIE] || "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sign(payload)); const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).expires > Date.now(); }
  catch { return false; }
}
function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; if (body.length > 20000) { reject(new Error("Request too large")); request.destroy(); } });
    request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); } });
    request.on("error", reject);
  });
}
function serveFile(response, file, contentType) {
  fs.readFile(file, (error, content) => {
    if (error) return send(response, 404, { error: "Não encontrado." });
    response.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
    response.end(content);
  });
}const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";

  if (url.pathname === "/api/availability" && request.method === "GET") return send(response, 200, { blocked: loadDates() });
  if (url.pathname === "/api/events" && request.method === "POST") {
    let body;
    try { body = await readBody(request); } catch { return send(response, 400, { error: "Dados inválidos." }); }
    const event = publicEvent(body);
    if (!event) return send(response, 400, { error: "Confira os dados enviados." });
    if (loadDates().includes(event.date)) return send(response, 409, { error: "Esta data não está disponível. Escolha outra data." });
    const events = loadEvents();
    const record = { id: crypto.randomUUID(), ...event, status: "Nova", notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "Site" };
    events.unshift(record); saveEvents(events);
    return send(response, 201, { id: record.id, message: "Solicitação registrada." });
  }
  if (url.pathname === "/api/admin/session" && request.method === "GET") {
    return send(response, 200, { authenticated: hasSession(request) });
  }
  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    let body;
    try { body = await readBody(request); } catch { return send(response, 400, { error: "Requisição inválida." }); }
    const supplied = Buffer.from(typeof body.password === "string" ? body.password : "");
    const expected = Buffer.from(ADMIN_PASSWORD);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return send(response, 401, { error: "Senha incorreta." });
    return send(response, 200, { authenticated: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(createSession())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secureCookie}`,
    });
  }
  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    return send(response, 200, { authenticated: false }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`,
    });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!hasSession(request)) return send(response, 401, { error: "Acesso não autorizado." });

    if (url.pathname === "/api/admin/summary" && request.method === "GET") {
      const events = loadEvents(); const today = new Date().toISOString().slice(0, 10); const month = today.slice(0, 7);
      return send(response, 200, {
        total: events.length, newCount: events.filter((item) => item.status === "Nova").length,
        confirmedCount: events.filter((item) => item.status === "Confirmado" && item.date >= today).length,
        thisMonth: events.filter((item) => item.date.startsWith(month) && item.status !== "Cancelado").length,
        nextEvents: events.filter((item) => item.status === "Confirmado" && item.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
        recentLeads: events.filter((item) => item.status === "Nova").slice(0, 5),
        blockedCount: loadDates().length,
      });
    }
    if (url.pathname === "/api/admin/events" && request.method === "GET") return send(response, 200, { events: loadEvents().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), statuses: STATUSES });
    if (url.pathname === "/api/admin/events" && request.method === "POST") {
      let body;
      try { body = await readBody(request); } catch { return send(response, 400, { error: "Dados inválidos." }); }
      const event = normalizeEvent(body);
      if (!event) return send(response, 400, { error: "Confira os dados obrigatórios do evento." });
      if (body.status && !STATUSES.includes(body.status)) return send(response, 400, { error: "Status inválido." });
      const record = { id: crypto.randomUUID(), ...event, status: body.status || "Nova", notes: cleanText(body.notes, 3000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "Cadastro manual" };
      const items = loadEvents(); items.unshift(record); saveEvents(items);

      return send(response, 201, { event: record });
    }
    if (url.pathname === "/api/admin/availability" && request.method === "GET") return send(response, 200, { blocked: loadDates() });
    if (url.pathname === "/api/admin/availability" && request.method === "PUT") {
      let body;
      try { body = await readBody(request); } catch { return send(response, 400, { error: "Requisição inválida." }); }
      if (!Array.isArray(body.blocked) || body.blocked.length > 1000 || !body.blocked.every(isValidDate)) return send(response, 400, { error: "Lista de datas inválida." });
      const dates = [...new Set(body.blocked)].sort(); saveDates(dates); return send(response, 200, { blocked: dates });
    }

    if (url.pathname === "/api/admin/finance" && request.method === "GET") return send(response, 200, { transactions: loadTransactions(), enabled: true });
    if (url.pathname === "/api/admin/finance" && request.method === "POST") {
      let body;
      try { body = await readBody(request); } catch { return send(response, 400, { error: "Dados inválidos." }); }
      const transaction = normalizeTransaction(body);
      if (!transaction) return send(response, 400, { error: "Confira os dados do lançamento." });
      const record = { id: crypto.randomUUID(), ...transaction, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const items = loadTransactions(); items.unshift(record); saveTransactions(items); return send(response, 201, { transaction: record });
    }
    if (url.pathname === "/api/admin/finance/export" && request.method === "GET") {
      const columns = ["description", "eventId", "type", "date", "amount", "status", "notes", "createdAt"];
      const csv = [columns.join(";"), ...loadTransactions().map((item) => columns.map((key) => `"${String(item[key] ?? "").replaceAll('"', '""')}"`).join(";"))].join("\r\n");
      response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=financeiro-duda-festas.csv", "Cache-Control": "no-store" }); return response.end(`\uFEFF${csv}`);
    }

    const financeMatch = url.pathname.match(/^\/api\/admin\/finance\/([\w-]+)$/);
    if (financeMatch && request.method === "PATCH") {
      let body;
      try { body = await readBody(request); } catch { return send(response, 400, { error: "Dados inválidos." }); }
      const items = loadTransactions(); const index = items.findIndex((item) => item.id === financeMatch[1]);
      if (index < 0) return send(response, 404, { error: "Lançamento não encontrado." });
      if (!["Pago", "Pendente"].includes(body.status)) return send(response, 400, { error: "Situação inválida." });
      items[index] = { ...items[index], status: body.status, updatedAt: new Date().toISOString() }; saveTransactions(items); return send(response, 200, { transaction: items[index] });
    }
    if (financeMatch && request.method === "DELETE") {
      const items = loadTransactions(); const filtered = items.filter((item) => item.id !== financeMatch[1]);
      if (filtered.length === items.length) return send(response, 404, { error: "Lançamento não encontrado." });
      saveTransactions(filtered); return send(response, 200, { deleted: true });
    }

    const eventMatch = url.pathname.match(/^\/api\/admin\/events\/([\w-]+)$/);
    if (eventMatch && request.method === "PATCH") {
      let body;
      try { body = await readBody(request); } catch { return send(response, 400, { error: "Dados inválidos." }); }
      const items = loadEvents(); const index = items.findIndex((item) => item.id === eventMatch[1]);
      if (index < 0) return send(response, 404, { error: "Evento não encontrado." });
      const updated = { ...items[index] };
      for (const key of ["name", "phone", "type", "period", "tables"]) if (Object.hasOwn(body, key)) updated[key] = cleanText(body[key], 100);
      if (Object.hasOwn(body, "date")) { if (!isValidDate(body.date)) return send(response, 400, { error: "Data inválida." }); updated.date = body.date; }
      if (Object.hasOwn(body, "guests")) { const guests = Number(body.guests); if (!Number.isInteger(guests) || guests < 1 || guests > 150) return send(response, 400, { error: "Quantidade de convidados inválida." }); updated.guests = guests; }
      if (Object.hasOwn(body, "status")) { if (!STATUSES.includes(body.status)) return send(response, 400, { error: "Status inválido." }); updated.status = body.status; }
      if (Object.hasOwn(body, "notes")) updated.notes = cleanText(body.notes, 3000);
      updated.updatedAt = new Date().toISOString(); items[index] = updated; saveEvents(items);
      return send(response, 200, { event: updated });
    }
    if (eventMatch && request.method === "DELETE") {
      const items = loadEvents(); const filtered = items.filter((item) => item.id !== eventMatch[1]);
      if (filtered.length === items.length) return send(response, 404, { error: "Evento não encontrado." });
      saveEvents(filtered); return send(response, 200, { deleted: true });
    }
    if (url.pathname === "/api/admin/export" && request.method === "GET") {
      const columns = ["name", "phone", "type", "date", "period", "guests", "tables", "status", "notes", "createdAt"];
      const csv = [columns.join(";"), ...loadEvents().map((item) => columns.map((key) => `"${String(item[key] ?? "").replaceAll('"', '""')}"`).join(";"))].join("\r\n");
      response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=eventos-duda-festas.csv", "Cache-Control": "no-store" }); return response.end(`\uFEFF${csv}`);
    }
    return send(response, 404, { error: "Não encontrado." });
  }
  if (url.pathname === "/album" || url.pathname === "/album.html") return serveFile(response, path.join(ROOT, "album.html"), "text/html; charset=utf-8");
  if (url.pathname === "/admin") return serveFile(response, path.join(ROOT, "admin.html"), "text/html; charset=utf-8");
  if (url.pathname === "/admin.css" || url.pathname === "/admin.js") return serveFile(response, path.join(ROOT, url.pathname.slice(1)), url.pathname.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8");
  const publicFiles = {
    "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"],
    "/assets/logo-duda.svg": ["assets/logo-duda.svg", "image/svg+xml"], "/assets/favicon.svg": ["assets/favicon.svg", "image/svg+xml"],
    "/assets/hero-demonstracao.png": ["assets/hero-demonstracao.png", "image/png"],
    "/assets/galeria/salao-principal.jpg": ["assets/galeria/salao-principal.jpg", "image/jpeg"],
    "/assets/galeria/salao-coberto.jpg": ["assets/galeria/salao-coberto.jpg", "image/jpeg"],
    "/assets/galeria/churrasqueira.jpg": ["assets/galeria/churrasqueira.jpg", "image/jpeg"],
    "/assets/galeria/area-externa.jpg": ["assets/galeria/area-externa.jpg", "image/jpeg"],
    "/assets/galeria/fachada.jpg": ["assets/galeria/fachada.jpg", "image/jpeg"],
    "/assets/galeria/salao-detalhe-01.jpg": ["assets/galeria/salao-detalhe-01.jpg", "image/jpeg"],
    "/assets/galeria/salao-detalhe-02.jpg": ["assets/galeria/salao-detalhe-02.jpg", "image/jpeg"],
    "/assets/galeria/salao-recepcao.jpg": ["assets/galeria/salao-recepcao.jpg", "image/jpeg"],
    "/assets/galeria/salao-entrada.jpg": ["assets/galeria/salao-entrada.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-01.jpg": ["assets/galeria/salao-mesas-01.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-02.jpg": ["assets/galeria/salao-mesas-02.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-03.jpg": ["assets/galeria/salao-mesas-03.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-04.jpg": ["assets/galeria/salao-mesas-04.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-05.jpg": ["assets/galeria/salao-mesas-05.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-06.jpg": ["assets/galeria/salao-mesas-06.jpg", "image/jpeg"],
    "/assets/galeria/salao-mesas-07.jpg": ["assets/galeria/salao-mesas-07.jpg", "image/jpeg"],
    "/assets/galeria/brinquedoteca.jpg": ["assets/galeria/brinquedoteca.jpg", "image/jpeg"],
    "/assets/galeria/fachada-lateral.jpg": ["assets/galeria/fachada-lateral.jpg", "image/jpeg"],
    "/assets/galeria/fachada-frontal.jpg": ["assets/galeria/fachada-frontal.jpg", "image/jpeg"],
    "/assets/galeria/estacionamento.jpg": ["assets/galeria/estacionamento.jpg", "image/jpeg"],
    "/assets/galeria/entrada-local.jpg": ["assets/galeria/entrada-local.jpg", "image/jpeg"],
    "/assets/galeria/patio-coberto-01.jpg": ["assets/galeria/patio-coberto-01.jpg", "image/jpeg"],
    "/assets/galeria/patio-coberto-02.jpg": ["assets/galeria/patio-coberto-02.jpg", "image/jpeg"],
    "/assets/galeria/patio-churrasqueira.jpg": ["assets/galeria/patio-churrasqueira.jpg", "image/jpeg"],
    "/assets/galeria/patio-circulacao.jpg": ["assets/galeria/patio-circulacao.jpg", "image/jpeg"],
    "/assets/galeria/cozinha.jpg": ["assets/galeria/cozinha.jpg", "image/jpeg"],
  };
  const adminFiles = {
    "/admin.css": ["admin.css", "text/css; charset=utf-8"], "/admin.js": ["admin.js", "text/javascript; charset=utf-8"],
  };
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    if (!hasSession(request) && url.pathname !== "/admin") return send(response, 404, { error: "Não encontrado." });
    const file = adminFiles[url.pathname];
    if (file && request.method === "GET") return serveFile(response, path.join(ROOT, file[0]), file[1]);
    return send(response, 404, { error: "Não encontrado." });
  }
  const publicFile = publicFiles[url.pathname];
  if (publicFile && request.method === "GET") return serveFile(response, path.join(ROOT, publicFile[0]), publicFile[1]);
  return send(response, 404, { error: "Não encontrado." });
});

server.listen(PORT, () => console.log(`Duda Festas server listening on port ${PORT}`));
