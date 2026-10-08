const loginView = document.querySelector("#login-view");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const globalStatus = document.querySelector("#global-status");
const calendar = document.querySelector("#calendar");
const monthLabel = document.querySelector("#month-label");
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const STATUSES = ["Nova", "Em atendimento", "Aguardando retorno", "Confirmado", "Cancelado"];
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let viewMonth = new Date();
let blockedDates = new Set();
let events = [];
let transactions = [];
let savingDate = false;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const result = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(result?.error || "Nao foi possivel concluir a operacao.");
  return result;
}

function showMessage(message, isError = false) {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("error", isError);
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { globalStatus.textContent = ""; }, 5000);
}

function formatDate(date) {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "-";
}

async function enterDashboard() {
  try {
    const [eventData, dateData, financeData, summary] = await Promise.all([
      api("/api/admin/events"), api("/api/admin/availability"), api("/api/admin/finance"), api("/api/admin/summary"),
    ]);
    events = eventData.events || [];
    blockedDates = new Set(dateData.blocked || []);
    transactions = financeData.transactions || [];
    loginView.hidden = true;
    dashboard.hidden = false;
    document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
    updateDashboard(summary);
    renderEvents();
    renderCalendar();
    populateEventOptions();
    await reloadFinance();
  } catch (error) {
    dashboard.hidden = true;
    loginView.hidden = false;
    loginError.textContent = error.message;
  }
}

