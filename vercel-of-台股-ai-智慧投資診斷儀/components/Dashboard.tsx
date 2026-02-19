
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MarketPulse, StockData } from '../types';
import { ICONS } from '../constants';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  pulse: MarketPulse;
}

const Dashboard: React.FC<DashboardProps> = ({ pulse }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Banner: Market Status */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pulse.trends.map((trend, i) => (
          <div key={i} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">{trend.name}</p>
              <h3 className={`text-2xl font-bold ${trend.color}`}>{trend.val}</h3>
            </div>
            <div className="text-right">
              <span className={`text-sm font-medium ${trend.change > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {trend.change > 0 ? '+' : ''}{trend.change}%
              </span>
              <div className="h-10 w-24">
                 {/* Mini chart placeholder */}
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={[{v:10},{v:15},{v:12},{v:18},{v:16}]}>
                     <Line type="monotone" dataKey="v" stroke={trend.change > 0 ? '#f87171' : '#4ade80'} strokeWidth={2} dot={false} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Recommendations */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {ICONS.bolt} 高分潛力股 (AI 精選)
          </h2>
          <span className="text-xs text-slate-500 uppercase tracking-widest">{pulse.scanStatus}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pulse.recommendations.map((stock) => (
            <StockCard key={stock.id} stock={stock} onClick={() => navigate(`/analyze/${stock.id}`)} />
          ))}
        </div>
      </section>

      {/* Sectors */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {pulse.sectors.map((sector, i) => (
          <div key={i} className="bg-slate-800/30 rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
              <h3 className="font-bold text-slate-200">{sector.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">板塊強度</span>
                <span className="text-blue-400 font-mono font-bold">{sector.score}</span>
              </div>
            </div>
            <div className="space-y-3">
              {sector.stocks.map((stock) => (
                <div 
                  key={stock.id} 
                  className="flex items-center justify-between p-2 hover:bg-slate-700/50 rounded-lg cursor-pointer transition group"
                  onClick={() => navigate(`/analyze/${stock.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-mono text-sm w-12">{stock.id}</span>
                    <span className="font-medium group-hover:text-blue-400 transition">{stock.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-sm font-bold">{stock.price.toFixed(2)}</div>
                      <div className={`text-[10px] ${stock.changePercent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </div>
                    <div className="w-10 text-center">
                      <div className="text-[10px] text-slate-500 uppercase">評分</div>
                      <div className={`text-sm font-bold ${stock.score > 70 ? 'text-red-400' : 'text-slate-400'}`}>{stock.score}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

const StockCard: React.FC<{ stock: StockData; onClick: () => void }> = ({ stock, onClick }) => (
  <div 
    onClick={onClick}
    className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 hover:border-blue-500/50 cursor-pointer group transition-all hover:-translate-y-1 shadow-xl hover:shadow-blue-500/10"
  >
    <div className="flex justify-between items-start mb-4">
      <div>
        <h4 className="font-bold text-lg group-hover:text-blue-400 transition">{stock.name}</h4>
        <p className="text-slate-500 font-mono text-xs">{stock.id}</p>
      </div>
      <div className="bg-slate-900 px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-700 flex flex-col items-center">
        <span className="text-slate-500">評分</span>
        <span className="text-blue-400 text-sm">{stock.score}</span>
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div>
        <p className="text-2xl font-bold">{stock.price.toFixed(2)}</p>
        <p className={`text-sm font-medium ${stock.changePercent > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
        </p>
      </div>
      <div className="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-1 rounded-md border border-blue-500/30">
        {stock.action}
      </div>
    </div>
  </div>
);

export default Dashboard;
