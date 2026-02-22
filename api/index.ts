import express from "express";

const app = express();
app.use(express.json());

// === Fugle Proxy ===
app.get("/api/proxy/fugle/:sid", async (req, res) => {
  try {
    const { sid } = req.params;
    if (!sid || sid === "undefined" || sid === "null") {
      console.error("Backend: Invalid SID received");
      return res.status(400).json({ error: "Invalid SID" });
    }

    const apiKey = process.env.FUGLE_API_KEY || "NzQxN2Q5ZTQtNGMwZC00ZTQyLWI1OGEtODNmNmYwODk0NmRmIGY5MzU2ZDQzLWZjNzctNDdlYS04NjY4LWZiNjhmMjQ3M2FjMw==";
    
    console.log(`Backend: Fetching Fugle for ${sid}`);
    const response = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${sid}`, {
      headers: { 
        "X-API-KEY": apiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error(`Backend: Fugle API error ${response.status}:`, data);
    }
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("Backend: Fugle Proxy Exception:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// === FinMind Proxy ===
app.get("/api/proxy/finmind", async (req, res) => {
  try {
    const { dataset, data_id, start_date } = req.query;
    if (!dataset || !data_id || data_id === "undefined") {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const token = process.env.FINMIND_TOKEN;
    const params = new URLSearchParams({
      dataset: String(dataset),
      data_id: String(data_id),
      start_date: String(start_date || ""),
    });
    if (token) params.append("token", token);

    const url = `https://api.finmindtrade.com/api/v4/data?${params.toString()}`;
    console.log(`Backend: Fetching FinMind: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error(`Backend: FinMind non-JSON response (${response.status}):`, text);
      return res.status(response.status).json({ error: "Non-JSON response from FinMind", details: text });
    }

    if (!response.ok) {
      console.error(`Backend: FinMind API error ${response.status}:`, data);
    }
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("Backend: FinMind Proxy Exception:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// === Yahoo Proxy ===
app.get("/api/proxy/yahoo", async (req, res) => {
  try {
    const { symbol, range, interval } = req.query;
    if (!symbol || symbol === "undefined") {
      return res.status(400).json({ error: "Missing or invalid symbol" });
    }

    console.log(`Backend: Fetching Yahoo for ${symbol}`);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range || "2d"}&interval=${interval || "1d"}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`Backend: Yahoo API error ${response.status}:`, data);
    }
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error("Backend: Yahoo Proxy Exception:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default app;
