const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const plans = {
  data: [
    { id: "mtn-1gb", network: "MTN", name: "1GB", price: 500 },
    { id: "mtn-2gb", network: "MTN", name: "2GB", price: 1000 },
    { id: "airtel-1gb", network: "Airtel", name: "1GB", price: 500 },
    { id: "glo-1gb", network: "Glo", name: "1GB", price: 500 },
    { id: "9mobile-1gb", network: "9mobile", name: "1GB", price: 500 }
  ],
  airtime: [
    { id: "mtn-airtime", network: "MTN", name: "Airtime", price: 500 },
    { id: "airtel-airtime", network: "Airtel", name: "Airtime", price: 500 },
    { id: "glo-airtime", network: "Glo", name: "Airtime", price: 500 },
    { id: "9mobile-airtime", network: "9mobile", name: "Airtime", price: 500 }
  ],
  subscription: [
    { id: "dstv", network: "DSTV", name: "Subscription", price: 5000 },
    { id: "gotv", network: "GOtv", name: "Subscription", price: 3000 }
  ]
};

app.get("/api/plans", (req, res) => {
  res.json(plans);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`GPBILLZ_HUB running on port ${PORT}`);
});
