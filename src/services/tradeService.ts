import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { walletService } from './walletService';
import { Trade, TradingPattern, TradeAnalytics } from '../types';

class TradeService {
  private trades: Trade[] = [];
  private patterns: TradingPattern[] = [];
  private analytics: TradeAnalytics | null = null;
  private connection: Connection | null = null;
  private HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || '4f270978-3959-4c94-81dc-332e11477358';
  private HELIUS_RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`;
  private _lastAPICallFailed: boolean = false;  constructor() {
    this.setupConnection();
    console.log("TradeService initialized with API key:", this.HELIUS_API_KEY ? "Present" : "Missing");
  }
  
  // Method to check if test data is being used
  isUsingTestData(): boolean {
    const useTestData = localStorage.getItem('useTestData') === 'true';
    const forceRealData = localStorage.getItem('forceRealData') === 'true';
    return useTestData && !forceRealData;
  }
  
  private async setupConnection() {
    try {
      // Use Helius RPC node which provides enhanced transaction data
      this.connection = new Connection(this.HELIUS_RPC_ENDPOINT, 'confirmed');
      console.log("TradeService: Connection to Helius RPC established");
    } catch (error) {
      console.error('TradeService: Error setting up connection:', error);
    }
  }

  // Add this new method to get transactions using Helius enhanced API
  private async getTransactionsDAS(walletAddress: string, limit: number = 50): Promise<any[]> {
    try {
      console.log(`TradeService: Getting transactions using Helius DAS API for ${walletAddress}`);
      
      const apiEndpoint = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`;
      const response = await fetch(`${apiEndpoint}?api-key=${this.HELIUS_API_KEY}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }
      
      const transactions = await response.json();
      console.log(`TradeService: Found ${transactions.length} transactions via DAS API`);
      return transactions;
    } catch (error) {
      console.error("TradeService: Error fetching transactions via DAS API:", error);
      return [];
    }
  }

  // Modify the fetchBatchTransactions method to use bigger delays between batches
  private async fetchBatchTransactions(signatures: string[], batchSize: number = 3) {
    const results = [];
    // Process in smaller batches with longer delays between batches
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batchSignatures = signatures.slice(i, i + batchSize);
      console.log(`TradeService: Fetching transactions ${i+1}-${Math.min(i+batchSize, signatures.length)}/${signatures.length}`);
      
      // Create promise array for the batch with sequential fetching
      const batchResults = [];
      for (const sig of batchSignatures) {
        try {
          // Add a small delay between each request
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const tx = await this.connection!.getParsedTransaction(sig, { 
            maxSupportedTransactionVersion: 0 
          });
          
          if (tx) {
            batchResults.push({
              signature: sig,
              ...tx
            });
          }
        } catch (err) {
          console.error(`Error fetching transaction ${sig}:`, err);
        }
      }
      
      // Add valid results to the final array
      results.push(...batchResults.filter(tx => tx !== null));
      
      // Add longer delay between batches to avoid rate limiting
      if (i + batchSize < signatures.length) {
        const delayTime = 1000; // 1 second between batches
        console.log(`TradeService: Waiting ${delayTime}ms before next batch to avoid rate limiting`);
        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
    }
    
    return results;
  }

  // Enhanced parser for SPL transactions in tradeService.ts
  private parseSPLTransaction(tx: any): Trade | null {
    try {
      if (!tx) return null;
      
      // Get transaction basics
      const signature = tx.signature || tx.id || '';
      const timestamp = new Date((tx.timestamp || Date.now() / 1000) * 1000);
      
      console.log(`TradeService: Parsing transaction ${signature.substring(0, 8)}...`);
      
      // First check for token swap transactions
      if (tx.type === 'SWAP' && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        // Extract token details from the swap
        const tokenTransfer = tx.tokenTransfers[0];
        const tokenSymbol = tokenTransfer.tokenSymbol || tokenTransfer.symbol || 'Unknown';
        const amount = Math.abs(parseFloat(tokenTransfer.tokenAmount) || 0);
        
        // Determine if this is a buy or sell
        let tradeType: 'buy' | 'sell' = 'buy';
        
        // Check for SOL transfers to determine buy/sell direction
        const nativeTransfers = tx.nativeTransfers || [];
        let solAmount = 0;
        
        for (const transfer of nativeTransfers) {
          if (transfer.fromUserAccount === tx.feePayer) {
            // User sent SOL, so they're buying tokens
            tradeType = 'buy';
            solAmount = transfer.amount / 1_000_000_000; // Convert lamports to SOL
            break;
          } else if (transfer.toUserAccount === tx.feePayer) {
            // User received SOL, so they're selling tokens
            tradeType = 'sell';
            solAmount = transfer.amount / 1_000_000_000; // Convert lamports to SOL
            break;
          }
        }
        
        // Calculate approximate price
        let price = 0;
        if (solAmount > 0 && amount > 0) {
          // Assume 1 SOL = ~$20 for basic price estimation
          price = (solAmount * 20) / amount;
        } else {
          // Use market rates as fallback
          switch(tokenSymbol.toUpperCase()) {
            case 'BONK': price = 0.000003; break;
            case 'JUP': price = 0.65; break;
            case 'PYTH': price = 0.45; break;
            default: price = 0.1;
          }
        }
        
        console.log(`TradeService: Found ${tradeType} trade of ${amount} ${tokenSymbol}`);
        
        return {
          id: signature,
          timestamp,
          type: tradeType,
          cryptoAsset: tokenSymbol,
          amount: parseFloat(amount.toFixed(4)),
          price: parseFloat(price.toFixed(6)),
          totalValue: parseFloat((amount * price).toFixed(2)),
          exchange: this.detectExchange(tx),
          successful: true,
          notes: `${tradeType} ${tokenSymbol} ${tradeType === 'buy' ? 'with' : 'for'} SOL`
        };
      }
      
      return null;
    } catch (error) {
      console.error('TradeService: Error parsing SPL transaction:', error);
      return null;
    }
  }

  // Helper method to detect exchange
  private detectExchange(tx: any): string {
    if (!tx) return 'Unknown';
    
    // Check source field
    if (tx.source) {
      if (tx.source.toLowerCase().includes('jupiter')) return 'Jupiter';
      if (tx.source.toLowerCase().includes('raydium')) return 'Raydium';
      if (tx.source.toLowerCase().includes('orca')) return 'Orca';
      if (tx.source.toLowerCase().includes('pump')) return 'Pump';
    }
    
    // Check for program IDs in account keys
    const accounts = tx.accounts || [];
    const accountsStr = JSON.stringify(accounts);
    
    if (accountsStr.includes('JUP')) return 'Jupiter';
    if (accountsStr.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')) return 'Raydium';
    if (accountsStr.includes('9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP')) return 'Orca';
    
    return 'Unknown DEX';
  }

  // Add to tradeService.ts - helper to determine if a transaction is an SPL-SOL swap
  private isSOLSPLSwap(tx: any): boolean {
    // Check if there's a token transfer and a SOL transfer
    const hasTokenTransfer = tx.tokenTransfers && tx.tokenTransfers.length > 0;
    const hasSOLTransfer = tx.nativeTransfers && tx.nativeTransfers.length > 0;
    
    if (hasTokenTransfer && hasSOLTransfer) {
      // This likely represents a swap between SOL and an SPL token
      return true;
    }
    
    // If it's a SWAP type but doesn't have explicit transfers, check other indicators
    if (tx.type === 'SWAP') {
      // Check for events that might indicate a swap
      if (tx.events && tx.events.swap) {
        // Swap event present
        const swap = tx.events.swap;
        return (
          (swap.nativeInput && swap.tokenOutputs && swap.tokenOutputs.length > 0) || 
          (swap.nativeOutput && swap.tokenInputs && swap.tokenInputs.length > 0)
        );
      }
      
      // Check the logs for mentions of swap-related programs
      if (tx.logs) {
        const logsStr = JSON.stringify(tx.logs);
        if (logsStr.includes('Jupiter') || 
            logsStr.includes('Raydium') || 
            logsStr.includes('Orca') ||
            logsStr.includes('swap')) {
          return true;
        }
      }
    }
    
    return false;
  }

  // Get all trades for analysis
  async getTrades(): Promise<Trade[]> {
    // If we already have trades loaded, return them
    if (this.trades && this.trades.length > 0) {
      return this.trades;
    }
    
    // Otherwise fetch trades using the same logic as getLast4SPLTrades
    await this.getLast4SPLTrades();
    
    // Return all trades, not just the last 4
    return this.trades;
  }

  // Update the API endpoint in getLast4SPLTrades method
  async getLast4SPLTrades(): Promise<Trade[]> {
    // Check if we're in test mode
    const useTestData = localStorage.getItem('useTestData') === 'true';
    const forceRealData = localStorage.getItem('forceRealData') === 'true';
    
    if (useTestData && !forceRealData) {
      console.log("TradeService: Using test SPL data (forced by debug toggle)");
      this.trades = this.generateTestSPLTradeData(4);
      return this.trades;
    }

    const walletInfo = walletService.getWalletInfo();
    
    if (!walletInfo || !walletInfo.isConnected) {
      console.error("TradeService: Wallet not connected");
      this.trades = this.generateTestSPLTradeData(4);
      return this.trades;
    }
    
    console.log("TradeService: Getting SPL transactions for wallet", walletInfo.address);
    
    try {
      console.log(`TradeService: Fetching SPL transactions for wallet ${walletInfo.address}`);
      console.log(`TradeService: Using API key: ${this.HELIUS_API_KEY.substring(0, 6)}...`);
      
      // Use the enhanced Helius DAS API to get transactions
      const transactions = await this.getTransactionsDAS(walletInfo.address, 30);
      
      if (!transactions || transactions.length === 0) {
        console.log("TradeService: No transactions found, using test data");
        this.trades = this.generateTestSPLTradeData(4);
        return this.trades;
      }
      
      console.log(`TradeService: Processing ${transactions.length} transactions`);
      
      // Parse the transactions
      const parsedTrades: Trade[] = [];
      
      for (const tx of transactions) {
        // Check if this is a token swap transaction
        const trade = this.parseSPLTransaction(tx);
        if (trade) {
          parsedTrades.push(trade);
        }
      }
      
      // Sort by timestamp, newest first
      parsedTrades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // Take the most recent 4 trades
      this.trades = parsedTrades.slice(0, 4);
      
      if (this.trades.length === 0) {
        console.log("TradeService: No valid trades found in transactions, using test data");
        this.trades = this.generateTestSPLTradeData(4);
      } else {
        console.log(`TradeService: Found ${this.trades.length} valid trades`);
      }
      
      this._lastAPICallFailed = false;
      return this.trades;
    } catch (error) {
      console.error("TradeService: Error fetching SPL transactions:", error);
      this._lastAPICallFailed = true;
      
      // Fallback to test data
      console.log("TradeService: Using test SPL data as fallback");
      this.trades = this.generateTestSPLTradeData(4);
      return this.trades;
    }
  }

  // Generate test SPL trade data
  private generateTestSPLTradeData(count: number = 4): Trade[] {
    const tokens = ['BONK', 'JUP', 'PYTH', 'RAY', 'ORCA'];
    const exchanges = ['Jupiter', 'Raydium', 'Orca'];
    const testTrades: Trade[] = [];
    
    for (let i = 0; i < count; i++) {
      const isRecent = i < 2;
      const daysAgo = isRecent ? Math.random() * 2 : 3 + Math.random() * 30;
      const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      
      const tokenIndex = Math.floor(Math.random() * tokens.length);
      const token = tokens[tokenIndex];
      
      // Determine price based on token
      let price = 0;
      switch(token) {
        case 'BONK': price = 0.000003 + (Math.random() * 0.000001); break;
        case 'JUP': price = 0.65 + (Math.random() * 0.1); break;
        case 'PYTH': price = 0.45 + (Math.random() * 0.05); break;
        case 'RAY': price = 1.85 + (Math.random() * 0.2); break;
        case 'ORCA': price = 0.75 + (Math.random() * 0.1); break;
        default: price = 0.1 + (Math.random() * 0.05);
      }
      
      // Generate realistic amounts based on token price
      // More expensive tokens -> smaller amounts, cheaper tokens -> larger amounts
      let amount: number;
      if (price < 0.0001) { // For super cheap tokens like BONK
        amount = 1000000 + Math.random() * 9000000;
      } else if (price < 0.01) {
        amount = 1000 + Math.random() * 9000;
      } else if (price < 0.1) {
        amount = 100 + Math.random() * 900;
      } else if (price < 1) {
        amount = 20 + Math.random() * 80;
      } else {
        amount = 1 + Math.random() * 10;
      }
      
      const tradeType: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
      const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      const totalValue = amount * price;
      
      testTrades.push({
        id: `test-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp,
        type: tradeType,
        cryptoAsset: token,
        amount: parseFloat(amount.toFixed(token === 'BONK' ? 0 : 2)),
        price: parseFloat(price.toFixed(token === 'BONK' ? 8 : 4)),
        totalValue: parseFloat(totalValue.toFixed(2)),
        exchange,
        successful: true,
        notes: `Test ${tradeType} ${token} on ${exchange}`
      });
    }
    
    // Sort by timestamp, newest first
    testTrades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return testTrades;
  }

  // Method to get analytics for trades
  getAnalytics(): TradeAnalytics {
    if (!this.analytics) {
      this.computeAnalytics();
    }
    return this.analytics!;
  }
  // Compute analytics for the trades
  private computeAnalytics(): void {
    // Initialize analytics object with required properties for our app
    this.analytics = {
      // Properties needed for the UI
      overallSuccessRate: 0,
      totalProfitLoss: 0,
      mostProfitableToken: '',
      leastProfitableToken: '',
      averageHoldTime: '',
      tradeFrequency: '',
      recommendations: [],
      tokenAnalyses: [],
      
      // Internal properties for calculations
      totalTrades: this.trades.length,
      buyCount: 0,
      sellCount: 0,
      totalVolume: 0,
      successRate: 0,
      averageValue: 0,
      topToken: { symbol: '', volume: 0 },
      recentActivity: 'none'
    };
    
    if (this.trades.length === 0) {
      return;
    }
    
    // Track tokens and their volumes
    const tokenVolumes: Record<string, number> = {};
    let totalSuccessful = 0;
    
    // Process each trade
    for (const trade of this.trades) {
      // Count buys and sells
      if (trade.type === 'buy') {
        this.analytics.buyCount++;
      } else {
        this.analytics.sellCount++;
      }
      
      // Add to total volume
      this.analytics.totalVolume += trade.totalValue;
      
      // Track successful trades
      if (trade.successful) {
        totalSuccessful++;
      }
      
      // Track token volumes
      const token = trade.cryptoAsset;
      if (!tokenVolumes[token]) {
        tokenVolumes[token] = 0;
      }
      tokenVolumes[token] += trade.amount;
    }
    
    // Calculate success rate
    this.analytics.successRate = (totalSuccessful / this.trades.length) * 100;
    this.analytics.overallSuccessRate = this.analytics.successRate; // Sync both properties
    
    // Calculate average value
    this.analytics.averageValue = this.analytics.totalVolume / this.trades.length;
    
    // Find top token by volume
    let maxVolume = 0;
    let topToken = '';
    
    for (const token in tokenVolumes) {
      if (tokenVolumes[token] > maxVolume) {
        maxVolume = tokenVolumes[token];
        topToken = token;
      }
    }
    
    if (topToken) {
      this.analytics.topToken = {
        symbol: topToken,
        volume: maxVolume
      };
    }
    
    // Determine recent activity level based on trades in last 48 hours
    const recent = this.trades.filter(t => 
      (Date.now() - t.timestamp.getTime()) < 48 * 60 * 60 * 1000
    ).length;
    
    if (recent >= 3) {
      this.analytics.recentActivity = 'high';
    } else if (recent >= 1) {
      this.analytics.recentActivity = 'medium';
    } else {
      this.analytics.recentActivity = 'low';
    }
  }

  // Get patterns from trades
  getPatterns(): TradingPattern[] {
    if (this.patterns.length === 0) {
      this.detectPatterns();
    }
    return this.patterns;
  }

  // Detect patterns in trading data
  private detectPatterns(): void {
    this.patterns = [];
    
    if (this.trades.length < 2) {
      return;
    }
    
    // Sort trades by timestamp (oldest first for analysis)
    const sortedTrades = [...this.trades].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Group trades by token
    const tokenTrades: Record<string, Trade[]> = {};
    
    for (const trade of sortedTrades) {
      const token = trade.cryptoAsset;
      if (!tokenTrades[token]) {
        tokenTrades[token] = [];
      }
      tokenTrades[token].push(trade);
    }
    
    // Analyze each token's trades for patterns
    for (const token in tokenTrades) {
      const trades = tokenTrades[token];
      
      // Need at least 2 trades of the same token to detect a pattern
      if (trades.length < 2) continue;
      
      // Check for buying low and selling high pattern
      this.detectBuyLowSellHigh(trades, token);
      
      // Check for averaging down pattern
      this.detectAveragingDown(trades, token);
      
      // Check for momentum trading pattern
      this.detectMomentumTrading(trades, token);
    }
  }

  // Pattern: Buying low and selling high
  private detectBuyLowSellHigh(trades: Trade[], token: string): void {
    // Look for a buy followed by a sell at higher price
    for (let i = 0; i < trades.length - 1; i++) {
      for (let j = i + 1; j < trades.length; j++) {
        if (trades[i].type === 'buy' && trades[j].type === 'sell' && 
            trades[j].price > trades[i].price) {
          
          const priceDiff = trades[j].price - trades[i].price;
          const percentGain = (priceDiff / trades[i].price) * 100;
          
          // Only consider significant gains (more than 5%)
          if (percentGain > 5) {
            const daysBetween = Math.round((trades[j].timestamp.getTime() - trades[i].timestamp.getTime()) / (1000 * 60 * 60 * 24));
            
            this.patterns.push({
              type: 'buy-low-sell-high',
              token,
              strength: percentGain > 20 ? 'strong' : 'moderate',
              description: `Bought ${token} and sold ${daysBetween} days later for a ${percentGain.toFixed(1)}% gain`,
              trades: [trades[i].id, trades[j].id]
            });
            
            // Skip these trades for further pattern detection
            i = j;
            break;
          }
        }
      }
    }
  }

  // Pattern: Averaging down (buying more as price decreases)
  private detectAveragingDown(trades: Trade[], token: string): void {
    const buyTrades = trades.filter(t => t.type === 'buy');
    
    if (buyTrades.length < 2) return;
    
    // Look for consecutive buys with lower prices
    for (let i = 0; i < buyTrades.length - 1; i++) {
      if (buyTrades[i+1].price < buyTrades[i].price) {
        const priceDiff = buyTrades[i].price - buyTrades[i+1].price;
        const percentDrop = (priceDiff / buyTrades[i].price) * 100;
        
        // Only consider significant drops
        if (percentDrop > 10) {
          this.patterns.push({
            type: 'averaging-down',
            token,
            strength: percentDrop > 25 ? 'strong' : 'moderate',
            description: `Bought more ${token} after price dropped ${percentDrop.toFixed(1)}%, lowering average cost basis`,
            trades: [buyTrades[i].id, buyTrades[i+1].id]
          });
          
          // Skip this pair for further averaging down detection
          i++;
        }
      }
    }
  }

  // Pattern: Momentum trading (following the trend)
  private detectMomentumTrading(trades: Trade[], token: string): void {
    if (trades.length < 3) return;
    
    // Check if there's a series of only buys or only sells
    const allSameTxType = trades.every(t => t.type === trades[0].type);
    
    if (allSameTxType && trades.length >= 3) {
      const txType = trades[0].type;
      const firstDate = trades[0].timestamp;
      const lastDate = trades[trades.length - 1].timestamp;
      const daysPeriod = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysPeriod <= 30) { // Within a month
        this.patterns.push({
          type: 'momentum-trading',
          token,
          strength: trades.length >= 5 ? 'strong' : 'moderate',
          description: `${txType === 'buy' ? 'Accumulated' : 'Distributed'} ${token} with ${trades.length} ${txType} transactions in ${daysPeriod} days`,
          trades: trades.map(t => t.id)
        });
      }
    }
  }

  // Getter for API call status
  get lastAPICallFailed(): boolean {
    return this._lastAPICallFailed;
  }
}

// Export singleton
export const tradeService = new TradeService();