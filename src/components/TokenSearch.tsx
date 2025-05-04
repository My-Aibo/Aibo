import React, { useState, useEffect, useCallback } from 'react';
import './TokenSearch.css';

const TokenSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showChart, setShowChart] = useState<boolean>(false);
  const [tokenData, setTokenData] = useState<any>(null);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowChart(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Close modal when clicking outside
  const closeModal = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLDivElement).className === 'chart-modal-overlay') {
      setShowChart(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      setError('Please enter a token name, symbol, or contract address');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log(`Searching for token: ${searchQuery}`);
      
      // For token symbol or name search
      const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(searchQuery)}`);
      
      console.log('DexScreener response status:', response.status);
      
      const data = await response.json();
      console.log('DexScreener data received:', data);
      
      if (!data.pairs || data.pairs.length === 0) {
        setError('No tokens found matching your search');
        setLoading(false);
        return;
      }

      // Take the first result (most relevant/liquid)
      const bestPair = data.pairs[0];
      console.log('Best pair found:', bestPair);
      
      setTokenData(bestPair);
      setShowChart(true);
      
    } catch (err) {
      console.error('Search error:', err);
      setError('An error occurred while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="token-search">
      <h3>Search Tokens</h3>
      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Enter token name or symbol (e.g., BTC, ETH, SOL)"
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

      {showChart && tokenData && (
        <div className="chart-modal-overlay" onClick={closeModal}>
          <div className="chart-modal" onClick={e => e.stopPropagation()}>
            <div className="chart-header">
              <h3>{tokenData.baseToken.symbol}/{tokenData.quoteToken.symbol} Chart</h3>
              <button className="close-button" onClick={() => setShowChart(false)}>×</button>
            </div>
            <div className="chart-container">
              <iframe 
                src={`https://dexscreener.com/${tokenData.chainId}/${tokenData.pairAddress}`}
                title="DexScreener Chart"
                className="dexscreener-iframe"
                loading="lazy"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>
        </div>
      )}

      {/* Display token info outside of modal for debugging */}
      {tokenData && !showChart && (
        <div className="token-info" style={{marginTop: '20px', padding: '15px', backgroundColor: 'rgba(30, 30, 32, 0.7)', borderRadius: '8px'}}>
          <h4>Token Data (Debug Info)</h4>
          <p>Symbol: {tokenData.baseToken.symbol}</p>
          <p>Price: ${parseFloat(tokenData.priceUsd).toFixed(6)}</p>
          <p>Chain: {tokenData.chainId}</p>
          <p>Pair Address: {tokenData.pairAddress}</p>
        </div>
      )}
    </div>
  );
};

export default TokenSearch;