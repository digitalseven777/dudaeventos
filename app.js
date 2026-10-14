const WHATSAPP_NUMBER = "5511941537794";
const menuButton = document.querySelector(".menu-btn");
const navigation = document.querySelector(".nav");
menuButton.addEventListener("click", () => {
  const opened = navigation.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", opened);
});
navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => navigation.classList.remove("open")));
const dateField = document.querySelector('[name="data"]');
const availabilityNotice = document.querySelector(".date-availability");
let blockedDates = new Set();
const today = new Date(); today.setHours(0, 0, 0, 0);
let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const calendar = document.querySelector("#date-calendar");
const monthLabel = document.querySelector("#date-month");
function isoDate(year, month, day) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function renderDateCalendar() {
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  monthLabel.textContent = calendarMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  calendar.replaceChildren();
  for (let blank = 0; blank < new Date(year, month, 1).getDay(); blank++) { const spacer = document.createElement("span"); spacer.setAttribute("aria-hidden", "true"); calendar.append(spacer); }
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const date = isoDate(year, month, day); const button = document.createElement("button");
    button.type = "button"; button.textContent = String(day); button.className = "date-day";
    button.disabled = new Date(year, month, day) < today || blockedDates.has(date);
    button.setAttribute("aria-label", `${day} de ${calendarMonth.toLocaleDateString("pt-BR", { month: "long" })}${blockedDates.has(date) ? ", indisponível" : ""}`);
    if (dateField.dataset.date === date) { button.classList.add("selected"); button.setAttribute("aria-pressed", "true"); }
    button.addEventListener("click", () => {
      dateField.dataset.date = date;
      dateField.value = new Date(year, month, day).toLocaleDateString("pt-BR");
      availabilityNotice.textContent = "Data sujeita à confirmação da equipe.";
      availabilityNotice.classList.remove("unavailable"); renderDateCalendar();
    });
    calendar.append(button);
  }
  document.querySelector("#date-prev").disabled = year === today.getFullYear() && month <= today.getMonth();
}
document.querySelector("#date-prev").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderDateCalendar(); });
document.querySelector("#date-next").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderDateCalendar(); });
renderDateCalendar();
const availabilityLoaded = fetch("/api/availability", { cache: "no-store" }).then((response) => response.json()).then(({ blocked }) => {
  blockedDates = new Set(blocked);
  availabilityNotice.textContent = "Datas indisponíveis aparecem desativadas.";
  renderDateCalendar();
  return blockedDates;
}).catch(() => { availabilityNotice.textContent = "Não foi possível carregar as datas ocupadas. A disponibilidade será conferida ao enviar."; return blockedDates; });
document.querySelector("#agendamento").addEventListener("submit", async (event) => {
  event.preventDefault();
  await availabilityLoaded;
  const form = event.currentTarget;
  const status = form.querySelector(".form-status");
  const data = new FormData(form);
  if (!dateField.dataset.date) {
    status.textContent = "Escolha uma data disponível no calendário.";
    return;
  }
  if (blockedDates.has(dateField.dataset.date)) {
    status.textContent = "Essa data não está disponível. Escolha outra data ou fale conosco pelo WhatsApp.";
    return;
  }
  const eventDate = new Date(`${dateField.dataset.date}T12:00:00`).toLocaleDateString("pt-BR");
  const request = {
    name: data.get("nome"), phone: data.get("telefone"), type: data.get("evento"), date: dateField.dataset.date,
    period: data.get("periodo"), guests: data.get("convidados"), tables: data.get("mesas"),
  };
  status.textContent = "Registrando sua consulta…";
  try {
    const response = await fetch("/api/events", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        blockedDates.add(request.date);
        dateField.value = "";
        delete dateField.dataset.date;
        renderDateCalendar();
        availabilityNotice.textContent = result.error;
        availabilityNotice.classList.add("unavailable");
      }
      status.textContent = result.error || "Não foi possível registrar a consulta. Tente novamente.";
      return;
    }
  } catch {
    status.textContent = "Não foi possível registrar sua consulta agora. Tente novamente em instantes.";
    return;
  }
  const message = `Olá! Gostaria de consultar a disponibilidade para realizar meu evento no Duda Festas e Eventos.

*Meus dados*
Nome: ${request.name}
Telefone para contato: ${request.phone}

*Informações do evento*
Tipo de evento: ${request.type}
Data pretendida: ${eventDate}
Período: ${request.period}
Quantidade aproximada de convidados: ${request.guests}
Mesas e cadeiras: ${request.tables}

Gostaria de confirmar se a data está disponível e receber informações sobre valores, condições de locação e próximos passos. Obrigado(a)!`;
  status.textContent = "Consulta registrada! Abrindo o WhatsApp para você…";
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
});
