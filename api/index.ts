import express from "express";

const app = express();
app.use(express.json());

// === Fugle Proxy ===
app.get("/api/proxy/fugle/:sid", async (req, res) => {
  try {
    const { sid } = req.params;
    if (!sid) return res.status(400).json({ error: "Missing SID" });

    const apiKey = process.env.FUGLE_API_KEY || "NzQxN2Q5ZTQtNGMwZC00ZTQyLWI1OGEtODNmNmYwODk0NmRmIGY5MzU2ZDQzLWZjNzctNDdlYS04NjY4LWZiNjhmMjQ3M2FjMw==";
    
    const response = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${sid}`, {
      headers: { "X-API-KEY": apiKey }
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === FinMind Proxy ===
app.get("/api/proxy/finmind", async (req, res) => {
  try {
    const { dataset, data_id, start_date } = req.query;
    if (!dataset || !data_id) return res.status(400).json({ error: "Missing parameters" });

    const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${data_id}&start_date=${start_date || ""}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === Yahoo Proxy ===
app.get("/api/proxy/yahoo", async (req, res) => {
  try {
    const { symbol, range, interval } = req.query;
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range || "2d"}&interval=${interval || "1d"}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
