import React, { useState, useEffect } from 'react';
import { walletService } from '../services/walletService';
import { WalletInfo } from '../types';

const WalletConnect: React.FC = () => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if wallet is already connected on component mount
    const info = walletService.getWalletInfo();
    if (info) {
      setWalletInfo(info);
    }
    
    // Listen for wallet events
    const handleWalletChanged = (e: CustomEvent) => {
      setWalletInfo(e.detail.walletInfo);
    };
    
    const handleWalletDisconnected = () => {
      setWalletInfo(null);
    };
    
    window.addEventListener('walletChanged', handleWalletChanged as EventListener);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);
    
    return () => {
      window.removeEventListener('walletChanged', handleWalletChanged as EventListener);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
    };
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const info = await walletService.connect();
      setWalletInfo(info);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    walletService.disconnect();
    setWalletInfo(null);
  };

  const formatAddress = (address: string): string => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };
  
  // Check if Phantom wallet is installed
  const isPhantomInstalled = () => {
    const solana = (window as any).solana;
    return solana && solana.isPhantom;
  };

  return (
    <div className="wallet-connect">
      {walletInfo && walletInfo.isConnected ? (
        <div className="wallet-connected">
          <div className="wallet-balance-card">
            <div className="balance-header">
              <div className="balance-title">Total Balance</div>
              <div className="balance-actions">
                <button className="action-button send">Send</button>
                <button className="action-button receive">Receive</button>
              </div>
            </div>
            
            <div className="balance-amount">{(walletInfo.balance || 0).toFixed(4)} SOL</div>
            
            <div className="wallet-details">
              <div className="detail">
                <span className="detail-label">Address</span>
                <span className="detail-value">{formatAddress(walletInfo.address)}</span>
              </div>
              <div className="detail">
                <span className="detail-label">Network</span>
                <span className="detail-value network">{walletInfo.network}</span>
              </div>
            </div>
            
            <button 
              className="secondary disconnect-button"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="connect-prompt">
          <div className="connect-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M32 58.6667C46.7276 58.6667 58.6667 46.7276 58.6667 32C58.6667 17.2724 46.7276 5.33334 32 5.33334C17.2724 5.33334 5.33334 17.2724 5.33334 32C5.33334 46.7276 17.2724 58.6667 32 58.6667Z" stroke="url(#paint0_linear)" strokeWidth="2"/>
              <path d="M21.3333 30.6667L42.6667 30.6667" stroke="url(#paint1_linear)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M32 21.3333L32 42.6667" stroke="url(#paint2_linear)" strokeWidth="2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="paint0_linear" x1="5.33334" y1="5.33334" x2="58.6667" y2="58.6667" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a2facf"/>
                  <stop offset="1" stopColor="#64acff"/>
                </linearGradient>
                <linearGradient id="paint1_linear" x1="21.3333" y1="30.6667" x2="42.6667" y2="30.6667" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a2facf"/>
                  <stop offset="1" stopColor="#64acff"/>
                </linearGradient>
                <linearGradient id="paint2_linear" x1="32" y1="21.3333" x2="32" y2="42.6667" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a2facf"/>
                  <stop offset="1" stopColor="#64acff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <h3>Connect Your Wallet</h3>
          <p>Connect your Phantom wallet to access your Solana assets and start tracking your trades.</p>
          
          {!isPhantomInstalled() && (
            <div className="phantom-warning">
              <p>Phantom wallet is not installed.</p>
              <a 
                href="https://phantom.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="phantom-link"
              >
                Install Phantom Wallet
              </a>
            </div>
          )}
          
          <button 
            className="connect"
            onClick={handleConnect}
            disabled={isConnecting || !isPhantomInstalled()}
          >
            {isConnecting ? 'Connecting...' : 'Connect Phantom Wallet'}
          </button>
          
          {error && <div className="error-message">{error}</div>}
        </div>
      )}
    </div>
  );
};

export default WalletConnect;