// src/components/AIAdvisor.tsx
import React, { useState, useEffect, useRef } from 'react';
import { tradeAnalysisService } from '../services/tradeAnalysisService';
import { useWallet } from '../contexts/WalletContext';
import './AIAdvisor.css';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  // For rich content display
  richContent?: {
    type: 'chart' | 'tokenInfo' | 'walletDashboard' | 'transactionList';
    data: any;
  };
}

interface TokenAnalysis {
  symbol: string;
  name: string;
  totalTrades: number;
  profitableTrades: number;
  successRate: number;
  totalProfit: number;
  averageHoldTime: string;
  bestTrade: {
    profit: number;
    date: Date;
  };
  worstTrade: {
    loss: number;
    date: Date;
  };
}

interface WalletAnalysis {
  overallSuccessRate: number;
  totalProfitLoss: number;
  mostProfitableToken: string;
  leastProfitableToken: string;
  averageHoldTime: string;
  tradeFrequency: string;
  recommendations: string[];
  tokenAnalyses: TokenAnalysis[];
}

const AIAdvisor: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [walletAnalysis, setWalletAnalysis] = useState<WalletAnalysis | null>(null);
  const [walletBalance, setWalletBalance] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { isConnected, walletInfo, connect } = useWallet();

  // Start analysis when wallet is connected
  useEffect(() => {
    if (isConnected && walletInfo) {
      analyzeWallet();
      fetchWalletBalance();
    }
  }, [isConnected, walletInfo]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle textarea auto-resize
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.height = `${chatInputRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchWalletBalance = async () => {
    if (!walletInfo || !walletInfo.publicKey) return;

    try {
      const balance = await tradeAnalysisService.getWalletBalance(walletInfo.publicKey);
      setWalletBalance(balance);
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    }
  };

  const analyzeWallet = async () => {
    setIsLoading(true);
    
    // Add initial message
    setMessages([{
      id: Date.now().toString(),
      content: 'I\'m analyzing your wallet history now. This will take just a moment...',
      role: 'assistant',
      timestamp: new Date()
    }]);
    
    try {
      // Fetch wallet analysis data
      const analysis = await tradeAnalysisService.getWalletAnalysis();
      setWalletAnalysis(analysis);
      
      // Generate and display analysis message with dashboard
      const welcomeMessage = generateWelcomeMessage(analysis);
      setMessages([{
        id: Date.now().toString(),
        content: welcomeMessage,
        role: 'assistant',
        timestamp: new Date(),
        richContent: {
          type: 'walletDashboard',
          data: {
            analysis,
            balance: walletBalance
          }
        }
      }]);
    } catch (error) {
      console.error('Error analyzing wallet:', error);
      setMessages([{
        id: Date.now().toString(),
        content: 'Sorry, I had trouble analyzing your wallet. Please make sure you have some trading history or try again later.',
        role: 'assistant',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateWelcomeMessage = (analysis: WalletAnalysis): string => {
    return `
## Wallet Analysis Complete

Based on your trading history, here's what I found:

### Overall Performance
- **Success Rate:** ${analysis.overallSuccessRate.toFixed(2)}%
- **Total Profit/Loss:** ${analysis.totalProfitLoss > 0 ? '+' : ''}$${analysis.totalProfitLoss.toFixed(2)}
- **Average Hold Time:** ${analysis.averageHoldTime}

### Key Insights
- Your most profitable token is **${analysis.mostProfitableToken}**
- Your trading frequency is **${analysis.tradeFrequency}**

### Top Recommendation
${analysis.recommendations[0]}

What would you like to do? You can:
- Search for tokens (e.g., "Search for SOL")
- Check token prices (e.g., "What's the price of BTC?")
- Analyze specific tokens (e.g., "Analyze token <address>")
- Get trading insights (e.g., "How can I improve my trading strategy?")
- View your transaction history (e.g., "Show me my recent transactions")
    `;
  };

  // Handle token search requests
  const handleTokenSearch = async (message: string): Promise<boolean> => {
    const searchPattern = /search(?:\s+for)?\s+([a-zA-Z0-9]+)/i;
    const match = message.match(searchPattern);
    
    if (match) {
      const tokenQuery = match[1];
      setIsLoading(true);
      
      try {
        // Add a loading message
        const loadingMessage = {
          id: Date.now().toString(),
          content: `Searching for "${tokenQuery}"...`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, loadingMessage]);
        
        // Call the token search service
        const results = await tradeAnalysisService.searchTokens(tokenQuery);
        
        // Remove loading message
        setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
        
        if (!results || results.length === 0) {
          const noResultsMessage = {
            id: Date.now().toString(),
            content: `I couldn't find any tokens matching "${tokenQuery}". Please try another search term or a more specific token name/symbol.`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, noResultsMessage]);
        } else if (results.length === 1) {
          // Single result, show token details directly
          const tokenData = results[0];
          showTokenDetails(tokenData);
        } else {
          // Multiple results, show selection
          const resultsMessage = {
            id: Date.now().toString(),
            content: `I found multiple tokens matching "${tokenQuery}". Please select one to view details:`,
            role: 'assistant',
            timestamp: new Date(),
            richContent: {
              type: 'tokenInfo',
              data: {
                searchResults: results,
                query: tokenQuery,
                isSearchResults: true
              }
            }
          };
          setMessages(prev => [...prev, resultsMessage]);
        }
        
        return true; // Handled
      } catch (error) {
        console.error('Error searching for token:', error);
        const errorMessage = {
          id: Date.now().toString(),
          content: `I encountered an error while searching for "${tokenQuery}". Please try again or with a different query.`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return true; // Handled, even though there was an error
      } finally {
        setIsLoading(false);
      }
    }
    
    return false; // Not handled
  };

  // Check for price check requests
  const handlePriceCheck = async (message: string): Promise<boolean> => {
    const pricePattern = /(?:what(?:'s| is) the )?(?:price|value|worth) (?:of|for) ([a-zA-Z0-9]+)/i;
    const match = message.match(pricePattern);
    
    if (match) {
      const tokenSymbol = match[1];
      setIsLoading(true);
      
      try {
        // Get token price data
        const tokenPrice = await tradeAnalysisService.getTokenPrice(tokenSymbol);
        
        if (!tokenPrice) {
          const notFoundMessage = {
            id: Date.now().toString(),
            content: `I couldn't find price information for "${tokenSymbol}". Please check the token symbol and try again.`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, notFoundMessage]);
          return true; // Handled
        }
        
        // Format price response with rich content
        const priceResponse = {
          id: Date.now().toString(),
          content: `
## ${tokenPrice.symbol} Price Information

**Current Price:** $${tokenPrice.price.toFixed(6)}
**24h Change:** ${tokenPrice.priceChange24h ? `${tokenPrice.priceChange24h > 0 ? '+' : ''}${tokenPrice.priceChange24h.toFixed(2)}%` : 'N/A'}
**Market Cap:** ${tokenPrice.marketCap ? `$${formatLargeNumber(tokenPrice.marketCap)}` : 'N/A'}
**24h Volume:** ${tokenPrice.volume24h ? `$${formatLargeNumber(tokenPrice.volume24h)}` : 'N/A'}

Would you like me to show you a chart or provide a more detailed analysis of ${tokenPrice.symbol}?
          `,
          role: 'assistant',
          timestamp: new Date(),
          richContent: {
            type: 'chart',
            data: {
              token: tokenPrice,
              showChart: true
            }
          }
        };
        
        setMessages(prev => [...prev, priceResponse]);
        return true; // Handled
      } catch (error) {
        console.error('Error checking token price:', error);
        const errorMessage = {
          id: Date.now().toString(),
          content: `I encountered an error while checking the price of "${tokenSymbol}". Please try again or with a different token.`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return true; // Handled, even though there was an error
      } finally {
        setIsLoading(false);
      }
    }
    
    return false; // Not handled
  };

  // Handle token analysis requests
  const handleTokenAnalysis = async (message: string): Promise<boolean> => {
    const analysisRegex = /analyze\s+this\s+token\s*[:, ]\s*(.*?)(?:\s*\(([^)]+)\))?$/i;
    const match = message.match(analysisRegex);
    
    if (match) {
      const tokenSymbol = match[1]?.trim() || '';
      const tokenAddress = match[2]?.trim() || '';
      
      if (tokenAddress && tokenAddress.length > 30) {
        setIsLoading(true);
        
        try {
          // Add loading message
          const loadingMessage = {
            id: Date.now().toString(),
            content: `Analyzing ${tokenSymbol ? `token ${tokenSymbol}` : 'token address'}...`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, loadingMessage]);
          
          // Get token data
          const tokenData = await tradeAnalysisService.getTokenByAddress(tokenAddress);
          
          // Remove loading message
          setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
          
          if (!tokenData) {
            const notFoundMessage = {
              id: Date.now().toString(),
              content: `I couldn't find information for the token at address "${tokenAddress}". Please check the address and try again.`,
              role: 'assistant',
              timestamp: new Date()
            };
            setMessages(prev => [...prev, notFoundMessage]);
            return true;
          }
          
          // Show token details with full analysis
          showTokenDetails(tokenData, true);
          return true;
        } catch (error) {
          console.error('Error analyzing token:', error);
          const errorMessage = {
            id: Date.now().toString(),
            content: `I encountered an error while analyzing the token. Please try again or with a different token.`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
          return true;
        } finally {
          setIsLoading(false);
        }
      }
    }
    
    // Check for more generic analysis requests
    const altAnalysisPattern = /analyze(?:\s+token)?\s+([a-zA-Z0-9]{32,})/i;
    const altMatch = message.match(altAnalysisPattern);
    
    if (altMatch) {
      const tokenAddress = altMatch[1];
      setIsLoading(true);
      
      try {
        // Add loading message
        const loadingMessage = {
          id: Date.now().toString(),
          content: `Analyzing token address ${tokenAddress}...`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, loadingMessage]);
        
        // Get token data
        const tokenData = await tradeAnalysisService.getTokenByAddress(tokenAddress);
        
        // Remove loading message
        setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
        
        if (!tokenData) {
          const notFoundMessage = {
            id: Date.now().toString(),
            content: `I couldn't find information for the token at address "${tokenAddress}". Please check the address and try again.`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, notFoundMessage]);
          return true;
        }
        
        // Show token details with full analysis
        showTokenDetails(tokenData, true);
        return true;
      } catch (error) {
        console.error('Error analyzing token:', error);
        const errorMessage = {
          id: Date.now().toString(),
          content: `I encountered an error while analyzing the token. Please try again or with a different token.`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return true;
      } finally {
        setIsLoading(false);
      }
    }
    
    return false;
  };

  // Handle transaction history requests
  const handleTransactionRequest = async (message: string): Promise<boolean> => {
    const txPattern = /(?:show|view|display|get)(?:\s+my)?\s+(?:recent\s+)?(?:transaction|tx|history)/i;
    if (txPattern.test(message)) {
      setIsLoading(true);
      
      try {
        const transactions = await tradeAnalysisService.getRecentTransactions();
        
        if (!transactions || transactions.length === 0) {
          const noTxMessage = {
            id: Date.now().toString(),
            content: `I couldn't find any recent transactions in your wallet. Once you make some trades, they'll appear here.`,
            role: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, noTxMessage]);
          return true;
        }
        
        const txMessage = {
          id: Date.now().toString(),
          content: `Here are your recent transactions:`,
          role: 'assistant',
          timestamp: new Date(),
          richContent: {
            type: 'transactionList',
            data: {
              transactions: transactions
            }
          }
        };
        setMessages(prev => [...prev, txMessage]);
        return true;
      } catch (error) {
        console.error('Error fetching transactions:', error);
        const errorMessage = {
          id: Date.now().toString(),
          content: `I encountered an error while retrieving your transaction history. Please try again later.`,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        return true;
      } finally {
        setIsLoading(false);
      }
    }
    
    return false;
  };

  // Show token details helper
  const showTokenDetails = async (tokenData: any, fullAnalysis = false) => {
    try {
      // If we need full analysis, get more details
      if (fullAnalysis) {
        const enhancedData = await tradeAnalysisService.getEnhancedTokenData(tokenData.address || tokenData.mintAddress);
        if (enhancedData) {
          tokenData = { ...tokenData, ...enhancedData };
        }
      }
      
      // Generate token details message
      let tokenMessage = `
## ${tokenData.symbol || 'Token'} (${tokenData.name || 'Unknown'})

**Price:** $${tokenData.price?.toFixed(6) || 'N/A'}
**24h Change:** ${tokenData.priceChange24h ? `${tokenData.priceChange24h > 0 ? '+' : ''}${tokenData.priceChange24h.toFixed(2)}%` : 'N/A'}
`;

      // Add additional details for full analysis
      if (fullAnalysis) {
        tokenMessage += `
**Market Cap:** ${tokenData.marketCap ? `$${formatLargeNumber(tokenData.marketCap)}` : 'N/A'}
**Fully Diluted Valuation:** ${tokenData.fdv ? `$${formatLargeNumber(tokenData.fdv)}` : 'N/A'}
**24h Volume:** ${tokenData.volume24h ? `$${formatLargeNumber(tokenData.volume24h)}` : 'N/A'}
**Liquidity:** ${tokenData.liquidity ? `$${formatLargeNumber(tokenData.liquidity)}` : 'N/A'}
**Holders:** ${tokenData.holders ? formatLargeNumber(tokenData.holders) : 'N/A'}

### Analysis
${generateTokenAnalysis(tokenData)}
`;
      }
      
      // Add message with token details and chart
      const detailsMessage = {
        id: Date.now().toString(),
        content: tokenMessage,
        role: 'assistant',
        timestamp: new Date(),
        richContent: {
          type: fullAnalysis ? 'tokenInfo' : 'chart',
          data: {
            token: tokenData,
            showChart: true,
            fullAnalysis
          }
        }
      };
      
      setMessages(prev => [...prev, detailsMessage]);
    } catch (error) {
      console.error('Error showing token details:', error);
      const errorMessage = {
        id: Date.now().toString(),
        content: `I encountered an error while retrieving token details. Please try again.`,
        role: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Generate token analysis based on data
  const generateTokenAnalysis = (tokenData: any): string => {
    // This is a placeholder - in a real implementation, you'd use 
    // more sophisticated analysis based on token metrics
    let analysis = '';
    
    // Price momentum
    if (tokenData.priceChange24h) {
      if (tokenData.priceChange24h > 5) {
        analysis += "The token is showing strong bullish momentum with significant gains in the last 24 hours. ";
      } else if (tokenData.priceChange24h > 0) {
        analysis += "The token is showing slight positive momentum. ";
      } else if (tokenData.priceChange24h > -5) {
        analysis += "The token is showing slight bearish momentum. ";
      } else {
        analysis += "The token is showing strong bearish momentum with significant losses in the last 24 hours. ";
      }
    }
    
    // Volume and liquidity analysis
    if (tokenData.volume24h && tokenData.marketCap) {
      const volumeToMcapRatio = (tokenData.volume24h / tokenData.marketCap) * 100;
      if (volumeToMcapRatio > 15) {
        analysis += "Trading volume is very high relative to market cap, indicating strong interest and potentially high volatility. ";
      } else if (volumeToMcapRatio > 5) {
        analysis += "Trading volume is healthy relative to market cap. ";
      } else {
        analysis += "Trading volume is relatively low, which may indicate limited interest or liquidity. ";
      }
    }
    
    // Buy/sell ratio analysis
    if (tokenData.transactions && tokenData.transactions.h24Buys && tokenData.transactions.h24Sells) {
      const buyRatio = tokenData.transactions.h24Buys / (tokenData.transactions.h24Buys + tokenData.transactions.h24Sells);
      if (buyRatio > 0.7) {
        analysis += "There's a strong buying pressure with significantly more buys than sells in the last 24 hours. ";
      } else if (buyRatio > 0.5) {
        analysis += "There's a moderate buying pressure with more buys than sells. ";
      } else if (buyRatio > 0.3) {
        analysis += "There's a moderate selling pressure with more sells than buys. ";
      } else {
        analysis += "There's a strong selling pressure with significantly more sells than buys in the last 24 hours. ";
      }
    }
    
    return analysis || "Insufficient data to provide a detailed analysis at this time.";
  };

  // Format large numbers helper
  const formatLargeNumber = (num: number): string => {
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(2)}B`;
    } else if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(2)}K`;
    } else {
      return num.toFixed(2);
    }
  };

  // Check for token analysis and enhance message
  const checkForTokenAnalysisRequest = async (message: string): Promise<string> => {
    // Check if the message is requesting token analysis
    const analysisRegex = /analyze\s+this\s+token\s*[:, ]\s*(.*?)(?:\s*\(([^)]+)\))?$/i;
    const match = message.match(analysisRegex);
    
    if (match) {
      const tokenSymbol = match[1]?.trim() || '';
      const tokenAddress = match[2]?.trim() || '';
      
      // If we have a token address, use it for analysis
      if (tokenAddress && tokenAddress.length > 30) {
        console.log(`AIAdvisor: Detected token analysis request for address: ${tokenAddress}`);
        
        // Add a special message to indicate loading
        const loadingMessage = {
          id: Date.now().toString(),
          content: '🔍 Analyzing token data from Birdeye... This will take a moment.',
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, loadingMessage]);
        
        try {
          // Fetch token data from Birdeye API
          const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${tokenAddress}`, {
            headers: {
              'X-API-KEY': '1cd74346f55f428ab24c8821e1124ec1'
            }
          });
          
          // Also fetch metadata for more details
          const metaResponse = await fetch(`https://public-api.birdeye.so/defi/token_metadata?address=${tokenAddress}`, {
            headers: {
              'X-API-KEY': '1cd74346f55f428ab24c8821e1124ec1'
            }
          });
          
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          
          const priceData = await response.json();
          const metaData = metaResponse.ok ? await metaResponse.json() : { success: false };
          
          if (priceData.success && priceData.data) {
            const token = priceData.data;
            const meta = metaData.success ? metaData.data : {};
            
            // Create enhanced message with token data
            const enhancedMessage = `Analyze this token: ${tokenSymbol} (${tokenAddress})
            
Token Data:
- Name: ${meta?.name || token.name || 'Unknown'}
- Symbol: ${meta?.symbol || token.symbol || 'Unknown'}
- Price: $${token.value || 0}
- 24h Change: ${token.change24h || 0}%
- Market Cap: $${token.marketCap || 0}
- Fully Diluted Valuation: $${token.fdv || 0}
- Holders: ${token.holders || 'Unknown'}
- 24h Transactions: ${token.txns?.h24 || 0} (${token.txns?.h24Buys || 0} buys, ${token.txns?.h24Sells || 0} sells)`;
            
            // Remove the loading message and process the enhanced message
            setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));
            return enhancedMessage;
          }
        } catch (error) {
          console.error('Error fetching token data:', error);
          // Remove the loading message and continue with original message
          setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));
        }
      }
    }
    
    // If no token analysis detected or failed to fetch data, return the original message
    return message;
  };

  // Handle message sending and special commands
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    // Add user message to chat
    const newUserMessage = {
      id: Date.now().toString(),
      content: userMessage,
      role: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newUserMessage]);
    
    setIsLoading(true);
    
    try {
      // Check for special command patterns
      const handled = await handleTokenSearch(userMessage) ||
                       await handlePriceCheck(userMessage) ||
                       await handleTokenAnalysis(userMessage) ||
                       await handleTransactionRequest(userMessage);
      
      // If not handled by special commands, use general AI
      if (!handled) {
        // Check if this is a token analysis request and enhance the message if needed
        const enhancedMessage = await checkForTokenAnalysisRequest(userMessage);
        
        // Get wallet analysis if needed
        if (!walletAnalysis) {
          const analysis = await tradeAnalysisService.getWalletAnalysis();
          setWalletAnalysis(analysis);
        }
        
        // Get response from AI
        const response = await tradeAnalysisService.getAIResponse(enhancedMessage, walletAnalysis);
        
        // Add AI response to chat
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            content: response,
            role: 'assistant',
            timestamp: new Date()
          }
        ]);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Add error message to chat
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
          role: 'assistant',
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key presses in textarea
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Render token chart component
  const renderTokenChart = (token: any) => {
    if (!token) return null;
    
    const tokenAddress = token.address || token.mintAddress || token.pairAddress;
    
    return (
      <div className="token-chart-container">
        <iframe 
          src={`https://birdeye.so/token/${tokenAddress}?chain=solana&embed=1`}
          title="Token Chart"
          className="token-chart-iframe"
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    );
  };

  // Render transaction list component
  const renderTransactionList = (transactions: any[]) => {
    return (
      <div className="transactions-container">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Token</th>
              <th>Amount</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, index) => (
              <tr key={index} className={tx.type === 'buy' ? 'buy-tx' : 'sell-tx'}>
                <td>{new Date(tx.timestamp).toLocaleDateString()}</td>
                <td className="tx-type">{tx.type.toUpperCase()}</td>
                <td>{tx.cryptoAsset}</td>
                <td>{tx.amount.toFixed(4)}</td>
                <td>${tx.totalValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render wallet dashboard component
  const renderWalletDashboard = (data: any) => {
    const { analysis, balance } = data;
    
    return (
      <div className="wallet-dashboard">
        <div className="dashboard-section balance-section">
          <h3>Your Balance</h3>
          <div className="balance-amount">
            {balance ? `${balance.sol.toFixed(4)} SOL` : 'Loading...'}
          </div>
          <div className="balance-usd">
            {balance ? `$${balance.usdValue.toFixed(2)}` : ''}
          </div>
        </div>
        
        <div className="dashboard-section stats-section">
          <div className="stat-item">
            <div className="stat-label">Success Rate</div>
            <div className="stat-value">{analysis.overallSuccessRate.toFixed(2)}%</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Profit/Loss</div>
            <div className={`stat-value ${analysis.totalProfitLoss >= 0 ? 'positive' : 'negative'}`}>
              ${Math.abs(analysis.totalProfitLoss).toFixed(2)}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Avg Hold</div>
            <div className="stat-value">{analysis.averageHoldTime}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Trading Frequency</div>
            <div className="stat-value">{analysis.tradeFrequency.split(' ')[0]}</div>
          </div>
        </div>
      </div>
    );
  };

  // Render token selection list
  const renderTokenSelection = (data: any) => {
    const { searchResults, query } = data;
    
    return (
      <div className="token-selection">
        <div className="selection-header">
          {searchResults.length} results for "{query}"
        </div>
        <div className="token-list">
          {searchResults.map((token: any, index: number) => (
            <div 
              key={index} 
              className="token-list-item"
              onClick={() => showTokenDetails(token)}
            >
              {token.logoUrl && (
                <img 
                  src={token.logoUrl} 
                  alt={token.symbol} 
                  className="token-logo"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="token-info">
                <div className="token-symbol">{token.symbol}</div>
                <div className="token-name">{token.name}</div>
              </div>
              <div className="token-price">
                ${token.price?.toFixed(6) || 'N/A'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render rich content based on type
  const renderRichContent = (content: Message['richContent']) => {
    if (!content) return null;
    
    switch (content.type) {
      case 'chart':
        return renderTokenChart(content.data.token);
      case 'tokenInfo':
        return content.data.isSearchResults 
          ? renderTokenSelection(content.data)
          : (
            <div className="token-info-container">
              {content.data.showChart && renderTokenChart(content.data.token)}
            </div>
          );
      case 'walletDashboard':
        return renderWalletDashboard(content.data);
      case 'transactionList':
        return renderTransactionList(content.data.transactions);
      default:
        return null;
    }
  };

  // If wallet not connected, show connect prompt
  if (!isConnected) {
    return (
      <div className="ai-advisor">
        <div className="advisor-header">
          <h2>Aibo Trading Advisor</h2>
        </div>
        <div className="connect-wallet-prompt">
          <div className="prompt-icon">🔗</div>
          <h3>Connect Your Wallet</h3>
          <p>Please connect your wallet to receive personalized trading analysis and insights.</p>
          <button className="connect-button" onClick={connect}>Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-advisor">
      <div className="advisor-header">
        <h2>Aibo Trading Advisor</h2>
        {walletBalance && (
          <div className="balance-display">
            <span className="balance-label">Balance:</span>
            <span className="balance-amount">{walletBalance.sol.toFixed(4)} SOL</span>
            <span className="balance-usd">(${walletBalance.usdValue.toFixed(2)})</span>
          </div>
        )}
      </div>
      
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="ai-large-icon">🤖</div>
              <h3>Aibo Advisor</h3>
              <p>Your personal trading assistant is analyzing your wallet...</p>
            </div>
          ) : (
            messages.map(message => (
              <div 
                key={message.id} 
                className={`message ${message.role === 'assistant' ? 'ai-message' : 'user-message'}`}
              >
                <div className="message-bubble">
                  {message.role === 'assistant' ? (
                    <div className="ai-content">
                      <div className="ai-icon">🤖</div>
                      <div 
                        className="message-text" 
                        dangerouslySetInnerHTML={{ 
                          __html: message.content.replace(/\n/g, '<br />').replace(
                            /\*\*(.*?)\*\*/g, '<strong>$1</strong>'
                          ).replace(
                            /## (.*?)($|\n)/g, '<h2>$1</h2>'
                          ).replace(
                            /### (.*?)($|\n)/g, '<h3>$1</h3>'
                          )
                        }}
                      />
                    </div>
                  ) : (
                    <div className="message-text">{message.content}</div>
                  )}
                </div>
                {message.richContent && (
                  <div className="rich-content">
                    {renderRichContent(message.richContent)}
                  </div>
                )}
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
          <textarea
            ref={chatInputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tokens, check prices, ask for analysis..."
            disabled={isLoading}
            rows={1}
          />
          <button type="submit" className="send-button" disabled={isLoading || !inputMessage.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIAdvisor;