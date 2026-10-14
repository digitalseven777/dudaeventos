const continueButton = document.querySelector("#continue-whatsapp");
const whatsappUrl = sessionStorage.getItem("duda-pending-whatsapp");

if (whatsappUrl && /^https:\/\/wa\.me\/5511941537794\?text=/.test(whatsappUrl)) {
  continueButton.href = whatsappUrl;
  continueButton.addEventListener("click", () => sessionStorage.removeItem("duda-pending-whatsapp"), { once: true });
} else {
  continueButton.textContent = "Fazer uma nova consulta";
}
