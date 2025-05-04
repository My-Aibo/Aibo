import { tradeAnalysisService } from './tradeAnalysisService';
import { WalletAnalysis } from './tradeAnalysisService';

class AIApiService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    // Hardcode the API key directly to avoid environment variable issues
    this.apiKey = 'b837a457fb97f2ff5d7bad89ca0d8d1d46790221c95c891b666c2d7b954fe08c';
    this.apiUrl = 'https://api.together.xyz/v1/chat/completions';
    this.model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free';
    
    console.log("AIApiService initialized with model:", this.model);
  }

  async generateResponse(
    userQuery: string, 
    walletAnalysis: WalletAnalysis
  ): Promise<string> {
    try {
      console.log(`[AIApiService] Processing query: "${userQuery}"`);
      
      // First try to detect if this is a token price query
      const tokenSymbol = this.detectTokenPriceQuery(userQuery);
      
      if (tokenSymbol) {
        console.log(`[AIApiService] Detected token price query for ${tokenSymbol}`);
        
        // Try to get token price using our service
        try {
          const tokenPrice = await tradeAnalysisService.getTokenPrice(tokenSymbol);
          
          if (tokenPrice) {
            console.log(`[AIApiService] Found token price for ${tokenSymbol}:`, tokenPrice);
            return this.formatTokenPriceResponse(tokenPrice);
          } else {
            console.log(`[AIApiService] No token price found for ${tokenSymbol}`);
            // If no price found, we'll fall back to AI
          }
        } catch (error) {
          console.error(`[AIApiService] Error getting token price:`, error);
          // Continue to AI if error occurs
        }
      }

      // If not a token price query or price lookup failed, use the AI API
      console.log(`[AIApiService] Using Together.ai API for response`);
      
      // Create messages array for the chat completion
      const messages = this.createMessages(userQuery, walletAnalysis);
      
      console.log("[AIApiService] Sending request to Together.ai API");
      
      // Make API call to Together.ai using fetch
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      console.log("[AIApiService] API Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AIApiService] Error response from Together.ai:', errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[AIApiService] API Response received, processing...");
      
      if (!data.choices || !data.choices.length) {
        throw new Error('Unexpected API response structure');
      }
      
      // Extract the response text
      const aiResponse = data.choices[0].message.content.trim();
      console.log("[AIApiService] AI response length:", aiResponse.length);
      
      // Ensure proper formatting
      if (!aiResponse.includes('#')) {
        return `## Trading Analysis\n\n${aiResponse}`;
      }
      
      return aiResponse;
    } catch (error) {
      console.error('[AIApiService] Error generating response:', error);
      return `## Error Processing Request\n\nI'm sorry, but I encountered an error while processing your request. Please try again later or rephrase your question.\n\nError details: ${error.message}`;
    }
  }

  // Helper method to detect token price queries
  private detectTokenPriceQuery(query: string): string | null {
    // Normalize and lowercase the query
    const normalizedQuery = query.toLowerCase().trim();
    console.log(`[AIApiService] Analyzing query: "${normalizedQuery}"`);
    
    // Check if it looks like a price query
    const isPriceQuery = 
      normalizedQuery.includes('price') || 
      normalizedQuery.includes('worth') || 
      normalizedQuery.includes('value') || 
      normalizedQuery.includes('cost') ||
      normalizedQuery.includes('how much is') ||
      normalizedQuery.includes('what is') && (
        normalizedQuery.includes(' at') || 
        normalizedQuery.includes(' worth') ||
        normalizedQuery.includes(' price')
      );
    
    if (!isPriceQuery) {
      console.log(`[AIApiService] Not a price query`);
      return null;
    }
    
    console.log(`[AIApiService] Detected price query, looking for token`);
    
    // Common token mapping
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
      'shib': 'SHIB'
    };
    
    // Check for direct token mentions
    for (const [key, symbol] of Object.entries(tokenMap)) {
      if (normalizedQuery.includes(key)) {
        console.log(`[AIApiService] Found token mention: ${key} => ${symbol}`);
        return symbol;
      }
    }
    
    // Try to extract token symbol using regex patterns
    // Pattern 1: Price of X, X price, etc.
    const pricePatterns = [
      /price of (\w+)/i,
      /(\w+) (?:price|value|worth)/i,
      /how much is (\w+)/i,
      /(\w+) cost/i
    ];
    
    for (const pattern of pricePatterns) {
      const match = normalizedQuery.match(pattern);
      if (match && match[1]) {
        const potentialToken = match[1].trim().toUpperCase();
        // Filter out common words that aren't tokens
        if (!['THE', 'A', 'AN', 'THIS', 'THAT', 'AND', 'OR', 'OF', 'ON'].includes(potentialToken) && 
            potentialToken.length >= 2 && 
            potentialToken.length <= 5) {
          console.log(`[AIApiService] Extracted token via regex: ${potentialToken}`);
          return potentialToken;
        }
      }
    }
    
    console.log(`[AIApiService] No token found in price query`);
    return null;
  }

  // Format token price response in a nice way
  private formatTokenPriceResponse(tokenPrice: any): string {
    try {
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
      }).format(tokenPrice.priceChange24h / 100);
      
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
      
      const changeEmoji = tokenPrice.priceChange24h >= 0 ? '📈' : '📉';
      
      return `
## ${tokenPrice.symbol} Price Analysis

**Current Price:** ${formattedPrice}
**24h Change:** ${formattedChange} ${changeEmoji}
**24h Volume:** ${formattedVolume}
**Market Cap:** ${formattedMarketCap}

This data is sourced from DexScreener and represents the most liquid ${tokenPrice.symbol} pair.

${tokenPrice.priceChange24h >= 0 
  ? `The price is up in the last 24 hours, showing positive momentum.` 
  : `The price is down in the last 24 hours, showing some bearish pressure.`}

For more detailed information and charts, you can use the token search feature above.

Would you like to know about another token or any specific aspect of ${tokenPrice.symbol}?
      `;
    } catch (error) {
      console.error('[AIApiService] Error formatting token price response:', error);
      return `## ${tokenPrice.symbol} Price\n\nThe current price is approximately $${tokenPrice.price.toFixed(4)}`;
    }
  }

  private createMessages(userQuery: string, walletAnalysis: WalletAnalysis): Array<{role: string, content: string}> {
    const systemPrompt = `You are Aibo Trading Advisor, a sophisticated AI financial advisor specialized in cryptocurrency trading analysis.

You analyze crypto trading patterns and provide personalized, actionable advice based on real wallet data.
Format your responses using Markdown with ## headers, ### subheadings, and **bold text** for emphasis.
Be precise, professional, and provide data-driven recommendations based on the user's trading history.`;

    const userPrompt = `Please analyze my trading data and answer this question: "${userQuery}"

My trading data:
- Overall Success Rate: ${walletAnalysis.overallSuccessRate}%
- Total Profit/Loss: $${walletAnalysis.totalProfitLoss}
- Most Profitable Token: ${walletAnalysis.mostProfitableToken}
- Least Profitable Token: ${walletAnalysis.leastProfitableToken}
- Average Hold Time: ${walletAnalysis.averageHoldTime}
- Trading Frequency: ${walletAnalysis.tradeFrequency}

Token details:
${walletAnalysis.tokenAnalyses.map(token => `
${token.symbol} (${token.name}):
- Total Trades: ${token.totalTrades}
- Profitable Trades: ${token.profitableTrades} (${token.successRate}% success)
- Total Profit/Loss: $${token.totalProfit}
- Average Hold Time: ${token.averageHoldTime}
- Best Trade: +$${token.bestTrade.profit} on ${new Date(token.bestTrade.date).toLocaleDateString()}
- Worst Trade: $${token.worstTrade.loss} on ${new Date(token.worstTrade.date).toLocaleDateString()}
`).join('\n')}`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
  }
}

export const aiApiService = new AIApiService();