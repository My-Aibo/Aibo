import React from 'react';
import { useWallet } from '../contexts/WalletContext';
import './WalletButton.css';

const WalletButton: React.FC = () => {
  const { isConnected, walletInfo, connect, disconnect } = useWallet();

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <div className="wallet-button-container">
      {isConnected ? (
        <div className="wallet-info">
          <span className="wallet-address">
            {walletInfo?.address ? formatAddress(walletInfo.address) : ''}
          </span>
          <button 
            className="wallet-button connected" 
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          className="wallet-button" 
          onClick={connect}
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
};

export default WalletButton;