import { PublicKey, Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import { walletService } from './walletService';
import { Trade, TradingPattern, TradeAnalytics } from '../types';

const LAMPORTS_PER_SOL = 1000000000;

class TradeService {
  private trades: Trade[] = [];
  private patterns: TradingPattern[] = [];
  private analytics: TradeAnalytics | null = null;
  private connection: Connection | null = null;
  private HELIUS_API_KEY = 'your-helius-api-key'; // Add this to your .env file later
  
  constructor() {
    this.setupConnection();
  }
  
  private async setupConnection() {
    try {
      // Use Helius RPC node which provides enhanced transaction data
      this.connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${this.HELIUS_API_KEY}`, 'confirmed');
    } catch (error) {
      console.error('Error setting up connection:', error);
    }
  }
  
  // Get last 30 trades for analysis
  async getLast30Trades(): Promise<Trade[]> {
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
      
      // Use Helius enhanced API to get transactions with additional metadata
      const response = await fetch(`https://api.helius.xyz/v0/addresses/${publicKey.toString()}/transactions?api-key=${this.HELIUS_API_KEY}&limit=50`);
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.statusText}`);
      }
      
      const transactions = await response.json();
      
      // Transform Helius transactions to our Trade format
      const trades: Trade[] = [];
      
      for (const tx of transactions) {
        // Try to parse transaction as a trade
        const trade = this.parseHeliusTransaction(tx);
        if (trade) {
          trades.push(trade);
        }
        
        // If we have 30 trades, break
        if (trades.length >= 30) {
          break;
        }
      }
      
      // Sort by timestamp, newest first
      trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // Save the trades
      this.trades = trades.slice(0, 30);
      
      // Generate patterns and analytics based on the real transaction data
      if (this.trades.length > 0) {
        this.patterns = this.generatePatterns(this.trades);
        this.analytics = this.generateAnalytics(this.trades);
      }
      
      return this.trades;
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw new Error('Failed to load transaction history');
    }
  }
  
  // Parse Helius transaction format
  private parseHeliusTransaction(transaction: any): Trade | null {
    try {
      // Check if this is a trade transaction
      const isSwap = this.isSwapTransaction(transaction);
      const isTransfer = this.isTransferTransaction(transaction);
      
      if (!isSwap && !isTransfer) {
        return null;
      }
      
      // Extract basic details
      const timestamp = new Date(transaction.timestamp * 1000);
      const txid = transaction.signature;
      const type = this.determineTradeType(transaction);
      
      // Extract token details - this requires parsing Helius response format
      const { tokenSymbol, tokenAmount, tokenPrice } = this.extractTokenDetails(transaction);
      
      if (!tokenSymbol || tokenAmount === 0) {
        return null;
      }
      
      // Calculate values
      const totalValue = tokenAmount * (tokenPrice || 0);
      const successful = transaction.successful;
      
      return {
        id: txid,
        timestamp,
        type,
        cryptoAsset: tokenSymbol,
        amount: tokenAmount,
        price: tokenPrice || 0,
        totalValue,
        exchange: this.extractExchange(transaction),
        successful,
        notes: ''
      };
    } catch (error) {
      console.error('Error parsing Helius transaction:', error);
      return null;
    }
  }
  
  // Helper method to determine if transaction is a swap (trade)
  private isSwapTransaction(transaction: any): boolean {
    // Check if this is a Jupiter or other DEX swap
    if (transaction.type === 'SWAP' || 
        transaction.description?.includes('Swap') ||
        (transaction.events?.swap && transaction.events.swap.length > 0)) {
      return true;
    }
    return false;
  }
  
  // Helper method to determine if transaction is a token transfer
  private isTransferTransaction(transaction: any): boolean {
    if (transaction.type === 'TRANSFER' || 
        (transaction.events?.transfer && transaction.events.transfer.length > 0)) {
      return true;
    }
    return false;
  }
  
  // Determine if this is a buy or sell
  private determineTradeType(transaction: any): 'buy' | 'sell' {
    // For swaps, we need to determine direction
    if (this.isSwapTransaction(transaction)) {
      // This is oversimplified - in real implementation you'd check 
      // if tokens are coming to the wallet (buy) or going out (sell)
      const sourceIsUser = transaction.events?.swap?.[0]?.source === transaction.feePayer;
      return sourceIsUser ? 'sell' : 'buy';
    }
    
    // For transfers, if tokens are coming in it's a buy, otherwise a sell
    if (this.isTransferTransaction(transaction)) {
      const isIncoming = transaction.events?.transfer?.[0]?.toUserAccount === transaction.feePayer;
      return isIncoming ? 'buy' : 'sell';
    }
    
    // Default fallback
    return 'buy';
  }
  
  // Extract token details from transaction
  private extractTokenDetails(transaction: any): { tokenSymbol: string, tokenAmount: number, tokenPrice: number | null } {
    let tokenSymbol = 'Unknown';
    let tokenAmount = 0;
    let tokenPrice = null;
    
    try {
      // For swap transactions
      if (this.isSwapTransaction(transaction) && transaction.events?.swap?.[0]) {
        const swap = transaction.events.swap[0];
        tokenSymbol = swap.tokenIn.symbol || swap.tokenOut.symbol || 'Unknown';
        tokenAmount = swap.tokenIn.amount || swap.tokenOut.amount || 0;
        
        // Try to calculate price based on native values
        if (swap.nativeInput && swap.tokenIn.amount) {
          tokenPrice = swap.nativeInput / swap.tokenIn.amount;
        } else if (swap.nativeOutput && swap.tokenOut.amount) {
          tokenPrice = swap.nativeOutput / swap.tokenOut.amount;
        }
      }
      
      // For transfer transactions
      else if (this.isTransferTransaction(transaction) && transaction.events?.transfer?.[0]) {
        const transfer = transaction.events.transfer[0];
        tokenSymbol = transfer.tokenName || transfer.mint?.substring(0, 4) || 'Unknown';
        tokenAmount = transfer.amount || 0;
        
        // Transfers usually don't have price info in the transaction
        tokenPrice = null;
      }
    } catch (error) {
      console.error('Error extracting token details:', error);
    }
    
    return { tokenSymbol, tokenAmount, tokenPrice };
  }
  
  // Extract exchange information
  private extractExchange(transaction: any): string {
    // Try to determine which exchange was used
    if (transaction.description?.includes('Jupiter')) {
      return 'Jupiter';
    } else if (transaction.description?.includes('Raydium')) {
      return 'Raydium';
    } else if (transaction.description?.includes('Orca')) {
      return 'Orca';
    }
    
    return 'Unknown DEX';
  }
  
  // Keep existing methods
  async getTrades(): Promise<Trade[]> {
    // Update to use getLast30Trades or keep existing implementation
    return this.getLast30Trades();
  }
  
  // Existing code...
  private generatePatterns(trades: Trade[]): TradingPattern[] {
    // Your existing implementation
  }
  
  private generateAnalytics(trades: Trade[]): TradeAnalytics {
    // Your existing implementation
  }
  
  async getTradingPatterns(): Promise<TradingPattern[]> {
    // Your existing implementation
  }
  
  async getTradeAnalytics(): Promise<TradeAnalytics> {
    // Your existing implementation
  }
}

export const tradeService = new TradeService();import { Trade, TradingPattern, TradeAnalytics } from '../types';
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