function updateDashboard(summary) {
  document.querySelector("#metric-new").textContent = summary.newCount || 0;
  document.querySelector("#metric-confirmed").textContent = summary.confirmedCount || 0;
  document.querySelector("#metric-month").textContent = summary.thisMonth || 0;
  document.querySelector("#metric-blocked").textContent = summary.blockedCount || 0;
  const badge = document.querySelector("#new-badge");
  badge.hidden = !summary.newCount;
  badge.textContent = summary.newCount || "";

  const upcoming = document.querySelector("#upcoming-list");
  const nextEvents = summary.nextEvents || [];
  upcoming.innerHTML = nextEvents.length ? nextEvents.map((event) => `
    <button class="upcoming-item" data-event-id="${escapeHTML(event.id)}" type="button">
      <span class="date-tile"><strong>${new Date(`${event.date}T12:00:00`).getDate()}</strong><small>${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${event.date}T12:00:00`))}</small></span>
      <span class="upcoming-info"><strong>${escapeHTML(event.name)}</strong><small>${escapeHTML(event.type)} - ${escapeHTML(event.period)}</small></span><span class="upcoming-guests">${event.guests} pessoas</span>
    </button>`).join("") : '<p class="muted-empty">Nenhuma reserva confirmada proxima.</p>';
  upcoming.querySelectorAll("[data-event-id]").forEach((button) => button.addEventListener("click", () => openEventDetail(button.dataset.eventId)));

  const leads = document.querySelector("#recent-leads");
  const recentLeads = summary.recentLeads || [];
  leads.innerHTML = recentLeads.length ? recentLeads.map((lead) => `
    <button class="lead-preview" data-event-id="${escapeHTML(lead.id)}" type="button"><span><strong>${escapeHTML(lead.name)}</strong><small>${escapeHTML(lead.type)} - ${formatDate(lead.date)}</small></span><span class="status-pill status-new">Nova</span></button>`).join("") : '<p class="muted-empty">Nenhum lead pendente. Novas consultas aparecerao aqui.</p>';
  leads.querySelectorAll("[data-event-id]").forEach((button) => button.addEventListener("click", () => openEventDetail(button.dataset.eventId)));
}

function switchView(view) {
  document.querySelectorAll(".view-section").forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelector("#page-title").textContent = ({ overview: "Visao geral", events: "Eventos e solicitacoes", calendar: "Agenda e disponibilidade", finance: "Financeiro" })[view];
  if (view === "calendar") renderCalendar();
  if (view === "finance") renderFinance();
}

function eventStatusClass(status) {
  return ({ Nova: "new", "Em atendimento": "working", "Aguardando retorno": "waiting", Confirmado: "confirmed", Cancelado: "cancelled" })[status] || "new";
}

function renderEvents() {
  const query = document.querySelector("#event-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = document.querySelector("#status-filter").value;
  const filtered = events.filter((event) => `${event.name} ${event.phone} ${event.type}`.toLocaleLowerCase("pt-BR").includes(query) && (!status || event.status === status));
  const tbody = document.querySelector("#events-table");
  tbody.innerHTML = filtered.map((event) => `
    <tr><td><button class="client-cell" data-detail="${escapeHTML(event.id)}" type="button"><strong>${escapeHTML(event.name)}</strong><small>${escapeHTML(event.phone)}</small></button></td>
    <td>${escapeHTML(event.type)}</td><td>${formatDate(event.date)}<small class="sub-cell">${escapeHTML(event.period)}</small></td><td>${Number(event.guests) || 0}</td>
    <td><select class="status-select status-${eventStatusClass(event.status)}" data-status-id="${escapeHTML(event.id)}" aria-label="Status de ${escapeHTML(event.name)}">${STATUSES.map((value) => `<option ${value === event.status ? "selected" : ""}>${value}</option>`).join("")}</select></td>
    <td><button class="row-menu" data-detail="${escapeHTML(event.id)}" type="button" aria-label="Detalhes de ${escapeHTML(event.name)}">...</button></td></tr>`).join("");
  document.querySelector("#empty-events").hidden = filtered.length > 0;
  tbody.querySelectorAll("[data-detail]").forEach((button) => button.addEventListener("click", () => openEventDetail(button.dataset.detail)));
  tbody.querySelectorAll("[data-status-id]").forEach((select) => select.addEventListener("change", () => updateEvent(select.dataset.statusId, { status: select.value })));
}

function renderCalendar() {
  calendar.replaceChildren();
  monthLabel.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(viewMonth);
  weekdays.forEach((label) => { const heading = document.createElement("span"); heading.className = "weekday"; heading.textContent = label; calendar.append(heading); });
  const year = viewMonth.getFullYear(); const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let index = 0; index < firstDay; index += 1) { const spacer = document.createElement("span"); spacer.className = "day outside"; calendar.append(spacer); }
  const today = new Date(); const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const confirmed = events.some((event) => event.date === date && event.status === "Confirmado");
    const button = document.createElement("button"); button.type = "button"; button.className = "day"; button.textContent = String(day);
    button.setAttribute("aria-label", `${day} de ${monthLabel.textContent}${confirmed ? ", reserva confirmada" : ""}${blockedDates.has(date) ? ", bloqueada" : ""}`);
    button.setAttribute("aria-pressed", String(blockedDates.has(date)));
    if (blockedDates.has(date)) button.classList.add("blocked"); else if (confirmed) button.classList.add("reserved");
    if (date === todayKey) button.classList.add("today");
    button.disabled = savingDate; button.addEventListener("click", () => toggleDate(date)); calendar.append(button);
  }
}

async function toggleDate(date) {
  if (savingDate) return;
  const next = new Set(blockedDates); const shouldBlock = !next.has(date);
  if (shouldBlock) next.add(date); else next.delete(date);
  savingDate = true; document.querySelector("#calendar-status").textContent = "Salvando..."; renderCalendar();
  try {
    const result = await api("/api/admin/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: [...next] }) });
    blockedDates = new Set(result.blocked); document.querySelector("#calendar-status").textContent = shouldBlock ? "Data bloqueada para locacao." : "Data liberada para locacao.";
    showMessage(shouldBlock ? "Data bloqueada com sucesso." : "Data liberada com sucesso.");
  } catch (error) { document.querySelector("#calendar-status").textContent = error.message; }
  finally { savingDate = false; renderCalendar(); refreshSummary(); }
}

async function refreshSummary() { try { updateDashboard(await api("/api/admin/summary")); } catch (error) { showMessage(error.message, true); } }

function openEventForm(event = null) {
  const dialog = document.querySelector("#event-dialog"); const form = document.querySelector("#event-form"); form.reset();
  document.querySelector("#event-dialog-title").textContent = event ? "Editar evento" : "Cadastrar evento";
  for (const [key, value] of Object.entries(event || {})) { const field = form.elements.namedItem(key); if (field) field.value = value ?? ""; }
  if (!event) form.elements.namedItem("status").value = "Nova";
  dialog.showModal();
}

function openEventDetail(id) {
  const event = events.find((item) => item.id === id); if (!event) return;
  const content = document.querySelector("#event-detail-content");
  content.innerHTML = `<div class="modal-heading"><div><p class="eyebrow">${escapeHTML(event.source || "Evento")}</p><h2>${escapeHTML(event.name)}</h2></div><button class="close-modal" type="button" data-close="event-detail-dialog" aria-label="Fechar">x</button></div>
    <div class="detail-grid"><div><small>Tipo de evento</small><strong>${escapeHTML(event.type)}</strong></div><div><small>Status</small><span class="status-pill status-${eventStatusClass(event.status)}">${escapeHTML(event.status)}</span></div>
    <div><small>Data e periodo</small><strong>${formatDate(event.date)} - ${escapeHTML(event.period)}</strong></div><div><small>Convidados</small><strong>${Number(event.guests) || 0} pessoas</strong></div><div><small>Telefone</small><strong>${escapeHTML(event.phone)}</strong></div><div><small>Mesas e cadeiras</small><strong>${escapeHTML(event.tables)}</strong></div>
    <div class="full-width"><small>Observacoes</small><p>${escapeHTML(event.notes || "Nenhuma observacao registrada.")}</p></div><div class="full-width"><small>Solicitacao recebida</small><strong>${new Date(event.createdAt).toLocaleString("pt-BR")}</strong></div></div>
    <div class="modal-actions spread"><button class="danger-button" id="delete-event" type="button">Excluir registro</button><div><button class="secondary-button" type="button" data-close="event-detail-dialog">Fechar</button><button class="primary-button" id="edit-event" type="button">Editar evento</button></div></div>`;
  document.querySelector("#edit-event").addEventListener("click", () => { document.querySelector("#event-detail-dialog").close(); openEventForm(event); });
  document.querySelector("#delete-event").addEventListener("click", async () => {
    if (!confirm(`Excluir o registro de ${event.name}?`)) return;
    try { await api(`/api/admin/events/${encodeURIComponent(id)}`, { method: "DELETE" }); document.querySelector("#event-detail-dialog").close(); await reloadEvents(); showMessage("Registro excluido."); }
    catch (error) { showMessage(error.message, true); }
  });
  content.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close()));
  document.querySelector("#event-detail-dialog").showModal();
}

async function updateEvent(id, changes) {
  try { const result = await api(`/api/admin/events/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); events = events.map((event) => event.id === id ? result.event : event); renderEvents(); renderCalendar(); await refreshSummary(); showMessage("Evento atualizado."); }
  catch (error) { showMessage(error.message, true); renderEvents(); }
}

