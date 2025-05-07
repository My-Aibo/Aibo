import React from 'react';
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
              <WalletButton />
            </div>
          </div>
        </header>
        <main className="container">
          <div className="ai-advisor-container">
            <AIAdvisor />
          </div>
        </main>
      </div>
    </WalletProvider>
  );
};

export default App;