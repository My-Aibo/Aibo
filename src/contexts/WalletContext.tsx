import React, { createContext, useContext, useState, useEffect } from 'react';
import { walletService } from '../services/walletService';
import { WalletInfo } from '../types';

interface WalletContextType {
  isConnected: boolean;
  walletInfo: WalletInfo | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshWalletInfo: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Initialize wallet state
  useEffect(() => {
    const checkWallet = async () => {
      const connected = await walletService.checkIfWalletIsConnected();
      if (connected) {
        const info = walletService.getWalletInfo();
        setWalletInfo(info);
        setIsConnected(true);
      }
    };

    checkWallet();

    // Listen for wallet changes
    const handleWalletChanged = (e: any) => {
      console.log('Wallet changed event in context:', e);
      const info = e.detail?.walletInfo || walletService.getWalletInfo();
      setWalletInfo(info);
      setIsConnected(info && info.isConnected);
    };

    const handleWalletDisconnected = () => {
      setWalletInfo(null);
      setIsConnected(false);
    };

    window.addEventListener('walletChanged', handleWalletChanged);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);

    return () => {
      window.removeEventListener('walletChanged', handleWalletChanged);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
    };
  }, []);

  // Connect wallet
  const connect = async () => {
    try {
      const info = await walletService.connect();
      setWalletInfo(info);
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  // Disconnect wallet
  const disconnect = async () => {
    try {
      await walletService.disconnect();
      setWalletInfo(null);
      setIsConnected(false);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  // Refresh wallet info
  const refreshWalletInfo = () => {    const info = walletService.getWalletInfo();
    setWalletInfo(info);
    setIsConnected(info ? info.isConnected : false);
  };

  return (
    <WalletContext.Provider
      value={{ isConnected, walletInfo, connect, disconnect, refreshWalletInfo }}
    >
      {children}
    </WalletContext.Provider>
  );
};