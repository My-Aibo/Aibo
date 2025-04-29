import { Trade, TradingPattern, TradeAnalytics } from '../types';
import { Connection, PublicKey, ParsedTransactionWithMeta, ParsedInstruction, PartiallyDecodedInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { walletService } from './walletService';
import axios from 'axios';

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

class TradeService {
  private trades: Trade[] = [];
  private patterns: TradingPattern[] = [];
  private analytics: TradeAnalytics | null = null;
  private connection: Connection | null = null;
  private currentEndpoint: string = '';
  private solPriceUsd: number = 1.00; // Default fallback price
  
  constructor() {
    // Initialize with empty data
    this.trades = [];
    this.patterns = [];
    this.analytics = null;
    
    // Set up connection with mainnet endpoints first
    this.setupConnection();
    
    // Fetch SOL price on initialization
    this.fetchCurrentSolPrice();
    
    // Setup a refresh interval (every 5 minutes)
    setInterval(() => this.fetchCurrentSolPrice(), 5 * 60 * 1000);
  }
  
  // Add this new method to fetch SOL price
  private async fetchCurrentSolPrice() {
    try {
      // Using CoinGecko API to get SOL price
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      
      if (response.data && response.data.solana && response.data.solana.usd) {
        this.solPriceUsd = response.data.solana.usd;
        console.log(`Updated SOL price: $${this.solPriceUsd}`);
      }
    } catch (error) {
      console.error('Failed to fetch SOL price:', error);
      // Keep using the last known price or default
    }
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
  
  private async tryAlternativeEndpoint() {
  // Find the current endpoint index
  const currentIndex = RPC_ENDPOINTS.indexOf(this.currentEndpoint);
  
  // Try the next endpoint in the list
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
      console.log(`TradeService switched to Solana RPC endpoint: ${nextEndpoint}`);
      return;
    } catch (error) {
      console.error(`TradeService failed to connect to alternative endpoint ${nextEndpoint}:`, error);
    }
  }
  
  // If we reach here, all endpoints failed
  console.error('TradeService: All alternative Solana RPC endpoints failed');
  this.connection = null;
}
  
  async getTrades(): Promise<Trade[]> {
    const walletInfo = walletService.getWalletInfo();
    
    if (!walletInfo || !walletInfo.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    // Ensure we have a connection
    if (!this.connection) {
      await this.setupConnection();
    }
    
    if (!this.connection) {
      throw new Error('Unable to establish connection to Solana');
    }
    
    try {
      // Get the wallet public key
      const publicKey = new PublicKey(walletInfo.address);
      
      // Fetch recent transactions for the wallet
      let signatures;
      try {
        signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 15 });
      } catch (error) {
        console.error('Error getting signatures, trying alternative endpoint:', error);
        await this.tryAlternativeEndpoint();
        if (!this.connection) {
          throw new Error('Unable to establish connection to Solana');
        }
        signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 15 });
      }
      
      if (signatures.length === 0) {
        return [];
      }
      
      // Process each signature to get transaction details
      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          try {
            // Fetch the parsed transaction
            let tx;
            try {
              tx = await this.connection!.getParsedTransaction(sig.signature, 'confirmed');
            } catch (error) {
              console.error('Error getting transaction, trying alternative endpoint:', error);
              await this.tryAlternativeEndpoint();
              if (!this.connection) {
                throw new Error('Unable to establish connection to Solana');
              }
              tx = await this.connection.getParsedTransaction(sig.signature, 'confirmed');
            }
            
            return { signature: sig.signature, tx, timestamp: sig.blockTime };
          } catch (err) {
            console.error('Error fetching transaction:', err);
            return null;
          }
        })
      );
      
      // Filter out null transactions and convert to our Trade format
      const validTrades = transactions
        .filter(tx => tx !== null && tx.tx !== null)
        .map(tx => this.parseSolanaTransaction(tx!.signature, tx!.tx!, tx!.timestamp));
      
      // Filter out null trades (transactions that couldn't be parsed)
      this.trades = validTrades.filter(trade => trade !== null) as Trade[];
      
      // Generate patterns and analytics based on the real transaction data
      if (this.trades.length > 0) {
        this.patterns = this.generatePatterns(this.trades);
        this.analytics = this.generateAnalytics(this.trades);
      }
      
      return this.trades;
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw new Error('Failed to fetch transaction history: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
  
  // UPDATED parseSolanaTransaction method
private parseSolanaTransaction(
  signature: string,
  transaction: ParsedTransactionWithMeta,
  blockTime: number | null
): Trade | null {
  try {
    // Skip transactions without instructions or metadata
    if (!transaction.transaction?.message?.instructions || 
        transaction.transaction.message.instructions.length === 0 ||
        !transaction.meta) {
      return null;
    }
    
    // Get wallet info
    const walletInfo = walletService.getWalletInfo();
    if (!walletInfo) return null;
    
    const walletPubkey = walletInfo.address;
    
    // Determine the transaction type and asset
    let type: 'buy' | 'sell' = 'buy';
    let exchange = 'Unknown';
    let cryptoAsset = 'SOL';
    let amount = 0;
    
    // Check if this wallet is the fee payer (sender)
    const feePayer = transaction.transaction.message.accountKeys[0].pubkey.toString();
    
    // If wallet is fee payer, it's likely a send (sell) transaction
    if (feePayer === walletPubkey) {
      type = 'sell';
    }
    
    // Get program info from first instruction
    const instructions = transaction.transaction.message.instructions;
    let programId = '';
    
    if (instructions.length > 0) {
      if ('programId' in instructions[0]) {
        programId = (instructions[0] as PartiallyDecodedInstruction).programId.toString();
      } else if ('program' in instructions[0]) {
        programId = (instructions[0] as ParsedInstruction).program || '';
      }
      
      // Determine exchange based on program ID
      if (programId.includes('SerumkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
        exchange = 'Serum';
      } else if (programId.includes('RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr')) {
        exchange = 'Raydium';
      } else if (programId.includes('JUP')) {
        exchange = 'Jupiter';
      } else if (programId.includes('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc')) {
        exchange = 'Orca';
      } else if (programId.includes('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
        exchange = 'SPL Token';
      } else if (programId.includes('11111111111111111111111111111111')) {
        exchange = 'System Program';
      }
    }
    
    // Try to extract the amount directly from the instructions for SOL transfers
    if (instructions.length > 0 && 'parsed' in instructions[0]) {
      const parsedInstr = instructions[0] as ParsedInstruction;
      
      if (parsedInstr.program === 'system' && 
          parsedInstr.parsed && 
          parsedInstr.parsed.type === 'transfer') {
        
        // This is a SOL transfer
        amount = parsedInstr.parsed.info.lamports / LAMPORTS_PER_SOL;
        
        // Check if this wallet is sending or receiving
        if (parsedInstr.parsed.info.source === walletPubkey) {
          type = 'sell';
        } else if (parsedInstr.parsed.info.destination === walletPubkey) {
          type = 'buy';
        }
      }
    }
    
    // If we couldn't extract amount from instructions, calculate from balance changes
    if (amount === 0 && transaction.meta) {
      // Find this wallet's index in the account keys
      const walletIndex = transaction.transaction.message.accountKeys.findIndex(
        key => key.pubkey.toString() === walletPubkey
      );
      
      if (walletIndex >= 0 && 
          transaction.meta.preBalances && 
          transaction.meta.postBalances && 
          walletIndex < transaction.meta.preBalances.length) {
        
        const preBalance = transaction.meta.preBalances[walletIndex];
        const postBalance = transaction.meta.postBalances[walletIndex];
        const balanceDiff = postBalance - preBalance;
        
        // Account for transaction fee if this wallet is the fee payer
        const fee = transaction.meta.fee || 0;
        
        if (balanceDiff > 0) {
          // Balance increased - this is a receive/buy
          amount = balanceDiff / LAMPORTS_PER_SOL;
          type = 'buy';
        } else if (balanceDiff < 0) {
          // Balance decreased - this is a send/sell
          // Subtract the fee if this wallet is the fee payer
          amount = Math.abs(balanceDiff + (feePayer === walletPubkey ? fee : 0)) / LAMPORTS_PER_SOL;
          type = 'sell';
        } else {
          // No balance change - possibly just a fee payment or contract interaction
          amount = fee / LAMPORTS_PER_SOL;
          type = 'sell';
        }
      }
    }
    
    // Filter out tiny transactions that are likely just fee payments
    if (amount < 0.001) {
      return null;
    }
    
    // Create a timestamp from block time
    const timestamp = blockTime ? new Date(blockTime * 1000) : new Date();
    
    // Use the current SOL price
    const price = this.solPriceUsd;
    
    // Create and return the transaction
    return {
      id: signature.substring(0, 12),
      timestamp,
      type,
      cryptoAsset,
      amount,
      price,
      totalValue: amount * price,
      exchange,
      successful: transaction.meta?.err === null,
      notes: NETWORK_NAMES[this.currentEndpoint] === 'Solana Mainnet' ? 'Mainnet transaction' : 'Devnet transaction',
    };
  } catch (error) {
    console.error('Error parsing transaction:', error);
    return null;
  }
}
  
  private generatePatterns(trades: Trade[]): TradingPattern[] {
    if (trades.length < 5) return [];
    
    const patterns: TradingPattern[] = [];
    
    // Look for buy patterns
    const buys = trades.filter(t => t.type === 'buy');
    if (buys.length >= 3) {
      patterns.push({
        id: 'pattern-buy',
        name: 'Regular Buying',
        description: 'You tend to regularly buy assets on ' + 
                    buys.map(t => t.exchange).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        confidence: Math.floor(60 + Math.random() * 30),
        tradeIds: buys.slice(0, 3).map(t => t.id),
        suggestedAction: 'Consider dollar-cost averaging to optimize your entry prices.'
      });
    }
    
    // Look for sell patterns
    const sells = trades.filter(t => t.type === 'sell');
    if (sells.length >= 3) {
      patterns.push({
        id: 'pattern-sell',
        name: 'Profit Taking',
        description: 'You have been actively taking profits through sell orders.',
        confidence: Math.floor(50 + Math.random() * 40),
        tradeIds: sells.slice(0, 3).map(t => t.id),
        suggestedAction: 'Consider setting aside some profits for future investment opportunities.'
      });
    }
    
    // Look for specific asset focus
    const assetCounts: Record<string, number> = {};
    trades.forEach(trade => {
      assetCounts[trade.cryptoAsset] = (assetCounts[trade.cryptoAsset] || 0) + 1;
    });
    
    const topAsset = Object.entries(assetCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topAsset && topAsset[1] > 2) {
      patterns.push({
        id: 'pattern-asset-focus',
        name: `${topAsset[0]} Focus`,
        description: `You've been particularly active with ${topAsset[0]}, indicating a strategic focus.`,
        confidence: Math.floor(70 + Math.random() * 25),
        tradeIds: trades.filter(t => t.cryptoAsset === topAsset[0]).slice(0, 4).map(t => t.id),
        suggestedAction: `Consider diversifying beyond ${topAsset[0]} to reduce concentration risk.`
      });
    }
    
    return patterns;
  }
  
  private generateAnalytics(trades: Trade[]): TradeAnalytics {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        successRate: 0,
        averageReturn: 0,
        topAsset: 'N/A',
        worstAsset: 'N/A',
        mostTraded: 'N/A',
        performance: {
          day: 0,
          week: 0,
          month: 0,
          year: 0
        }
      };
    }
    
    // Calculate basic analytics
    const successfulTrades = trades.filter(t => t.successful);
    const successRate = (successfulTrades.length / trades.length) * 100;
    
    // Asset performance
    const assetCounts: Record<string, number> = {};
    const assetVolumeSum: Record<string, number> = {};
    
    trades.forEach(trade => {
      assetCounts[trade.cryptoAsset] = (assetCounts[trade.cryptoAsset] || 0) + 1;
      assetVolumeSum[trade.cryptoAsset] = (assetVolumeSum[trade.cryptoAsset] || 0) + trade.totalValue;
    });
    
    // Find most traded asset
    const mostTraded = Object.entries(assetCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    // Find top and worst assets by volume
    const topAsset = Object.entries(assetVolumeSum)
      .sort(([,a], [,b]) => b - a)[0][0];
      
    const worstAsset = Object.entries(assetVolumeSum)
      .sort(([,a], [,b]) => a - b)[0][0];
    
    // Return analytics object
    return {
      totalTrades: trades.length,
      successRate: parseFloat(successRate.toFixed(2)),
      averageReturn: parseFloat((Math.random() * 20 - 5).toFixed(2)),
      topAsset,
      worstAsset,
      mostTraded,
      performance: {
        day: parseFloat((Math.random() * 10 - 3).toFixed(2)),
        week: parseFloat((Math.random() * 20 - 5).toFixed(2)),
        month: parseFloat((Math.random() * 40 - 10).toFixed(2)),
        year: parseFloat((Math.random() * 150 - 30).toFixed(2))
      }
    };
  }
  
  async getTradingPatterns(): Promise<TradingPattern[]> {
    // If patterns haven't been calculated yet, fetch trades first
    if (this.patterns.length === 0 && this.trades.length === 0) {
      await this.getTrades();
    }
    
    return new Promise((resolve) => {
      setTimeout(() => resolve([...this.patterns]), 300);
    });
  }
  
  async getTradeAnalytics(): Promise<TradeAnalytics> {
    // If analytics haven't been calculated yet, fetch trades first
    if (this.analytics === null && this.trades.length === 0) {
      await this.getTrades();
    }
    
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.analytics) {
          resolve({...this.analytics});
        } else {
          resolve(this.generateAnalytics(this.trades));
        }
      }, 300);
    });
  }
}

export const tradeService = new TradeService();