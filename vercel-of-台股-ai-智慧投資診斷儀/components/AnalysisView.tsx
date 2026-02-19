
import React, { useState, useMemo, useRef } from 'react';
import { AnalysisDetail } from '../types';
import { getColor, smartPrice, getScoreColorCode, roundToTaiwanTick, getSectorName } from '../constants';
import { AreaChart, Area, Line, ResponsiveContainer, YAxis, Tooltip, ComposedChart, CartesianGrid, XAxis } from 'recharts';
import { 
  ChevronDown, TrendingUp, TrendingDown, Thermometer, 
  Loader2, X, Zap, Activity, Sparkles, ShieldCheck, Target, Lightbulb, FileText, ChevronUp,
  Globe, BarChart3, ListChecks, RotateCcw, Clock, Info,
  LayoutGrid, PiggyBank, Briefcase, Crown, Fingerprint, Waves, Gauge, AlertCircle, CircleDashed,
  ArrowUp, ArrowDown, Compass, Radar, ShieldAlert, Gauge as GaugeIcon, Map, Shield, 
  BookOpen, ClipboardCheck, Terminal, Link
} from 'lucide-react';

interface AnalysisViewProps {
  detail: AnalysisDetail;
  aiReport: string;
  aiReportTime: number;
  aiReportSources?: any[];
  onGenerateAI: () => void;
  isGenerating: boolean;
  isCapturing?: boolean; // 新增：是否處於截圖模式
}

const SubHeader = ({ icon: Icon, title, onClick }: { icon: any, title: string, onClick?: () => void }) => (
  <div className="flex items-center justify-between mb-4 relative z-20">
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
        <Icon size={14} />
      </div>
      <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
    </div>
    {onClick && (
      <button 
        onClick={(e) => { e.stopPropagation(); onClick(); }} 
        className="p-2 -mr-2 text-slate-500 hover:text-blue-400 active:scale-90 transition-all relative z-30 no-capture"
      >
        <Info size={18} />
      </button>
    )}
  </div>
);