async function reloadEvents() {
  const [eventData, summary] = await Promise.all([api("/api/admin/events"), api("/api/admin/summary")]);
  events = eventData.events || []; renderEvents(); renderCalendar(); updateDashboard(summary); populateEventOptions(); renderFinance();
}

function populateEventOptions() {
  const select = document.querySelector("#transaction-event"); const current = select.value;
  select.innerHTML = '<option value="">Sem evento vinculado</option>' + events.map((event) => `<option value="${escapeHTML(event.id)}">${escapeHTML(event.name)} - ${formatDate(event.date)}</option>`).join("");
  if (current) select.value = current;
}

function renderFinance() {
  const month = document.querySelector("#finance-month-filter").value; const type = document.querySelector("#finance-type-filter").value;
  const filtered = transactions.filter((item) => (!month || item.date.startsWith(month)) && (!type || item.type === type));
  const received = transactions.filter((item) => item.type === "Receita" && item.status === "Pago").reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = transactions.filter((item) => item.type === "Receita" && item.status === "Pendente").reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = transactions.filter((item) => item.type === "Despesa" && item.status === "Pago").reduce((sum, item) => sum + Number(item.amount), 0);
  document.querySelector("#finance-income").textContent = currency.format(received);
  document.querySelector("#finance-pending").textContent = currency.format(pending);
  document.querySelector("#finance-expense").textContent = currency.format(expenses);
  document.querySelector("#finance-balance").textContent = currency.format(received - expenses);
  const tbody = document.querySelector("#finance-table");
  tbody.innerHTML = filtered.map((item) => `<tr><td><strong>${escapeHTML(item.description)}</strong><small class="sub-cell">${escapeHTML(item.notes || "")}</small></td><td>${escapeHTML(events.find((event) => event.id === item.eventId)?.name || "-")}</td><td><span class="finance-type ${item.type === "Receita" ? "type-income" : "type-expense"}">${escapeHTML(item.type)}</span></td><td>${formatDate(item.date)}</td><td><strong>${currency.format(Number(item.amount))}</strong></td><td><select class="status-select ${item.status === "Pago" ? "status-confirmed" : "status-waiting"}" data-transaction-id="${escapeHTML(item.id)}"><option ${item.status === "Pendente" ? "selected" : ""}>Pendente</option><option ${item.status === "Pago" ? "selected" : ""}>Pago</option></select></td><td><button class="row-menu" data-delete-transaction="${escapeHTML(item.id)}" type="button" aria-label="Excluir lancamento">...</button></td></tr>`).join("");
  const isEmpty = filtered.length === 0; document.querySelector("#empty-finance").hidden = !isEmpty; tbody.closest(".table-wrap").classList.toggle("show-empty", isEmpty);
  tbody.querySelectorAll("[data-transaction-id]").forEach((select) => select.addEventListener("change", () => updateTransaction(select.dataset.transactionId, { status: select.value })));
  tbody.querySelectorAll("[data-delete-transaction]").forEach((button) => button.addEventListener("click", () => deleteTransaction(button.dataset.deleteTransaction)));
}

