import { TokenPrice } from '../types';

export class EnhancedPriceService {
  async getTokenPrice(tokenSymbol: string): Promise<TokenPrice | null> {
    try {
      console.log(`[EnhancedPriceService] Searching for token: ${tokenSymbol}`);
      
      // Normalize the token input
      const normalizedInput = tokenSymbol.trim();
      const isAddress = normalizedInput.length > 30; // Basic check if it looks like an address
      
      let searchResults = null;
      
      // Try multiple search strategies
      const searchStrategies = [
        // Strategy 1: Direct search with the input
        async () => {
          console.log(`[EnhancedPriceService] Trying direct search`);
          const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(normalizedInput)}`);
          if (!response.ok) return null;
          return await response.json();
        },
        
        // Strategy 2: If it looks like an address, try token endpoint
        async () => {
          if (!isAddress) return null;
          console.log(`[EnhancedPriceService] Trying token address lookup`);
          const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(normalizedInput)}`);
          if (!response.ok) return null;
          return await response.json();
        },
        
        // Strategy 3: Try lowercase search (sometimes helps with case sensitivity)
        async () => {
          console.log(`[EnhancedPriceService] Trying lowercase search`);
          const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(normalizedInput.toLowerCase())}`);
          if (!response.ok) return null;
          return await response.json();
        }
      ];
      
      // Execute each strategy until we get results
      for (const strategy of searchStrategies) {
        const result = await strategy();
        if (result && result.pairs && result.pairs.length > 0) {
          searchResults = result;
          break;
        }
      }
      
      if (!searchResults || !searchResults.pairs || searchResults.pairs.length === 0) {
        console.log(`[EnhancedPriceService] No pairs found for ${tokenSymbol}`);
        return null;
      }
      
      // Filter out pairs with extremely low liquidity or volume
      const viablePairs = searchResults.pairs.filter(pair => {
        const liquidityUsd = pair.liquidity?.usd || 0;
        const volume24h = pair.volume?.h24 || 0;
        
        // Accept pairs with reasonable liquidity or recent volume
        return liquidityUsd > 500 || volume24h > 100; 
      });
      
      if (viablePairs.length === 0) {
        console.log(`[EnhancedPriceService] Found pairs but none have sufficient liquidity/volume`);
        
        // Fall back to the highest liquidity pair regardless of threshold
        const sortedByLiquidity = [...searchResults.pairs].sort((a, b) => {
          const liquidityA = a.liquidity?.usd || 0;
          const liquidityB = b.liquidity?.usd || 0;
          return liquidityB - liquidityA;
        });
        
        if (sortedByLiquidity.length > 0) {
          console.log(`[EnhancedPriceService] Using best available pair with ${sortedByLiquidity[0].liquidity?.usd || 0} USD liquidity`);
          const bestPair = sortedByLiquidity[0];
          return this.createTokenPriceFromPair(bestPair, normalizedInput);
        }
        
        return null;
      }
      
      // Sort viable pairs by liquidity (primary) and volume (secondary)
      const sortedPairs = [...viablePairs].sort((a, b) => {
        const liquidityA = a.liquidity?.usd || 0;
        const liquidityB = b.liquidity?.usd || 0;
        
        // If liquidity is similar, use volume as a tiebreaker
        if (Math.abs(liquidityA - liquidityB) < 1000) {
          const volumeA = a.volume?.h24 || 0;
          const volumeB = b.volume?.h24 || 0;
          return volumeB - volumeA;
        }
        
        return liquidityB - liquidityA;
      });
      
      const bestPair = sortedPairs[0];
      console.log(`[EnhancedPriceService] Selected best pair:`, bestPair);
      
      return this.createTokenPriceFromPair(bestPair, normalizedInput);
      
    } catch (error) {
      console.error(`[EnhancedPriceService] Error getting token price:`, error);
      return null;
    }
  }
  
  private createTokenPriceFromPair(pair: any, originalQuery: string): TokenPrice | null {
    try {
      // Determine if we're looking for the base or quote token
      const isBaseToken = this.isSearchingForBaseToken(pair, originalQuery);
      
      // Get the appropriate token data
      const token = isBaseToken ? pair.baseToken : pair.quoteToken;
      
      if (!token) {
        console.error(`[EnhancedPriceService] Could not find target token in pair`);
        return null;
      }
      
      // Calculate price
      const price = isBaseToken 
        ? parseFloat(pair.priceUsd || '0') 
        : (pair.priceUsd ? 1 / parseFloat(pair.priceUsd) : 0);
      
      return {
        symbol: token.symbol,
        name: token.name || token.symbol,
        price: price,
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        marketCap: pair.fdv || 0,
        liquidity: pair.liquidity?.usd || 0,
        chainId: pair.chainId,
        pairAddress: pair.pairAddress,
        contractAddress: token.address
      };
    } catch (error) {
      console.error(`[EnhancedPriceService] Error creating token price object:`, error);
      return null;
    }
  }
  
  private isSearchingForBaseToken(pair: any, query: string): boolean {
    // Check if query matches a token address
    if (query.length > 30) {
      const baseAddress = (pair.baseToken?.address || '').toLowerCase();
      const quoteAddress = (pair.quoteToken?.address || '').toLowerCase();
      const normalizedQuery = query.toLowerCase();
      
      if (baseAddress === normalizedQuery) return true;
      if (quoteAddress === normalizedQuery) return false;
    }
    
    // Otherwise check symbol match
    const baseSymbol = (pair.baseToken?.symbol || '').toLowerCase();
    const quoteSymbol = (pair.quoteToken?.symbol || '').toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Check for exact match
    if (baseSymbol === queryLower) return true;
    if (quoteSymbol === queryLower) return false;
    
    // Check for partial match
    if (baseSymbol.includes(queryLower)) return true;
    if (quoteSymbol.includes(queryLower)) return false;
    
    // Default to base token if we can't determine
    return true;
  }
  
  // Helper method to find small market cap tokens
  async findSmallCapTokens(maxMarketCap: number = 100000): Promise<TokenPrice[]> {
    try {
      // This would require additional implementation to scan for small market cap tokens
      // DexScreener doesn't have a direct API for this, so we'd need to implement a custom solution
      return [];
    } catch (error) {
      console.error('Error finding small cap tokens:', error);
      return [];
    }
  }
}