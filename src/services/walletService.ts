// src/services/walletService.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletInfo } from '../types';

// Updated RPC endpoints with public endpoints that allow CORS from localhost
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',  // Official Solana mainnet
  'https://solana.public-rpc.com',        // Public endpoint
  'https://free.rpcpool.com',             // RPCPool free endpoint
  'https://api.devnet.solana.com'         // Keep devnet as last resort
];

// Update the NETWORK_NAMES too
const NETWORK_NAMES = {
  'https://api.mainnet-beta.solana.com': 'Solana Mainnet',
  'https://solana.public-rpc.com': 'Solana Mainnet',
  'https://free.rpcpool.com': 'Solana Mainnet',
  'https://api.devnet.solana.com': 'Solana Devnet'
};

class WalletService {
  private walletInfo: WalletInfo | null = null;
  private connection: Connection | null = null;
  private currentEndpoint: string = '';
  
  constructor() {
    // Start with the first endpoint (mainnet)
    this.setupConnection();
    setTimeout(() => this.checkIfWalletIsConnected(), 500);
  }
  
  private async setupConnection() {
    // Check if we should force mainnet for development
    const forceMainnet = localStorage.getItem('forceMainnet') === 'true';
    
    // Filter endpoints if forcing mainnet
    const endpoints = forceMainnet 
      ? RPC_ENDPOINTS.filter(endpoint => !endpoint.includes('devnet'))
      : RPC_ENDPOINTS;
      
    // Try each endpoint in order until one works
    for (const endpoint of endpoints) {
      try {
        console.log(`Attempting to connect to ${endpoint}...`);
        
        // Create connection with fetch configuration to help with CORS
        const fetchConfig = {
          // Use no-cors mode as a fallback if standard mode fails
          fetch: (url: string, init: RequestInit) => {
            // Try standard fetch first
            return fetch(url, init).catch(error => {
              if (error.message.includes('CORS')) {
                console.log(`CORS error on ${url}, retrying with no-cors mode`);
                // If CORS error, retry with no-cors mode
                // Note: This will result in opaque responses
                return fetch(url, { ...init, mode: 'no-cors' });
              }
              throw error;
            });
          }
        };
        
        this.connection = new Connection(endpoint, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 30000, // 30 seconds
          disableRetryOnRateLimit: false,
          // Add fetch configuration
          ...fetchConfig
        });
        
        // Test with retries
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await this.connection.getLatestBlockhash();
            this.currentEndpoint = endpoint;
            console.log(`Successfully connected to ${endpoint}`);
            return;
          } catch (retryError) {
            if (attempt < 2) {
              console.log(`Attempt ${attempt+1} failed, retrying...`);
              await new Promise(r => setTimeout(r, 1000)); // Wait 1 second before retry
            }
          }
        }
        
      } catch (error) {
        console.error(`Failed to connect to ${endpoint}:`, error);
      }
    }
    
    // If we reach here, all endpoints failed
    console.error('All Solana RPC endpoints failed');
  }
  
  public async checkIfWalletIsConnected() {
    try {
      const solana = (window as any).solana;
      
      if (solana && solana.isPhantom && solana.isConnected) {
        console.log("Found connected Phantom wallet");
        await this.setWalletInfo(solana.publicKey.toString());
        
        // Add this to dispatch the event when we find a connected wallet
        window.dispatchEvent(new CustomEvent('walletChanged', { 
          detail: { walletInfo: this.walletInfo } 
        }));
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      return false;
    }
  }
  
  private async setWalletInfo(address: string) {
    if (!this.connection) {
      await this.setupConnection();
    }
    
    if (!this.connection) {
      throw new Error('Unable to establish connection to Solana');
    }
    
    try {
      const publicKey = new PublicKey(address);
      let balance = 0;
      
      try {
        balance = await this.connection.getBalance(publicKey);
      } catch (error) {
        console.error('Error getting balance, trying alternative endpoint:', error);
        // If balance fetch fails, try alternative endpoint
        await this.tryAlternativeEndpoint();
        // If we found a working endpoint, try getting the balance again
        if (this.connection) {
          balance = await this.connection.getBalance(publicKey);
        }
      }
      
      this.walletInfo = {
        address,
        balance: balance / LAMPORTS_PER_SOL,
        chainId: 0,
        network: NETWORK_NAMES[this.currentEndpoint] || 'Solana',
        isConnected: true,
      };
      
      return this.walletInfo;
    } catch (error) {
      console.error('Error setting wallet info:', error);
      throw error;
    }
  }
  
  private async tryAlternativeEndpoint() {
    // Find the current endpoint index
    const currentIndex = RPC_ENDPOINTS.indexOf(this.currentEndpoint);
    
    // Try the next endpoint in the list, focusing on mainnet endpoints
    for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
      // Skip the current endpoint
      const nextIndex = (currentIndex + i + 1) % RPC_ENDPOINTS.length;
      const nextEndpoint = RPC_ENDPOINTS[nextIndex];
      
      // Skip devnet if we're looking for alternatives and we have working mainnet endpoints
      if (nextEndpoint.includes('devnet') && i < RPC_ENDPOINTS.length - 1) {
        continue;
      }
      
      try {
        this.connection = new Connection(nextEndpoint, 'confirmed');
        await this.connection.getLatestBlockhash();
        this.currentEndpoint = nextEndpoint;
        console.log(`Switched to Solana RPC endpoint: ${nextEndpoint}`);
        return;
      } catch (error) {
        console.error(`Failed to connect to alternative endpoint ${nextEndpoint}:`, error);
      }
    }
    
    // If we reach here, all endpoints failed
    console.error('All alternative Solana RPC endpoints failed');
    this.connection = null;
  }
  
  async connect(): Promise<WalletInfo> {
    try {
      const solana = (window as any).solana;
      
      if (!solana) {
        throw new Error('Phantom wallet is not installed. Please install it from https://phantom.app/');
      }
      
      if (!solana.isPhantom) {
        throw new Error('Please use Phantom wallet');
      }
      
      // Connect to the wallet
      await solana.connect();
      
      if (!solana.publicKey) {
        throw new Error('Failed to connect to Phantom wallet');
      }
      
      const walletInfo = await this.setWalletInfo(solana.publicKey.toString());
      
      // Set up listeners for account changes
      solana.on('accountChanged', this.handleAccountChanged);
      solana.on('disconnect', this.handleDisconnect);
      
      return walletInfo!;
    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      throw new Error(error.message || 'Failed to connect wallet');
    }
  }
  
  isConnected(): boolean {
    return this.walletInfo !== null && this.walletInfo.isConnected;
  }
  
  getWalletInfo(): WalletInfo | null {
    return this.walletInfo;
  }
  
  getCurrentNetwork(): string {
    return NETWORK_NAMES[this.currentEndpoint] || 'Unknown';
  }
  
  async disconnect(): Promise<void> {
    const solana = (window as any).solana;
    
    if (solana && solana.isConnected) {
      await solana.disconnect();
    }
    
    this.walletInfo = null;
    
    // Remove listeners
    if (solana) {
      solana.off('accountChanged', this.handleAccountChanged);
      solana.off('disconnect', this.handleDisconnect);
    }
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('walletDisconnected'));
  }
  
  // This is the new method you should add
  public forceSetConnected(): void {
    // Create a minimal wallet info object for testing
    this.walletInfo = {
      address: "SimulatedAddress123456789",
      balance: 100.0,
      chainId: 0,
      network: "Debug Network",
      isConnected: true
    };
    
    // Dispatch the wallet changed event
    window.dispatchEvent(new CustomEvent('walletChanged', { 
      detail: { walletInfo: this.walletInfo } 
    }));
    
    console.log("Wallet forcibly set to connected state for debugging");
  }
  
  private handleAccountChanged = async () => {
    const solana = (window as any).solana;
    
    if (solana && solana.isConnected && solana.publicKey) {
      await this.setWalletInfo(solana.publicKey.toString());
      
      // Dispatch event with new wallet info
      window.dispatchEvent(new CustomEvent('walletChanged', { 
        detail: { walletInfo: this.walletInfo } 
      }));
    } else {
      // Handle wallet disconnection
      this.walletInfo = null;
      window.dispatchEvent(new CustomEvent('walletDisconnected'));
    }
  };
  
  private handleDisconnect = () => {
    this.walletInfo = null;
    
    // Dispatch an event that components can listen to
    window.dispatchEvent(new CustomEvent('walletDisconnected'));
  };
}

export const walletService = new WalletService();