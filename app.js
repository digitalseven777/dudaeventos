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
const availabilityLoaded = fetch("/api/availability").then((response) => response.json()).then(({ blocked }) => {
  blockedDates = new Set(blocked);
  return blockedDates;
}).catch(() => blockedDates);
dateField.min = new Date().toISOString().split("T")[0];
dateField.addEventListener("change", () => {
  const unavailable = blockedDates.has(dateField.value);
  availabilityNotice.textContent = unavailable ? "Esta data está indisponível. Escolha outra data." : "Data sujeita à confirmação da equipe.";
  availabilityNotice.classList.toggle("unavailable", unavailable);
});
document.querySelector("#agendamento").addEventListener("submit", async (event) => {
  event.preventDefault();
  await availabilityLoaded;
  const form = event.currentTarget;
  const status = form.querySelector(".form-status");
  const data = new FormData(form);
  if (blockedDates.has(data.get("data"))) {
    status.textContent = "Essa data não está disponível. Escolha outra data ou fale conosco pelo WhatsApp.";
    return;
  }
  const eventDate = new Date(`${data.get("data")}T12:00:00`).toLocaleDateString("pt-BR");
  const request = {
    name: data.get("nome"), phone: data.get("telefone"), type: data.get("evento"), date: data.get("data"),
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
