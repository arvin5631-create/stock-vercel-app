
import { MarketPulse, AnalysisDetail, StockData, Strategy, TechIndicators, MarketContext } from '../types';
import { ALL_STOCK_MAP, SECTOR_MAP, getColor, roundToTaiwanTick, getSectorName } from '../constants';

// 優先讀取環境變數，若無則使用預設備用 Key
const FUGLE_API_KEY = process.env.FUGLE_API_KEY || (import.meta as any).env?.VITE_FUGLE_API_KEY || "NzQxN2Q5ZTQtNGMwZC00ZTQyLWI1OGEtODNmNmYwODk0NmRmIGY5MzU2ZDQzLWZjNzctNDdlYS04NjY4LWZiNjhmMjQ3M2FjMw==";
const FINMIND_API_URL = "https://api.finmindtrade.com/api/v4/data";

// === 請求排隊與頻率限制系統 (Request Throttling) ===
const requestQueue: (() => Promise<any>)[] = [];
let isProcessingQueue = false;
let MIN_REQUEST_GAP = 1000; // 增加間隔到 1000ms
let fugleRateLimitUntil = 0;
let finmindRateLimitUntil = 0;

const processQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (task) {
      await task();
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_GAP));
    }
  }
  isProcessingQueue = false;
};

const throttledFetch = <T>(fetchFn: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fetchFn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    processQueue();
  });
};

// === 報價數據快取 (Live Quote Caching) ===
// 避免在同一個渲染週期內重複抓取同一支股票
const QUOTE_CACHE: Record<string, { data: any, timestamp: number }> = {};
const QUOTE_CACHE_DURATION = 30000; // 30 秒內不重複抓取即時報價

// === 靜態數據快取系統 (Static Data Caching) ===
// 盤中不會變動的數據 (財報、籌碼、昨日以前的K線)，存放在這裡避免重複 API 請求
interface StaticAnalysisData {
  histData: any[];
  perData: any[];
  chipData: any[];
  financialAnalysis: any[];
  revData: any[];
  marketBelowMA20: boolean;
  marketContext: MarketContext;
  timestamp: number;
}

const MEMORY_CACHE: Record<string, StaticAnalysisData> = {};
const CACHE_DURATION = 1000 * 60 * 60 * 4; // 基礎快取時間 4 小時

// ===========================================

const getNameCache = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('stock_name_cache_v3');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
};

const isChinese = (str: string) => /[\u4e00-\u9fa5]/.test(str);

const saveToNameCache = (id: string, name: string) => {
  if (!id || !name || id === name) return;
  if (!isChinese(name)) return;
  const cache = getNameCache();
  if (cache[id] === name) return;
  cache[id] = name;
  localStorage.setItem('stock_name_cache_v3', JSON.stringify(cache));
};

const resolveStockName = (id: string, apiName?: string) => {
    if (ALL_STOCK_MAP[id]) return ALL_STOCK_MAP[id];
    const cache = getNameCache();
    if (cache[id]) return cache[id];
    if (apiName && isChinese(apiName)) {
        saveToNameCache(id, apiName);
        return apiName;
    }
    return apiName || id;
};

// === 技術指標計算引擎 ===

const calculateMA = (data: number[], period: number) => {
  if (data.length < period) return 0;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
};

const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateBBands = (prices: number[], period: number = 20, stdDevMultiplier: number = 2) => {
  if (prices.length < period) return { upper: 0, mid: 0, lower: 0, bandwidth: 0 };
  
  const slice = prices.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  
  const squareDiffs = slice.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(avgSquareDiff);

  const upper = avg + stdDevMultiplier * stdDev;
  const lower = avg - stdDevMultiplier * stdDev;
  const bandwidth = (upper - lower) / avg * 100;

  return { upper, mid: avg, lower, bandwidth };
};

// 用於純價格指標的簡易聚合
const aggregateToWeeklyPrices = (dailyData: any[]) => {
  const weeklyPrices: number[] = [];
  const reversed = [...dailyData].reverse();
  for (let i = 0; i < reversed.length; i += 5) {
    weeklyPrices.push(reversed[i].close);
  }
  return weeklyPrices.reverse();
};

// === Ace Trader: K 線型態辨識核心 ===

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  date?: string;
}

