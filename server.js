import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

app.use(express.json());
app.use(express.static("public"));

const orders = new Map();

const plans = {
  data: [
    { id: "mtn-1gb", network: "MTN", name: "1GB Data", price: 350 },
    { id: "mtn-2gb", network: "MTN", name: "2GB Data", price: 650 },
    { id: "airtel-1gb", network: "Airtel", name: "1GB Data", price: 350 },
    { id: "glo-1gb", network: "Glo", name: "1GB Data", price: 300 },
    { id: "9mobile-1gb", network: "9mobile", name: "1GB Data", price: 300 }
  ],
  airtime: [
    { id: "airtime-mtn", network: "MTN", name: "MTN Airtime", price: 100 },
    { id: "airtime-airtel", network: "Airtel", name: "Airtel Airtime", price: 100 },
    { id: "airtime-glo", network: "Glo", name: "Glo Airtime", price: 100 },
    { id: "airtime-9mobile", network: "9mobile", name: "9mobile Airtime", price: 100 }
  ]
};

app.get("/api/plans", (_req, res) => {
  res.json(plans);
});

app.post("/api/paystack/initialize", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ message: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY on the server." });
    }

    const { email, productType, planId, phone, amount } = req.body;

    if (!email || !productType || !planId || !phone || !Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({ message: "Please provide a valid email, phone, product and amount." });
    }

    const selected = plans[productType]?.find((p) => p.id === planId);
    if (!selected) return res.status(400).json({ message: "Invalid product." });

    // Never trust a price sent by the browser.
    if (selected.price !== amount) {
      return res.status(400).json({ message: "Product price mismatch." });
    }

    const reference = `GPB-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const order = {
      reference,
      email,
      phone,
      productType,
      planId,
      product: selected,
      amount: selected.price,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    orders.set(reference, order);

    const payload = {
      email,
      amount: String(selected.price * 100),
      currency: "NGN",
      reference,
      callback_url: `${PUBLIC_BASE_URL}/payment/callback`,
      metadata: JSON.stringify({
        order_reference: reference,
        product_type: productType,
        plan_id: planId,
        phone
      })
    };

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      orders.delete(reference);
      return res.status(400).json({ message: data.message || "Unable to initialize payment." });
    }

    order.accessCode = data.data.access_code;
    orders.set(reference, order);

    res.json({
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Payment initialization failed." });
  }
});

app.get("/payment/callback", async (req, res) => {
  const reference = String(req.query.reference || "");
  if (!reference) return res.status(400).send("Missing payment reference.");

  const result = await verifyPayment(reference);
  const safe = JSON.stringify(result).replace(/</g, "\\u003c");

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GPBILLZ_HUB Payment</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b1020;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}
.card{max-width:480px;width:100%;background:#151c31;border-radius:20px;padding:28px;box-sizing:border-box}
a{display:inline-block;background:#22c55e;color:#06100a;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700}
.muted{color:#aab3c5}
</style>
</head>
<body><div class="card">
<h1>${result.ok ? "Payment successful" : "Payment not confirmed"}</h1>
<p>${result.ok ? "Your payment has been verified by GPBILLZ_HUB." : (result.message || "Please contact support if money was deducted.")}</p>
<p class="muted">Reference: ${reference}</p>
<a href="/">Return to GPBILLZ_HUB</a>
</div>
<script>window.__PAYMENT_RESULT__=${safe};</script>
</body></html>`);
});

async function verifyPayment(reference) {
  const order = orders.get(reference);
  if (!order) return { ok: false, message: "Order not found." };

  if (!PAYSTACK_SECRET_KEY) return { ok: false, message: "Paystack is not configured." };

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    const data = await response.json();

    if (!response.ok || !data.status) {
      return { ok: false, message: data.message || "Verification failed." };
    }

    const paidAmount = Number(data.data.amount);
    const expectedAmount = order.amount * 100;

    if (data.data.status !== "success" || paidAmount !== expectedAmount) {
      order.status = data.data.status || "failed";
      orders.set(reference, order);
      return { ok: false, message: "Payment was not verified as successful." };
    }

    // IMPORTANT: In production, fulfill the airtime/data here using your
    // chosen VTU/provider API, and record a durable order in a database.
    // Do this only once per reference to prevent double fulfilment.
    order.status = "paid";
    order.paystack = {
      id: data.data.id,
      channel: data.data.channel,
      paidAt: data.data.paid_at
    };
    orders.set(reference, order);

    return { ok: true, order };
  } catch (error) {
    console.error(error);
    return { ok: false, message: "Could not verify payment." };
  }
}

app.get("/api/order/:reference", (req, res) => {
  const order = orders.get(req.params.reference);
  if (!order) return res.status(404).json({ message: "Order not found." });
  res.json(order);
});

app.get("*", (_req, res) => {
  res.sendFile(new URL("./public/index.html", import.meta.url).pathname);
});

app.listen(PORT, () => {
  console.log(`GPBILLZ_HUB running on ${PUBLIC_BASE_URL}`);
});