async function reloadFinance() {
  transactions = (await api("/api/admin/finance")).transactions || [];
  const months = [...new Set(transactions.map((item) => item.date.slice(0, 7)))].sort().reverse();
  const monthSelect = document.querySelector("#finance-month-filter"); const selected = monthSelect.value;
  monthSelect.innerHTML = '<option value="">Todos os meses</option>' + months.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00`))}</option>`).join("");
  if (months.includes(selected)) monthSelect.value = selected;
  renderFinance();
}

async function addTransaction(form) {
  const data = Object.fromEntries(new FormData(form)); data.amount = Number(data.amount);
  try { await api("/api/admin/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); await reloadFinance(); document.querySelector("#transaction-dialog").close(); form.reset(); showMessage("Lancamento financeiro salvo."); }
  catch (error) { showMessage(error.message, true); }
}

async function updateTransaction(id, changes) {
  try { const result = await api(`/api/admin/finance/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); transactions = transactions.map((item) => item.id === id ? result.transaction : item); renderFinance(); }
  catch (error) { showMessage(error.message, true); }
}

async function deleteTransaction(id) {
  if (!confirm("Excluir este lancamento financeiro?")) return;
  try { await api(`/api/admin/finance/${encodeURIComponent(id)}`, { method: "DELETE" }); await reloadFinance(); showMessage("Lancamento excluido."); }
  catch (error) { showMessage(error.message, true); }
}

function downloadFile(url) { const link = document.createElement("a"); link.href = url; link.click(); }

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault(); loginError.textContent = "";
  const button = loginForm.querySelector("button"); button.disabled = true;
  try { await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: new FormData(loginForm).get("password") }) }); loginForm.reset(); await enterDashboard(); }
  catch (error) { loginError.textContent = error.message; }
  finally { button.disabled = false; }
});

document.querySelector("#logout-button").addEventListener("click", async () => { try { await api("/api/admin/logout", { method: "POST" }); dashboard.hidden = true; loginView.hidden = false; loginForm.reset(); } catch (error) { showMessage(error.message, true); } });
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));
document.querySelectorAll("[data-transaction]").forEach((button) => button.addEventListener("click", () => document.querySelector("#transaction-dialog").showModal()));
document.querySelector("#previous-month").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderCalendar(); });
document.querySelector("#next-month").addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderCalendar(); });
document.querySelector("#event-search").addEventListener("input", renderEvents);
document.querySelector("#status-filter").addEventListener("change", renderEvents);
document.querySelector("#finance-month-filter").addEventListener("change", renderFinance);
document.querySelector("#finance-type-filter").addEventListener("change", renderFinance);
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close()));
document.querySelector("#add-event-button").addEventListener("click", () => openEventForm());
document.querySelector("#add-event-top").addEventListener("click", () => openEventForm());
document.querySelector("#add-event-quick").addEventListener("click", () => openEventForm());
document.querySelector("#add-transaction").addEventListener("click", () => document.querySelector("#transaction-dialog").showModal());
document.querySelector("#export-events").addEventListener("click", () => downloadFile("/api/admin/export"));
document.querySelector("#export-finance").addEventListener("click", () => downloadFile("/api/admin/finance/export"));
document.querySelector("#event-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const id = data.id; delete data.id; data.guests = Number(data.guests);
  try { if (id) await api(`/api/admin/events/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); else await api("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); await reloadEvents(); document.querySelector("#event-dialog").close(); showMessage(id ? "Evento atualizado." : "Registro salvo. Leads e alteracoes de status nao bloqueiam a data; faca o bloqueio manual na agenda."); }
  catch (error) { showMessage(error.message, true); }
});
document.querySelector("#transaction-form").addEventListener("submit", (event) => { event.preventDefault(); addTransaction(event.currentTarget); });

api("/api/admin/session").then(({ authenticated }) => { if (authenticated) enterDashboard(); }).catch(() => {});
