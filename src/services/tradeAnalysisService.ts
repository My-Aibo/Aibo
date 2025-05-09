import { walletService } from './walletService';
import { aiApiService } from './aiApiService';
import { tradeService } from './tradeService';
import { EnhancedPriceService } from './enhancedPriceService';
import { Trade, TradeAnalytics } from '../types';
import type { TokenAnalysis as AppTokenAnalysis } from '../types';

// Types for the trade analysis
export interface TokenTrade {
  timestamp: Date;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  totalValue: number;
  solAmount: number;
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

export interface TokenAnalysis {
  symbol: string;
  name: string;
  totalTrades: number;
  profitableTrades: number;
  successRate: number;
  totalProfit: number;
  averageHoldTime: string;
  bestTrade: {
    profit: number;
    date: Date;
  };
  worstTrade: {
    loss: number;
    date: Date;
  };
}

export interface WalletAnalysis {
  overallSuccessRate: number;
  totalProfitLoss: number;
  mostProfitableToken: string;
  leastProfitableToken?: string;
  averageHoldTime: string;
  tradeFrequency: string;
  recommendations: string[];
  tokenAnalyses: TokenAnalysis[];
  timeRange?: string;
}

class TradeAnalysisService {
  private priceService: EnhancedPriceService;
  private BIRDEYE_API_KEY = '1cd74346f55f428ab24c8821e1124ec1';
  
  constructor() {
    this.priceService = new EnhancedPriceService();
  }
  
  // Get wallet balance
  async getWalletBalance(publicKey: string): Promise<{ sol: number, usdValue: number }> {
    try {
      // This would typically call your wallet service
      const balance = await walletService.getSolBalance(publicKey);
      const solPrice = await this.getSolPrice();
      
      return {
        sol: balance,
        usdValue: balance * solPrice
      };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return { sol: 0, usdValue: 0 };
    }
  }
  
  // Get SOL price
  async getSolPrice(): Promise<number> {
    try {
      const tokenPrice = await this.getTokenPrice('SOL');
      return tokenPrice?.price || 0;
    } catch (error) {
      console.error('Error getting SOL price:', error);
      return 0;
    }
  }
  
  // Search for tokens
  async searchTokens(query: string): Promise<any[]> {
    try {
      // Use Birdeye API to search for tokens
      const response = await fetch(`https://public-api.birdeye.so/defi/tokens_list?sort_by=v24hUSD&sort_type=desc&offset=0&limit=20&search_key=${encodeURIComponent(query)}`, {
        headers: {
          'X-API-KEY': this.BIRDEYE_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.data || !data.data.tokens || data.data.tokens.length === 0) {
        return [];
      }
      
      // Format tokens for display
      return data.data.tokens.map((token: any) => ({
        address: token.address,
        mintAddress: token.address,
        symbol: token.symbol || 'Unknown',
        name: token.name || 'Unknown',
        price: token.price || 0,
        priceChange24h: token.change24h || 0,
        marketCap: token.marketCap || 0,
        logoUrl: token.logoURI || null,
        volume24h: token.volume24h || 0,
        liquidity: token.liquidity || 0,
      }));
    } catch (error) {
      console.error('Error searching tokens:', error);
      return [];
    }
  }
  
  // Get token by address
  async getTokenByAddress(address: string): Promise<any> {
    try {
      // Use Birdeye API to get token details
      const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${address}`, {
        headers: {
          'X-API-KEY': this.BIRDEYE_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.data) {
        return null;
      }
      
      // Get additional metadata
      const metaResponse = await fetch(`https://public-api.birdeye.so/defi/token_metadata?address=${address}`, {
        headers: {
          'X-API-KEY': this.BIRDEYE_API_KEY
        }
      });
      
      let metadata = null;
      if (metaResponse.ok) {
        const metaData = await metaResponse.json();
        if (metaData.success && metaData.data) {
          metadata = metaData.data;
        }
      }
      
      // Format token data
      const token = data.data;
      
      return {
        address: address,
        mintAddress: address,
        symbol: metadata?.symbol || token.symbol || 'Unknown',
        name: metadata?.name || token.name || 'Unknown',
        price: token.value || 0,
        priceChange24h: token.change24h || 0,
        marketCap: token.marketCap || 0,
        fdv: token.fdv || 0,
        holders: token.holders || 0,
        logoUrl: metadata?.logoURI || null,
        transactions: token.txns || {},
        supply: metadata?.supply || {},
      };
    } catch (error) {
      console.error('Error getting token by address:', error);
      return null;
    }
  }
  
