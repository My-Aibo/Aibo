import React, { useState, useEffect, useCallback } from 'react';
import './TokenSearch.css';
import { tradeAnalysisService } from '../services/tradeAnalysisService';

// Birdeye API key
const BIRDEYE_API_KEY = '1cd74346f55f428ab24c8821e1124ec1';

const TokenSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState<boolean>(false);
  const [tokenData, setTokenData] = useState<any>(null);
  const [debug, setDebug] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  
  // Store full token data for chatbot integration
  const [lastFoundToken, setLastFoundToken] = useState<any>(null);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowChart(false);
        setShowSearchResults(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Close modals when clicking outside
  const closeModal = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLDivElement).className === 'chart-modal-overlay') {
      setShowChart(false);
    } else if ((e.target as HTMLDivElement).className === 'search-results-overlay') {
      setShowSearchResults(false);
    }
  }, []);

  // Check if input is a contract address (Solana public key)
  const isSolanaAddress = (value: string): boolean => {
    // Basic check for Solana address format
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  };

  // Handle search submission
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      setError('Please enter a token name, symbol, or contract address');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSearchResults([]);
      
      const query = searchQuery.trim();
      console.log(`TokenSearch: Searching for token: ${query}`);
      
      // Handle known token symbols
      const knownTokens: Record<string, string> = {
        'sol': 'So11111111111111111111111111111111111111112',
        'solana': 'So11111111111111111111111111111111111111112',
        'btc': 'qfnrshAQb49EFbLMaUNPzEkQGokkJuHJxhX85w6aKWz',
        'bitcoin': 'qfnrshAQb49EFbLMaUNPzEkQGokkJuHJxhX85w6aKWz',
        'eth': 'FeGn77dhg1KXRRFeSwwMiykZnZPw5JXW6naf2aQgZDQf',
        'ethereum': 'FeGn77dhg1KXRRFeSwwMiykZnZPw5JXW6naf2aQgZDQf',
        'usdc': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      };
      
      // Check if the query is a known token
      const lowerQuery = query.toLowerCase();
      let address = knownTokens[lowerQuery] || query;
      
      // Different search strategies based on input type
      if (isSolanaAddress(query)) {
        // Search directly by token address
        await searchByAddress(query);
      } else if (knownTokens[lowerQuery]) {
        // Search using the known token address
        await searchByAddress(knownTokens[lowerQuery]);
      } else {
        // Search by name/symbol
        await searchByName(query);
      }
      
    } catch (err) {
      console.error('TokenSearch: Search error:', err);
      setError('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Search tokens by address using Birdeye API
  const searchByAddress = async (address: string) => {
    console.log(`TokenSearch: Searching by address: ${address}`);
    
    try {
      // Fetch token info
      const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${address}`, {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Birdeye API Error (${response.status}):`, errorText);
        throw new Error(`Birdeye API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Birdeye token data:', data);
      
      if (!data.success || !data.data) {
        setError('No token found with this address.');
        return;
      }
      
      // Format token data
      const token = data.data;
      
      // Fetch additional token metadata for name, symbol, etc.
      const metadataResponse = await fetch(`https://public-api.birdeye.so/defi/token_metadata?address=${address}`, {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY
        }
      });
      
      let tokenMetadata = null;
      if (metadataResponse.ok) {
        const metaResult = await metadataResponse.json();
        if (metaResult.success && metaResult.data) {
          tokenMetadata = metaResult.data;
          console.log('Birdeye token metadata:', tokenMetadata);
        }
      }
      
      // Fetch pool data
      const poolsResponse = await fetch(`https://public-api.birdeye.so/defi/pools?address=${address}`, {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY
        }
      });
      
      let poolsData = null;
      if (poolsResponse.ok) {
        const poolsResult = await poolsResponse.json();
        if (poolsResult.success && poolsResult.data && poolsResult.data.items && poolsResult.data.items.length > 0) {
          poolsData = poolsResult.data.items[0];
          console.log('Birdeye pool data:', poolsData);
        }
      }
      
      // Create a more detailed token data object
      const fullTokenData = {
        address: address,
        name: tokenMetadata?.name || token.name || 'Unknown',
        symbol: tokenMetadata?.symbol || token.symbol || 'UNKNOWN',
        price: token.value || 0,
        priceChange24h: token.change24h || 0,
        marketCap: token.marketCap || 0,
        fullyDilutedValuation: token.fdv || 0,
        volume24h: poolsData?.volume24h || 0,
        liquidity: poolsData?.liquidity || 0,
        supply: {
          total: tokenMetadata?.supply?.total || 0,
          circulating: tokenMetadata?.supply?.circulating || 0
        },
        holders: token.holders || 0,
        poolsCount: token.poolsCount || 0,
        transactions: {
          count24h: token.txns?.h24 || 0,
          buys24h: token.txns?.h24Buys || 0,
          sells24h: token.txns?.h24Sells || 0,
        },
        logoUrl: tokenMetadata?.logoURI || null,
        description: tokenMetadata?.description || null,
        website: tokenMetadata?.website || null,
        twitter: tokenMetadata?.twitter || null,
        discord: tokenMetadata?.discord || null,
        telegram: tokenMetadata?.telegram || null,
      };
      
      // Store full data for chatbot analysis
      setLastFoundToken(fullTokenData);
      
      // Create a formatted token data object for display
      const formattedTokenData = {
        baseToken: {
          address: address,
          name: fullTokenData.name,
          symbol: fullTokenData.symbol,
        },
        quoteToken: {
          address: poolsData?.pairedMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Default to USDC if no pool
          name: poolsData?.pairedName || 'USD Coin',
          symbol: poolsData?.pairedSymbol || 'USDC',
        },
        priceUsd: fullTokenData.price,
        priceChange: {
          h24: fullTokenData.priceChange24h,
        },
        liquidity: {
          usd: fullTokenData.liquidity,
        },
        chainId: 'solana',
        dexId: poolsData?.source || 'Unknown DEX',
        volume: {
          h24: fullTokenData.volume24h,
        },
        marketCap: fullTokenData.marketCap,
        fdv: fullTokenData.fullyDilutedValuation,
        mintAddress: address,
        logoUrl: fullTokenData.logoUrl,
        // Add a special field to indicate this is from Birdeye
        isBirdeyeData: true,
      };
      
      setTokenData(formattedTokenData);
      setShowChart(true);
      
    } catch (error) {
      console.error('Error fetching token data from Birdeye:', error);
      setError('Failed to fetch token data. Please try another token or address.');
    }
  };

  // Search tokens by name or symbol
  const searchByName = async (query: string) => {
    console.log(`TokenSearch: Searching by name/symbol: ${query}`);
    
    try {
      const response = await fetch(`https://public-api.birdeye.so/defi/tokens_list?sort_by=v24hUSD&sort_type=desc&offset=0&limit=50&search_key=${encodeURIComponent(query)}`, {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Birdeye API Error (${response.status}):`, errorText);
        throw new Error(`Birdeye API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Birdeye search results:', data);
      
      if (!data.success || !data.data || !data.data.tokens || data.data.tokens.length === 0) {
        setError(`No tokens found matching "${query}"`);
        return;
      }
      
      // Format search results
      const tokens = data.data.tokens;
      
      if (tokens.length === 1) {
        // If only one result, select it directly
        await searchByAddress(tokens[0].address);
      } else {
        // Format results for the search results UI
        const formattedResults = tokens.map(token => ({
          baseToken: {
            address: token.address,
            name: token.name || 'Unknown',
            symbol: token.symbol || 'UNKNOWN',
          },
          quoteToken: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Default to USDC
            name: 'USD Coin',
            symbol: 'USDC',
          },
          priceUsd: token.price || 0,
          priceChange: {
            h24: token.change24h || 0,
          },
          liquidity: {
            usd: token.liquidity || 0,
          },
          chainId: 'solana',
          volume: {
            h24: token.volume24h || 0,
          },
          marketCap: token.marketCap || 0,
          fdv: token.fdv || 0,
          mintAddress: token.address,
          // Special fields for the UI
          logoUrl: token.logoURI,
          isBirdeyeData: true,
        }));
        
        setSearchResults(formattedResults);
        setShowSearchResults(true);
      }
      
    } catch (error) {
      console.error('Error searching tokens by name/symbol:', error);
      setError('Failed to search for tokens. Please try again.');
    }
  };

  // Select a token from search results
  const selectToken = (token: any) => {
    // For Birdeye data, we may need to fetch more details
    if (token.isBirdeyeData && token.mintAddress) {
      searchByAddress(token.mintAddress);
    } else {
      setTokenData(token);
      setShowSearchResults(false);
      setShowChart(true);
    }
  };

  // Share token info with chatbot for analysis
  const analyzeTokenWithChatbot = async () => {
    if (!lastFoundToken) return;

    try {
      // Access the AI Advisor's chat input element and submit button
      const chatInput = document.querySelector('.ai-advisor .chat-input textarea');
      const submitButton = document.querySelector('.ai-advisor .send-button');

      if (chatInput && submitButton) {
        // Set the input value to request token analysis
        (chatInput as HTMLTextAreaElement).value = `Analyze this token: ${lastFoundToken.symbol} (${lastFoundToken.address})`;
        
        // Dispatch events to simulate user input
        const inputEvent = new Event('input', { bubbles: true });
        chatInput.dispatchEvent(inputEvent);
        
        // Trigger click event on submit button
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        submitButton.dispatchEvent(clickEvent);
      } else {
        console.error('Could not find chat input or submit button');
      }
    } catch (error) {
      console.error('Error sending token to chatbot:', error);
    }
  };

  // Format price with appropriate precision
  const formatPrice = (price: number | string): string => {
    if (typeof price === 'string') {
      price = parseFloat(price);
    }
    
    if (isNaN(price) || price === 0) return '$0.00';
    
    // Format based on price magnitude
    if (price < 0.000001) return '$' + price.toExponential(4);
    if (price < 0.0001) return '$' + price.toFixed(8);
    if (price < 0.01) return '$' + price.toFixed(6);
    if (price < 1) return '$' + price.toFixed(4);
    if (price < 1000) return '$' + price.toFixed(2);
    
    return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Format liquidity
  const formatLiquidity = (liquidity: number | undefined): string => {
    if (!liquidity) return '$0';
    
    if (liquidity >= 1000000) return `$${(liquidity / 1000000).toFixed(2)}M`;
    if (liquidity >= 1000) return `$${(liquidity / 1000).toFixed(2)}K`;
    
    return `$${liquidity.toFixed(2)}`;
  };

  // Get token address for display
  const shortenAddress = (address: string): string => {
    if (!address || address.length < 10) return address || 'N/A';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="token-search">
      <h3>
        Search Tokens
        <button 
          onClick={() => setDebug(!debug)} 
          className="debug-button"
        >
          {debug ? 'Hide Debug' : 'Debug'}
        </button>
      </h3>
      
      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter token name, symbol, or Solana address"
            autoComplete="off"
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </form>

      {/* Search Results Modal */}
      {showSearchResults && searchResults.length > 0 && (
        <div className="search-results-overlay" onClick={closeModal}>
          <div className="search-results-modal">
            <div className="search-results-header">
              <h3>Search Results</h3>
              <button className="close-button" onClick={() => setShowSearchResults(false)}>×</button>
            </div>
            <div className="search-results-list">
              {searchResults.map((token, index) => (
                <div 
                  key={`${token.baseToken?.address || ''}-${index}`}
                  className="search-result-item"
                  onClick={() => selectToken(token)}
                >
                  <div className="result-token-info">
                    {token.logoUrl && (
                      <img 
                        src={token.logoUrl} 
                        alt={token.baseToken?.symbol} 
                        className="result-token-image"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="result-token-details">
                      <span className="result-token-symbol">{token.baseToken?.symbol}</span>
                      <span className="result-token-name">{token.baseToken?.name}</span>
                      <span className="result-token-address" title={token.mintAddress || token.baseToken?.address}>
                        {shortenAddress(token.mintAddress || token.baseToken?.address)}
                      </span>
                    </div>
                  </div>
                  <div className="result-token-stats">
                    <span className="result-token-price">
                      {formatPrice(token.priceUsd)}
                    </span>
                    <span className={`result-token-change ${
                      (token.priceChange?.h24 || 0) >= 0 ? 'positive' : 'negative'
                    }`}>
                      {(token.priceChange?.h24 || 0).toFixed(2)}%
                    </span>
                    <span className="result-token-liquidity">
                      {formatLiquidity(token.liquidity?.usd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chart Modal */}
      {showChart && tokenData && (
        <div className="chart-modal-overlay" onClick={closeModal}>
          <div className="chart-modal">
            <div className="chart-header">
              <h3>
                {tokenData.logoUrl && (
                  <img 
                    src={tokenData.logoUrl} 
                    alt={tokenData.baseToken?.symbol} 
                    className="token-logo-header"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                {tokenData.baseToken?.symbol} ({tokenData.baseToken?.name})
              </h3>
              <div className="chart-header-actions">
                <button 
                  className="analyze-button" 
                  onClick={analyzeTokenWithChatbot}
                  title="Send to AI Advisor for analysis"
                >
                  Analyze
                </button>
                <button className="close-button" onClick={() => setShowChart(false)}>×</button>
              </div>
            </div>
            <div className="token-info-summary">
              <div><strong>Price:</strong> {formatPrice(tokenData.priceUsd)}</div>
              <div className={`price-change ${(tokenData.priceChange?.h24 || 0) >= 0 ? 'positive' : 'negative'}`}>
                <strong>24h Change:</strong> {(tokenData.priceChange?.h24 || 0).toFixed(2)}%
              </div>
              <div><strong>Market Cap:</strong> {formatLiquidity(tokenData.marketCap)}</div>
              <div><strong>FDV:</strong> {formatLiquidity(tokenData.fdv)}</div>
              <div><strong>24h Volume:</strong> {formatLiquidity(tokenData.volume?.h24)}</div>
              <div className="token-address-info">
                <strong>Address:</strong> 
                <span 
                  title={tokenData.mintAddress || tokenData.baseToken?.address} 
                  className="token-address"
                >
                  {tokenData.mintAddress || tokenData.baseToken?.address}
                </span>
              </div>
            </div>
            <div className="chart-container">
              {/* Use Birdeye's chart */}
              <iframe 
                src={`https://birdeye.so/token/${tokenData.mintAddress || tokenData.baseToken?.address}?chain=solana&embed=1`}
                title="Birdeye Chart"
                className="birdeye-iframe"
                loading="lazy"
                referrerPolicy="no-referrer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          </div>
        </div>
      )}

      {/* Debug information */}
      {debug && (
        <div className="debug-section">
          <h4>Debug Info</h4>
          {lastFoundToken && (
            <>
              <h5>Last Found Token (Full Data):</h5>
              <pre>{JSON.stringify(lastFoundToken, null, 2)}</pre>
            </>
          )}
          {tokenData && (
            <>
              <h5>Current Token Display Data:</h5>
              <pre>{JSON.stringify(tokenData, null, 2)}</pre>
            </>
          )}
          {searchResults.length > 0 && (
            <>
              <h5>Search Results ({searchResults.length}):</h5>
              <pre>{JSON.stringify(searchResults.slice(0, 1), null, 2)}</pre>
              {searchResults.length > 1 && <div>... and {searchResults.length - 1} more results</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenSearch;