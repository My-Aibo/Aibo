import React from 'react';
import WalletConnect from './components/WalletConnect';
import TradeHistory from './components/TradeHistory';
import AIAdvisor from './components/AIAdvisor';
import TokenSearch from './components/TokenSearch';
import { WalletProvider } from './contexts/WalletContext';
import WalletButton from './components/WalletButton';
import './App.css';

const App: React.FC = () => {
  return (
    <WalletProvider>
      <div className="app">
        <header className="app-header">
          <div className="container">
            <div className="header-content">
              <div className="aibo-logo-emoji">🤖</div>
              <div className="header-text">
                <h1>Aibo</h1>
                <p>Your personal crypto memory assistant</p>
              </div>
              <WalletButton />
            </div>
          </div>
        </header>
        <main className="container">
          <div className="dashboard-summary">
            <WalletConnect />
          </div>
          
          {/* Replace TokenTracker with TokenSearch */}
          <div className="dashboard-grid">
            <div className="grid-item token-search-container">
              <TokenSearch />
            </div>
          </div>
          
          <div className="dashboard-grid">
            <div className="grid-item ai-advisor-main">
              <AIAdvisor />
            </div>
            <div className="grid-item trade-history-side">
              <TradeHistory />
            </div>
          </div>
        </main>
      </div>
    </WalletProvider>
  );
};

export default App;