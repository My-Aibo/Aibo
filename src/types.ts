export interface Trade {
  id: string;
  timestamp: Date;
  type: 'buy' | 'sell';
  cryptoAsset: string;
  amount: number;
  price: number;
  totalValue: number;
  exchange: string;
  successful: boolean;
  notes?: string;
}

export interface TradingPattern {
  id?: string;
  name?: string;
  description?: string;
  type: string;
  token?: string;
  strength?: string;
  trades?: string[];
  // Add other pattern properties as needed
}

export interface TokenAnalysis {
  token: string;
  totalTrades: number;
  profitLoss: number;
  successRate: number;
  
  // Additional properties used in various parts of the application
  symbol: string;
  name?: string;
  totalProfit: number;
  profitableTrades: number;
  averageHoldTime: string;
  bestTrade: {
    profit: number;
    date: number;
  };
  worstTrade: {
    loss: number;
    date: number;
  };
}

export interface TradeAnalytics {
  overallSuccessRate: number;
  totalProfitLoss: number;
  mostProfitableToken: string;
  leastProfitableToken: string;
  averageHoldTime: string;
  tradeFrequency: string;
  recommendations: string[];
  tokenAnalyses: TokenAnalysis[];
  
  // Adding missing properties that are used in tradeService.ts
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  totalVolume: number;
  successRate: number;
  averageValue: number;
  topToken: { symbol: string; volume: number };
  recentActivity: string;
}

export interface WalletInfo {
  address: string;
  isConnected: boolean;
  balance?: number;
  network: string;
  publicKey?: any; // Using any here because Solana's PublicKey type may not be imported directly
  chainId?: number;
}

export interface TokenPrice {
  symbol: string;
  name: string;
  price: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  liquidity?: number;
  chainId?: string;
  pairAddress?: string;
  contractAddress?: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  richContent?: {
    type: string;
    data: any;
  };
}