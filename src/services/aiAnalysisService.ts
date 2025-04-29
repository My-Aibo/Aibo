import { Trade, TradingPattern } from '../types';
import { userProfileService, TradingLesson, TradingBehavior } from './userProfileService';
import { tradeService } from './tradeService';

interface TradingInsight {
  id: string;
  title: string;
  description: string;
  confidence: number; // 0-100
  suggestedAction: string;
  createdAt: Date;
}

class AIAnalysisService {
  private insights: TradingInsight[] = [];
  
  async analyzeTradeHistory(): Promise<TradingInsight[]> {
    // Get trade history
    const trades = await tradeService.getTrades();
    const patterns = await tradeService.getTradingPatterns();
    
    // Get user profile for context
    const profile = userProfileService.getProfile();
    
    // Clear previous insights
    this.insights = [];
    
    // Skip if not enough data
    if (trades.length < 3) {
      return [];
    }
    
    this.analyzeBuySellRatio(trades, profile.tradingBehavior);
    this.analyzeTimingPatterns(trades);
    this.analyzeProfitLossPatterns(trades);
    this.detectFOMO(trades, profile.tradingBehavior);
    this.detectPanicSelling(trades);
    this.analyzeDiversification(trades, profile.watchlist);
    
    return this.insights;
  }
  
  private analyzeBuySellRatio(trades: Trade[], behavior: TradingBehavior) {
    const buys = trades.filter(t => t.type === 'buy');
    const sells = trades.filter(t => t.type === 'sell');
    
    // Only analyze if we have enough trades
    if (buys.length + sells.length < 5) return;
    
    const buyRatio = buys.length / trades.length;
    
    if (buyRatio > 0.8) {
      // User is accumulating heavily
      this.insights.push({
        id: `insight_buy_heavy_${new Date().getTime()}`,
        title: 'Heavy Accumulation Pattern',
        description: "You're buying frequently without taking profits. While accumulation is good in bull markets, remember to consider profit-taking strategies.",
        confidence: 70 + Math.floor(Math.random() * 20),
        suggestedAction: 'Consider setting price targets for taking partial profits on some positions.',
        createdAt: new Date()
      });
      
      // Adapt behavior profile
      const updatedBehavior: Partial<TradingBehavior> = {
        riskTolerance: Math.min(behavior.riskTolerance + 5, 100),
      };
      userProfileService.updateTradingBehavior(updatedBehavior);
    } else if (buyRatio < 0.2 && sells.length > 3) {
      // User is selling heavily
      this.insights.push({
        id: `insight_sell_heavy_${new Date().getTime()}`,
        title: 'Increased Selling Activity',
        description: "You've been primarily selling assets recently. This could be profit-taking or risk management, but ensure it aligns with your overall strategy.",
        confidence: 65 + Math.floor(Math.random() * 20),
        suggestedAction: 'Review market conditions and your investment thesis to confirm if selling is the optimal strategy.',
        createdAt: new Date()
      });
      
      // Adapt behavior profile
      const updatedBehavior: Partial<TradingBehavior> = {
        riskTolerance: Math.max(behavior.riskTolerance - 5, 0),
      };
      userProfileService.updateTradingBehavior(updatedBehavior);
    }
  }
  
