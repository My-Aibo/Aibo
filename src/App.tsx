import React from 'react';
import WalletConnect from './components/WalletConnect';
import TradeHistory from './components/TradeHistory';
import AIAdvisor from './components/AIAdvisor';
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
              {/* Add the wallet button here in the header */}
              <WalletButton />
            </div>
          </div>
        </header>
        
        <nav className="app-nav">
          <div className="container">
            <div className="nav-tabs">
              <div className="nav-tab active">Dashboard</div>
              <div className="nav-tab">Transactions</div>
              <div className="nav-tab">Analytics</div>
              <div className="nav-tab">Settings</div>
            </div>
          </div>
        </nav>
        
        <main className="container">
          <div className="dashboard-summary">
            <WalletConnect />
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
        
        <footer className="app-footer">
          <div className="container">
            <p>&copy; 2025 Aibo. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </WalletProvider>
  );
};

export default App;