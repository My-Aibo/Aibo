import React from 'react';
import './RichContentDisplay.css';

// Add proper type definition for the props
interface RichContentProps {
  content: {
    type: string;
    data: any;
  };
}

export const RichContentDisplay: React.FC<RichContentProps> = ({ content }) => {
  if (!content) return null;

  switch (content.type) {
    case 'walletDashboard':
      return (
        <div className="wallet-dashboard">
          <div className="dashboard-metrics">
            <div className="metric">
              <span className="metric-label">Success Rate</span>
              <span className="metric-value">{content.data.analysis?.overallSuccessRate?.toFixed(2)}%</span>
            </div>
            <div className="metric">
              <span className="metric-label">Total P/L</span>
              <span className={`metric-value ${(content.data.analysis?.totalProfitLoss || 0) >= 0 ? 'positive' : 'negative'}`}>
                {(content.data.analysis?.totalProfitLoss || 0) >= 0 ? '+' : '-'}$
                {Math.abs(content.data.analysis?.totalProfitLoss || 0).toFixed(2)}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Best Token</span>
              <span className="metric-value">{content.data.analysis?.mostProfitableToken || 'N/A'}</span>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export default RichContentDisplay;