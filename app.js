const state = { type: "data", plans: {} };

const planEl = document.querySelector("#plan");
const phoneEl = document.querySelector("#phone");
const emailEl = document.querySelector("#email");
const totalEl = document.querySelector("#total");
const payEl = document.querySelector("#pay");
const messageEl = document.querySelector("#message");

const naira = (n) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0
}).format(n);

async function loadPlans() {
  const res = await fetch("/api/plans");
  state.plans = await res.json();
  renderPlans();
}

function renderPlans() {
  planEl.innerHTML = "";
  for (const item of state.plans[state.type] || []) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.network} — ${item.name} — ${naira(item.price)}`;
    planEl.appendChild(option);
  }
  updateTotal();
}

function updateTotal() {
  const item = (state.plans[state.type] || []).find(p => p.id === planEl.value);
  totalEl.textContent = item ? naira(item.price) : "₦0";
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.type = btn.dataset.type;
    renderPlans();
  });
});

planEl.addEventListener("change", updateTotal);

payEl.addEventListener("click", async () => {
  messageEl.textContent = "";
  const phone = phoneEl.value.trim();
  const email = emailEl.value.trim();
  const item = (state.plans[state.type] || []).find(p => p.id === planEl.value);

  if (!item) return show("Please select a plan.");
  if (!/^0\d{10}$/.test(phone)) return show("Enter a valid 11-digit Nigerian phone number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show("Enter a valid email address.");

  payEl.disabled = true;
  payEl.textContent = "Opening Paystack…";

  try {
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        productType: state.type,
        planId: item.id,
        amount: item.price
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Could not start payment.");

    window.location.href = data.authorization_url;
  } catch (error) {
    show(error.message);
    payEl.disabled = false;
    payEl.textContent = "Pay with Paystack";
  }
});

function show(text) {
  messageEl.textContent = text;
}

document.querySelector("#year").textContent = new Date().getFullYear();
loadPlans().catch(() => show("Could not load products. Please refresh."));
