// ============================================================
// Page d'accueil — création / jonction de salon
// ============================================================

const btnCreate = document.getElementById("btn-create");
const formJoin = document.getElementById("form-join");
const joinCodeInput = document.getElementById("join-code");
const joinError = document.getElementById("join-error");

btnCreate.addEventListener("click", async () => {
  btnCreate.disabled = true;
  btnCreate.textContent = "CRÉATION...";
  try {
    const res = await fetch("/api/rooms", { method: "POST" });
    if (!res.ok) throw new Error("Création impossible");
    const room = await res.json();
    window.location.href = `/room/${room.code}`;
  } catch (err) {
    btnCreate.disabled = false;
    btnCreate.textContent = "CRÉER UN SALON";
    console.error(err);
    alert("Impossible de créer un salon pour le moment.");
  }
});

formJoin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = joinCodeInput.value.trim().toUpperCase();
  joinError.hidden = true;

  if (code.length !== 4) {
    joinError.textContent = "Le code fait 4 caractères.";
    joinError.hidden = false;
    return;
  }

  try {
    const res = await fetch(`/api/rooms/${code}`);
    if (!res.ok) {
      joinError.textContent = `Le salon ${code} n'existe pas (ou plus).`;
      joinError.hidden = false;
      return;
    }
    window.location.href = `/room/${code}`;
  } catch (err) {
    joinError.textContent = "Erreur réseau, réessaie.";
    joinError.hidden = false;
    console.error(err);
  }
});

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase();
});