  private analyzeTimingPatterns(trades: Trade[]) {
    // Analyze when user typically trades
    const tradeTimes = trades.map(t => {
      const hour = t.timestamp.getHours();
      return { trade: t, hour };
    });
    
    // Group by hour
    const hourCounts: Record<number, number> = {};
    tradeTimes.forEach(({ hour }) => {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    // Find peak trading hours
    const entries = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count);
    
    if (entries.length > 0 && entries[0].count >= 3) {
      const peakHour = entries[0].hour;
      const peakCount = entries[0].count;
      
      // Check if there's a strong concentration in one time period
      if (peakCount / trades.length > 0.5) {
        // Convert to 12-hour format with AM/PM for readability
        const formattedHour = peakHour % 12 === 0 ? 12 : peakHour % 12;
        const ampm = peakHour < 12 ? 'AM' : 'PM';
        
        this.insights.push({
          id: `insight_timing_${new Date().getTime()}`,
          title: 'Preferred Trading Time Detected',
          description: `You frequently trade around ${formattedHour}${ampm}. Analyzing whether this timing is optimal for your assets could improve results.`,
          confidence: 60 + Math.floor(Math.random() * 25),
          suggestedAction: 'Compare market volatility and volume at your typical trading time vs. other times.',
          createdAt: new Date()
        });
      }
    }
  }
  
  private analyzeProfitLossPatterns(trades: Trade[]) {
    // Need detailed trade data with profit/loss info
    // This is placeholder logic since the current model doesn't track profit/loss
    
    // For now, just use price trends as a proxy
    const assetPrices: Record<string, number[]> = {};
    
    trades.forEach(trade => {
      if (!assetPrices[trade.cryptoAsset]) {
        assetPrices[trade.cryptoAsset] = [];
      }
      assetPrices[trade.cryptoAsset].push(trade.price);
    });
    
    // Check for buying at local peaks (proxy for poor timing)
    Object.entries(assetPrices).forEach(([asset, prices]) => {
      if (prices.length < 3) return;
      
      // Simple analysis - compare to average
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const buyTrades = trades.filter(t => t.type === 'buy' && t.cryptoAsset === asset);
      
      const highBuys = buyTrades.filter(t => t.price > avgPrice * 1.05);
      
      if (highBuys.length >= 2 && highBuys.length / buyTrades.length > 0.5) {
        this.insights.push({
          id: `insight_timing_buy_${asset}_${new Date().getTime()}`,
          title: `${asset} Buy Price Analysis`,
          description: `You tend to buy ${asset} at above-average prices. This may indicate reacting to price movements rather than planning entries.`,
          confidence: 55 + Math.floor(Math.random() * 20),
          suggestedAction: 'Consider dollar-cost averaging or setting limit orders below current market price.',
          createdAt: new Date()
        });
        
        // Create a lesson
        userProfileService.addLesson({
          title: 'Entry Price Optimization',
          description: `Your ${asset} purchases are often at higher than average prices, which may reduce overall returns.`,
          actionItems: [
            'Try setting limit orders below market price',
            'Consider dollar-cost averaging at regular intervals',
            'Track market cycles to identify better entry points'
          ],
          relatedTrades: highBuys.slice(0, 3).map(t => t.id)
        });
      }
    });
  }
  
  private detectFOMO(trades: Trade[], behavior: TradingBehavior) {
    // FOMO detection - looking for clusters of buys during price increases
    const recentTrades = trades.slice(0, 10);
    const buys = recentTrades.filter(t => t.type === 'buy');
    
    // Check timing between buys
    if (buys.length >= 3) {
      const sortedBuys = [...buys].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Check for rapid successive buys (potential FOMO)
      const timeGaps = [];
      for (let i = 1; i < sortedBuys.length; i++) {
        const gap = sortedBuys[i].timestamp.getTime() - sortedBuys[i-1].timestamp.getTime();
        timeGaps.push(gap);
      }
      
      // Convert to hours
      const hourGaps = timeGaps.map(gap => gap / (1000 * 60 * 60));
      
      // If multiple buys within short period
      if (hourGaps.filter(gap => gap < 24).length >= 2) {
        this.insights.push({
          id: `insight_fomo_${new Date().getTime()}`,
          title: 'Potential FOMO Trading Detected',
          description: 'You made several purchases in quick succession. Rapid buying can sometimes indicate fear of missing out.',
          confidence: 60 + Math.floor(Math.random() * 25),
          suggestedAction: 'Consider planning entries in advance and spreading buys over time.',
          createdAt: new Date()
        });
        
        // Update behavior profile
        const updatedBehavior: Partial<TradingBehavior> = {
          psychologicalPatterns: {
            ...behavior.psychologicalPatterns,
            fomoTendency: Math.min(behavior.psychologicalPatterns.fomoTendency + 10, 100)
          }
        };
        userProfileService.updateTradingBehavior(updatedBehavior);
      }
    }
  }
  
  private detectPanicSelling(trades: Trade[]) {
    // Look for sell clusters during market drops
    const sells = trades.filter(t => t.type === 'sell');
    
    if (sells.length >= 3) {
      const sortedSells = [...sells].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Check for rapid successive sells 
      const timeGaps = [];
      for (let i = 1; i < sortedSells.length; i++) {
        const gap = sortedSells[i].timestamp.getTime() - sortedSells[i-1].timestamp.getTime();
        timeGaps.push(gap);
      }
      
      // Convert to hours
      const hourGaps = timeGaps.map(gap => gap / (1000 * 60 * 60));
      
      // If multiple sells within short period
      if (hourGaps.filter(gap => gap < 12).length >= 2) {
        this.insights.push({
          id: `insight_panic_${new Date().getTime()}`,
          title: 'Potential Reactive Selling Pattern',
          description: 'You sold multiple assets in a short timeframe. Clustered selling can sometimes indicate reacting to market events.',
          confidence: 65 + Math.floor(Math.random() * 20),
          suggestedAction: 'Consider setting predetermined exit points and sticking to your strategy regardless of short-term market movements.',
          createdAt: new Date()
        });
      }
    }
  }
  
  private analyzeDiversification(trades: Trade[], watchlist: string[]) {
    // Count unique assets traded
    const tradedAssets = new Set(trades.map(t => t.cryptoAsset));
    
    // If watching many assets but trading only one or two
    if (watchlist.length > 5 && tradedAssets.size <= 2) {
      this.insights.push({
        id: `insight_diversification_${new Date().getTime()}`,
        title: 'Limited Asset Diversification',
        description: `You're watching ${watchlist.length} assets but primarily trading only ${tradedAssets.size}. This could indicate a narrow focus.`,
        confidence: 70 + Math.floor(Math.random() * 15),
        suggestedAction: 'Consider exploring opportunities in other assets on your watchlist to diversify your portfolio.',
        createdAt: new Date()
      });
    }
    
    // Check for heavy concentration in one asset
    const assetCounts: Record<string, number> = {};
    trades.forEach(trade => {
      assetCounts[trade.cryptoAsset] = (assetCounts[trade.cryptoAsset] || 0) + 1;
    });
    
    const topAsset = Object.entries(assetCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topAsset && topAsset[1] / trades.length > 0.7 && trades.length > 5) {
      this.insights.push({
        id: `insight_concentration_${new Date().getTime()}`,
        title: 'High Concentration Risk',
        description: `Over 70% of your recent activity involves ${topAsset[0]}. High concentration increases both potential reward and risk.`,
        confidence: 80 + Math.floor(Math.random() * 15),
        suggestedAction: 'Consider allocating a portion of future trades to other promising assets to reduce single-asset risk.',
        createdAt: new Date()
      });
    }
  }
  
  async getInsights(): Promise<TradingInsight[]> {
    // If no insights yet, analyze first
    if (this.insights.length === 0) {
      await this.analyzeTradeHistory();
    }
    return this.insights;
  }
}

export const aiAnalysisService = new AIAnalysisService();
export type { TradingInsight };