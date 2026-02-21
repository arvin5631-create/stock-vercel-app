
import { GoogleGenAI } from "@google/genai";
import { AnalysisDetail } from "../types";

const getAIClient = () => {
  // 相容性處理：
  // 1. process.env.API_KEY: 用於特定開發環境或 Webpack
  // 2. import.meta.env.VITE_API_KEY: 用於 Vite 建置與 Vercel 部屬
  // 注意：在 Vercel 設定環境變數時，請使用 "VITE_API_KEY"
  const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
  
  if (!apiKey) {
    console.warn("未檢測到 API Key，AI 功能可能無法正常運作。請確認環境變數 VITE_API_KEY 已設定。");
  }

  return new GoogleGenAI({ apiKey: apiKey || '' });
};

const getModelName = async (taskType: 'fast' | 'pro' = 'fast') => {
  // 檢查是否有透過 AI Studio 擴充功能選取 Key (開發環境專用)
  const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
  
  // 若有選取 Key 或者是 Vercel 環境 (通常有設定 API Key)，則允許使用 Pro 模型
  // 這裡做一個簡單判斷：如果有設定 VITE_API_KEY，也視為有權限使用 Pro
  const hasEnvKey = !!(import.meta as any).env?.VITE_API_KEY;
  
  if (hasKey || hasEnvKey) {
    return taskType === 'pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  }
  return 'gemini-3-flash-preview';
};

export const discoverTrendingStocks = async (excludedIds: string[]): Promise<string[]> => {
  const ai = getAIClient();
  const model = await getModelName('fast');
  
  const prompt = `
    今天日期是 ${new Date().toLocaleDateString()}。
    請搜尋今日台股市場中，具備「成交量異常放大」、「產業題材突破」且「非大型權值股」的 2 檔強勢股票代號。
    請排除以下代號：${excludedIds.join(', ')}。
    
    請只回傳代號，格式為：["代號1", "代號2"]。
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const text = response.text || "";
    const match = text.match(/\d{4}/g);
    return match ? Array.from<string>(new Set(match)).slice(0, 2) : [];
  } catch (error) {
    console.error("Discovery Error:", error);
    return [];
  }
};

// === AI 頻率限制與冷卻系統 ===
let lastAIGenTime = 0;
const AI_COOLDOWN = 35000; // 35 秒冷卻時間 (Gemini Free Tier 限制)

export const generateAIAudit = async (data: AnalysisDetail): Promise<{text: string, sources: any[]}> => {
  const now = Date.now();
  const timeSinceLast = now - lastAIGenTime;
  
  if (timeSinceLast < AI_COOLDOWN) {
    const waitSec = Math.ceil((AI_COOLDOWN - timeSinceLast) / 1000);
    throw new Error(`AI 正在冷卻中，請在 ${waitSec} 秒後再試。`);
  }

  const ai = getAIClient();
  const model = await getModelName('pro');
  
  const tech = data.advanced_tech;
  const kLineNarrative = tech?.k_line_narrative || { daily_stream: "無數據", weekly_stream: "無數據" };
  const keyLevels = tech?.key_levels || { recent_high: 0, recent_low: 0, high_vol_price: 0 };
  const market = data.market_context || { 
    index_performance: { twii_change: 0, nasdaq_change: 0, sox_change: 0 }, 
    sector_performance: { sector_name: "未知", avg_change: 0, peers: [] } 
  };

  const peerNames = market.sector_performance.peers.map(p => `${p.name}(${p.change.toFixed(2)}%)`).join(", ");
  
  // 計算距離主力成本的乖離率，用於判斷獲利/套牢狀況
  const costBias = keyLevels.high_vol_price > 0 
    ? ((data.price_info.price - keyLevels.high_vol_price) / keyLevels.high_vol_price * 100).toFixed(2) 
    : "0";

  const quantContext = `
    [Ace Trader V7 標的量化儀表板]
    - 標的：${data.name} (${data.id}) | 板塊：${market.sector_performance.sector_name}
    - 現價：${data.price_info.price} (漲跌: ${data.price_info.changePercent.toFixed(2)}%)
    - 量化評分：${data.analysis.score} (原始策略: ${data.analysis.action})
    
    [市場宏觀與板塊 (Macro & Sector)]
    - 大盤氛圍：台股加權(${market.index_performance.twii_change.toFixed(2)}%), 那斯達克(${market.index_performance.nasdaq_change.toFixed(2)}%), 費城半導體(${market.index_performance.sox_change.toFixed(2)}%)
    - 族群動向：同儕平均漲跌 ${market.sector_performance.avg_change.toFixed(2)}% | 參考股：${peerNames || "無"}

    [籌碼與關鍵價位辯證 (Chips Logic)]
    - 關鍵攻防：近季高點 ${keyLevels.recent_high} | 近季低點 ${keyLevels.recent_low}
    - 主力成本區 (爆量價)：${keyLevels.high_vol_price} (目前股價相對於主力成本乖離：${costBias}%)
      > 若乖離為正且大，主力獲利拉開；若為負，主力套牢有壓。
    - 籌碼動向：投信5日 ${data.chips.trust_5d}張 (連買 ${data.chips.trust_streak} 天), 外資5日 ${data.chips.foreign_5d}張

    [K線型態密碼 (Price Action)]
    - 週線大趨勢：${kLineNarrative.weekly_stream}
    - 日線短波段：${kLineNarrative.daily_stream}
    - 技術指標：日RSI=${tech?.daily.rsi.toFixed(1)} | 週RSI=${tech?.weekly.rsi.toFixed(1)}

    [基本面價值 (Fundamentals)]
    - 估值：PE=${data.fundamentals.pe}, ROE=${data.fundamentals.roe}
    - 獲利能力：毛利率=${data.fundamentals.profitMargins}, 殖利率=${data.fundamentals.dividend}
  `;

  const instruction = `
    角色設定：你是一位極度理性、奉行「機率思維 (Probabilistic Thinking)」與「期望值 (Expected Value)」的傳奇對沖基金經理人。你討厭模稜兩可的廢話，專注於尋找市場定價錯誤 (Mispricing)。

    任務：
    1. 啟動 googleSearch 搜尋該標的近 7 天重大新聞、法說會、營收。
    2. **必須搜尋**該公司的「主要客戶(如 Apple/Nvidia/Tesla)」或「競爭對手」的近期股價或消息，以判斷供應鏈連動效應。
    3. 綜合「技術面(Technical)」、「基本面(Fundamental)」、「籌碼面(Chips)」與「消息面(News)」進行全方位診斷。
    4. **嚴格禁止**產生獨立的「技術分析」或「基本面」區塊。請將 K 線型態、均線乖離與關鍵價位判斷，**完美融合**進以下指定的五大章節中。

    深度邏輯要求 (Deep Dive Logic)：
    
    1. 【邏輯矛盾辯證 (Dialectic Check)】：
       - 尋找背離：好消息頻傳但股價不漲？(利多出盡) vs. 壞消息但股價不跌？(利空測試完成)
       - 籌碼背離：股價創高但法人大賣？(主力出貨) vs. 股價破底但法人大買？(低檔吃貨)
       - 技術背離：指標高檔鈍化還是背離？均線是助漲還是蓋頭反壓？
    
    2. 【宏觀因子加權 (Macro Weighting)】：
       - 若為電子/半導體股：請考量近期「費半指數」與「台幣匯率」影響。
       - 若為傳產/原物料股：請考量「報價指數」或「運價」趨勢。

    3. 【技術與籌碼共振 (Tech & Chips Resonance)】：
       - 結合「主力成本乖離 (${costBias}%)」與「K線型態 (${kLineNarrative.daily_stream})」判斷目前是主升段、盤整還是做頭。
    
    4. 【勝率與賠率 (Risk/Reward)】：
       - 不只給買賣建議，更要預估「勝率 (Win Rate)」與「盈虧比 (R/R Ratio)」。

    輸出規定 (嚴格遵守區塊標題與繁體中文)：

    【投資決策儀表板】
    - 投資訊號：(強力買進 / 拉回佈局 / 區間短打 / 反彈空 / 觀望)
    - 預估勝率：(例如：65% / 盈虧比 1:3)
    - 技術格局：(一句話形容 K 線型態與均線架構，例如：多頭排列且站穩季線)
    - 風險等級：(低 / 中 / 高 / 極高)
    - 一句話快評：(融合「供應鏈」、「籌碼」與「技術位階」的關鍵結論)

    【風險深度解析】
    (條列 2 點。請具體指出「宏觀逆風」、「基本面衰退」或「技術面破線」(如跌破 ${keyLevels.recent_low} 或 M頭成型) 的具體風險)

    【多維度層層分析】
    1. 供應鏈與競爭態勢 (Supply Chain & Peers)：
       - "產業地位..." (分析主要客戶或對手狀況)。
    2. 消息面與邏輯辯證 (News & Logic)：
       - "市場預期..." (執行二階思考，判斷利多/利空反應)。
    3. 技術結構與籌碼意圖 (Tech & Chips)：
       - "量價籌碼..." (結合週線趨勢 ${kLineNarrative.weekly_stream}、日線型態與主力成本 ${keyLevels.high_vol_price} 攻防，研判主力意圖)。

    【重點整理與操作建議】
    - 多方優勢：(條列技術/籌碼/基本面優勢)
    - 空方劣勢：(條列劣勢)
    - 戰術執行：(給出具體進場、加碼與停損規劃，**必須參考** 關鍵價位 ${keyLevels.recent_high} / ${keyLevels.recent_low} / ${keyLevels.high_vol_price})

    【情境模擬與風控】
    1. 樂觀情境：(若突破壓力 ${keyLevels.recent_high} 且量能配合...)
    2. 悲觀情境：(若跌破支撐 ${keyLevels.recent_low} 或主力棄守...)
    3. 盤整情境：(區間震盪策略)

    風格要求：語氣專業、篤定、具備避險基金的冷靜視角。將所有數據內化，不要生硬條列。
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `數據如下：\n${quantContext}\n\n指令如下：\n${instruction}`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title,
      uri: chunk.web?.uri
    })) || [];

    lastAIGenTime = Date.now(); // 成功後更新時間
    return {
      text: response.text || "診斷失敗",
      sources: sources
    };
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      lastAIGenTime = Date.now(); // 遇到 429 也視為一次嘗試，啟動冷卻
      throw new Error("AI 額度已達上限，請稍候 35 秒再試。");
    }
    throw error;
  }
};
