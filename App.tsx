
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { 
  Plus, Edit3, Check, Activity, PauseCircle, Globe, X, ArrowLeft, Loader2, Info, ArrowUp, ArrowDown, 
  Trash2, RefreshCw, ChevronRight, ChevronUp, ChevronDown, BarChart3, Layers, Zap, Flame, 
  SlidersHorizontal, Filter, Target, Sparkles, Wand2, Key, Share, Download, ImageDown
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { StockData, MarketPulse, AnalysisDetail } from './types';
import { getMarketPulse, getAnalyze, checkStock } from './services/stockService';
import { generateAIAudit, discoverTrendingStocks } from './services/geminiService';
import { getColor, getScoreColorCode, smartPrice, SECTOR_MAP, getSectorName } from './constants';
import AnalysisView from './components/AnalysisView';

const StockListItem = memo((props: any) => {
  const { stock, editMode, onOpen, onDelete, onMove, isFirst, isLast, delay } = props;
  return (
    <div 
      onClick={() => { if (!editMode) onOpen(stock.id); }} 
      className={`glass-card p-4 rounded-2xl flex justify-between items-center animate-list-enter transition-all ${!editMode ? 'cursor-pointer hover:bg-white/5 active:scale-[0.98]' : ''}`} 
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm border-2 ${getScoreColorCode(stock.score)} bg-black/20 shadow-inner`}>
          {stock.score || '50'}
        </div>
        <div>
          <div className="font-bold text-white text-lg tracking-tight leading-none mb-1">{stock.name}</div>
          <div className="text-[10px] text-gray-400 font-num flex items-center gap-1.5 font-bold uppercase tracking-wider">
            {stock.id} <span className="opacity-20">|</span> <span className={getScoreColorCode(stock.score)}>{stock.action}</span>
            {stock.isDetailed && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded ml-1">DEEP</span>}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {!editMode ? (
          <div className="text-right">
            <div className={`font-black font-num text-xl leading-none ${getColor(stock.change)}`}>{smartPrice(stock.price)}</div>
            <div className={`text-[10px] px-1.5 py-0.5 rounded bg-gray-900/50 font-num font-bold mt-1 inline-block ${getColor(stock.change)}`}>
              {stock.change > 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col gap-1">
              <button disabled={isFirst} onClick={(e) => { e.stopPropagation(); onMove(stock.id, 'up'); }} className={`p-1.5 rounded-lg border transition-all active:scale-90 ${isFirst ? 'bg-slate-800/20 text-slate-700 border-slate-800' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-blue-400'}`}>
                <ChevronUp size={14} />
              </button>
              <button disabled={isLast} onClick={(e) => { e.stopPropagation(); onMove(stock.id, 'down'); }} className={`p-1.5 rounded-lg border transition-all active:scale-90 ${isLast ? 'bg-slate-800/20 text-slate-700 border-slate-800' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-blue-400'}`}>
                <ChevronDown size={14} />
              </button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(stock.id); }} className="p-3 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20 active:scale-90 transition-all">
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'recommend'>('watchlist');
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [marketPulse, setMarketPulse] = useState<MarketPulse>({ trends: [], sectors: [], recommendations: [], warning: '', scanStatus: '' });
  const [editMode, setEditMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStockId, setNewStockId] = useState('');
  const [adding, setAdding] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [detailMode, setDetailMode] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [detailData, setDetailData] = useState<AnalysisDetail | null>(null);
  
  // 快存報告包含內容、時間與來源
  const [aiReportsCache, setAiReportsCache] = useState<Record<string, { content: string, time: number, sources: any[] }>>({});
  const [aiReport, setAiReport] = useState('');
  const [aiReportTime, setAiReportTime] = useState(0);
  const [aiReportSources, setAiReportSources] = useState<any[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [deepScanCount, setDeepScanCount] = useState(0);
  const [totalTargets, setTotalTargets] = useState(0);
  const [selectedSectorName, setSelectedSectorName] = useState<string | null>(null);
  const [hasCustomKey, setHasCustomKey] = useState(false);

  const [minScore, setMinScore] = useState(0);
  const [sectorFilter, setSectorFilter] = useState('all');
  const [perfFilter, setPerfFilter] = useState<'all' | 'gain' | 'lose'>('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const [dailyPicks, setDailyPicks] = useState<StockData[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // 截圖功能 Ref 與 State
  const captureRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const deepScanQueue = useRef<string[]>([]);
  const isDeepScanning = useRef(false);

  const refreshRef = useRef<() => void>(() => {});
  const scanRef = useRef<() => void>(() => {});

  useEffect(() => {
    const checkKey = async () => {
      const selected = await (window as any).aistudio?.hasSelectedApiKey();
      setHasCustomKey(!!selected);
    };
    checkKey();
    
    const saved = localStorage.getItem('stocks_v5_7');
    if (saved) setStocks(JSON.parse(saved));
    else setStocks([{ id: '2330', name: '台積電', price: 0, change: 0, changePercent: 0, score: 85, action: '強力買進', isDetailed: true }]);
    
    const savedPicks = localStorage.getItem('daily_picks_v1');
    if (savedPicks) setDailyPicks(JSON.parse(savedPicks));

    const savedReports = localStorage.getItem('ai_reports_cache_v5_time');
    if (savedReports) setAiReportsCache(JSON.parse(savedReports));
  }, []);

  const handleOpenKeySelector = async () => {
    try {
      await (window as any).aistudio?.openSelectKey();
      setHasCustomKey(true);
      showToast("金鑰已串接，將優先使用個人配額");
    } catch (e) {
      showToast("金鑰選取取消");
    }
  };

  useEffect(() => {
    localStorage.setItem('stocks_v5_7', JSON.stringify(stocks));
  }, [stocks]);

  useEffect(() => {
    localStorage.setItem('daily_picks_v1', JSON.stringify(dailyPicks));
  }, [dailyPicks]);

  useEffect(() => {
    localStorage.setItem('ai_reports_cache_v5_time', JSON.stringify(aiReportsCache));
  }, [aiReportsCache]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  // 截圖功能實作
  const handleCapture = async () => {
    if (!captureRef.current || !detailData) return;
    
    // 1. 設定狀態為 Capturing，這會觸發 AnalysisView 隱藏不必要的按鈕並展開全文
    setIsCapturing(true);
    showToast("正在生成專業診斷報告...");
    
    try {
      // 2. 給予一點時間讓 React 重新渲染 (例如展開全文)
      await new Promise(resolve => setTimeout(resolve, 300));

      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        backgroundColor: '#020617', // 強制使用深色背景
        pixelRatio: 3, // 提高解析度
        filter: (node) => {
          // 濾掉標記為 no-capture 的元素
          if (node.classList && node.classList.contains('no-capture')) {
            return false;
          }
          return true;
        },
        style: {
           // 確保截圖時能夠撐開完整高度
           height: 'auto',
           overflow: 'visible',
           maxHeight: 'none'
        }
      });
      
      const link = document.createElement('a');
      link.download = `AceTrader_${detailData.id}_${new Date().toISOString().slice(0,10)}.png`;
      link.href = dataUrl;
      link.click();
      
      showToast("報告影像已成功下載");
    } catch (err) {
      console.error('Snapshot failed', err);
      showToast("影像生成失敗，請稍後再試");
    } finally {
      setIsCapturing(false);
    }
  };

  const runDiscovery = async () => {
    setIsDiscovering(true);
    showToast("AI 正在掃描全市場異常熱點...");
    const excluded = (Object.values(SECTOR_MAP) as string[][]).flat();
    try {
      const ids = (await discoverTrendingStocks(excluded)) as string[];
      const results = await Promise.all(ids.map(async (id: string): Promise<StockData | null> => {
        try {
          // Discovery 使用 full mode，因為是新股票
          const detail = await getAnalyze(id, 'full');
          return {
            id,
            name: detail.name,
            price: detail.price_info.price,
            change: detail.price_info.change,
            changePercent: detail.price_info.changePercent,
            score: detail.analysis.score,
            action: detail.analysis.action,
            isDetailed: true
          };
        } catch(e) { return null; }
      }));
      const validPicks = results.filter((s): s is StockData => s !== null);
      setDailyPicks(validPicks);
      showToast(`發現 ${validPicks.length} 檔跨域熱門標的`);
    } catch (e) {
      showToast("探測失敗，請檢查網路");
    } finally {
      setIsDiscovering(false);
    }
  };

  const syncStockData = useCallback((sid: string, update: Partial<StockData>) => {
    setStocks(prev => prev.map(s => s.id === sid ? { ...s, ...update, isDetailed: true } : s));
    setDailyPicks(prev => prev.map(s => s.id === sid ? { ...s, ...update, isDetailed: true } : s));
    setMarketPulse(prev => ({
      ...prev,
      sectors: prev.sectors.map(sec => {
        const hasStock = sec.stocks.some(s => s.id === sid);
        if (!hasStock) return sec;
        const updatedStocks = sec.stocks.map(s => s.id === sid ? { ...s, ...update, isDetailed: true } : s);
        const avgScore = Math.round(updatedStocks.reduce((a, b) => a + b.score, 0) / updatedStocks.length);
        return { ...sec, stocks: updatedStocks, score: avgScore };
      })
    }));
  }, []);

  const runBatchScan = useCallback(async () => {
    if (deepScanQueue.current.length === 0) {
      isDeepScanning.current = false;
      showToast("AI 全場域深度診斷完成");
      return;
    }

    const batchSize = 15;
    const batch = deepScanQueue.current.splice(0, batchSize);
    
    try {
      await Promise.all(batch.map(async (sid) => {
        try {
          // 深度掃描使用 'full' 模式以建立快取
          const detail = await getAnalyze(sid, 'full');
          syncStockData(sid, {
            price: detail.price_info.price,
            change: detail.price_info.change,
            changePercent: detail.price_info.changePercent,
            score: detail.analysis.score,
            action: detail.analysis.action
          });
        } catch (e) { console.error(`Batch item failed: ${sid}`); }
      }));
      
      setDeepScanCount(prev => prev + batch.length);
      setTimeout(runBatchScan, 2500);
    } catch (e) {
      isDeepScanning.current = false;
    }
  }, [syncStockData, showToast]);

  const triggerDeepScan = useCallback(() => {
    if (isDeepScanning.current || deepScanQueue.current.length === 0) return;
    isDeepScanning.current = true;
    runBatchScan();
  }, [runBatchScan]);

  const scanMarket = useCallback(async (isManual: boolean = false) => {
    if (isScanning) return;
    setIsScanning(true);
    if (isManual) showToast("掃描全場域即時行情...");
    
    try {
      const data = await getMarketPulse();
      setMarketPulse(prev => {
        const mergedSectors = data.sectors.map(newSec => {
          const oldSec = prev.sectors.find(s => s.name === newSec.name);
          return {
            ...newSec,
            stocks: newSec.stocks.map(newStock => {
              const existing = oldSec?.stocks.find(s => s.id === newStock.id) || stocks.find(s => s.id === newStock.id);
              return existing?.isDetailed ? { ...newStock, ...existing, isDetailed: true } : newStock;
            })
          };
        });
        return { ...data, sectors: mergedSectors };
      });

      const etfIds = SECTOR_MAP["ETF 戰略精選"] || [];
      const allIds = data.sectors.flatMap(sec => sec.stocks.map(s => s.id));
      const uniqueIds = Array.from(new Set(allIds));
      
      const pendingIds = uniqueIds.filter(id => {
        const isEtf = etfIds.includes(id);
        const s = stocks.find(x => x.id === id);
        return (!s || !s.isDetailed) && !isEtf;
      });

      if (pendingIds.length > 0) {
        const currentQueue = new Set(deepScanQueue.current);
        const newOnes = pendingIds.filter(id => !currentQueue.has(id));
        
        if (newOnes.length > 0) {
          deepScanQueue.current = [...deepScanQueue.current, ...newOnes];
          setTotalTargets(prev => prev + newOnes.length);
          triggerDeepScan();
        }
      }
      
      if (isManual) showToast("行情已更新，背景深度同步中");
    } catch (e) {
      if (isManual) showToast("網路連線繁忙，請稍候");
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, stocks, showToast, triggerDeepScan]);

  const refreshQuotes = useCallback(async (manual: boolean = false) => {
    if ((isPaused && !manual) || document.hidden || stocks.length === 0) return;
    if (manual) showToast("同步自選標的最新評分...");
    
    for (const stock of stocks) {
      try {
        // 重要修改：這裡使用 'fast' 模式，只抓現價，使用快取中的財報/歷史數據
        // 大幅減少 API 請求，提升盤中更新速度
        const analyzeRes = await getAnalyze(stock.id, 'fast');
        
        syncStockData(stock.id, {
          price: analyzeRes.price_info.price,
          change: analyzeRes.price_info.change,
          changePercent: analyzeRes.price_info.changePercent,
          score: analyzeRes.analysis.score,
          action: analyzeRes.analysis.action
        });
        await new Promise(r => setTimeout(r, 600));
      } catch (e) { console.error(e); }
    }
    
    if (manual) showToast("自選行情同步完成");
  }, [isPaused, stocks, syncStockData, showToast]);

  useEffect(() => {
    refreshRef.current = () => refreshQuotes(false);
    scanRef.current = () => scanMarket(false);
  }, [refreshQuotes, scanMarket]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshRef.current();
      scanRef.current();
    }, 300000); // 延長至 5 分鐘更新一次
    scanMarket(false);
    return () => clearInterval(timer);
  }, []);

  const handleQuickAdd = async (id: string) => {
    if (stocks.find(s => s.id === id)) {
      showToast("標的已存在自選中");
      return;
    }
    try {
      const info = await checkStock(id);
      // 新增股票時，必須使用 'full' 模式以建立快取
      const analyze = await getAnalyze(id, 'full');
      setStocks(prev => [...prev, { 
        id, 
        name: info.name, 
        price: analyze.price_info.price, 
        change: analyze.price_info.change, 
        changePercent: analyze.price_info.changePercent, 
        score: analyze.analysis.score, 
        action: analyze.analysis.action,
        isDetailed: true
      }]);
      showToast(`已新增 ${info.name}`);
    } catch (e) { showToast("無效標的或網路異常"); }
  };

  const handleAddStock = async () => {
    if (!newStockId) return;
    setAdding(true);
    try {
      const info = await checkStock(newStockId.trim());
      await handleQuickAdd(info.id);
      setNewStockId('');
      setShowAddModal(false);
    } catch (e) { showToast("查對此股號"); } finally { setAdding(false); }
  };

  const openAnalyze = useCallback(async (sid: string) => {
    setDetailMode(true);
    setSelectedStockId(sid);
    setDetailData(null);
    
    const cached = aiReportsCache[sid];
    if (cached) {
        setAiReport(cached.content);
        setAiReportTime(cached.time);
        setAiReportSources(cached.sources || []);
    } else {
        setAiReport('');
        setAiReportTime(0);
        setAiReportSources([]);
    }
    
    try {
      // 點開詳情頁時，使用 'full' 模式確保數據絕對新鮮 (雖然有快取，但詳情頁值得一次完整請求)
      const data = await getAnalyze(sid, 'full');
      setDetailData(data);
      syncStockData(sid, {
        price: data.price_info.price,
        change: data.price_info.change,
        changePercent: data.price_info.changePercent,
        score: data.analysis.score,
        action: data.analysis.action
      });
    } catch (e) { 
      showToast("深度數據解析失敗");
      setDetailMode(false); 
    }
  }, [syncStockData, showToast, aiReportsCache]);

  const generateAI = async () => {
    if (!detailData) return;
    setIsGenerating(true);
    try {
      const result = await generateAIAudit(detailData);
      const timestamp = Date.now();
      
      setAiReport(result.text);
      setAiReportTime(timestamp);
      setAiReportSources(result.sources);
      
      setAiReportsCache(prev => ({ 
        ...prev, 
        [detailData.id]: { content: result.text, time: timestamp, sources: result.sources } 
      }));
      
      showToast("AI 深度稽核完成並已快存");
    } catch (e: any) { 
        console.error("AI Generation Error in App:", e);
        if (e.message?.includes("冷卻") || e.message?.includes("額度")) {
            showToast(e.message);
        } else if (e.message?.includes("entity was not found")) {
            showToast("金鑰失效，請重選");
            setHasCustomKey(false);
        } else {
            showToast(`AI 專家連線異常: ${e.message || '未知錯誤'}`);
        }
    } finally { setIsGenerating(false); }
  };

  const currentSector = useMemo(() => marketPulse.sectors.find(s => s.name === selectedSectorName), [marketPulse.sectors, selectedSectorName]);

  const sortedSectorStocks = useMemo(() => {
    if (!currentSector) return [];
    return [...currentSector.stocks].sort((a, b) => b.score - a.score || b.changePercent - a.changePercent);
  }, [currentSector]);

  const aiHotStocks = useMemo(() => {
    let allScanned = marketPulse.sectors.flatMap(sec => 
      sec.stocks.map(stk => ({ ...stk, sectorName: sec.name }))
    );
    
    const uniqueMap = new Map<string, StockData & { sectorName: string }>();
    allScanned.forEach(s => {
      if (!uniqueMap.has(s.id) || (uniqueMap.get(s.id)?.score || 0) < s.score) { 
        uniqueMap.set(s.id, s); 
      }
    });

    let filteredList = Array.from(uniqueMap.values());

    if (minScore > 0) filteredList = filteredList.filter(s => s.score >= minScore);
    if (sectorFilter !== 'all') filteredList = filteredList.filter(s => s.sectorName === sectorFilter);
    if (perfFilter === 'gain') filteredList = filteredList.filter(s => s.changePercent > 0);
    else if (perfFilter === 'lose') filteredList = filteredList.filter(s => s.changePercent < 0);

    return filteredList.sort((a, b) => b.score - a.score || b.changePercent - a.changePercent).slice(0, 15);
  }, [marketPulse.sectors, minScore, sectorFilter, perfFilter]);

  const handleDelete = useCallback((sid: string) => {
    setStocks(prev => prev.filter(x => x.id !== sid));
  }, []);

  const handleMoveStock = useCallback((sid: string, dir: 'up' | 'down') => {
    setStocks(prev => {
      const idx = prev.findIndex(s => s.id === sid);
      if (idx === -1 || (dir === 'up' && idx === 0) || (dir === 'down' && idx === prev.length - 1)) return prev;
      const newStocks = [...prev];
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      [newStocks[idx], newStocks[targetIdx]] = [newStocks[targetIdx], newStocks[idx]];
      return newStocks;
    });
  }, []);

  return (
    <div className="app-container">
      <header className="header-area bg-slate-900/90 border-b border-slate-800 p-3 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="font-bold text-white text-xl flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20"><Zap size={18} fill="currentColor" /></div>
            <div className="flex flex-col">
                <span className="leading-none">台股智謀</span>
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-blue-500 font-num text-[10px] font-black uppercase tracking-widest">V5.8.0</span>
                    <button 
                        onClick={handleOpenKeySelector}
                        className={`p-1 rounded flex items-center gap-1 transition-all ${hasCustomKey ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}
                    >
                        <Key size={10} />
                        <div className={`w-1 h-1 rounded-full ${hasCustomKey ? 'bg-emerald-500 animate-pulse shadow-[0_0_5px_#10b981]' : 'bg-slate-700'}`}></div>
                    </button>
                </div>
            </div>
          </div>
          <div className="flex gap-2.5">
            {activeTab === 'watchlist' && (
              <button onClick={() => refreshQuotes(true)} className="p-2.5 rounded-xl bg-slate-800 text-blue-400 active:scale-90 transition-all"><RefreshCw size={18} /></button>
            )}
            {activeTab === 'watchlist' && (
              <button onClick={() => setEditMode(!editMode)} className={`p-2.5 rounded-xl border transition-all active:scale-90 ${editMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {editMode ? <Check size={18} /> : <Edit3 size={18} />}
              </button>
            )}
            <button onClick={() => setShowAddModal(true)} className="p-2.5 rounded-xl bg-blue-600 text-white active:scale-90 transition-all"><Plus size={18} /></button>
          </div>
        </div>
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50">
          <button onClick={() => setActiveTab('watchlist')} className={`flex-1 py-2 text-xs font-black rounded-lg ${activeTab === 'watchlist' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>我的自選</button>
          <button onClick={() => setActiveTab('recommend')} className={`flex-1 py-2 text-xs font-black rounded-lg ${activeTab === 'recommend' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>市場監測</button>
        </div>
      </header>

      <main className="content-area p-4 space-y-6 ios-scroll no-scrollbar">
        {activeTab === 'watchlist' ? (
          <div className="space-y-3.5 max-w-4xl mx-auto">
            <div className="flex justify-between items-center px-1 mb-1">
               <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">智能監控連線中</span>
               <button onClick={() => setIsPaused(!isPaused)} className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${isPaused ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800/50 text-blue-400'}`}>
                  {isPaused ? <PauseCircle size={12} /> : <Activity size={12} />} {isPaused ? '已暫停同步' : '自動同步中'}
               </button>
            </div>
            {stocks.length === 0 ? (
              <div className="py-24 text-center text-slate-700 space-y-4">
                <Layers size={56} className="mx-auto opacity-10" />
                <p className="text-sm font-bold uppercase tracking-widest opacity-40">自選清單為空</p>
                <button onClick={() => setShowAddModal(true)} className="text-xs text-blue-500 font-bold underline">立即新增標的</button>
              </div>
            ) : stocks.map((s, idx) => (
              <StockListItem key={s.id} stock={s} editMode={editMode} onOpen={openAnalyze} onDelete={handleDelete} onMove={handleMoveStock} isFirst={idx === 0} isLast={idx === stocks.length - 1} delay={idx * 40} />
            ))}
          </div>
        ) : (
          <div className="space-y-8 max-w-6xl mx-auto">
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-[11px] text-indigo-400 font-black flex items-center gap-2 uppercase tracking-[0.2em]"><Sparkles size={13} fill="currentColor" /> AI 每日智選 Alpha</h3>
                <button 
                  onClick={runDiscovery} 
                  disabled={isDiscovering}
                  className="text-[10px] font-black flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isDiscovering ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  {isDiscovering ? "全網搜索中" : "探測跨域黑馬"}
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x min-h-[130px] px-1">
                {dailyPicks.length > 0 ? dailyPicks.map(s => (
                  <div key={s.id} onClick={() => openAnalyze(s.id)} className="flex-none w-[185px] glass-card p-4 rounded-[1.8rem] snap-start relative active:scale-95 overflow-hidden transition-all bg-gradient-to-br from-indigo-900/40 to-slate-950 border-indigo-500/30">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-500/20 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start mb-2">
                      <div className={`text-[12px] font-black w-9 h-9 rounded-xl flex items-center justify-center bg-black/60 border border-white/10 ${getScoreColorCode(s.score)}`}>
                        {s.score}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleQuickAdd(s.id); }} 
                        className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all shadow-lg"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="mb-2">
                      <div className="font-black text-white text-base tracking-tight truncate">{s.name}</div>
                      <div className="text-[8px] text-indigo-400 font-black uppercase tracking-widest mt-0.5">Alpha Discovery • {s.id}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className={`font-num font-black text-lg ${getColor(s.change)}`}>{smartPrice(s.price)}</div>
                      <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-black/40 ${getColor(s.change)}`}>
                        {s.change > 0 ? '+' : ''}{s.changePercent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="w-full flex flex-col items-center justify-center py-6 glass-card border-dashed border-2 border-indigo-500/20 rounded-[2rem] bg-indigo-500/5 opacity-60">
                    <Sparkles size={20} className="text-indigo-400 mb-2 opacity-50" />
                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300">啟動探測以尋找名單外標的</div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-[11px] text-slate-500 font-black flex items-center gap-2 uppercase tracking-[0.2em]"><Globe size={13} /> 全球指標</h3>
                <div className="flex items-center gap-3">
                  {deepScanCount < totalTargets && totalTargets > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-[9px] font-black text-blue-400 uppercase">個股 AI 診斷中 {deepScanCount}/{totalTargets}</span>
                    </div>
                  )}
                  <button onClick={() => scanMarket(true)} disabled={isScanning} className="text-[10px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 text-blue-400 disabled:opacity-50">
                    <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
                    {isScanning ? "掃描中" : "刷新脈動"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {marketPulse.trends.map(t => (
                  <div key={t.name} className="glass-card p-4 rounded-2xl text-center">
                    <div className="text-[9px] text-slate-500 mb-2 font-black uppercase tracking-widest">{t.name}</div>
                    <div className={`font-black text-lg mb-1 font-num ${t.color}`}>{t.val}</div>
                    <div className={`text-[10px] font-num font-bold flex items-center justify-center gap-1 ${t.change > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {t.change > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Math.abs(t.change).toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-[11px] text-rose-500 font-black flex items-center gap-2 uppercase tracking-[0.2em]"><Flame size={13} fill="currentColor" /> AI 強勢飆股</h3>
                <button 
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${showFilterPanel ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
                >
                  <SlidersHorizontal size={12} />
                  進階篩選
                </button>
              </div>

              {showFilterPanel && (
                <div className="glass-card p-4 rounded-2xl mb-5 space-y-4 animate-slide-up border-blue-500/20 bg-blue-500/5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">AI 評分門檻: {minScore}+</label>
                      <input 
                        type="range" min="0" max="90" step="10" 
                        value={minScore} 
                        onChange={(e) => setMinScore(parseInt(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">限定產業板塊</label>
                      <select 
                        value={sectorFilter} 
                        onChange={(e) => setSectorFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-300 outline-none"
                      >
                        <option value="all">所有板塊</option>
                        {marketPulse.sectors.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest block">當日績效方向</label>
                      <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                        <button onClick={() => setPerfFilter('all')} className={`flex-1 py-1.5 text-[10px] font-black rounded-lg ${perfFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-600'}`}>全部</button>
                        <button onClick={() => setPerfFilter('gain')} className={`flex-1 py-1.5 text-[10px] font-black rounded-lg ${perfFilter === 'gain' ? 'bg-rose-500/20 text-rose-500' : 'text-slate-600'}`}>收紅</button>
                        <button onClick={() => setPerfFilter('lose')} className={`flex-1 py-1.5 text-[10px] font-black rounded-lg ${perfFilter === 'lose' ? 'bg-emerald-500/20 text-emerald-500' : 'text-slate-600'}`}>收黑</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x min-h-[140px] px-1">
                {aiHotStocks.length > 0 ? aiHotStocks.map(s => (
                  <div key={s.id} onClick={() => openAnalyze(s.id)} className="flex-none w-[165px] glass-card p-4 rounded-[1.8rem] snap-start relative active:scale-95 group overflow-hidden transition-all shadow-[0_12px_25px_-5px_rgba(0,0,0,0.3)]">
                    <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full blur-3xl opacity-25 transition-all group-hover:opacity-40 ${s.score >= 70 ? 'bg-rose-500' : s.score >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                    
                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <div className={`text-[16px] font-black w-11 h-11 rounded-2xl flex items-center justify-center bg-black/40 border-2 shadow-inner transition-transform group-hover:scale-110 ${getScoreColorCode(s.score)}`}>
                        {s.score}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleQuickAdd(s.id); }} 
                          className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all active:scale-90 shadow-lg"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-0.5 relative z-10 mb-3">
                      <div className="font-black text-white text-base tracking-tight truncate group-hover:text-blue-400 transition-colors">{s.name}</div>
                      <div className="text-[9px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-1">
                        {s.id}
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline relative z-10">
                      <div className={`font-num font-black text-xl tracking-tighter ${getColor(s.change)}`}>{smartPrice(s.price)}</div>
                      <div className={`text-[10px] font-num font-black flex items-center gap-0.5 px-1 rounded bg-black/30 ${getColor(s.change)}`}>
                        {s.change > 0 ? <ArrowUp size={10} /> : s.change < 0 ? <ArrowDown size={10} /> : null}
                        {Math.abs(s.changePercent).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="w-full flex items-center justify-center py-6 text-slate-700 opacity-60">
                    <div className="text-[10px] font-black uppercase">查無符合篩選條件之標的</div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[11px] text-slate-500 mb-4 font-black flex items-center gap-2 uppercase tracking-[0.2em]"><BarChart3 size={13} /> 產業熱力區塊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {marketPulse.sectors.map(sec => (
                  <div key={sec.name} onClick={() => setSelectedSectorName(sec.name)} className="glass-card p-5 rounded-3xl flex justify-between items-center border-l-4 active:scale-[0.98]">
                    <div>
                      <div className="text-white font-black text-base leading-none mb-2">{sec.name}</div>
                      <div className={`text-[10px] font-bold ${getScoreColorCode(sec.score)}`}>評分: {sec.score}</div>
                    </div>
                    <div className="p-2.5 bg-slate-950/50 rounded-2xl text-slate-700"><ChevronRight size={18} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {detailMode && (
        <div className="fixed inset-0 bg-slate-950 z-[260] flex flex-col animate-slide-up">
          <div className="header-area bg-slate-900/90 border-b border-slate-800 p-4 flex justify-between items-center z-50">
            <button onClick={() => setDetailMode(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 bg-slate-800/50 rounded-xl active:scale-95 transition-all"><ArrowLeft size={22} /></button>
            <div className="text-center flex-1">
              <div className="font-black text-white text-lg leading-none">{detailData?.name || '同步中...'}</div>
              {detailData && (
                <div className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-2">
                  {getSectorName(detailData.id)} • <span className="text-slate-500 font-num">{detailData.id}</span>
                </div>
              )}
            </div>
            {detailData ? (
                <button 
                  onClick={handleCapture}
                  disabled={isCapturing}
                  className="w-12 h-12 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-blue-600/10 text-blue-400 active:scale-95 transition-all hover:bg-blue-600/20"
                >
                  {isCapturing ? <Loader2 size={20} className="animate-spin" /> : <ImageDown size={20} />}
                  <span className="text-[8px] font-black uppercase mt-0.5">Save</span>
                </button>
            ) : (
                <div className="w-12"></div>
            )}
          </div>
          <div className="content-area flex-1 overflow-y-auto bg-slate-950">
             {/* 
                 修正：將 captureRef 移至內層容器，確保截圖時能撐開完整高度。
                 外部容器 content-area 負責滾動，內部容器負責被截圖。
             */}
            <div ref={captureRef} className="p-4 bg-slate-950 min-h-full">
                {!detailData ? (
                    <div className="text-center py-10 opacity-40">同步中...</div>
                ) : (
                    <>
                    {/* 截圖專用標頭，平時不顯示 (opacity-0)，截圖時透過 CSS 顯示? 不，這裡直接顯示即可，因為有 no-capture 控制其他元素 */}
                    <div className={`mb-6 flex justify-between items-end border-b border-white/10 pb-4 ${isCapturing ? 'opacity-100' : 'hidden'}`}>
                        <div>
                            <div className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                                <Zap size={12} fill="currentColor"/> Ace Trader AI Report
                            </div>
                            <div className="text-3xl font-black text-white flex items-baseline gap-2">
                                {detailData.name} <span className="text-slate-500 text-xl font-num">{detailData.id}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Report Date</div>
                            <div className="text-xs font-bold text-slate-300 font-num">{new Date().toLocaleDateString()}</div>
                        </div>
                    </div>

                    <AnalysisView 
                        detail={detailData} 
                        aiReport={aiReport} 
                        aiReportTime={aiReportTime} 
                        aiReportSources={aiReportSources}
                        onGenerateAI={generateAI} 
                        isGenerating={isGenerating}
                        isCapturing={isCapturing} // 傳入截圖狀態以控制顯示
                    />

                    {/* 截圖專用頁尾 */}
                    <div className={`mt-8 pt-6 border-t border-white/10 flex justify-between items-center opacity-40 pb-4 ${isCapturing ? 'block' : 'hidden'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center"><Zap size={10} className="text-white" fill="currentColor" /></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">台股智謀 Ultimate</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">AI Analysis Not Financial Advice</span>
                    </div>
                    </>
                )}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-[300]" onClick={() => setShowAddModal(false)}>
          <div className="bg-slate-900 w-full max-sm rounded-[2rem] p-8 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-black text-xl mb-6">新增標的</h3>
            <input value={newStockId} onChange={e => setNewStockId(e.target.value)} placeholder="股號 (如: 2330)" className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white mb-6 outline-none" autoFocus />
            <div className="flex gap-3">
               <button onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-800 text-slate-400 font-bold py-4 rounded-2xl">取消</button>
               <button onClick={handleAddStock} disabled={adding || !newStockId} className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl flex justify-center items-center gap-2">
                 {adding ? <Loader2 size={20} className="animate-spin" /> : '開始診斷'}
               </button>
            </div>
          </div>
        </div>
      )}

      {selectedSectorName && currentSector && (
        <div className="fixed inset-0 bg-black/85 z-[250] flex items-end justify-center" onClick={() => setSelectedSectorName(null)}>
          <div className="bg-slate-950 w-full max-w-2xl rounded-t-[3rem] p-8 h-[88vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-8">
              <h3 className="font-black text-3xl text-white">{currentSector.name}</h3>
              <button onClick={() => setSelectedSectorName(null)} className="w-10 h-10 bg-slate-900 rounded-full text-slate-400 flex items-center justify-center"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar pb-10">
              {sortedSectorStocks.map(s => (
                <div key={s.id} onClick={() => { openAnalyze(s.id); }} className="bg-slate-900/40 p-5 rounded-3xl flex justify-between items-center border border-white/5 active:bg-blue-600/5 group">
                  <div className="flex items-center gap-5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 ${getScoreColorCode(s.score)}`}>{s.score}</div>
                    <div>
                      <div className="font-black text-white text-lg">{s.name}</div>
                      <div className={`text-[10px] font-black ${getScoreColorCode(s.score)} flex items-center gap-1`}>
                        {s.id} • {s.action}
                        {s.isDetailed && <span className="text-[7px] bg-blue-500/20 text-blue-400 px-1 rounded ml-1">DEEP</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`font-black font-num text-lg ${getColor(s.change)}`}>{smartPrice(s.price)}</div>
                      <div className={`text-[10px] font-black flex items-center justify-end gap-1 ${getColor(s.change)}`}>
                        {s.change > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                        {Math.abs(s.changePercent).toFixed(2)}%
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleQuickAdd(s.id); }} 
                      className="p-3 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all active:scale-90"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-900/90 text-white px-8 py-3.5 rounded-full shadow-2xl z-[400] animate-fade-in backdrop-blur-xl border border-white/5">
          <span className="font-black text-xs tracking-widest uppercase flex items-center gap-2">{toastMsg}</span>
        </div>
      )}

      <div className="status-bar">
        <div className="status-dot"></div>
        <span className="font-black tracking-[0.2em] uppercase">{marketPulse.warning || '系統運作中'}</span>
      </div>
    </div>
  );
};

export default App;
