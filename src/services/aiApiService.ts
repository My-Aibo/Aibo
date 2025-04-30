import { WalletAnalysis } from './tradeAnalysisService';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

class AIApiService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    // Load API key and other configurations from environment variables
    this.apiKey = process.env.TOGETHER_API_KEY || 'b837a457fb97f2ff5d7bad89ca0d8d1d46790221c95c891b666c2d7b954fe08c';
    this.apiUrl = process.env.TOGETHER_API_URL || 'https://api.together.xyz/v1/chat/completions';
    this.model = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free';ok

    if (!this.apiKey) {
      console.error("API key is missing. Please set TOGETHER_API_KEY in your environment variables.");
      throw new Error("API key is missing");
    }
    
    console.log("AIApiService initialized with model:", this.model);
  }

  async generateResponse(
    userQuery: string, 
    walletAnalysis: WalletAnalysis
  ): Promise<string> {
    try {
      const messages = this.createMessages(userQuery, walletAnalysis);

      console.log("Sending request to Together.ai API");

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

      console.log("API Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response from Together.ai:', errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("API Response received, processing...");

      if (!data.choices || !data.choices.length) {
        throw new Error('Unexpected API response structure');
      }

      const aiResponse = data.choices[0].message.content.trim();
      console.log("AI response length:", aiResponse.length);

      if (!aiResponse.includes('#')) {
        return `## Trading Analysis\n\n${aiResponse}`;
      }

      return aiResponse;
    } catch (error) {
      console.error('Error calling Together.ai API:', error);
      throw error;
    }
  }

  private createMessages(userQuery: string, walletAnalysis: WalletAnalysis): Array<{ role: string, content: string }> {
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