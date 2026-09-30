const WHATSAPP_NUMBER = "5511941537794";

const menuButton = document.querySelector(".menu-btn");
const navigation = document.querySelector(".nav");

menuButton.addEventListener("click", () => {
  const opened = navigation.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", opened);
});

navigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navigation.classList.remove("open"));
});

const dateField = document.querySelector('[name="data"]');
dateField.min = new Date().toISOString().split("T")[0];

document.querySelector("#agendamento").addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  const eventDate = new Date(`${data.get("data")}T12:00:00`).toLocaleDateString("pt-BR");
  const message = `Olá! Gostaria de consultar a disponibilidade para realizar meu evento no Duda Festas e Eventos.

*Meus dados*
Nome: ${data.get("nome")}
Telefone para contato: ${data.get("telefone")}

*Informações do evento*
Tipo de evento: ${data.get("evento")}
Data pretendida: ${eventDate}
Período: ${data.get("periodo")}
Quantidade aproximada de convidados: ${data.get("convidados")}
Mesas e cadeiras: ${data.get("mesas")}

Gostaria de confirmar se a data está disponível e receber informações sobre valores, condições de locação e próximos passos. Obrigado(a)!`;

  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener",
  );
});