const FormattedLine = ({ text }: { text: string; key?: React.Key }) => {
  if (text.includes('：') || text.includes(':')) {
    const parts = text.split(/[：:]/);
    const label = parts[0].trim();
    const value = parts.slice(1).join('：').trim();
    
    const isNegative = label.includes('空方') || label.includes('停損') || label.includes('風險') || label.includes('悲觀') || label.includes('高') || label.includes('極高');
    const isPositive = label.includes('多方') || label.includes('訊號') || label.includes('進場') || label.includes('樂觀') || label.includes('低');

    return (
      <div className="flex gap-2 py-1 items-start border-b border-white/5 last:border-0">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1 min-w-[70px]">{label}</span>
        <span className={`text-[13px] font-bold ${isPositive ? 'text-blue-400' : isNegative ? 'text-rose-400' : 'text-slate-200'} leading-relaxed`}>{value}</span>
      </div>
    );
  }
  
  const isList = /^\d+\./.test(text) || text.startsWith('-') || text.startsWith('•');
  if (isList) {
    const isPositive = text.includes('多方') || text.includes('優勢') || text.includes('支撐') || text.includes('買進');
    const isNegative = text.includes('空方') || text.includes('劣勢') || text.includes('壓力') || text.includes('風險');
    
    return (
      <div className="flex gap-3 py-1.5 pl-1">
        <div className={`w-1 h-1 rounded-full mt-2.5 shrink-0 shadow-lg ${isPositive ? 'bg-blue-500 shadow-blue-500/50' : isNegative ? 'bg-rose-500 shadow-rose-500/50' : 'bg-slate-500 shadow-slate-500/50'}`} />
        <span className={`text-[13px] leading-relaxed font-medium ${isPositive ? 'text-blue-200/90' : isNegative ? 'text-rose-200/90' : 'text-slate-400'}`}>
          {text.replace(/^[-\d. ]+/, '').trim()}
        </span>
      </div>
    );
  }

  return <p className="text-[13px] text-slate-400 leading-relaxed py-1">{text}</p>;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 border border-white/10 p-3 rounded-2xl backdrop-blur-md shadow-2xl">
        <p className="text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest border-b border-white/5 pb-1">{label}</p>
        <div className="space-y-1.5">
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center gap-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase">{p.name === 'price' ? '現價' : p.name.toUpperCase()}</span>
              <span className="text-sm font-black font-num" style={{ color: p.color }}>{p.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const AnalysisView: React.FC<AnalysisViewProps> = ({ detail, aiReport, aiReportTime, aiReportSources, onGenerateAI, isGenerating, isCapturing }) => {
  const [activeTab, setActiveTab] = useState<'impact' | 'strategy' | 'metrics'>('impact');
  const [strategyMode, setStrategyMode] = useState<'momentum' | 'value'>('momentum');
  const [showInfluenceHelp, setShowInfluenceHelp] = useState(false);
  const [isReportExpanded, setIsReportExpanded] = useState(false);
  const fullTextRef = useRef<HTMLDivElement>(null);

  const reportTimeLabel = useMemo(() => {
    if (!aiReportTime) return '';
    return new Date(aiReportTime).toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    });
  }, [aiReportTime]);

  const influenceData = useMemo(() => {
    const price = detail.price_info.price;
    const vol = detail.fundamentals.vol || 0;
    const changePct = Math.abs(detail.price_info.changePercent);
    const trust5d = typeof detail.chips.trust_5d === 'number' ? detail.chips.trust_5d : 0;
    const foreign5d = typeof detail.chips.foreign_5d === 'number' ? detail.chips.foreign_5d : 0;
    const streak = detail.chips.trust_streak || 0;
    
    const scale = Math.min(100, Math.round((price * (vol / 500)) / 100));
    const volatility = Math.min(100, Math.round(changePct * 12));
    const instSum = Math.abs(trust5d) + Math.abs(foreign5d);
    const concentration = Math.min(100, Math.round((instSum / Math.max(1, vol/1000)) * 5 + (streak * 10)));
    
    const total = Math.round(scale * 0.4 + volatility * 0.3 + concentration * 0.3);
    let comment = total >= 80 ? "權值領軍者。具備極高市場代表性，價格波動往往帶動整體產業鏈。" : total >= 60 ? "主流活躍股。法人關注度高，資金流動性極佳。" : total >= 40 ? "中堅標的。影響力集中於子板塊，走勢較多受大盤帶動。" : "邊緣觀望。市場參與度較低，對產業不具備顯著導向。";
    
    return { total, scale, volatility, concentration, comment };
  }, [detail]);

  const techState = useMemo(() => {
    const price = detail.price_info.price;
    const ma20 = detail.fundamentals.ma20 || 0;
    const ma60 = detail.fundamentals.ma60 || 0;
    const dist20 = ma20 ? ((price - ma20) / ma20) * 100 : 0;
    const dist60 = ma60 ? ((price - ma60) / ma60) * 100 : 0;
    let trend = "震盪整理";
    let subTrend = "盤整待變";
    if (price > ma20 && ma20 > ma60) { trend = "多頭排列"; subTrend = "強勢上攻"; }
    else if (price < ma20 && ma20 < ma60) { trend = "空頭排列"; subTrend = "趨勢轉空"; }
    else if (price > ma20) { trend = "反彈挑戰"; subTrend = "短線走強"; }
    else if (price < ma20) { trend = "回檔整理"; subTrend = "短線轉弱"; }
    return { dist20, dist60, trend, subTrend };
  }, [detail]);

  const highlights = useMemo(() => {
    if (!aiReport) return null;
    
    // 清理 Markdown 符號的文字清理函數
    const cleanContent = (text: string) => {
      return text
        .replace(/[#*]/g, '') // 移除所有的 # 與 * 符號
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    };

    const extract = (title: string) => {
      // 匹配被 【】 包圍的標題，忽略標題周圍可能的 Markdown 符號
      const regex = new RegExp(`(?:\\*\\*|#)?\\s*【${title}】\\s*(?:\\*\\*|#)?(.*?)(?=(?:(?:\\*\\*|#)?\\s*【)|$)`, 's');
      const match = aiReport.match(regex);
      return match ? cleanContent(match[1]) : null;
    };

    const dashboard = extract('投資決策儀表板');
    let riskLevel = "中";
    if (dashboard) {
        const riskLine = dashboard.find(l => l.includes('風險等級'));
        if (riskLine) riskLevel = riskLine.split(/[：:]/)[1]?.trim() || "中";
    }
    
    const scenarioLines = extract('情境模擬與風控');
    const categorizedScenarios = { optimistic: [] as string[], pessimistic: [] as string[], sideways: [] as string[] };
    if (scenarioLines) {
      let currentType: 'o' | 'p' | 's' | null = null;
      scenarioLines.forEach(line => {
        if (line.includes('樂觀')) currentType = 'o';
        else if (line.includes('悲觀')) currentType = 'p';
        else if (line.includes('盤整')) currentType = 's';
        
        if (currentType === 'o') categorizedScenarios.optimistic.push(line);
        else if (currentType === 'p') categorizedScenarios.pessimistic.push(line);
        else if (currentType === 's') categorizedScenarios.sideways.push(line);
      });
    }

    return { 
      dashboard, 
      risk: extract('風險深度解析'), 
      actions: extract('重點整理與操作建議'), 
      scenarios: categorizedScenarios,
      analysis: extract('多維度層層分析'), 
      riskLevel 
    };
  }, [aiReport]);

  const isUp = detail.price_info.change > 0;
  const isDown = detail.price_info.change < 0;
  const score = detail.analysis.score;

  return (
    <div className="animate-fade-in space-y-4 pb-12 px-1 font-sans text-slate-200">
      
      {/* 核心數據面板 */}
      <div className="glass-card rounded-[2.5rem] p-6 border-white/5 bg-gradient-to-br from-slate-900 to-slate-950 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent)] pointer-events-none"></div>
        <div className="absolute inset-0 opacity-40 pointer-events-none -z-10 mt-12 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={detail.history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isUp ? '#f43f5e' : isDown ? '#10b981' : '#3b82f6'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={isUp ? '#f43f5e' : isDown ? '#10b981' : '#3b82f6'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="price" stroke={isUp ? '#f43f5e' : isDown ? '#10b981' : '#3b82f6'} fill="url(#colorPrice)" strokeWidth={3} animationDuration={1200} isAnimationActive={true} />
              <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="5 5" opacity={0.4} />
              <Line type="monotone" dataKey="ma60" stroke="#c084fc" strokeWidth={1.5} dot={false} opacity={0.4} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between items-start mb-2 relative z-10">
          <span className="text-[11px] bg-blue-500/10 text-blue-400 px-3 py-1 rounded-xl border border-blue-500/20 font-black uppercase tracking-widest flex items-center gap-1.5">
            <LayoutGrid size={14} /> {getSectorName(detail.id)}
          </span>
          <div className="flex gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
             <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Quantum V5.7.6</div>
          </div>
        </div>
        
        <div className="flex justify-between items-end relative z-10 pt-4">
          <div className="space-y-1">
            <div className="text-5xl font-black font-num tracking-tighter text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">{smartPrice(detail.price_info.price)}</div>
            <div className={`flex items-center gap-2 text-base font-black font-num ${getColor(detail.price_info.change)}`}>
              {isUp ? <TrendingUp size={18} /> : isDown ? <TrendingDown size={18} /> : <Activity size={18} />}
              <span>{isUp ? '+' : ''}{smartPrice(detail.price_info.change)}</span>
              <span className="bg-white/5 px-2 py-0.5 rounded-lg text-xs font-bold">({isUp ? '+' : ''}{detail.price_info.changePercent.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-slate-950/70 p-4 rounded-[2.5rem] border border-white/10 backdrop-blur-md shadow-2xl">
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Score</div>
              <div className={`text-3xl font-black font-num leading-none ${getScoreColorCode(score)}`}>{score}</div>
            </div>
            <div className="h-10 w-[1px] bg-white/10"></div>
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Bias</div>
              <div className={`text-xl font-black font-num leading-none ${detail.bias > 8 ? 'text-rose-500' : detail.bias < -8 ? 'text-emerald-500' : 'text-slate-300'}`}>{detail.bias}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* 技術雷達儀表 */}
      <div className="glass-card rounded-[2.5rem] p-6 border-white/5 bg-slate-900/40 relative overflow-hidden group shadow-xl">
        <div className="flex items-center justify-between mb-6 relative z-10">
           <div className="flex items-center gap-2">
             <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20"><Radar size={16} /></div>
             <div>
               <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">技術位階儀表</h4>
               <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Technical Radar Analysis</div>
             </div>
           </div>
           <div className="flex gap-2">
             <span className="text-[10px] bg-slate-950/80 text-slate-300 px-3 py-1.5 rounded-xl font-black uppercase border border-white/5">{techState.trend}</span>
             <span className={`text-[10px] px-3 py-1.5 rounded-xl font-black uppercase border shadow-lg ${techState.dist20 > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
               {techState.subTrend}
             </span>
           </div>
        </div>
        <div className="grid grid-cols-2 gap-6 relative z-10">
           <div className="bg-black/40 p-5 rounded-[2.2rem] border border-white/5 shadow-inner space-y-4">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                <span className="text-slate-500">20MA (月) 偏離</span>
                <span className={`font-num font-black ${techState.dist20 > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{techState.dist20 > 0 ? '+' : ''}{techState.dist20.toFixed(1)}%</span>
              </div>
              <div className="relative h-4 bg-slate-800/40 rounded-full border border-white/5 flex items-center px-1">
                <div className="absolute inset-0 flex justify-between px-4 pointer-events-none">
                   <div className="w-[1px] h-full bg-white/5"></div><div className="w-[1px] h-full bg-white/5"></div><div className="w-[2px] h-full bg-slate-600"></div><div className="w-[1px] h-full bg-white/5"></div><div className="w-[1px] h-full bg-white/5"></div>
                </div>
                <div className={`h-2.5 rounded-full transition-all duration-1000 ease-out relative shadow-xl ${techState.dist20 > 0 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-l from-emerald-600 to-emerald-400'}`} style={{ width: `${Math.min(50, Math.abs(techState.dist20) * 4)}%`, marginLeft: techState.dist20 > 0 ? '50%' : `${50 - Math.min(50, Math.abs(techState.dist20) * 4)}%` }}>
                  <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg ${techState.dist20 > 0 ? 'right-0 bg-rose-500' : 'left-0 bg-emerald-500'}`}></div>
                </div>
              </div>
           </div>
           <div className="bg-black/40 p-5 rounded-[2.2rem] border border-white/5 shadow-inner space-y-4">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                <span className="text-slate-500">60MA (季) 偏離</span>
                <span className={`font-num font-black ${techState.dist60 > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{techState.dist60 > 0 ? '+' : ''}{techState.dist60.toFixed(1)}%</span>
              </div>
              <div className="relative h-4 bg-slate-800/40 rounded-full border border-white/5 flex items-center px-1">
                <div className="absolute inset-0 flex justify-between px-4 pointer-events-none">
                   <div className="w-[1px] h-full bg-white/5"></div><div className="w-[1px] h-full bg-white/5"></div><div className="w-[2px] h-full bg-slate-600"></div><div className="w-[1px] h-full bg-white/5"></div><div className="w-[1px] h-full bg-white/5"></div>
                </div>
                <div className={`h-2.5 rounded-full transition-all duration-1000 ease-out relative shadow-xl ${techState.dist60 > 0 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-l from-emerald-600 to-emerald-400'}`} style={{ width: `${Math.min(50, Math.abs(techState.dist60) * 4)}%`, marginLeft: techState.dist60 > 0 ? '50%' : `${50 - Math.min(50, Math.abs(techState.dist60) * 4)}%` }}>
                  <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg ${techState.dist60 > 0 ? 'right-0 bg-rose-500' : 'left-0 bg-emerald-500'}`}></div>
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="px-1 flex flex-wrap gap-2">
        {detail.analysis.reasons.map((r, i) => {
          const isNeg = r.includes('跌') || r.includes('破') || r.includes('弱') || r.includes('熱') || r.includes('撤') || r.includes('空') || r.includes('拖累');
          return (
            <span key={i} className={`text-[10px] font-black px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-sm transition-all active:scale-95 ${isNeg ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              {isNeg ? <ArrowDown size={10}/> : <ArrowUp size={10}/>} {r}
            </span>
          );
        })}
      </div>

      {/* 資訊分頁卡片 */}
      <div className="glass-card rounded-[2.5rem] border-white/5 bg-slate-950/40 overflow-hidden shadow-xl">
        <div className="flex border-b border-white/5 bg-slate-900/40">
          {[
            { id: 'impact', label: '影響力', icon: Waves },
            { id: 'strategy', label: '策略佈局', icon: Target },
            { id: 'metrics', label: '核心數據', icon: Activity }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-4 flex flex-col items-center gap-1.5 transition-all active:bg-blue-600/5 ${activeTab === tab.id ? 'text-blue-400' : 'text-slate-500'} ${isCapturing ? 'no-capture' : ''}`}>
              <tab.icon size={20} className={activeTab === tab.id ? 'animate-pulse' : ''} />
              <span className={`text-[13px] font-black uppercase tracking-widest transition-opacity ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`}>{tab.label}</span>
              {activeTab === tab.id && <div className="h-1 w-8 bg-blue-500 mt-1 rounded-full shadow-[0_0_8px_#3b82f6]"></div>}
            </button>
          ))}
        </div>

        <div className={`p-6 overflow-y-auto no-scrollbar ${isCapturing ? 'h-auto overflow-visible' : 'h-[280px]'}`}>
          {activeTab === 'impact' && (
            <div className="animate-fade-in space-y-6">
              <SubHeader icon={Crown} title="市場地位協議" onClick={() => setShowInfluenceHelp(true)} />
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <svg className="w-20 h-20 -rotate-90"><circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-900" /><circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={226} strokeDashoffset={226 - (226 * influenceData.total) / 100} className="text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]" strokeLinecap="round" /></svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-white font-num leading-none">{influenceData.total}</span>
                    <span className="text-[8px] text-slate-500 font-black mt-0.5 uppercase tracking-widest">Index</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 flex-1">
                  {[
                    { label: "市值規模", val: influenceData.scale, icon: Gauge, color: "text-blue-400" }, 
                    { label: "籌碼集中", val: influenceData.concentration, icon: Fingerprint, color: "text-indigo-400" },
                    { label: "波動指標", val: influenceData.volatility, icon: Activity, color: "text-amber-400" }
                  ].map(m => (
                    <div key={m.label} className="bg-black/40 p-2.5 rounded-xl border border-white/5 text-center shadow-inner group">
                      <div className="flex justify-center mb-1"><m.icon size={12} className={m.color} /></div>
                      <div className="text-[8px] text-slate-500 mb-0.5 font-black uppercase tracking-tighter truncate">{m.label}</div>
                      <div className="font-black text-[13px] font-num text-white leading-none">{m.val}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex gap-3 items-start backdrop-blur-sm shadow-inner min-h-[80px]">
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500 shrink-0"><Lightbulb size={14} /></div>
                <p className="text-[12px] font-bold text-slate-400 leading-relaxed italic text-justify line-clamp-3">{influenceData.comment}</p>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="animate-fade-in space-y-5">
              <div className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 shadow-inner">
                <button onClick={() => setStrategyMode('momentum')} className={`flex-1 py-2 text-[12px] font-black rounded-xl transition-all flex items-center justify-center gap-2 ${strategyMode === 'momentum' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500'}`}><TrendingUp size={14}/>波段趨勢</button>
                <button onClick={() => setStrategyMode('value')} className={`flex-1 py-2 text-[12px] font-black rounded-xl transition-all flex items-center justify-center gap-2 ${strategyMode === 'value' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500'}`}><PiggyBank size={14}/>價值存股</button>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "建議進場", val: strategyMode === 'momentum' ? detail.analysis.strategy_mom.entry : detail.analysis.strategy_val.entry, color: "text-white" },
                  { label: "防守停損", val: strategyMode === 'momentum' ? detail.analysis.strategy_mom.stop_loss : detail.analysis.strategy_val.stop_loss, color: "text-rose-400" },
                  { label: "目標停利", val: strategyMode === 'momentum' ? detail.analysis.strategy_mom.take_profit : detail.analysis.strategy_val.take_profit, color: "text-emerald-400" }
                ].map((item, i) => (
                  <div key={i} className="bg-black/40 p-3 rounded-2xl border border-white/5 text-center shadow-inner">
                    <div className="text-[9px] text-slate-500 mb-1 font-black uppercase tracking-tighter">{item.label}</div>
                    <div className={`font-black text-[14px] font-num ${item.color}`}>
                      {typeof item.val === 'number' ? smartPrice(item.val) : item.val}
                    </div>
                  </div>
                ))}
              </div>

              <div className={`p-4 rounded-2xl border text-[12px] font-bold leading-relaxed text-justify italic min-h-[70px] ${strategyMode === 'momentum' ? 'bg-blue-500/5 border-blue-500/20 text-blue-200/80' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200/80'}`}>
                {strategyMode === 'momentum' ? detail.analysis.strategy_mom.desc : detail.analysis.strategy_val.desc}
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="animate-fade-in grid grid-cols-2 gap-4">
              {[
                { label: "投信 5D ", val: detail.chips.trust_5d, icon: Activity, color: "text-blue-400" },
                { label: "外資 5D ", val: detail.chips.foreign_5d, icon: Globe, color: "text-indigo-400" },
                { label: "ROE 獲利品質", val: detail.fundamentals.roe, icon: PiggyBank, color: "text-emerald-400" },
                { label: "P/E 歷史估值", val: detail.fundamentals.pe, icon: Target, color: "text-amber-400" }
              ].map(m => (
                <div key={m.label} className="p-5 bg-slate-900/60 rounded-[2rem] border border-white/5 space-y-2 shadow-inner group active:scale-95 transition-transform h-[110px] flex flex-col justify-center">
                  <div className="flex items-center gap-2.5"><m.icon size={14} className={m.color} /><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{m.label}</span></div>
                  <div className={`text-xl font-black font-num ${typeof m.val === 'number' ? (m.val > 0 ? 'text-rose-400' : m.val < 0 ? 'text-emerald-400' : 'text-white') : 'text-white'}`}>
                    {typeof m.val === 'number' && m.val > 0 ? '+' : ''}{m.val}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI 專家深度診斷報告區塊 - 戰略指令書風格 */}
      <section className="space-y-6 pt-4">
        <div className="flex items-center justify-between px-3">
           <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <div className="p-2.5 bg-violet-600/20 rounded-xl text-violet-400 shadow-lg shadow-violet-600/20"><ShieldCheck size={22} /></div>
                <h3 className="font-black text-2xl text-white tracking-tight">AI 專家診斷</h3>
             </div>
             {aiReport && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2 pl-1">
                  <Clock size={12} /> {reportTimeLabel}
                </div>
             )}
           </div>
           {!isGenerating && (
              <button onClick={onGenerateAI} className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-violet-600 text-white shadow-xl shadow-violet-600/30 active:scale-90 transition-all font-black text-[12px] uppercase tracking-widest border border-violet-500/50 ${isCapturing ? 'no-capture' : ''}`}>
                {aiReport ? <RotateCcw size={18} /> : <Sparkles size={18} />}
                {aiReport ? '重新核對' : '啟動診斷'}
              </button>
           )}
        </div>
        
        {isGenerating ? (
          <div className="glass-card p-20 rounded-[3rem] flex flex-col items-center justify-center space-y-5 border-dashed border-2 border-violet-500/30 bg-violet-500/5">
            <Loader2 size={36} className="text-violet-500 animate-spin" />
            <div className="text-center space-y-1">
              <span className="text-white font-black text-[12px] uppercase tracking-[0.3em] animate-pulse block">Quantum Analysis Syncing...</span>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">正在掃描消息與歷史型態序列</span>
            </div>
          </div>
        ) : aiReport && highlights ? (
          <div className="space-y-5 animate-fade-in">
            
            {/* 1. 決策智慧核心 */}
            {highlights.dashboard && (
              <div className="glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden">
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center justify-between">
                   <div className="flex items-center gap-2.5">
                      <Target size={16} className="text-indigo-400" />
                      <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">決策智慧核心 (Strategic Dashboard)</span>
                   </div>
                   <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${highlights.riskLevel.includes('高') ? 'bg-rose-600/20 text-rose-400 border-rose-500/30' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'}`}>
                     風險：{highlights.riskLevel}
                   </div>
                </div>
                <div className="p-1">
                  <div className="p-5 bg-indigo-500/5 border-l-4 border-indigo-500/50">
                    <div className="space-y-0.5">
                      {highlights.dashboard.map((line, i) => <FormattedLine key={i} text={line} />)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 核心風險診斷 */}
            {highlights.risk && (
              <div className="glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden">
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center gap-2.5">
                   <ShieldAlert size={16} className="text-rose-500" />
                   <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">核心風險診斷 (Risk Audit)</span>
                </div>
                <div className="p-1">
                  <div className="p-5 bg-rose-500/5 border-l-4 border-rose-500/50">
                    <div className="space-y-0.5">
                      {highlights.risk.map((line, i) => <FormattedLine key={i} text={line} />)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 戰術執行建議 */}
            {highlights.actions && (
              <div className="glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden">
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center gap-2.5">
                   <ClipboardCheck size={16} className="text-violet-500" />
                   <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">戰術執行建議 (Tactical Actions)</span>
                </div>
                <div className="p-1">
                  <div className="p-5 bg-violet-500/5 border-l-4 border-violet-500/50">
                    <div className="space-y-0.5">
                      {highlights.actions.map((line, i) => <FormattedLine key={i} text={line} />)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. 情境模擬演習 */}
            {highlights.scenarios && (highlights.scenarios.optimistic.length > 0 || highlights.scenarios.pessimistic.length > 0 || highlights.scenarios.sideways.length > 0) && (
              <div className="glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden">
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center gap-2.5">
                   <Map size={16} className="text-blue-500" />
                   <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">情境模擬演習 (Scenario Pre-view)</span>
                </div>
                <div className="p-1 space-y-1">
                  {highlights.scenarios.optimistic.length > 0 && (
                    <div className="p-5 bg-cyan-500/5 border-l-4 border-cyan-500/50">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={14} className="text-cyan-400" />
                        <span className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">樂觀路徑：突破加碼策略</span>
                      </div>
                      <div className="space-y-0.5">
                        {highlights.scenarios.optimistic.map((line, i) => <FormattedLine key={i} text={line} />)}
                      </div>
                    </div>
                  )}
                  {highlights.scenarios.pessimistic.length > 0 && (
                    <div className="p-5 bg-rose-500/5 border-l-4 border-rose-500/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield size={14} className="text-rose-400" />
                        <span className="text-[11px] font-black text-rose-400 uppercase tracking-widest">悲觀路徑：防禦止損計畫</span>
                      </div>
                      <div className="space-y-0.5">
                        {highlights.scenarios.pessimistic.map((line, i) => <FormattedLine key={i} text={line} />)}
                      </div>
                    </div>
                  )}
                  {highlights.scenarios.sideways.length > 0 && (
                    <div className="p-5 bg-amber-500/5 border-l-4 border-amber-500/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Compass size={14} className="text-amber-400" />
                        <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest">盤整路徑：區間獲利操作</span>
                      </div>
                      <div className="space-y-0.5">
                        {highlights.scenarios.sideways.map((line, i) => <FormattedLine key={i} text={line} />)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 戰略情報來源 */}
            {aiReportSources && aiReportSources.length > 0 && (
              <div className="glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden">
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center gap-2.5">
                   <Link size={16} className="text-emerald-500" />
                   <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">戰略情報來源 (Intelligence Sources)</span>
                </div>
                <div className="p-4 space-y-2">
                   {aiReportSources.map((source, i) => (
                     <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-xl border border-white/5 hover:bg-slate-700 transition-colors group">
                       <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:scale-110 transition-transform"><Globe size={14} /></div>
                       <span className="text-[13px] font-bold text-slate-300 truncate">{source.title || source.uri}</span>
                     </a>
                   ))}
                </div>
              </div>
            )}

            {/* 完整情報解碼 */}
            <div className="space-y-3" ref={fullTextRef}>
              <div className={`relative glass-card rounded-[2.5rem] bg-slate-900/60 border-white/5 shadow-xl overflow-hidden transition-all duration-700 ${isReportExpanded || isCapturing ? 'max-h-[5000px]' : 'max-h-[280px]'}`}>
                <div className="p-5 border-b border-white/5 bg-slate-800/20 flex items-center gap-2.5">
                   <Terminal size={16} className="text-slate-400" />
                   <span className="text-[12px] font-black text-slate-300 uppercase tracking-widest">原始情報解碼 (Full Report Decoded)</span>
                </div>
                <div className="p-1">
                   <div className="p-5 bg-slate-500/5 border-l-4 border-slate-500/50 space-y-4">
                      {highlights.analysis ? (
                        <div className="space-y-4">
                          {highlights.analysis.map((line, i) => <FormattedLine key={i} text={line} />)}
                        </div>
                      ) : (
                        <p className="text-[13px] text-slate-400 font-medium leading-[1.8] whitespace-pre-wrap text-justify">
                          {aiReport.replace(/#|\*/g, '').replace(/【.*?】/g, '').trim()}
                        </p>
                      )}
                   </div>
                </div>

                {!isReportExpanded && !isCapturing ? (
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent flex items-end justify-center pb-8 no-capture">
                    <button onClick={() => setIsReportExpanded(true)} className="px-10 py-3.5 bg-slate-800/95 hover:bg-slate-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-white/10 backdrop-blur-md transition-all active:scale-95">
                      解碼完整情報 <ChevronDown size={14} />
                    </button>
                  </div>
                ) : (
                  <div className={`p-6 border-t border-white/5 flex justify-center bg-slate-900/50 backdrop-blur-md ${isCapturing ? 'hidden' : ''}`}>
                    <button onClick={() => { setIsReportExpanded(false); fullTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="text-[10px] text-slate-600 font-black uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors">
                      <ChevronUp size={16} /> 鎖定情報章節
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-16 rounded-[3rem] text-center border-slate-800 bg-slate-950/30 opacity-40 flex flex-col items-center shadow-inner">
            <Lightbulb size={40} className="text-slate-700 mb-4" />
            <div className="space-y-2">
              <p className="text-slate-500 font-black text-[11px] uppercase tracking-[0.3em]">等待指令啟動深度診斷</p>
              <p className="text-slate-700 text-[9px] font-bold uppercase tracking-widest">啟動後將進行型態辨識與風險權重模擬</p>
            </div>
          </div>
        )}
      </section>

      {/* 資訊彈窗 */}
      {showInfluenceHelp && (
        <div className="fixed inset-0 bg-black/98 z-[500] flex items-center justify-center p-6 backdrop-blur-xl animate-fade-in" onClick={() => setShowInfluenceHelp(false)}>
          <div className="bg-slate-900/95 w-full max-sm rounded-[3rem] p-10 space-y-8 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center relative z-10">
              <h4 className="font-black text-white text-2xl flex items-center gap-3"><Crown className="text-blue-500" size={30} /> 影響力模型詳解</h4>
              <button onClick={() => setShowInfluenceHelp(false)} className="w-12 h-12 flex items-center justify-center bg-slate-800/80 rounded-2xl text-slate-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <p className="text-[15px] font-bold text-slate-400 leading-[1.8] text-justify">
              此模型量化標的在市場中的「話語權」。包含市值規模、籌碼集中度與波動指標。
            </p>
            <button onClick={() => setShowInfluenceHelp(false)} className="w-full bg-blue-600 text-white font-black py-5 rounded-[2rem] text-xs uppercase tracking-[0.2em]">已了解詳情</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisView;
