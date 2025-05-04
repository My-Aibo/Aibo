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
  
  // Handle wallet connection state
  if (!isConnected) {
    return (
      <div className="transaction-history">
        <h2>Transaction History</h2>
        <div className="connect-wallet-prompt">
          <div className="prompt-icon">🔗</div>
          <p>Please connect your wallet using the button in the upper right corner to view your transaction history.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="transaction-history">
        <h2>Transaction History</h2>
        <div className="loading">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading transactions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transaction-history">
        <h2>Transaction History</h2>
        <div className="error-container">
          <div className="error-message">{error}</div>
          <p>
            We're experiencing difficulties connecting to the Solana network.
            This could be due to:
          </p>
          <ul>
            <li>High network traffic</li>
            <li>Rate limits on public RPC endpoints</li>
            <li>Temporary network issues</li>
          </ul>
          <button onClick={fetchTrades}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <h2>Transaction History</h2>
      <div className="network-info">
        Currently connected to: <span className="network-name">{walletInfo?.network || 'Unknown'}</span>
      </div>
      
      {trades.length === 0 ? (
        <div className="empty-state">
          <p>No transactions found for this wallet.</p>
          <p>This could be because:</p>
          <ul>
            <li>This is a new wallet with no transaction history</li>
            <li>Your wallet hasn't made any transactions on {walletInfo?.network}</li>
            <li>The RPC endpoint has limited transaction history</li>
          </ul>
          
          {(walletInfo?.network || '').includes('Devnet') && (
            <div className="devnet-info">
              <p>You're currently on Devnet. To get some test SOL:</p>
              <ol>
                <li>Open your Phantom wallet</li>
                <li>Click on your SOL balance</li>
                <li>Select "Receive Airdrop" (in Developer Settings)</li>
                <li>Make a test transaction</li>
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="trades-list">
          {trades.map((trade) => (
            <div 
              key={trade.id} 
              className="transaction"
            >
              <span className={`transaction-type ${trade.type.toLowerCase()}`}>
                {trade.type.toUpperCase()}
              </span>
              <span className="transaction-date">{formatDate(trade.timestamp)}</span>
              
              <div className="transaction-details">
                <div>
                  <div className="transaction-detail-label">Asset</div>
                  <div className="transaction-detail-value">{trade.cryptoAsset}</div>
                </div>
                
                <div>
                  <div className="transaction-detail-label">Amount</div>
                  <div className="transaction-detail-value">{trade.amount.toFixed(4)}</div>
                </div>
                
                <div>
                  <div className="transaction-detail-label">Price</div>
                  <div className="transaction-detail-value">${trade.price.toFixed(2)}</div>
                </div>
                
                <div>
                  <div className="transaction-detail-label">Total</div>
                  <div className="transaction-detail-value">${trade.totalValue.toFixed(2)}</div>
                </div>
                
                <div>
                  <div className="transaction-detail-label">Exchange</div>
                  <div className="transaction-detail-value">{trade.exchange}</div>
                </div>
              </div>
              
              <div className="transaction-id">{trade.id.substring(0, 12)}...</div>
              
              {trade.notes && (
                <div className="devnet-tag">{trade.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TradeHistory;