const analyzeCandle = (cur: OHLCV, prevClose: number, avgVol: number): string => {
  const body = Math.abs(cur.close - cur.open);
  const range = cur.high - cur.low;
  const upperShadow = cur.high - Math.max(cur.open, cur.close);
  const lowerShadow = Math.min(cur.open, cur.close) - cur.low;
  
  const isRed = cur.close > cur.open;
  const isDoji = body <= range * 0.15; // 實體極小
  const isLong = body >= cur.close * 0.025; // 實體超過 2.5% 視為長K
  const isVolExplosion = avgVol > 0 && cur.vol > avgVol * 1.8;
  const isVolShrink = avgVol > 0 && cur.vol < avgVol * 0.6;

  let desc = isRed ? "紅" : "黑";
  if (isDoji) desc = "十字";
  else if (isLong) desc = isRed ? "長紅" : "長黑";

  const features = [];
  if (upperShadow > body * 1.5 && upperShadow > lowerShadow) features.push("上影");
  if (lowerShadow > body * 1.5 && lowerShadow > upperShadow) features.push("下影");
  
  if (isVolExplosion) features.push("爆量");
  else if (isVolShrink) features.push("量縮");

  // 缺口判斷
  if (prevClose > 0) {
    if (cur.low > prevClose * 1.01) features.push("跳空漲");
    if (cur.high < prevClose * 0.99) features.push("跳空跌");
  }

  return `${desc}${features.length > 0 ? `(${features.join(',')})` : ''}`;
};

const aggregateWeeklyOHLC = (dailyData: any[]): OHLCV[] => {
  const weekly: OHLCV[] = [];
  // 假設數據是按時間排序 (舊 -> 新)。反向處理每 5 天一組。
  const reversed = [...dailyData].reverse();
  
  for (let i = 0; i < reversed.length; i += 5) {
    const chunk = reversed.slice(i, i + 5);
    if (chunk.length === 0) break;
    
    // Chunk 是反向的：[Fri, Thu, Wed, Tue, Mon]
    // Close = chunk[0].close
    // Open = chunk[last].open
    const wClose = chunk[0].close;
    const wOpen = chunk[chunk.length - 1].open;
    const wHigh = Math.max(...chunk.map(d => d.max));
    const wLow = Math.min(...chunk.map(d => d.min));
    const wVol = chunk.reduce((acc, d) => acc + d.Trading_Volume, 0);
    const wDate = chunk[0].date; // 使用週收盤日

    weekly.push({ open: wOpen, high: wHigh, low: wLow, close: wClose, vol: wVol, date: wDate });
  }
  
  return weekly.reverse(); // 轉回 [舊 -> 新]
};

const generatePatternStream = (data: OHLCV[], limit: number): string => {
  if (data.length === 0) return "無數據";
  const target = data.slice(-limit);
  // 計算 5MA Volume 作為比較基準
  const volMA = data.length >= 5 ? data.slice(-5).reduce((a,b)=>a+b.vol,0)/5 : data[0].vol;

  return target.map((d, i) => {
    const prevC = i > 0 ? target[i-1].close : (i === 0 && data.length > limit ? data[data.length - limit - 1].close : 0);
    const tag = analyzeCandle(d, prevC, volMA);
    const change = prevC > 0 ? ((d.close - prevC) / prevC * 100).toFixed(1) : "0";
    return `[${d.date?.slice(5) || i}] ${d.close}(${change}%): ${tag}`;
  }).join(" -> ");
};

// ========================

const determineTrend = (price: number, ma20: number, ma60: number) => {
  if (price > ma20 && ma20 > ma60) return "多頭排列";
  if (price < ma20 && ma20 < ma60) return "空頭排列";
  if (price > ma60 && price < ma20) return "回檔修正";
  if (price < ma60 && price > ma20) return "反彈格局";
  return "震盪整理";
};

// ========================

export const checkStock = async (sid: string): Promise<{ id: string; name: string }> => {
  const name = resolveStockName(sid);
  if (name !== sid) return { id: sid, name };
  
  const live = await fetchFugleQuote(sid);
  if (live && live.name) return { id: sid, name: live.name };
  
  const yahoo = await fetchYahooQuote(sid);
  if (yahoo && yahoo.name) return { id: sid, name: yahoo.name };
  
  return { id: sid, name: sid };
};

