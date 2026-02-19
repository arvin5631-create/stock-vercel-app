
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICONS, ALL_STOCK_MAP } from '../constants';

interface NavbarProps {
  onSearch: (id: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setQuery('');
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-lg">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => navigate('/')}
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-blue-500/20 shadow-lg group-hover:scale-110 transition">
            {ICONS.robot}
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-lg tracking-tight">台股 AI 診斷儀</h1>
            <p className="text-[10px] text-blue-400 font-mono">V5.2 INTELLIGENT SCAN</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 max-w-md relative">
          <input 
            type="text"
            placeholder="輸入股號或名稱 (如: 2330)"
            className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            {ICONS.search}
          </div>
        </form>

        <div className="flex items-center gap-4">
          <button className="hidden md:flex items-center gap-1 text-xs text-slate-400 hover:text-white transition">
            {ICONS.bolt} 即時監控中
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
