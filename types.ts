
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Stock {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  marketCap: string;
  reasoning: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  lastUpdated: string;
}

export interface MarketIndex {
  name: string;
  value: string;
  change: string;
  changePercent: string;
  isPositive: boolean;
}

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
}

export interface Portfolio {
  cash: number;
  holdings: Holding[];
  history: { timestamp: string; totalValue: number; isPrediction?: boolean }[];
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  ticker: string;
  shares: number;
  price: number;
  timestamp: string;
}

export interface AnalysisResponse {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  ticker: string;
  currentPrice: number;
  confidence: number;
  analysis: string;
  sources: { title: string; uri: string }[];
}

export interface DiscoveryResponse {
  stocks: Stock[];
  sources: { title: string; uri: string }[];
}

export interface MarketOverviewResponse {
  indices: MarketIndex[];
  sources: { title: string; uri: string }[];
}

export interface PredictionResponse {
  predictions: { timestamp: string; totalValue: number }[];
  rationale: string;
  sources: { title: string; uri: string }[];
}