export const calculateScore = (params: {
  price: number;
  changePercent: number;
  ma20?: number;
  ma60?: number;
  avgVol5?: number;
  vol?: number;
  roe?: number;
  pe?: number | string;
  trust_5d?: number | string;
  foreign_5d?: number | string;
  trust_streak?: number;
  marketBelowMA20?: boolean;
}) => {
  let score = 50;
  const reasons: string[] = [];

  if (params.changePercent > 3 && params.changePercent < 7) { score += 8; reasons.push("健康拉抬區間"); }
  else if (params.changePercent >= 7) { score += 5; reasons.push("強勢但防回檔"); }
  else if (params.changePercent < -4) { score -= 8; reasons.push("短線跌勢轉重"); }

  if (params.vol && params.avgVol5 && params.vol > params.avgVol5 * 1.5) { score += 5; reasons.push("爆量攻擊訊號"); }

  if (params.ma20) {
    if (params.price > params.ma20) { score += 10; reasons.push("站上月線關鍵位"); }
    else { score -= 10; reasons.push("跌破月線轉弱"); }
    if (params.ma60 && params.price > params.ma20 && params.ma20 > params.ma60) { score += 10; reasons.push("多頭排列格局"); }
    const bias = ((params.price - params.ma20) / params.ma20) * 100;
    if (bias > 10) { score -= 5; reasons.push("短線過熱警示"); }
  }

  const trust = typeof params.trust_5d === 'number' ? params.trust_5d : 0;
  const foreign = typeof params.foreign_5d === 'number' ? params.foreign_5d : 0;

  if (trust > 500) { score += 15; reasons.push("投信大舉佈局"); }
  else if (params.trust_streak && params.trust_streak >= 3) { score += 8; reasons.push("投信連續買超"); }
  else if (trust < -500) { score -= 12; reasons.push("投信連番撤出"); }

  if (foreign > 2000) { score += 8; reasons.push("外資趨勢偏多"); }
  else if (foreign < -2000) { score -= 8; reasons.push("外資趨勢偏空"); }

  if (params.roe && params.roe >= 15) { score += 8; reasons.push("高ROE品質保證"); }
  const pe = typeof params.pe === 'number' ? params.pe : parseFloat(String(params.pe));
  if (!isNaN(pe) && pe > 0 && pe < 20) { score += 7; reasons.push("估值仍在成長區"); }
  if (params.marketBelowMA20) { score -= 5; reasons.push("大盤疲弱拖累"); }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  let action = "區間操作";
  if (finalScore >= 80) action = "強力買進";
  else if (finalScore >= 65) action = "偏多操作";
  else if (finalScore >= 45) action = "中性觀望";
  else if (finalScore >= 25) action = "保守避險";
  else action = "建議觀望";

  return { score: finalScore, action: action, reasons: reasons.length > 0 ? reasons : ["盤勢待確認"] };
};

const getDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};

