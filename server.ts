import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === Fugle Proxy ===
  app.get("/api/proxy/fugle/:sid", async (req, res) => {
    try {
      const { sid } = req.params;
      const apiKey = process.env.FUGLE_API_KEY || "NzQxN2Q5ZTQtNGMwZC00ZTQyLWI1OGEtODNmNmYwODk0NmRmIGY5MzU2ZDQzLWZjNzctNDdlYS04NjY4LWZiNjhmMjQ3M2FjMw==";
      
      const response = await axios.get(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${sid}`, {
        headers: { "X-API-KEY": apiKey }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // === FinMind Proxy ===
  app.get("/api/proxy/finmind", async (req, res) => {
    try {
      const { dataset, data_id, start_date } = req.query;
      const response = await axios.get("https://api.finmindtrade.com/api/v4/data", {
        params: { dataset, data_id, start_date }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // === Yahoo Proxy ===
  app.get("/api/proxy/yahoo", async (req, res) => {
    try {
      const { symbol, range, interval } = req.query;
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: { range, interval }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
