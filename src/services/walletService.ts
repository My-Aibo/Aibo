// src/services/walletService.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletInfo } from '../types';

class WalletService {
  private walletInfo: WalletInfo | null = null;
  private connection: Connection | null = null;
  private currentEndpoint: string = '';
  private defaultRPC: string = 'https://api.mainnet-beta.solana.com';
  private endpoints = [
    `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || '4f270978-3959-4c94-81dc-332e11477358'}`,
    'https://api.mainnet-beta.solana.com',
    'https://api.devnet.solana.com'
  ];
  private HELIUS_API_KEY: string;
  // These handlers are defined later in the classconstructor() {
    // Get API key from environment
    this.HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || '4f270978-3959-4c94-81dc-332e11477358';

    // Check for stored network preference
    const savedNetwork = localStorage.getItem('selectedNetwork') || 'mainnet';

    // Determine RPC URL based on network
    if (savedNetwork === 'mainnet') {
      this.defaultRPC = `https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`;
    } else {
      this.defaultRPC = 'https://api.devnet.solana.com';
    }

    console.log(`WalletService initialized with default RPC: ${this.defaultRPC.replace(this.HELIUS_API_KEY, 'xxxxx')}`);

    // Initialize connection
    this.setupConnection().then(() => {
      setTimeout(() => this.checkIfWalletIsConnected(), 500);
    }).catch(err => {
      console.error("Failed to initialize wallet connection:", err);
    });
  }
  
  // Handle wallet account change events
  private handleAccountChanged = async (publicKey: any) => {
    if (publicKey) {
      await this.setWalletInfo(publicKey.toString());
      window.dispatchEvent(new CustomEvent('walletChanged', { 
        detail: { walletInfo: this.walletInfo } 
      }));
    }
  };
  
  // Handle wallet disconnect events
  private handleDisconnect = () => {
    this.walletInfo = null;
    window.dispatchEvent(new CustomEvent('walletDisconnected'));
    console.log('Wallet disconnected');
  };

  private async setupConnection() {
    // Check if we should force mainnet for development
    const forceMainnet = localStorage.getItem('forceMainnet') === 'true';

    // Filter endpoints if forcing mainnet
    const endpoints = forceMainnet 
      ? this.endpoints.filter(endpoint => !endpoint.includes('devnet'))
      : this.endpoints;
      
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
          // Use only basic configuration to avoid TypeScript errors with fetch
        this.connection = new Connection(endpoint, 'confirmed');
        
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
        network: 'Solana',
        isConnected: true,
        publicKey: publicKey
      };
      
      return this.walletInfo;
    } catch (error) {
      console.error('Error setting wallet info:', error);
      throw error;
    }
  }
  
  private async tryAlternativeEndpoint() {
    // Find the current endpoint index
    const currentIndex = this.endpoints.indexOf(this.currentEndpoint);
    
    // Try the next endpoint in the list, focusing on mainnet endpoints
    for (let i = 0; i < this.endpoints.length; i++) {
      // Skip the current endpoint
      const nextIndex = (currentIndex + i + 1) % this.endpoints.length;
      const nextEndpoint = this.endpoints[nextIndex];
      
      // Skip devnet if we're looking for alternatives and we have working mainnet endpoints
      if (nextEndpoint.includes('devnet') && i < this.endpoints.length - 1) {
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
  }    async connect(rpcUrl: string = ''): Promise<WalletInfo> {
    try {
      const solana = (window as any).solana;
      
      if (!solana) {
        throw new Error('Phantom wallet is not installed. Please install it from https://phantom.app/');
      }
      
      if (!solana.isPhantom) {
        throw new Error('Please use Phantom wallet');
      }
      
      // If no RPC URL is provided, use the default
      if (!rpcUrl) {
        rpcUrl = this.defaultRPC || 'https://api.mainnet-beta.solana.com';
      }
      
      // Make sure we have a connection setup
      if (!this.connection || this.currentEndpoint !== rpcUrl) {
        try {          // Use only the commitment parameter to avoid TypeScript errors
          this.connection = new Connection(rpcUrl, 'confirmed');
          this.currentEndpoint = rpcUrl;
        } catch (connError) {
          console.error('Error setting up connection:', connError);
          // Fall back to default RPC if provided URL fails
          this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
          this.currentEndpoint = 'https://api.mainnet-beta.solana.com';
        }
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
    return 'Solana';
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
  
  async getSolBalance(publicKeyString: string): Promise<number> {
    if (!this.connection) {
      await this.setupConnection();
    }
    
    if (!this.connection) {
      console.error('Unable to establish connection to Solana network');
      return 0;
    }
    
    try {
      const publicKey = new PublicKey(publicKeyString);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting SOL balance:', error);
      
      // Try alternative endpoint if the current one fails
      try {
        await this.tryAlternativeEndpoint();
        if (this.connection) {
          const publicKey = new PublicKey(publicKeyString);
          const balance = await this.connection.getBalance(publicKey);
          return balance / LAMPORTS_PER_SOL;
        }
      } catch (fallbackError) {
        console.error('Error getting SOL balance with alternative endpoint:', fallbackError);
      }
      
      return 0;
    }
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

  // Add proper rate limiting to prevent 429 errors
  private async fetchWithRateLimit<T>(method: string, params: any[]): Promise<T> {
    // Simple delay function
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 500; // 500ms base delay
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(this.defaultRPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now().toString(),
            method,
            params
          })
        });
        
        if (response.status === 429) {
          attempts++;
          const backoffDelay = baseDelay * Math.pow(2, attempts); // Exponential backoff
          console.log(`Rate limited (429), retrying after ${backoffDelay}ms...`);
          await delay(backoffDelay);
          continue;
        }
        
        const data = await response.json();
        if (data.error) {
          throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
        }
        
        return data.result as T;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw error;
        }
        const backoffDelay = baseDelay * Math.pow(2, attempts);
        console.log(`Error fetching ${method}, retrying after ${backoffDelay}ms...`);
        await delay(backoffDelay);
      }
    }
    
    throw new Error(`Failed to fetch ${method} after ${maxAttempts} attempts`);
  }

  // Add this method to your WalletService class
  public switchNetwork(network: 'mainnet' | 'devnet'): void {
    try {
      // Update the RPC URL based on network
      let rpcUrl = '';
      
      if (network === 'mainnet') {
        rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`;
      } else {
        rpcUrl = 'https://api.devnet.solana.com';
      }
      
      // Store the selected network
      localStorage.setItem('selectedNetwork', network);
      
      // Reconnect to the new RPC
      this.connect(rpcUrl);
      
      console.log(`WalletService: Switched to ${network} network with RPC ${rpcUrl}`);
    } catch (error) {
      console.error('WalletService: Error switching network:', error);
    }
  }
}

export const walletService = new WalletService();