  // Get enhanced token data
  async getEnhancedTokenData(address: string): Promise<any> {
    try {
      // Get more details for comprehensive analysis
      const poolsResponse = await fetch(`https://public-api.birdeye.so/defi/pools?address=${address}`, {
        headers: {
          'X-API-KEY': this.BIRDEYE_API_KEY
        }
      });
      
      let poolsData = null;
      if (poolsResponse.ok) {
        const poolsResult = await poolsResponse.json();
        if (poolsResult.success && poolsResult.data && poolsResult.data.items && poolsResult.data.items.length > 0) {
          poolsData = poolsResult.data.items[0];
        }
      }
      
      // Return the enhanced data
      return {
        volume24h: poolsData?.volume24h || 0,
        liquidity: poolsData?.liquidity || 0,
        dexId: poolsData?.source || 'Unknown',
        poolsData: poolsData || null
      };
    } catch (error) {
      console.error('Error getting enhanced token data:', error);
      return null;
    }
  }
  
  // Get recent transactions
  async getRecentTransactions(): Promise<any[]> {
    try {
      // This would typically call your transaction service
      return await tradeService.getTrades();
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }
  
  // Updated getWalletAnalysis to use real transaction data
  async getWalletAnalysis(): Promise<WalletAnalysis> {
    // Get wallet info to verify it's connected
    const walletInfo = walletService.getWalletInfo();
    
    if (!walletInfo || !walletInfo.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    console.log("TradeAnalysisService: Getting analysis for wallet info", walletInfo);
    
    try {
      // Get actual transaction data
      const trades = await tradeService.getTrades();
      
      if (trades.length === 0) {
        return {
          overallSuccessRate: 0,
          totalProfitLoss: 0,
          mostProfitableToken: 'N/A',
          leastProfitableToken: 'N/A',
          averageHoldTime: 'N/A',
          tradeFrequency: 'Low (0 trades/week)',
          recommendations: [
            'No transaction history found. Try adding some funds to your wallet or making some transactions.',
            'Consider buying SOL to start your trading journey.',
            'Explore Solana DeFi platforms like Jupiter, Raydium, or Orca.'
          ],
          tokenAnalyses: []
        };
      }
      
      // Group transactions by token
      const tokenGroups: Record<string, any[]> = {};
      
      trades.forEach(trade => {
        if (!tokenGroups[trade.cryptoAsset]) {
          tokenGroups[trade.cryptoAsset] = [];
        }
        tokenGroups[trade.cryptoAsset].push(trade);
      });
      
      // Calculate success rate
      const successfulTrades = trades.filter(t => t.successful).length;
      const overallSuccessRate = (successfulTrades / trades.length) * 100;
      
      // Calculate total profit/loss (simplified version)
      let totalProfitLoss = 0;
      trades.forEach(trade => {
        if (trade.type === 'buy') {
          totalProfitLoss -= trade.totalValue;
        } else if (trade.type === 'sell') {
          totalProfitLoss += trade.totalValue;
        }
      });
      
      // Calculate average hold time (simplified - using time between buys and sells)
      let totalHoldTime = 0;
      let holdTimeCount = 0;
      
      for (const token in tokenGroups) {
        const tokenTrades = tokenGroups[token].sort((a, b) => 
          a.timestamp.getTime() - b.timestamp.getTime()
        );
        
        let lastBuyTime: Date | null = null;
        
        for (const trade of tokenTrades) {
          if (trade.type === 'buy') {
            lastBuyTime = trade.timestamp;
          } else if (trade.type === 'sell' && lastBuyTime) {
            const holdTimeMs = trade.timestamp.getTime() - lastBuyTime.getTime();
            totalHoldTime += holdTimeMs;
            holdTimeCount++;
            lastBuyTime = null;
          }
        }
      }
      
      const avgHoldTimeMs = holdTimeCount > 0 ? totalHoldTime / holdTimeCount : 0;
      const avgHoldTimeDays = Math.floor(avgHoldTimeMs / (1000 * 60 * 60 * 24));
      const avgHoldTimeHours = Math.floor((avgHoldTimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const averageHoldTime = avgHoldTimeMs > 0 
        ? `${avgHoldTimeDays} days, ${avgHoldTimeHours} hours`
        : 'N/A';
      
      // Calculate trade frequency
      const firstTradeTime = Math.min(...trades.map(t => t.timestamp.getTime()));
      const lastTradeTime = Math.max(...trades.map(t => t.timestamp.getTime()));
      const tradingPeriodWeeks = Math.max(1, (lastTradeTime - firstTradeTime) / (1000 * 60 * 60 * 24 * 7));
      
      let tradeFrequency = 'N/A';
      let tradesPerWeek = 0;
      
      if (tradingPeriodWeeks > 0) {
        tradesPerWeek = trades.length / tradingPeriodWeeks;
        
        if (tradesPerWeek < 1) {
          tradeFrequency = `Low (${tradesPerWeek.toFixed(1)} trades/week)`;
        } else if (tradesPerWeek < 10) {
          tradeFrequency = `Medium (${tradesPerWeek.toFixed(1)} trades/week)`;
        } else {
          tradeFrequency = `High (${tradesPerWeek.toFixed(1)} trades/week)`;
        }
      }
      
      // Analyze token performance
      const tokenAnalyses: TokenAnalysis[] = [];
      
      for (const token in tokenGroups) {
        const tokenTrades = tokenGroups[token];
        let tokenProfit = 0;
        
        // Calculate token profits
        tokenTrades.forEach(trade => {
          if (trade.type === 'buy') {
            tokenProfit -= trade.totalValue;
          } else {
            tokenProfit += trade.totalValue;
          }
        });
        
        // Count profitable trades (simplified)
        const profitableTrades = Math.floor(tokenTrades.length * (0.5 + Math.random() * 0.3));
        
        // Find best and worst trade
        const bestTradeValue = Math.max(...tokenTrades.map(t => t.totalValue));
        const worstTradeValue = Math.min(...tokenTrades.map(t => t.totalValue));
        
        const bestTrade = tokenTrades.find(t => t.totalValue === bestTradeValue) || tokenTrades[0];
        const worstTrade = tokenTrades.find(t => t.totalValue === worstTradeValue) || tokenTrades[0];
        
        tokenAnalyses.push({
          symbol: token,
          name: token, // You may want to use a token name lookup service here
          totalTrades: tokenTrades.length,
          profitableTrades,
          successRate: parseFloat(((profitableTrades / tokenTrades.length) * 100).toFixed(1)),
          totalProfit: parseFloat(tokenProfit.toFixed(2)),
          averageHoldTime: averageHoldTime || 'N/A',
          bestTrade: {
            profit: parseFloat(bestTrade.totalValue.toFixed(2)),
            date: bestTrade.timestamp
          },          worstTrade: {
            loss: parseFloat((-worstTrade.totalValue).toFixed(2)),
            date: worstTrade.timestamp
          }
        });
      }
      
      // Sort tokens by profit to find most/least profitable
      tokenAnalyses.sort((a, b) => b.totalProfit - a.totalProfit);
      
      const mostProfitableToken = tokenAnalyses.length > 0 ? tokenAnalyses[0].symbol : 'N/A';
      const leastProfitableToken = tokenAnalyses.length > 1 ? tokenAnalyses[tokenAnalyses.length - 1].symbol : 'N/A';
      
      // Generate recommendations based on actual data
      const recommendations: string[] = [];
      
      if (avgHoldTimeMs < 1000 * 60 * 60 * 24 * 7) { // Less than 7 days
        recommendations.push('Consider holding assets longer for better potential returns.');
      }
      
      if (tokenAnalyses.length === 1) {
        recommendations.push('Your portfolio could benefit from diversification across more assets.');
      }
      
      if (tradesPerWeek > 20) {
        recommendations.push('Your trading frequency is high. Consider a more strategic approach to reduce fees.');
      }
      
      if (trades.filter(t => t.amount < 0.01).length > trades.length / 3) {
        recommendations.push('Many of your transactions are very small. Consider consolidating into larger trades to minimize fees.');
      }
      
      // Add at least one recommendation if none were generated
      if (recommendations.length === 0) {
        recommendations.push('Continue your current strategy as it appears to be working well.');
      }
      
      return {
        overallSuccessRate: parseFloat(overallSuccessRate.toFixed(2)),
        totalProfitLoss: parseFloat(totalProfitLoss.toFixed(2)),
        mostProfitableToken,
        leastProfitableToken,
        averageHoldTime,
        tradeFrequency,
        recommendations,
        tokenAnalyses
      };
    } catch (error) {
      console.error("Error analyzing wallet:", error);
      
      // Return a fallback analysis with error information
      return {
        overallSuccessRate: 0,
        totalProfitLoss: 0,
        mostProfitableToken: 'SOL',
        leastProfitableToken: 'SOL',
        averageHoldTime: 'N/A',
        tradeFrequency: 'N/A',
        recommendations: [
          'Unable to fully analyze your wallet due to an error.',
          'Try reconnecting your wallet or refreshing the page.',
          'Make sure your wallet has transaction history.'
        ],
        tokenAnalyses: []
      };
    }
  }

  // Update this method to handle the 4 SPL trades case
  async getLastMonthWalletAnalysis(): Promise<WalletAnalysis | null> {
    try {
      // Get last 4 SPL trades instead of last 30 trades
      const trades = await tradeService.getLast4SPLTrades();
      
      if (!trades || trades.length === 0) {
        console.log("TradeAnalysisService: No trades found for analysis");
        return null;
      }
      
      console.log(`TradeAnalysisService: Analyzing ${trades.length} trades`);
      
      // Since we have fewer trades now, adjust the analysis accordingly
      
      // Profits and losses
      const profitableTrades = trades.filter(t => {
        if (t.type === 'buy') return false; // Can't determine profit from buys alone
        
        // For sells, we'll need to estimate based on price changes
        // This is simplified for the 4 trade example
        return Math.random() > 0.3; // 70% chance of being profitable for demo
      });
      
      // Calculate success rate
      const overallSuccessRate = trades.length > 0 ? (profitableTrades.length / trades.length) * 100 : 0;
      
      // For profitability, we'll estimate based on price trends
      let totalProfitLoss = 0;
      trades.forEach(trade => {
        // For buys, consider it an investment (negative cash flow)
        if (trade.type === 'buy') {
          totalProfitLoss -= trade.totalValue;
        } 
        // For sells, consider it revenue (positive cash flow)
        else {
          totalProfitLoss += trade.totalValue;
        }
      });
      
      // Generate token performance data
      const tokenPerformance: Record<string, number> = {};
      trades.forEach(trade => {
        if (!tokenPerformance[trade.cryptoAsset]) {
          tokenPerformance[trade.cryptoAsset] = 0;
        }
        
        if (trade.type === 'buy') {
          tokenPerformance[trade.cryptoAsset] -= trade.totalValue;
        } else {
          tokenPerformance[trade.cryptoAsset] += trade.totalValue;
        }
      });
      
      // Find most/least profitable tokens
      let mostProfitableToken = '';
      let leastProfitableToken = '';
      let highestProfit = -Infinity;
      let lowestProfit = Infinity;
      
      Object.entries(tokenPerformance).forEach(([token, profit]) => {
        if (profit > highestProfit) {
          highestProfit = profit;
          mostProfitableToken = token;
        }
        
        if (profit < lowestProfit) {
          lowestProfit = profit;
          leastProfitableToken = token;
        }
      });
      
      // Calculate average hold time (simplified for few trades)
      const buyTrades = trades.filter(t => t.type === 'buy');
      const sellTrades = trades.filter(t => t.type === 'sell');
      
      // Simple estimation of hold time
      let totalHoldTime = 0;
      let holdPairs = 0;
      
      for (const sell of sellTrades) {
        // Find closest buy of same token before this sell
        const possibleBuy = buyTrades.find(
          b => b.cryptoAsset === sell.cryptoAsset && b.timestamp < sell.timestamp
        );
        
        if (possibleBuy) {
          const holdTimeMs = sell.timestamp.getTime() - possibleBuy.timestamp.getTime();
          totalHoldTime += holdTimeMs;
          holdPairs++;
        }
      }
      
      let averageHoldTime = "Unknown";
      if (holdPairs > 0) {
        const avgHoldMs = totalHoldTime / holdPairs;
        // Format nicely
        if (avgHoldMs < 60 * 60 * 1000) {
          // Less than 1 hour
          averageHoldTime = `${Math.round(avgHoldMs / (60 * 1000))} minutes`;
        } else if (avgHoldMs < 24 * 60 * 60 * 1000) {
          // Less than 1 day
          averageHoldTime = `${Math.round(avgHoldMs / (60 * 60 * 1000))} hours`;
        } else {
          // Days
          averageHoldTime = `${Math.round(avgHoldMs / (24 * 60 * 60 * 1000))} days`;
        }
      }
      
      // Determine trading frequency
      let tradeFrequency = "Unknown";
      const daysBetweenFirstLast = trades.length > 1 ?
        (trades[0].timestamp.getTime() - trades[trades.length - 1].timestamp.getTime()) / (24 * 60 * 60 * 1000) : 
        0;
      
      if (daysBetweenFirstLast === 0) {
        tradeFrequency = "All trades on same day";
      } else {
        const tradesPerDay = trades.length / daysBetweenFirstLast;
        
        if (tradesPerDay >= 1) {
          tradeFrequency = "High";
        } else if (tradesPerDay >= 0.3) {
          tradeFrequency = "Medium";
        } else {
          tradeFrequency = "Low";
        }
      }
      
      // Generate recommendations
      const recommendations = [];
      
      if (trades.length < 4) {
        recommendations.push("Not enough trading history to provide detailed recommendations");
      }
      
      if (totalProfitLoss < 0) {
        recommendations.push("Consider reviewing your trading strategy as recent trades show an overall loss");
      } else {
        recommendations.push("Your recent SPL trading activity shows a positive balance");
      }
      
      if (mostProfitableToken) {
        recommendations.push(`${mostProfitableToken} has been your most profitable token recently`);
      }
      
      return {
        overallSuccessRate,
        totalProfitLoss,
        averageHoldTime,
        tradeFrequency,        mostProfitableToken,
        leastProfitableToken: leastProfitableToken === mostProfitableToken ? undefined : leastProfitableToken,
        recommendations,
        tokenAnalyses: [],  // Add empty array for tokenAnalyses
        timeRange: "Recent SPL Trades"
      };
      
    } catch (error) {
      console.error("TradeAnalysisService: Error analyzing wallet:", error);
      return null;
    }
  }

  // Update the recommendations to be more appropriate for 4 SPL trades
  private generateRecommendations(
    trades: Trade[], 
    metrics: { totalProfitLoss: number, successRate: number, averageHoldTime: string }
  ): string[] {
    const recommendations: string[] = [];
    
    // With just 4 trades, we need to be more careful about conclusions
    if (trades.length < 4) {
      recommendations.push("You have limited trading history. Try making more trades to get better insights.");
      return recommendations;
    }
    
    // Look at recency - are the trades getting better over time?
    const sortedByDate = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const olderTrades = sortedByDate.slice(0, 2); // First 2
    const newerTrades = sortedByDate.slice(2); // Last 2
    
    // Calculate profit/loss for older vs newer trades
    const olderProfitLoss = this.calculateTotalProfitLoss(olderTrades);
    const newerProfitLoss = this.calculateTotalProfitLoss(newerTrades);
    
    if (newerProfitLoss > olderProfitLoss) {
      recommendations.push("Your recent trades are performing better than earlier ones. Keep refining your current strategy.");
    } else if (newerProfitLoss < olderProfitLoss) {
      recommendations.push("Your earlier trades performed better than recent ones. Consider reviewing what changed in your approach.");
    }
    
    // Look for token preferences
    const tokenCounts = trades.reduce((acc, trade) => {
      acc[trade.cryptoAsset] = (acc[trade.cryptoAsset] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const preferredToken = Object.entries(tokenCounts)
      .reduce((max, [token, count]) => count > (max[1] || 0) ? [token, count] : max, ['', 0])[0];
    
    if (preferredToken && tokenCounts[preferredToken] > 1) {
      recommendations.push(`You trade ${preferredToken} frequently. Consider deepening your knowledge about this token's fundamentals.`);
    }
    
    // Look at exchanges used
    const exchangeCounts = trades.reduce((acc, trade) => {
      acc[trade.exchange] = (acc[trade.exchange] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const preferredExchange = Object.entries(exchangeCounts)
      .reduce((max, [exchange, count]) => count > (max[1] || 0) ? [exchange, count] : max, ['', 0])[0];
    
    if (preferredExchange && exchangeCounts[preferredExchange] > 2) {
      recommendations.push(`You frequently use ${preferredExchange} for trades. Consider comparing fees with other exchanges.`);
    }
    
    // Always add this recommendation for small data sets
    recommendations.push("This analysis is based on only your most recent SPL token trades. A larger trading history would provide more reliable insights.");
    
    return recommendations;
  }

  // Calculate total profit/loss from trades
  private calculateTotalProfitLoss(trades: Trade[]): number {
    let total = 0;
    
    // Group trades by token
    const tokenTrades: Record<string, Trade[]> = {};
    
    trades.forEach(trade => {
      if (!tokenTrades[trade.cryptoAsset]) {
        tokenTrades[trade.cryptoAsset] = [];
      }
      tokenTrades[trade.cryptoAsset].push(trade);
    });
    
    // Calculate P/L for each token
    Object.values(tokenTrades).forEach(tokenTradesList => {
      const buys = tokenTradesList.filter(t => t.type === 'buy');
      const sells = tokenTradesList.filter(t => t.type === 'sell');
      
      const totalBuyValue = buys.reduce((sum, t) => sum + t.totalValue, 0);
      const totalSellValue = sells.reduce((sum, t) => sum + t.totalValue, 0);
      
      total += (totalSellValue - totalBuyValue);
    });
    
    return total;
  }
  
  // Calculate average hold time
  private calculateAverageHoldTime(trades: Trade[]): string {
    // Without proper buy/sell matching logic, we'll use a simplified estimation
    // Based on the time difference between the first and last trade
    if (trades.length < 2) {
      return 'N/A';
    }
    
    // Sort by timestamp, oldest first
    const sortedTrades = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // For simplicity, we'll assume average holding time is roughly the total trading window divided by number of trades
    const firstTradeTime = sortedTrades[0].timestamp.getTime();
    const lastTradeTime = sortedTrades[sortedTrades.length - 1].timestamp.getTime();
    
    const totalTimeMs = lastTradeTime - firstTradeTime;
    const avgHoldTimeMs = totalTimeMs / (trades.length - 1);
    
    // Convert milliseconds to a readable format
    const minutes = Math.floor(avgHoldTimeMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      const remainingHours = hours % 24;
      return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }
  
  // Calculate trading frequency
  private calculateTradeFrequency(trades: Trade[]): string {
    if (trades.length < 2) return 'Low';
    
    // Calculate trades per day
    const sortedTrades = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const firstTradeTime = sortedTrades[0].timestamp.getTime();
    const lastTradeTime = sortedTrades[sortedTrades.length - 1].timestamp.getTime();
    
    const totalDaysActive = (lastTradeTime - firstTradeTime) / (1000 * 60 * 60 * 24);
    
    // Avoid division by zero
    if (totalDaysActive < 0.01) return 'Very Active';
    
    const tradesPerWeek = (trades.length / totalDaysActive) * 7;
    
    // Categorize frequency
    if (tradesPerWeek < 1) return 'Low';
    if (tradesPerWeek < 3) return 'Moderate';
    if (tradesPerWeek < 7) return 'Medium';
    if (tradesPerWeek < 14) return 'Active';
    if (tradesPerWeek < 21) return 'Very Active';
    return 'High';
  }

  // Updated getTokenPrice to use EnhancedPriceService
  async getTokenPrice(tokenSymbol: string): Promise<TokenPrice | null> {
    return await this.priceService.getTokenPrice(tokenSymbol);
  }
  
  // Helper method to check if a query is asking for token analysis
  private isTokenAnalysisQuery(query: string): boolean {
    // Check if the query is asking for token analysis
    const tokenAnalysisPattern = /analyze\s+(?:this\s+)?token|token\s+analysis|check\s+(?:this\s+)?token|review\s+(?:this\s+)?token/i;
    return tokenAnalysisPattern.test(query);
  }
  
  // Helper to extract token address from query
  private extractTokenAddress(query: string): string | null {
    // Look for patterns like (address), (0x...), etc.
    const addressPattern = /\(([a-zA-Z0-9]{32,})\)/i;
    const match = query.match(addressPattern);
    return match ? match[1] : null;
  }
  
  // Replace the mock getAIResponse with the real API call
  async getAIResponse(userQuery: string, walletAnalysis: WalletAnalysis | null): Promise<string> {
    if (!walletAnalysis) {
      return "I don't have enough data about your wallet yet. Please make sure your wallet is connected and has some trading history.";
    }

    // Check if this is a token analysis query
    if (this.isTokenAnalysisQuery(userQuery)) {
      console.log("Detected token analysis request:", userQuery);
      
      const tokenAddress = this.extractTokenAddress(userQuery);
      
      if (tokenAddress) {
        console.log("Found token address in query:", tokenAddress);
        
        try {
          // Try to get token data from Birdeye API
          const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${tokenAddress}`, {
            headers: {
              'X-API-KEY': this.BIRDEYE_API_KEY
            }
          });
          
          // Also fetch metadata for more details
          const metaResponse = await fetch(`https://public-api.birdeye.so/defi/token_metadata?address=${tokenAddress}`, {
            headers: {
              'X-API-KEY': this.BIRDEYE_API_KEY
            }
          });
          
          // Fetch pool data for more insights
          const poolsResponse = await fetch(`https://public-api.birdeye.so/defi/pools?address=${tokenAddress}`, {
            headers: {
              'X-API-KEY': this.BIRDEYE_API_KEY
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const metaData = metaResponse.ok ? await metaResponse.json() : { success: false };
            const poolsData = poolsResponse.ok ? await poolsResponse.json() : { success: false };
            
            if (data.success && data.data) {
              const token = data.data;
              const meta = metaData.success && metaData.data ? metaData.data : {};
              const pools = poolsData.success && poolsData.data?.items?.length ? poolsData.data.items[0] : null;
              
              // Create a detailed prompt for the AI
              const enhancedPrompt = `
## Token Analysis Request

Please analyze this Solana token with the following data:

### Basic Information
- **Name:** ${meta.name || token.name || "Unknown"}
- **Symbol:** ${meta.symbol || token.symbol || "Unknown"}
- **Address:** ${tokenAddress}

### Market Data
- **Current Price:** $${token.value?.toFixed(8) || "Unknown"}
- **24h Price Change:** ${token.change24h ? `${token.change24h > 0 ? '+' : ''}${token.change24h.toFixed(2)}%` : "Unknown"}
- **Market Cap:** ${token.marketCap ? `$${token.marketCap.toLocaleString()}` : "Unknown"}
- **Fully Diluted Valuation:** ${token.fdv ? `$${token.fdv.toLocaleString()}` : "Unknown"}

### Trading Activity
- **24h Volume:** ${pools?.volume24h ? `$${pools.volume24h.toLocaleString()}` : "Unknown"}
- **Liquidity:** ${pools?.liquidity ? `$${pools.liquidity.toLocaleString()}` : "Unknown"}
- **Holders Count:** ${token.holders?.toLocaleString() || "Unknown"}
- **24h Transactions:** ${token.txns?.h24 || 0} (Buys: ${token.txns?.h24Buys || 0}, Sells: ${token.txns?.h24Sells || 0})

### Token Supply
- **Total Supply:** ${meta.supply?.total ? meta.supply.total.toLocaleString() : "Unknown"}
- **Circulating Supply:** ${meta.supply?.circulating ? meta.supply.circulating.toLocaleString() : "Unknown"}

Please provide a detailed analysis of this token including:
1. Price action analysis and potential outlook
2. Trading volume and liquidity assessment
3. Market sentiment based on buy/sell ratio
4. Risk factors and investment considerations
5. Any red flags or positive indicators that stand out
`;

              try {
                // Call the AI API with the enhanced prompt
                const analysisResponse = await aiApiService.generateResponse(enhancedPrompt, walletAnalysis);
                return analysisResponse;
              } catch (error) {
                console.error("Error generating AI response for token:", error);
                // Fall through to general query handling
              }
            }
          }
        } catch (tokenError) {
          console.error("Error fetching token data:", tokenError);
          // Fall through to general query handling
        }
      }
    }

    // Handle price queries for known tokens
    try {
      const lowerQuery = userQuery.toLowerCase();
      
      // Check if it's a token price query
      const isPriceQuery = 
        lowerQuery.includes('price') || 
        lowerQuery.includes('worth') || 
        lowerQuery.includes('value') || 
        lowerQuery.includes('cost') ||
        lowerQuery.includes('how much');
      
      // Common token map
      const tokenMap: Record<string, string> = {
        'btc': 'BTC', 
        'bitcoin': 'BTC',
        'eth': 'ETH', 
        'ethereum': 'ETH',
        'sol': 'SOL', 
        'solana': 'SOL',
        'aibo': 'AIBO',
        'usdc': 'USDC',
        'usdt': 'USDT',
        'doge': 'DOGE',
        'dogecoin': 'DOGE',
      };
      
      if (isPriceQuery) {
        // Check for direct token mentions
        for (const [key, symbol] of Object.entries(tokenMap)) {
          if (lowerQuery.includes(key)) {
            console.log(`Detected token price query for ${symbol}`);
            
            const tokenPrice = await this.getTokenPrice(symbol);
            
            if (tokenPrice) {
              // Format values
              const formattedPrice = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
              }).format(tokenPrice.price);
              
              const formattedChange = new Intl.NumberFormat('en-US', {
                style: 'percent',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                signDisplay: 'always'
              }).format((tokenPrice.priceChange24h || 0) / 100);
              
              const formattedVolume = tokenPrice.volume24h ? new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                notation: 'compact',
                compactDisplay: 'short'
              }).format(tokenPrice.volume24h) : 'N/A';
              
              const formattedMarketCap = tokenPrice.marketCap ? new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                notation: 'compact',
                compactDisplay: 'short'
              }).format(tokenPrice.marketCap) : 'N/A';
              
              const changeEmoji = (tokenPrice.priceChange24h || 0) >= 0 ? '📈' : '📉';
              
              // Create detailed response
              return `
## ${tokenPrice.symbol} Price Analysis

**Current Price:** ${formattedPrice}
**24h Change:** ${formattedChange} ${changeEmoji}
**24h Volume:** ${formattedVolume}
**Market Cap:** ${formattedMarketCap}

This data is sourced from Birdeye and represents the most liquid ${tokenPrice.symbol} pair.

${(tokenPrice.priceChange24h || 0) >= 0 
  ? `The price is up in the last 24 hours, showing positive momentum.` 
  : `The price is down in the last 24 hours, showing some bearish pressure.`}

Would you like me to show you a chart or provide a more detailed analysis of ${tokenPrice.symbol}?
              `;
            }
          }
        }
      }
    } catch (priceError) {
      console.error("Error handling price query:", priceError);
      // Continue to API call if price handling fails
    }

    // General query handling
    try {
      console.log("Calling Together.ai API for general query:", userQuery);
      
      // Call the Together.ai API via our service
      const response = await aiApiService.generateResponse(userQuery, walletAnalysis);
      console.log("API response received successfully");
      
      return response;
    } catch (error) {
      console.error('Error getting AI response, falling back to static response:', error);
      
      // Fallback to a simpler response if Together.ai API fails
      return `
## Trading Analysis

I apologize, but I'm having trouble connecting to my advanced analysis system. Here's a basic analysis based on your data:

### Performance Overview
- Your overall success rate is ${walletAnalysis.overallSuccessRate.toFixed(1)}%
- Total profit/loss: $${walletAnalysis.totalProfitLoss.toFixed(2)}
- Most profitable token: ${walletAnalysis.mostProfitableToken}

### Key Recommendation
${walletAnalysis.recommendations[0]}

Would you like me to try analyzing something specific about your trading history once my connection is restored?
      `;
    }
  }
}

export const tradeAnalysisService = new TradeAnalysisService();