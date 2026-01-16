
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from './components/Layout';
import { GeminiTraderService } from './services/geminiService';
import { Portfolio, Stock, Holding, Transaction, AnalysisResponse, MarketIndex, User } from './types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const INITIAL_BALANCE = 100.00;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('trader_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [portfolio, setPortfolio] = useState<Portfolio>(() => {
    if (!user) return { cash: INITIAL_BALANCE, holdings: [], history: [] };
    const saved = localStorage.getItem(`portfolio_${user.id}`);
    if (saved) return JSON.parse(saved);
    return {
      cash: INITIAL_BALANCE,
      holdings: [],
      history: [{ timestamp: new Date().toLocaleTimeString(), totalValue: INITIAL_BALANCE }]
    };
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (!user) return [];
    const saved = localStorage.getItem(`transactions_${user.id}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [marketSources, setMarketSources] = useState<{title: string, uri: string}[]>([]);
  const [discoveredStocks, setDiscoveredStocks] = useState<Stock[]>([]);
  const [discoverySources, setDiscoverySources] = useState<{title: string, uri: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisResponse | null>(null);
  const [predictionRationale, setPredictionRationale] = useState('');
  const [predictionSources, setPredictionSources] = useState<{title: string, uri: string}[]>([]);
  const [predicting, setPredicting] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  
  const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', content: string, sources?: any[] }[]>([]);
  const [chatInput, setChatInput] = useState('');

  const service = useRef(new GeminiTraderService());

  // Persistence
  useEffect(() => {
    if (user) {
      localStorage.setItem('trader_user', JSON.stringify(user));
      localStorage.setItem(`portfolio_${user.id}`, JSON.stringify(portfolio));
      localStorage.setItem(`transactions_${user.id}`, JSON.stringify(transactions));
    }
  }, [user, portfolio, transactions]);

  const fetchMarketData = useCallback(async () => {
    setMarketLoading(true);
    try {
      const data = await service.current.getMarketOverview();
      setMarketIndices(data.indices);
      setMarketSources(data.sources);
    } catch (err) {
      console.error(err);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const fetchDiscovery = useCallback(async () => {
    setLoading(true);
    try {
      const data = await service.current.discoverMicroCaps();
      setDiscoveredStocks(data.stocks);
      setDiscoverySources(data.sources);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAnalyze = useCallback(async (ticker: string) => {
    setAnalyzing(ticker);
    try {
      const result = await service.current.analyzeStock(ticker);
      setActiveAnalysis(result);
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Please try again later.");
    } finally {
      setAnalyzing(null);
    }
  }, []);

  const handleSearchStock = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const { stock } = await service.current.searchStock(searchQuery);
      setSearchResults([stock]);
    } catch (err) {
      console.error(err);
      alert("Ticker not found or search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMarketData();
      fetchDiscovery();
    }
  }, [user, fetchMarketData, fetchDiscovery]);

  const handleLogin = () => {
    const mockUser: User = {
      id: 'google_user_123',
      name: 'Experimental Trader',
      email: 'trader@example.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Trader'
    };
    setUser(mockUser);
    
    if (!localStorage.getItem(`portfolio_${mockUser.id}`)) {
      const initial = {
        cash: INITIAL_BALANCE,
        holdings: [],
        history: [{ timestamp: new Date().toLocaleTimeString(), totalValue: INITIAL_BALANCE }]
      };
      setPortfolio(initial);
      localStorage.setItem(`portfolio_${mockUser.id}`, JSON.stringify(initial));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('trader_user');
  };

  const fetchPrediction = async () => {
    setPredicting(true);
    try {
      const result = await service.current.predictPortfolioValue(portfolio.holdings, portfolio.cash);
      setPredictionRationale(result.rationale);
      setPredictionSources(result.sources);
      const predictions = result.predictions.map(p => ({ ...p, isPrediction: true }));
      setPortfolio(prev => ({
        ...prev,
        history: [...prev.history.filter(h => !h.isPrediction), ...predictions]
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setPredicting(false);
    }
  };

  const executeTrade = (type: 'BUY' | 'SELL', ticker: string, price: number, shares: number) => {
    if (shares <= 0) return;
    const cost = price * shares;
    const newHoldings = [...portfolio.holdings];
    const index = newHoldings.findIndex(h => h.ticker === ticker);

    if (type === 'BUY') {
      if (portfolio.cash < cost) return alert("Insufficient cash!");
      if (index >= 0) {
        const h = newHoldings[index];
        const totalShares = h.shares + shares;
        const totalCost = (h.shares * h.avgCost) + (shares * price);
        newHoldings[index] = { ...h, shares: totalShares, avgCost: totalCost / totalShares, currentPrice: price };
      } else {
        newHoldings.push({ ticker, shares, avgCost: price, currentPrice: price });
      }
      setPortfolio(prev => ({
        ...prev,
        cash: prev.cash - cost,
        holdings: newHoldings,
        history: [...prev.history.filter(h => !h.isPrediction), { timestamp: new Date().toLocaleTimeString(), totalValue: (prev.cash - cost) + newHoldings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0) }]
      }));
    } else {
      if (index < 0 || newHoldings[index].shares < shares) return alert("Not enough shares!");
      newHoldings[index].shares -= shares;
      if (newHoldings[index].shares === 0) newHoldings.splice(index, 1);
      setPortfolio(prev => ({
        ...prev,
        cash: prev.cash + cost,
        holdings: newHoldings,
        history: [...prev.history.filter(h => !h.isPrediction), { timestamp: new Date().toLocaleTimeString(), totalValue: (prev.cash + cost) + newHoldings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0) }]
      }));
    }

    const tx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type, ticker, shares, price, timestamp: new Date().toISOString()
    };
    setTransactions([tx, ...transactions]);
    setActiveAnalysis(null);
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const res = await service.current.chatWithTrader([], msg);
      setChatMessages(prev => [...prev, { role: 'model', content: res.text, sources: res.sources }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', content: "Error communicating with AI." }]);
    }
  };

  const totalValue = portfolio.cash + portfolio.holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
  const pnl = totalValue - INITIAL_BALANCE;

  const StockCard = ({ stock, isSearchResult = false }: { stock: Stock, isSearchResult?: boolean }) => {
    const amountStr = buyAmounts[stock.ticker] || '';
    const amount = parseFloat(amountStr) || 0;
    const sharesToBuy = Math.floor(amount / stock.price);
    const canAffordOne = portfolio.cash >= stock.price;
    const isAffordable = amount > 0 && portfolio.cash >= amount && sharesToBuy > 0;

    return (
      <div className={`group p-5 bg-slate-900 border ${isSearchResult ? 'border-blue-500/50' : 'border-slate-800'} rounded-3xl hover:border-blue-500/40 transition-all shadow-lg`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors font-mono tracking-tighter">{stock.ticker}</h4>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide truncate max-w-[120px]">{stock.name}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-mono font-bold text-lg">${stock.price.toFixed(2)}</p>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${stock.changePercent >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
        
        <p className="text-slate-400 text-xs line-clamp-2 mb-4 h-8">{stock.reasoning}</p>
        
        <div className="space-y-3">
          <div className="flex gap-2">
            <button 
              onClick={() => handleAnalyze(stock.ticker)} 
              disabled={analyzing === stock.ticker}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              {analyzing === stock.ticker ? 'Deep Analyzing...' : 'Deep Dive'}
            </button>
          </div>

          <div className={`pt-3 border-t border-slate-800 transition-opacity ${!canAffordOne ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quick Buy</span>
              {!canAffordOne && <span className="text-[8px] font-black text-rose-500 uppercase ml-auto">Insufficient Cash</span>}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input 
                  type="number"
                  min="0"
                  max={portfolio.cash}
                  value={amountStr}
                  onChange={(e) => setBuyAmounts(prev => ({ ...prev, [stock.ticker]: e.target.value }))}
                  placeholder="Amount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-6 pr-3 py-2 text-xs text-white focus:ring-1 focus:ring-blue-500/50 outline-none"
                />
              </div>
              <button 
                disabled={!isAffordable}
                onClick={() => {
                   executeTrade('BUY', stock.ticker, stock.price, sharesToBuy);
                   setBuyAmounts(prev => ({ ...prev, [stock.ticker]: '' }));
                }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAffordable ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800 text-slate-500'}`}
              >
                Buy {sharesToBuy > 0 ? `${sharesToBuy} Sh` : 'Shares'}
              </button>
            </div>
            {sharesToBuy > 0 && <p className="text-[9px] text-slate-500 mt-1 font-bold italic">Approx. {sharesToBuy} shares for ${ (sharesToBuy * stock.price).toFixed(2) }</p>}
          </div>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-10 animate-in fade-in duration-700">
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-violet-700 rounded-3xl flex items-center justify-center font-black text-5xl text-white shadow-2xl transform hover:scale-110 transition-transform cursor-default">G</div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black text-white tracking-tight">Gemini Trader</h1>
            <p className="text-slate-400 text-lg">The AI-Powered $100 Micro-Cap Experiment.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-[2.5rem] shadow-2xl space-y-8">
            <div className="space-y-2">
              <p className="text-white font-bold text-xl">Ready to invest?</p>
              <p className="text-slate-500 text-sm">Join the experiment and get $100 in virtual capital.</p>
            </div>
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-4 bg-white hover:bg-slate-100 text-slate-950 font-black py-5 rounded-2xl transition-all active:scale-95 shadow-xl text-lg"
            >
              <svg className="w-6 h-6" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="mb-8 flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-3xl border border-slate-800 w-full md:w-auto shadow-xl">
          <img src={user.avatar} className="w-12 h-12 rounded-full border-2 border-blue-500/50 shadow-blue-500/20 shadow-lg" alt="Profile" />
          <div className="flex-1">
            <p className="text-white font-black text-base leading-none mb-1">{user.name}</p>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest bg-slate-800 px-1.5 py-0.5 rounded">Experiment $100</span>
              <span className="text-blue-400 font-black text-[10px] font-mono">ID: {user.id.split('_').pop()}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="text-slate-500 hover:text-rose-400 p-2 transition-colors ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 w-full md:w-auto no-scrollbar">
          {marketIndices.map(idx => (
            <div key={idx.name} className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl min-w-[140px] flex flex-col justify-center shadow-lg border-b-2 border-b-blue-500/10">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-0.5">{idx.name}</span>
              <span className={`text-sm font-mono font-black ${idx.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {idx.value}
              </span>
              <span className={`text-[10px] font-bold ${idx.isPositive ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                {idx.isPositive ? '▲' : '▼'} {idx.changePercent}
              </span>
            </div>
          ))}
          {marketLoading && <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin self-center"></div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Main Portfolio Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
            <div className="p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-800/50">
              <div className="flex-1">
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                  Total Portfolio Value
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                </p>
                <div className="flex items-baseline gap-4">
                  <h2 className="text-5xl font-black text-white font-mono tracking-tighter">${totalValue.toFixed(2)}</h2>
                  <span className={`text-sm font-black px-4 py-1.5 rounded-2xl shadow-lg ${pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10' : 'bg-rose-500/10 text-rose-400 shadow-rose-500/10'}`}>
                    {pnl >= 0 ? '↑' : '↓'} {Math.abs(pnl).toFixed(2)} ({((pnl/INITIAL_BALANCE)*100).toFixed(1)}%)
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-3xl shadow-inner group">
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Available Cash</p>
                   <p className="text-white font-black text-xl font-mono">${portfolio.cash.toFixed(2)}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-3xl shadow-inner group">
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1 group-hover:text-violet-500 transition-colors">Stocks Value</p>
                   <p className="text-white font-black text-xl font-mono">${(totalValue - portfolio.cash).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="p-8">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-sm font-black text-white uppercase tracking-widest">Growth Analytics</h3>
                 <button 
                  onClick={fetchPrediction}
                  disabled={predicting}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl shadow-blue-600/30 active:scale-95"
                >
                  {predicting ? 'Forecasting...' : 'AI Projection'}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </button>
               </div>
               <div className="h-72 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolio.history}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                      labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="totalValue" 
                      stroke="#3b82f6" 
                      fillOpacity={1} 
                      fill="url(#colorValue)" 
                      strokeWidth={4}
                      dot={(props: any) => props.payload.isPrediction ? null : <circle cx={props.cx} cy={props.cy} r={4} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} />}
                      strokeDasharray="0"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {predicting && (
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-10 flex items-center justify-center">
                    <div className="bg-slate-800 px-6 py-4 rounded-3xl border border-slate-700 shadow-2xl flex items-center gap-4">
                      <span className="w-5 h-5 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></span>
                      <span className="text-white text-sm font-black uppercase tracking-widest">Generating AI Forecast...</span>
                    </div>
                  </div>
                )}
               </div>
            </div>
            
            {(predictionRationale || (predictionSources && predictionSources.length > 0)) && (
              <div className="px-8 pb-8 animate-in slide-in-from-bottom-6">
                <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-[2rem]">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                    AI Projection Insight
                  </p>
                  <p className="text-slate-300 text-sm leading-relaxed italic">"{predictionRationale}"</p>
                  
                  {predictionSources && predictionSources.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {predictionSources.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="text-[8px] font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg border border-blue-500/10 hover:bg-blue-500/30 transition-colors">
                          Source: {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
              <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                Current Assets
                <span className="text-[10px] font-bold bg-slate-800 px-2 py-0.5 rounded text-slate-500">{portfolio.holdings.length} Positions</span>
              </h3>
              {portfolio.holdings.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="font-bold text-xs uppercase tracking-widest">No active investments</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {portfolio.holdings.map(h => {
                    const gain = (h.currentPrice - h.avgCost) * h.shares;
                    const gainPct = ((h.currentPrice - h.avgCost) / h.avgCost) * 100;
                    return (
                      <div key={h.ticker} className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-800 rounded-3xl hover:bg-slate-800/50 transition-colors">
                        <div>
                          <p className="text-white font-black text-lg font-mono tracking-tighter">{h.ticker}</p>
                          <p className="text-slate-500 text-[10px] font-black uppercase">{h.shares} Shares</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-base font-mono ${gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {gain >= 0 ? '+' : ''}{gain.toFixed(2)}
                          </p>
                          <p className={`text-[10px] font-bold ${gain >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
                            {gainPct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
              <h3 className="text-xl font-black text-white mb-6">Activity Log</h3>
              <div className="space-y-5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {transactions.length === 0 ? (
                  <p className="text-slate-600 text-sm font-bold italic py-4">No trading history yet.</p>
                ) : (
                  transactions.map(tx => (
                    <div key={tx.id} className="flex justify-between items-center text-sm border-l-4 pr-1 pl-4 border-slate-800 hover:border-blue-500/50 transition-colors py-1">
                      <div>
                        <span className={`font-black text-[10px] uppercase ${tx.type === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>{tx.type}</span>
                        <span className="text-white font-mono font-bold ml-2">{tx.ticker}</span>
                        <p className="text-slate-500 text-[9px] font-black mt-0.5 uppercase tracking-tighter">{new Date(tx.timestamp).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-mono font-bold text-sm">${(tx.shares * tx.price).toFixed(2)}</p>
                        <p className="text-slate-500 text-[9px] uppercase font-bold">{tx.shares} @ ${tx.price.toFixed(2)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Search Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-xl">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Stock Scanner</h3>
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchStock()}
                placeholder="Ticker (e.g. NVDA)"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-white text-sm font-mono tracking-widest uppercase focus:ring-2 focus:ring-blue-500/50 outline-none transition-all pr-12"
              />
              <button 
                onClick={handleSearchStock}
                disabled={isSearching}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 p-2.5 rounded-xl text-white transition-all shadow-lg shadow-blue-600/20 active:scale-90"
              >
                {isSearching ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                )}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="animate-in slide-in-from-top-6 duration-300">
              <StockCard stock={searchResults[0]} isSearchResult={true} />
            </div>
          )}

          {activeAnalysis ? (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 shadow-2xl text-white animate-in slide-in-from-right duration-500 overflow-hidden relative border border-white/10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-3xl font-black tracking-tighter font-mono">{activeAnalysis.ticker}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${activeAnalysis.recommendation === 'BUY' ? 'bg-emerald-400 text-emerald-950' : activeAnalysis.recommendation === 'SELL' ? 'bg-rose-400 text-rose-950' : 'bg-slate-400 text-slate-950'}`}>
                      {activeAnalysis.recommendation}
                    </span>
                    <span className="text-white/70 text-[10px] font-black uppercase tracking-widest">Confidence: {activeAnalysis.confidence}%</span>
                  </div>
                </div>
                <button onClick={() => setActiveAnalysis(null)} className="text-white/40 hover:text-white transition-colors p-1">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="bg-black/20 backdrop-blur-md p-6 rounded-3xl mb-6 border border-white/10 max-h-[300px] overflow-y-auto custom-scrollbar text-sm leading-relaxed shadow-inner">
                {activeAnalysis.analysis}
                {activeAnalysis.sources && activeAnalysis.sources.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Grounding Sources</p>
                    <div className="grid grid-cols-1 gap-2">
                      {activeAnalysis.sources.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="text-[9px] bg-black/30 hover:bg-black/50 px-3 py-2 rounded-xl transition-all truncate font-bold uppercase tracking-tighter flex items-center gap-2">
                          <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                          {s.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-white/10 rounded-3xl border border-white/10 flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-white/60">Current Price</span>
                      <span className="text-xl font-black font-mono">${activeAnalysis.currentPrice.toFixed(2)}</span>
                   </div>
                   <button 
                    onClick={() => executeTrade('BUY', activeAnalysis.ticker, activeAnalysis.currentPrice, Math.floor(portfolio.cash / activeAnalysis.currentPrice))}
                    disabled={portfolio.cash < activeAnalysis.currentPrice}
                    className="bg-white text-blue-700 px-6 py-3 rounded-2xl font-black active:scale-95 transition-all shadow-xl text-xs uppercase tracking-widest disabled:opacity-50"
                  >
                    Max Buy
                  </button>
                </div>
                
                {portfolio.holdings.find(h => h.ticker === activeAnalysis.ticker) && (
                  <button 
                    onClick={() => {
                      const h = portfolio.holdings.find(h => h.ticker === activeAnalysis.ticker);
                      if (h) executeTrade('SELL', activeAnalysis.ticker, activeAnalysis.currentPrice, h.shares);
                    }}
                    className="w-full bg-blue-800/40 hover:bg-rose-600/20 hover:text-rose-400 hover:border-rose-500/50 text-white py-4 rounded-2xl font-black active:scale-95 transition-all border border-white/10 text-xs uppercase tracking-widest"
                  >
                    Exit All Positions
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-white">AI Discoveries</h3>
                <button onClick={fetchDiscovery} className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 border-b-2 border-blue-500/20 hover:border-blue-500 transition-colors pb-0.5">Refresh AI</button>
              </div>
              <div className="space-y-6">
                {discoveredStocks.map(stock => (
                   <StockCard key={stock.ticker} stock={stock} />
                ))}
                
                {discoverySources.length > 0 && (
                  <div className="pt-6 border-t border-slate-800">
                    <p className="text-[9px] font-black uppercase text-slate-600 mb-3 tracking-widest">Discovery Grounding</p>
                    <div className="flex flex-wrap gap-2">
                      {discoverySources.slice(0, 3).map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="text-[8px] font-bold text-slate-500 hover:text-blue-400 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 truncate max-w-[120px]">
                          {s.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {loading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">Scanning Global Markets...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] flex flex-col h-[400px] shadow-xl overflow-hidden relative">
            <div className="p-5 bg-slate-800/30 border-b border-slate-800 flex items-center justify-between shadow-lg z-10">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50"></div>
                Gemini Trader Pro
              </h3>
              <span className="text-[8px] font-black text-slate-500 uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-800">v3.0 Flash</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.05),transparent_40%)]">
              {chatMessages.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-[10px] text-slate-600 font-black leading-relaxed italic uppercase tracking-widest opacity-60">
                    Ask Gemini about micro-cap trends,<br/>stock analysis, or market sentiment.
                  </p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-[2rem] p-4 text-xs leading-relaxed shadow-xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-950 text-slate-300 rounded-tl-none border border-slate-800'}`}>
                    {msg.content}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                        <p className="text-[8px] font-black uppercase text-slate-500">Links</p>
                        {msg.sources.map((s, i) => (
                          <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="block text-[8px] font-black text-blue-500 hover:text-blue-400 underline decoration-2 underline-offset-4 transition-all truncate">
                             {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 shadow-2xl z-10">
              <div className="relative">
                <input 
                  type="text" 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleChat()} 
                  placeholder="Analyze market data..." 
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3.5 text-xs text-white focus:ring-2 focus:ring-blue-500/40 focus:outline-none pr-14 transition-all shadow-inner" 
                />
                <button 
                  onClick={handleChat} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl shadow-lg transition-all active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default App;
