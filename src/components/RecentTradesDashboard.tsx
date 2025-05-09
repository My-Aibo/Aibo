import React from 'react';
import { WalletAnalysis } from '../services/tradeAnalysisService';
import './RecentTradesDashboard.css';

interface RecentTradesDashboardProps {
  analysis: WalletAnalysis;
  balance: { sol: number; usdValue: number } | null;
}

const RecentTradesDashboard: React.FC<RecentTradesDashboardProps> = ({ analysis, balance }) => {  // Sort token analyses by profit
  const sortedTokens = [...analysis.tokenAnalyses].sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0));
  return (
    <div className="dashboard-container">
      <h3 className="dashboard-title">Recent Trading Analysis</h3>
      
      <div className="dashboard-section">
        <h4 className="section-title">Performance Overview</h4>
        <div className="stats-section">
          <div className="stat-item">
            <div className="stat-label">Success Rate</div>
            <div className="stat-value">
              {analysis.overallSuccessRate.toFixed(2)}%
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">Profit/Loss</div>
            <div className={`stat-value ${analysis.totalProfitLoss >= 0 ? 'positive' : 'negative'}`}>
              {analysis.totalProfitLoss >= 0 ? '+' : ''}${analysis.totalProfitLoss.toFixed(2)}
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">Avg. Hold Time</div>
            <div className="stat-value">{analysis.averageHoldTime}</div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">Trading Frequency</div>
            <div className="stat-value">{analysis.tradeFrequency}</div>
          </div>
        </div>
      </div>
      
      <div className="dashboard-section">
        <h4 className="section-title">Top Tokens</h4>
        <div className="token-list">          {sortedTokens.slice(0, 5).map((token, index) => (
            <div key={token.symbol || token.totalTrades.toString()} className="token-list-item">
              <div className="token-rank">{index + 1}</div>
              <div className="token-symbol">{token.symbol || ''}</div>
              <div className="token-trades">{token.totalTrades} trades</div>
              <div className={`token-profit ${(token.totalProfit || 0) >= 0 ? 'positive' : 'negative'}`}>
                {(token.totalProfit || 0) >= 0 ? '+' : ''}${(token.totalProfit || 0).toFixed(2)}
              </div>
            </div>
          ))}
          
          {sortedTokens.length === 0 && (
            <div className="empty-tokens">No token data available</div>
          )}
        </div>
      </div>
      
      <div className="dashboard-section">
        <h4 className="section-title">Recommendations</h4>
        <ul className="recommendations-list">
          {analysis.recommendations.map((rec, index) => (
            <li key={index} className="recommendation-item">{rec}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RecentTradesDashboard;