async function fetchYahooQuote(sid: string, marketType: string = 'TSE') {
  const cacheKey = `yahoo_${sid}`;
  if (QUOTE_CACHE[cacheKey] && Date.now() - QUOTE_CACHE[cacheKey].timestamp < QUOTE_CACHE_DURATION) {
    return QUOTE_CACHE[cacheKey].data;
  }

  const toYahooSymbol = (s: string, mt: string) => s.includes("^") ? s : (mt === 'OTC' ? `${s}.TWO` : `${s}.TW`);
  
  return throttledFetch(async () => {
    try {
      const symbol = toYahooSymbol(sid, marketType);
      const res = await fetch(`/api/proxy/yahoo?symbol=${encodeURIComponent(symbol)}&range=2d&interval=1d`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();
      const result = json.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice || 0;
      const prevClose = meta?.chartPreviousClose || price;
      const change = price - prevClose;
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
      const apiName = meta?.shortName || "";
      const data = { price: price, change: change, changePercent: changePercent, vol: result?.indicators?.quote?.[0]?.volume?.pop() || 0, name: resolveStockName(sid, apiName), market: marketType };
      
      QUOTE_CACHE[cacheKey] = { data, timestamp: Date.now() };
      return data;
    } catch (e) { return null; }
  });
}

async function fetchFugleQuote(sid: string) {
  const cacheKey = `fugle_${sid}`;
  if (QUOTE_CACHE[cacheKey] && Date.now() - QUOTE_CACHE[cacheKey].timestamp < QUOTE_CACHE_DURATION) {
    return QUOTE_CACHE[cacheKey].data;
  }

  if (Date.now() < fugleRateLimitUntil) {
    console.warn("Fugle is in cooling down due to rate limit");
    return null;
  }

  return throttledFetch(async () => {
    try {
      const response = await fetch(`/api/proxy/fugle/${encodeURIComponent(sid)}`);
      if (!response.ok) {
        if (response.status === 429) {
          console.warn("Fugle API Rate Limit Hit - Cooling down for 60s");
          fugleRateLimitUntil = Date.now() + 60000;
        }
        return null;
      }
      const d = await response.json();
      const price = d.lastTrade?.price || d.closePrice || 0;
      const prevClose = d.previousClose || (price - (d.quote?.change || 0));
      const change = d.quote?.change || (price - prevClose);
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      const apiName = d.nameZhTw || "";
      const data = { id: sid, price: price, change: change, changePercent: changePercent, vol: d.quote?.totalVolume || 0, name: resolveStockName(sid, apiName), market: d.market };
      
      QUOTE_CACHE[cacheKey] = { data, timestamp: Date.now() };
      return data;
    } catch (e) { return null; }
  });
}

async function fetchFinMindData(dataset: string, sid: string, startDate: string) {
  // Sanitize sid: remove .TW, .TWO or any non-numeric suffix for FinMind
  const cleanSid = sid.split('.')[0].replace(/[^0-9]/g, '');
  if (!cleanSid) return [];
  
  if (Date.now() < finmindRateLimitUntil) {
    return [];
  }

  return throttledFetch(async () => {
    try {
      const params = new URLSearchParams({
        dataset,
        data_id: cleanSid,
        start_date: startDate
      });
      const res = await fetch(`/api/proxy/finmind?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) return json.data;
      } else if (res.status === 429 || res.status === 402) {
        console.warn(`FinMind API ${res.status} Hit - Cooling down for 5 minutes`);
        finmindRateLimitUntil = Date.now() + 300000; // 402/429 則冷卻 5 分鐘
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error(`FinMind API Error ${res.status}:`, errData);
      }
    } catch (e) {}
    return [];
  });
}

async function getMarketState() {
  const symbol = "^TWII";
  try {
    const res = await fetch(`/api/proxy/yahoo?symbol=${encodeURIComponent(symbol)}&range=2mo&interval=1d`);
    const json = await res.json();
    const result = json.chart?.result?.[0];
    const close = result?.indicators?.quote?.[0]?.close || [];
    const validPrices = close.filter((p: any) => p !== null);
    if (validPrices.length < 20) return false;
    const current = validPrices[validPrices.length - 1];
    const ma20 = validPrices.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    return current < ma20;
  } catch (e) { return false; }
}

async function fetchMarketContext(sid: string): Promise<MarketContext> {
  const defaultRes = { 
    index_performance: { twii_change: 0, nasdaq_change: 0, sox_change: 0 }, 
    sector_performance: { sector_name: "市場標的", avg_change: 0, peers: [] }
  };

  try {
    const [twii, nasdaq, sox] = await Promise.all([
      fetchYahooQuote("^TWII"),
      fetchYahooQuote("^IXIC"),
      fetchYahooQuote("^SOX")
    ]);

    const sectorName = getSectorName(sid);
    const sectorIds = (SECTOR_MAP as any)[sectorName] || [];
    const peerIds = sectorIds.filter((id: string) => id !== sid).slice(0, 3);
    
    let peers: Array<{name: string, change: number}> = [];
    if (peerIds.length > 0) {
      const peerResults = await Promise.all(peerIds.map((id: string) => fetchFugleQuote(id)));
      peers = peerResults
        .filter((p: any) => p !== null)
        .map((p: any) => ({ name: p.name, change: p.changePercent }));
    }

    const avgSectorChange = peers.length > 0 
      ? peers.reduce((sum, p) => sum + p.change, 0) / peers.length 
      : 0;

    return {
      index_performance: {
        twii_change: twii?.changePercent || 0,
        nasdaq_change: nasdaq?.changePercent || 0,
        sox_change: sox?.changePercent || 0
      },
      sector_performance: {
        sector_name: sectorName,
        avg_change: avgSectorChange,
        peers: peers
      }
    };

  } catch (e) {
    return defaultRes;
  }
}

// === 新增：負責抓取所有「靜態」數據的函數 ===
// 這個函數很「重」，但盤中只需要執行一次並快取
async function fetchStaticAnalysisData(sid: string): Promise<StaticAnalysisData> {
    const [histData, perData, chipData, financialAnalysis, marketBelowMA20, revData, marketContext] = await Promise.all([
        fetchFinMindData('TaiwanStockPrice', sid, getDateOffset(365)), 
        fetchFinMindData('TaiwanStockPER', sid, getDateOffset(30)),    
        fetchFinMindData('TaiwanStockInstitutionalInvestorsBuySell', sid, getDateOffset(30)), 
        fetchFinMindData('TaiwanStockFinancialAnalysis', sid, getDateOffset(730)), 
        getMarketState(),
        fetchFinMindData('TaiwanStockMonthRevenue', sid, getDateOffset(120)),
        fetchMarketContext(sid)
    ]);

    return {
        histData,
        perData,
        chipData,
        financialAnalysis,
        revData,
        marketBelowMA20,
        marketContext,
        timestamp: Date.now()
    };
}

// === 新增：純運算核心 (Compute Engine) ===
// 接收「快取的靜態數據」與「最新的即時報價」，瞬間合成分析結果
function computeAnalysis(sid: string, live: any, staticData: StaticAnalysisData): AnalysisDetail {
    const { histData, perData, chipData, financialAnalysis, revData, marketBelowMA20, marketContext } = staticData;

    const currentPrice = live?.price || 0;
    const currentVol = live?.vol || (histData.length > 0 ? histData[histData.length - 1].Trading_Volume : 0);

    // === 重組 K 線數據：將歷史 K 線與今日即時 K 線拼接 ===
    const dailyPrices = histData.map((d: any) => d.close);
    const dailyOHLC: OHLCV[] = histData.map((d: any) => ({ open: d.open, high: d.max, low: d.min, close: d.close, vol: d.Trading_Volume, date: d.date }));

    // 動態注入今日數據
    if (live && live.price > 0 && histData.length > 0) {
        // 若歷史資料最後一筆不是今天，則 push 新資料
        const todayStr = new Date().toISOString().split('T')[0];
        if (histData[histData.length-1].date !== todayStr) {
            dailyPrices.push(live.price);
            dailyOHLC.push({ 
                open: live.price, // 近似
                high: live.price, 
                low: live.price, 
                close: live.price, 
                vol: live.vol || 0,
                date: 'Today'
            });
        }
    }

    // 即時重算技術指標
    const dailyMa20 = calculateMA(dailyPrices, 20);
    const dailyMa60 = calculateMA(dailyPrices, 60);
    const dailyRsi = calculateRSI(dailyPrices, 14);
    const dailyBB = calculateBBands(dailyPrices, 20, 2);

    // 週線聚合
    const weeklyPrices = aggregateToWeeklyPrices(histData);
    const weeklyOHLC = aggregateWeeklyOHLC(histData);
    
    if (weeklyPrices.length > 0 && live?.price) {
        weeklyPrices[weeklyPrices.length - 1] = live.price;
        if (weeklyOHLC.length > 0) {
            weeklyOHLC[weeklyOHLC.length - 1].close = live.price; 
        }
    }

    const weeklyMa20 = calculateMA(weeklyPrices, 20);
    const weeklyMa60 = calculateMA(weeklyPrices, 60);
    const weeklyRsi = calculateRSI(weeklyPrices, 14);
    const weeklyBB = calculateBBands(weeklyPrices, 20, 2);

    const dailyStream = generatePatternStream(dailyOHLC, 12);
    const weeklyStream = generatePatternStream(weeklyOHLC, 15);

    // 關鍵價位
    const period60 = histData.length >= 60 ? histData.slice(-60) : histData;
    let recentHigh = currentPrice;
    let recentLow = currentPrice;
    let highVolPrice = currentPrice;
    
    if (period60.length > 0) {
        const prices60 = period60.map((d: any) => d.close);
        if (live?.price) prices60.push(live.price);
        recentHigh = Math.max(...prices60);
        recentLow = Math.min(...prices60);

        let maxVol = 0;
        let maxVolItem = null;
        period60.forEach((d: any) => {
            if (d.Trading_Volume > maxVol) {
                maxVol = d.Trading_Volume;
                maxVolItem = d;
            }
        });
        if (live && live.vol > maxVol) {
            highVolPrice = live.price;
        } else if (maxVolItem) {
            highVolPrice = maxVolItem.close;
        }
    }

    const advanced_tech = {
        daily: {
            rsi: dailyRsi,
            bbands: dailyBB,
            ma20: dailyMa20,
            ma60: dailyMa60,
            trend_status: determineTrend(currentPrice, dailyMa20, dailyMa60)
        },
        weekly: {
            rsi: weeklyRsi,
            bbands: weeklyBB,
            ma20: weeklyMa20,
            ma60: weeklyMa60,
            trend_status: determineTrend(currentPrice, weeklyMa20, weeklyMa60)
        },
        k_line_narrative: { daily_stream: dailyStream, weekly_stream: weeklyStream },
        key_levels: { recent_high: recentHigh, recent_low: recentLow, high_vol_price: highVolPrice }
    };

    let ma20Final, ma60Final, avgVol5;
    if (histData.length >= 20) ma20Final = dailyMa20;
    if (histData.length >= 60) ma60Final = dailyMa60;
    if (histData.length >= 5) avgVol5 = histData.slice(-5).reduce((a: number, b: any) => a + b.Trading_Volume, 0) / 5;

    const historyCount = 20;
    const history = [];
    for (let i = 0; i < historyCount; i++) {
        const idx = histData.length - historyCount + i;
        if (idx < 0) continue;
        const item = histData[idx];
        const hPrices = histData.slice(0, idx + 1).map((x:any) => x.close);
        const ma20 = calculateMA(hPrices, 20);
        const ma60 = calculateMA(hPrices, 60);
        history.push({ date: item.date, price: item.close, ma20: ma20 || undefined, ma60: ma60 || undefined });
    }

    if (live && live.price > 0 && (!history.length || history[history.length-1].date !== new Date().toISOString().split('T')[0])) {
        history.push({ date: '即時', price: live.price, ma20: ma20Final || undefined, ma60: ma60Final || undefined });
    }

    const latestPERData = perData && perData.length > 0 ? [...perData].sort((a: any, b: any) => b.date.localeCompare(a.date))[0] : null;
    const pe = latestPERData?.PER && latestPERData.PER !== 0 ? latestPERData.PER : "-";
    const pbr = latestPERData?.PBR && latestPERData.PBR !== 0 ? latestPERData.PBR : null;
    const dividend = latestPERData?.dividend_yield || 0;

    const getLatestAnalysisValue = (type: string) => {
        if (!financialAnalysis || financialAnalysis.length === 0) return undefined;
        const matches = financialAnalysis.filter((d: any) => d.type === type).sort((a: any, b: any) => b.date.localeCompare(a.date));
        return matches.length > 0 ? matches[0].value : undefined;
    };

    const officialROE = getLatestAnalysisValue('Return_on_Equity_A_percent');
    const officialMargin = getLatestAnalysisValue('Net_Profit_Margin');
    let roeVal = 0, roeDisplay = "-";
    if (officialROE !== undefined) {
        roeVal = officialROE;
        roeDisplay = roeVal.toFixed(2) + "%";
    } else if (pbr !== null && typeof pe === 'number' && pe > 0) {
        roeVal = (pbr / pe) * 100;
        roeDisplay = roeVal.toFixed(2) + "% (估)";
    }
    const marginDisplay = officialMargin !== undefined ? officialMargin.toFixed(2) + "%" : "-";

    let estMonthRev = "資料計算中", estAnnualReturn = "8~12%", sentimentScore = 60;
    if (revData && revData.length >= 2) {
        const sortedRev = [...revData].sort((a: any, b: any) => b.date.localeCompare(a.date));
        const latestRev = sortedRev[0];
        const prevYearRev = sortedRev.find((d: any) => d.date.startsWith((parseInt(latestRev.date.substring(0,4))-1).toString()) && d.date.substring(5) === latestRev.date.substring(5));
        const yoy = latestRev.revenue_year_growth || (prevYearRev ? (latestRev.revenue - prevYearRev.revenue) / prevYearRev.revenue * 100 : 0);
        estMonthRev = yoy.toFixed(1) + "% (YoY)";
        sentimentScore = Math.min(98, Math.max(30, 60 + (yoy * 0.5)));
        estAnnualReturn = Math.max(2, (roeVal * 0.6) + (yoy * 0.2)).toFixed(1) + "%";
    }

    const sortedChipDates = Array.from(new Set(chipData.map((d: any) => d.date))).sort().reverse();
    const targetDates5 = sortedChipDates.slice(0, 5); 
    let trustSum = 0, foreignSum = 0, trustStreak = 0, hasValidData = false;

    chipData.forEach((item: any) => {
        if (targetDates5.includes(item.date)) {
            const net = (parseFloat(item.buy) || 0) - (parseFloat(item.sell) || 0);
            const name = (item.name || "").toLowerCase();
            if (name.includes('trust')) { trustSum += net; hasValidData = true; }
            if (name.includes('foreign')) { foreignSum += net; hasValidData = true; }
        }
    });

    for (const date of sortedChipDates) {
        const dayData = chipData.filter((d: any) => d.date === date && (d.name || "").toLowerCase().includes('trust'));
        if (dayData.length > 0) {
            const net = dayData.reduce((acc: number, d: any) => acc + ((parseFloat(d.buy) || 0) - (parseFloat(d.sell) || 0)), 0);
            if (net > 0) trustStreak++; else break;
        } else break;
    }

    const scoreResult = calculateScore({ price: currentPrice, changePercent: live?.changePercent || 0, ma20: ma20Final || undefined, ma60: ma60Final || undefined, avgVol5, vol: currentVol, roe: roeVal, pe, trust_5d: hasValidData ? Math.round(trustSum/1000) : "-", foreign_5d: hasValidData ? Math.round(foreignSum/1000) : "-", trust_streak: trustStreak, marketBelowMA20 });

    const momEntry = roundToTaiwanTick(currentPrice * (scoreResult.score >= 70 ? 0.985 : 0.96));
    const valEntry = roundToTaiwanTick(currentPrice * (roeVal >= 12 ? 0.94 : 0.88));

    const strategy_mom: Strategy = {
        entry: momEntry,
        stop_loss: roundToTaiwanTick(momEntry * 0.93),
        take_profit: roundToTaiwanTick(momEntry * 1.15),
        desc: scoreResult.score >= 70 ? "趨勢明確，適合沿月線分批佈局。" : "動能疲弱，建議縮小倉位或空倉觀望。"
    };

    const strategy_val: Strategy = {
        entry: valEntry,
        stop_loss: "長期持有",
        take_profit: roundToTaiwanTick(valEntry * 1.3),
        desc: roeVal >= 12 ? "獲利效率穩定，價值面具支撐。" : "估值偏高或效率不足，價值诱因較低。"
    };

    return {
        id: sid,
        name: resolveStockName(sid, live?.name),
        price_info: { price: currentPrice, change: live?.change || 0, changePercent: live?.changePercent || 0 },
        analysis: { score: scoreResult.score, action: scoreResult.action, reasons: scoreResult.reasons, strategy_mom, strategy_val, report_text: "" },
        fundamentals: { pe, roe: roeDisplay, dividend: dividend === 0 ? "-" : dividend.toFixed(2) + "%", profitMargins: marginDisplay, vol: currentVol, ma20: ma20Final || undefined, ma60: ma60Final || undefined },
        advanced_tech,
        market_context: marketContext,
        chips: { trust_5d: hasValidData ? Math.round(trustSum/1000) : "-", foreign_5d: hasValidData ? Math.round(foreignSum/1000) : "-", trust_streak: trustStreak },
        bias: (ma20Final && ma20Final > 0) ? Number(((currentPrice - ma20Final) / ma20Final * 100).toFixed(2)) : 0,
        history,
        forecasts: { est_month_rev: estMonthRev, est_eps: "-", est_annual_return: estAnnualReturn, market_sentiment: Math.round(sentimentScore), quarterly_eps: [] }
    };
}

// === 修改後的 getAnalyze 主入口 ===

// 輔助函數：取得指定時間戳的「台灣時間」Date 物件
const getTaiwanDate = (timestamp: number) => {
  return new Date(new Date(timestamp).toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
};

// 輔助函數：更嚴謹的快取驗證
// 解決 12:30 (盤中) 建立的快取，在 16:00 (盤後) 應該失效的問題
const isCacheExpired = (timestamp: number) => {
  const now = Date.now();
  const twNow = getTaiwanDate(now);
  const twCache = getTaiwanDate(timestamp);

  // 1. 基礎時效檢查 (4小時)
  if (now - timestamp > CACHE_DURATION) return true;

  // 2. 換日檢查：如果快取是昨天的，當然失效
  if (twNow.getDate() !== twCache.getDate()) return true;

  // 3. 關鍵時刻檢查：15:00 (下午3點)
  // 如果現在已經過了 15:00，但快取是在 15:00 之前建立的 -> 失效 (需要抓取盤後籌碼)
  // 即使 15:00 之前是 12:30 (未滿4小時)，也必須強制刷新
  const MARKET_SETTLE_HOUR = 15;
  if (twNow.getHours() >= MARKET_SETTLE_HOUR && twCache.getHours() < MARKET_SETTLE_HOUR) {
    return true; 
  }

  return false;
};

const DEFAULT_STATIC_DATA: StaticAnalysisData = {
    histData: [],
    perData: [],
    chipData: [],
    financialAnalysis: [],
    revData: [],
    marketBelowMA20: false,
    marketContext: { 
        index_performance: { twii_change: 0, nasdaq_change: 0, sox_change: 0 }, 
        sector_performance: { sector_name: "市場標的", avg_change: 0, peers: [] } 
    },
    timestamp: 0
};

// 參數 mode: 'full' (強制更新所有數據) | 'fast' (優先使用快取，若無則抓取) | 'pulse' (只用快取，若無則回傳預設值)
export const getAnalyze = async (sid: string, mode: 'full' | 'fast' | 'pulse' = 'full'): Promise<AnalysisDetail> => {
  // 1. 永遠抓取最新的即時報價 (Fugle / Yahoo)
  let live = await fetchFugleQuote(sid);
  if (!live || live.price === 0) {
    const yahooLive = await fetchYahooQuote(sid, 'TSE') || await fetchYahooQuote(sid, 'OTC');
    if (yahooLive && yahooLive.price !== 0) {
      live = { id: sid, price: yahooLive.price, change: yahooLive.change, changePercent: yahooLive.changePercent, vol: yahooLive.vol, name: resolveStockName(sid, yahooLive.name), market: yahooLive.market };
    }
  }

  // 2. 處理靜態數據 (FinMind, MarketContext)
  let staticData = MEMORY_CACHE[sid];
  
  // 使用新的驗證邏輯：如果 mode 是 fast/pulse，且快取存在，且「未過期」，才使用快取
  const isValid = staticData && !isCacheExpired(staticData.timestamp);

  if (mode === 'full' || (!isValid && mode === 'fast')) {
    // 沒有快取、強制更新、或快取已過期：執行重的 Fetch
    staticData = await fetchStaticAnalysisData(sid);
    MEMORY_CACHE[sid] = staticData; // 寫入快取
  } else if (!isValid && mode === 'pulse') {
    // Pulse 模式下若無效快取，則回傳預設值，避免掃描時產生大量 API 請求
    staticData = DEFAULT_STATIC_DATA;
  }

  // 3. 運算核心：合成數據並回傳
  return computeAnalysis(sid, live, staticData || DEFAULT_STATIC_DATA);
};

export const getMarketPulse = async (): Promise<MarketPulse> => {
  const [twii, nasdaq, sox] = await Promise.all([
    fetchYahooQuote("^TWII"),
    fetchYahooQuote("^IXIC"),
    fetchYahooQuote("^SOX")
  ]);

  const trends = [
    { name: "加權指數", val: twii?.price.toLocaleString() || "0", change: twii?.changePercent || 0, color: getColor(twii?.change || 0) },
    { name: "那斯達克", val: nasdaq?.price.toLocaleString() || "0", change: nasdaq?.changePercent || 0, color: getColor(nasdaq?.change || 0) },
    { name: "費城半導體", val: sox?.price.toLocaleString() || "0", change: sox?.changePercent || 0, color: getColor(sox?.change || 0) }
  ];

  const sectorNames = Object.keys(SECTOR_MAP).slice(0, 3); // 初始只掃描前 3 個板塊，減少負載
  const sectorResults: any[] = [];

  for (const name of sectorNames) {
    const ids = (SECTOR_MAP as any)[name].slice(0, 6); // 減少掃描數量
    const stocksInSector: StockData[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const detail = await getAnalyze(id, 'pulse'); 
        stocksInSector.push({
          id: id,
          name: detail.name,
          price: detail.price_info.price,
          change: detail.price_info.change,
          changePercent: detail.price_info.changePercent,
          score: detail.analysis.score,
          action: detail.analysis.action
        } as StockData);
      } catch (e) {
        stocksInSector.push({ id, name: resolveStockName(id), price: 0, change: 0, changePercent: 0, score: 50, action: "觀望" } as StockData);
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // 增加單個請求間的延遲
    }

    const avgScore = stocksInSector.length > 0 ? Math.round(stocksInSector.reduce((a, b) => a + b.score, 0) / stocksInSector.length) : 50;
    sectorResults.push({ name, score: avgScore, stocks: stocksInSector });
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // 板塊間延遲
  }

  const allScannedStocks = sectorResults.flatMap(s => s.stocks);
  const allRecommendations = allScannedStocks
    .filter(s => s.score >= 75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    trends,
    sectors: sectorResults,
    recommendations: allRecommendations,
    warning: twii && twii.changePercent < -1 ? "大盤修正風險，建議保守" : "市場運行穩健",
    scanStatus: `最後更新: ${new Date().toLocaleTimeString()}`
  };
};
