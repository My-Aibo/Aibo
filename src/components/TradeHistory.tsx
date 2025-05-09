// src/components/TradeHistory.tsx
import React, { useEffect, useState } from 'react';
import { Trade } from '../types';
import { tradeService } from '../services/tradeService';
import { useWallet } from '../contexts/WalletContext';

const TradeHistory: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, walletInfo } = useWallet();

  useEffect(() => {
    if (isConnected && walletInfo) {
      fetchTrades();
    }
  }, [isConnected, walletInfo]);

  const fetchTrades = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const tradesData = await tradeService.getTrades();
      setTrades(tradesData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trade history');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date instanceof Date ? date : new Date(date));
  };

  return (
    <div className="trade-history-container">
      <h2>Trading History</h2>
      
      {loading ? (
        <div className="loading">Loading trades...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : trades.length === 0 ? (
        <div className="no-trades">
          {isConnected ? 
            "No trades found for this wallet. You may need to make some SPL token swaps first." : 
            "Please connect your wallet to view your trading history."}
        </div>
      ) : (
        <div className="trades-list">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Total</th>
                <th>Exchange</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => (
                <tr key={trade.id} className={`trade-row ${trade.type}`}>
                  <td>{new Date(trade.timestamp).toLocaleString()}</td>
                  <td className={trade.type}>{trade.type.toUpperCase()}</td>
                  <td>{trade.cryptoAsset}</td>
                  <td>{trade.amount.toLocaleString()}</td>
                  <td>${trade.price.toFixed(6)}</td>
                  <td>${trade.totalValue.toFixed(2)}</td>
                  <td>{trade.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {tradeService.isUsingTestData() && (
            <div className="test-data-notice">
              Note: Showing test data. Connect a wallet with actual trading history for real data.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TradeHistory;