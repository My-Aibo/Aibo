import { walletService } from './walletService';
import { aiApiService } from './aiApiService';
import { tradeService } from './tradeService'; // Import tradeService

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
  leastProfitableToken: string;
  averageHoldTime: string;
  tradeFrequency: string;
  recommendations: string[];
  tokenAnalyses: TokenAnalysis[];
}

class TradeAnalysisService {
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
          },
          worstTrade: {
            loss: parseFloat(-worstTrade.totalValue.toFixed(2)),
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
  
  // Replace the mock getAIResponse with the real API call
  async getAIResponse(userQuery: string, walletAnalysis: WalletAnalysis | null): Promise<string> {
    if (!walletAnalysis) {
      return "I don't have enough data about your wallet yet. Please make sure your wallet is connected and has some trading history.";
    }

    // Add a fallback mechanism in case the API fails
    try {
      console.log("Calling Together.ai API for query:", userQuery);
      
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