import axios from 'axios';

// Interfaces for DexScreener API responses
export interface Token {
  address: string;
  name: string;
  symbol: string;
}

export interface Pair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: Token;
  quoteToken: Token;
  priceNative: string;
  priceUsd: string;
  txns?: {
    [timeframe: string]: {
      buys: number;
      sells: number;
    };
  };
  volume?: {
    [timeframe: string]: number;
  };
  priceChange?: {
    [timeframe: string]: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: Pair[];
}

export interface TokenPrice {
  symbol: string;
  name: string;
  price: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  liquidity?: number;
  chainId: string;
  pairAddress: string;
  timestamp: number;
}

export class EnhancedPriceService {
  // Fetch price for a specific token by symbol
  static async getTokenPrice(symbol: string): Promise<TokenPrice> {
    try {
      // Search for the token by symbol
      const response = await axios.get<DexScreenerResponse>(
        `https://api.dexscreener.com/latest/dex/search?q=${symbol}/USDC`
      );

      if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
        throw new Error(`No price data found for ${symbol}`);
      }

      // Sort by liquidity and get the most liquid pair
      const sortedPairs = response.data.pairs
        .filter(pair => 
          (pair.baseToken.symbol.toUpperCase() === symbol.toUpperCase() || 
           pair.quoteToken.symbol.toUpperCase() === symbol.toUpperCase()))
        .sort((a, b) => {
          if (!a.liquidity || !b.liquidity) return 0;
          return b.liquidity.usd - a.liquidity.usd;
        });

      if (sortedPairs.length === 0) {
        throw new Error(`No matching pairs found for ${symbol}`);
      }

      const bestPair = sortedPairs[0];
      
      // Determine which token in the pair is our target
      const isBase = bestPair.baseToken.symbol.toUpperCase() === symbol.toUpperCase();
      const targetToken = isBase ? bestPair.baseToken : bestPair.quoteToken;
      
      return {
        symbol: targetToken.symbol,
        name: targetToken.name,
        price: parseFloat(bestPair.priceUsd),
        priceChange24h: bestPair.priceChange?.['24h'] || 0,
        volume24h: bestPair.volume?.['24h'] || 0,
        marketCap: bestPair.marketCap,
        liquidity: bestPair.liquidity?.usd,
        chainId: bestPair.chainId,
        pairAddress: bestPair.pairAddress,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching ${symbol} price:`, error);
      throw error;
    }
  }

  // Fetch prices for multiple tokens
  static async getMultipleTokenPrices(symbols: string[]): Promise<Map<string, TokenPrice>> {
    const result = new Map<string, TokenPrice>();
    const promises = symbols.map(symbol => this.getTokenPrice(symbol));
    
    try {
      const results = await Promise.allSettled(promises);
      
      results.forEach((res, index) => {
        if (res.status === 'fulfilled') {
          result.set(symbols[index].toUpperCase(), res.value);
        } else {
          console.error(`Failed to fetch ${symbols[index]}:`, res.reason);
        }
      });
      
      return result;
    } catch (error) {
      console.error('Error fetching multiple token prices:', error);
      throw error;
    }
  }

  // Get detailed information for a specific pair
  static async getPairInfo(chainId: string, pairAddress: string): Promise<Pair> {
    try {
      const response = await axios.get<DexScreenerResponse>(
        `https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairAddress}`
      );

      if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
        throw new Error('No data found for specified pair');
      }

      return response.data.pairs[0];
    } catch (error) {
      console.error('Error fetching pair info:', error);
      throw error;
    }
  }

  // Search tokens by name or symbol
  static async searchTokens(query: string): Promise<TokenPrice[]> {
    if (!query || query.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    try {
      const response = await axios.get<DexScreenerResponse>(
        `https://api.dexscreener.com/latest/dex/search?q=${query}`
      );

      if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
        return [];
      }

      // Process the results to get unique tokens
      const uniqueTokens = new Map<string, TokenPrice>();
      
      response.data.pairs.forEach(pair => {
        // Process both base and quote tokens
        const processToken = (token: Token, isBase: boolean) => {
          if (!uniqueTokens.has(token.address)) {
            uniqueTokens.set(token.address, {
              symbol: token.symbol,
              name: token.name,
              price: parseFloat(pair.priceUsd),
              priceChange24h: pair.priceChange?.['24h'] || 0,
              volume24h: pair.volume?.['24h'] || 0,
              marketCap: pair.marketCap,
              liquidity: pair.liquidity?.usd,
              chainId: pair.chainId,
              pairAddress: pair.pairAddress,
              timestamp: Date.now()
            });
          }
        };
        
        processToken(pair.baseToken, true);
        processToken(pair.quoteToken, false);
      });
      
      return Array.from(uniqueTokens.values());
    } catch (error) {
      console.error('Error searching tokens:', error);
      throw error;
    }
  }
}