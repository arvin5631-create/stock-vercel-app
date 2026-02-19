
export interface StockData {
  id: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  score: number;
  action: string;
  volume?: number;
  isDetailed?: boolean; 
}

export interface MarketPulse {
  trends: Array<{ name: string; val: string; change: number; color: string }>;
  sectors: Array<{ name: string; score: number; stocks: StockData[] }>;
  recommendations: StockData[];
  warning: string;
  scanStatus: string;
}

export interface TechIndicators {
  rsi: number;
  bbands: { upper: number; mid: number; lower: number; bandwidth: number };
  ma20: number;
  ma60: number;
  trend_status: string; // e.g. "多頭排列" | "空頭排列" | "震盪"
}

export interface KeyLevels {
  recent_high: number; // 近60日最高收盤
  recent_low: number;  // 近60日最低收盤
  high_vol_price: number; // 近60日最大量當日收盤價 (主力成本參考)
}

export interface MarketContext {
  index_performance: {
    twii_change: number; // 加權指數漲跌幅
    nasdaq_change: number; // 那斯達克漲跌幅
    sox_change: number; // 費半漲跌幅
  };
  sector_performance: {
    sector_name: string;
    avg_change: number; // 同族群平均漲跌幅
    peers: Array<{ name: string; change: number }>; // 同族群代表股表現
  };
}

export interface AnalysisDetail {
  id: string;
  name: string;
  price_info: { price: number; change: number; changePercent: number };
  analysis: {
    score: number;
    action: string;
    reasons: string[];
    strategy_mom: Strategy;
    strategy_val: Strategy;
    report_text: string;
  };
  fundamentals: {
    pe: number | string;
    roe: number | string;
    dividend: number | string;
    profitMargins: number | string;
    vol: number;
    ma20?: number;
    ma60?: number;
  };
  // 新增進階技術指標欄位，包含 K 線型態敘述
  advanced_tech?: {
    daily: TechIndicators;
    weekly: TechIndicators;
    k_line_narrative: {
      daily_stream: string;  // 日線 K 棒序列描述
      weekly_stream: string; // 週線 K 棒序列描述
    };
    key_levels: KeyLevels; // 新增關鍵價位
  };
  // 新增市場連動資訊
  market_context?: MarketContext; 
  chips: {
    trust_5d: number | string;
    foreign_5d: number | string;
    trust_streak: number;
  };
  bias: number;
  history: Array<{ date: string, price: number, ma20?: number, ma60?: number }>; 
  forecasts?: {
    est_month_rev: string; 
    est_eps: string;
    est_annual_return: string; 
    market_sentiment: number; 
    quarterly_eps?: Array<{ label: string; actual?: number; projected: number }>; 
  };
}

export interface Strategy {
  entry: number | string;
  stop_loss: number | string;
  take_profit: number | string;
  desc: string;
}
