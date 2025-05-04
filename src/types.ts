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
  id: string;
  name: string;
  description: string;
  confidence: number;
  tradeIds: string[];
  suggestedAction: string;
}

export interface TradeAnalytics {
  totalTrades: number;
  successRate: number;
  averageReturn: number;
  topAsset: string;
  worstAsset: string;
  mostTraded: string;
  performance: {
    day: number;
    week: number;
    month: number;
    year: number;
  };
}
// Add this to your types.ts file if it's not already there
export interface WalletInfo {
  address: string;
  balance: number;
  chainId: number;
  network: string;
  isConnected: boolean;
}