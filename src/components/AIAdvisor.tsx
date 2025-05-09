// src/components/AIAdvisor.tsx
import React, { useState, useEffect, useRef, useReducer } from 'react';
import { tradeAnalysisService } from '../services/tradeAnalysisService';
import { tradeService } from '../services/tradeService';
import { walletService } from '../services/walletService';
import { useWallet } from '../contexts/WalletContext';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import './AIAdvisor.css';
import { Message } from '../types';

// Add this function to make TypeScript happy with custom events
declare global {
  interface WindowEventMap {
    'walletChanged': CustomEvent;
    'walletDisconnected': CustomEvent;
  }
}

// Define your initial state type
interface AIAdvisorState {
  messages: Message[];
  isLoading: boolean;
  walletAnalysis: any | null;
  walletBalance: any | null;
  error: string | null;
}

// Initial state
const initialState: AIAdvisorState = {
  messages: [],
  isLoading: false,
  walletAnalysis: null,
  walletBalance: null,
  error: null
};

// Type-safe reducer
function reducer(state: AIAdvisorState, action: any): AIAdvisorState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_WALLET_ANALYSIS':
      return { ...state, walletAnalysis: action.payload };
    case 'SET_WALLET_BALANCE':
      return { ...state, walletBalance: action.payload };
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
    default:
      return state;
  }
}

// Export the component properly
export const AIAdvisor: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [inputMessage, setInputMessage] = useState('');
  const [useTestData, setUseTestData] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [dataSource, setDataSource] = useState<'real' | 'test'>('test');
  const [network, setNetwork] = useState<'mainnet' | 'devnet'>('mainnet');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { isConnected, walletInfo } = useWallet();

  useEffect(() => {
    const storedTestMode = localStorage.getItem('useTestData') === 'true';
    setUseTestData(storedTestMode);
  }, []);

  // Add this useEffect to auto-scroll when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle send message
  const handleSendMessage = () => {
    if (!inputMessage.trim() || state.isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      role: 'user',
      timestamp: new Date()
    };
    
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    setInputMessage('');
    handleUserInput(inputMessage);
  };

  // Enhance the handleUserInput function to detect token price queries
  const handleUserInput = async (message: string) => {
    console.log("Processing user message:", message);
    
    // Set loading state
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      // Check for token price queries
      const priceRegex = /(?:price|value|worth|cost)\s+(?:of\s+)?([a-zA-Z0-9]+)|\b([a-zA-Z0-9]{2,10})\b\s+(?:price|value)/i;
      const priceMatch = message.match(priceRegex);
      
      if (priceMatch && (priceMatch[1] || priceMatch[2])) {
        const tokenSymbol = (priceMatch[1] || priceMatch[2]).toUpperCase();
        
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: Date.now().toString(),
            content: `Checking current price for ${tokenSymbol}...`,
            role: 'assistant',
            timestamp: new Date()
          }
        });
        
        try {
          const tokenPrice = await tradeAnalysisService.getTokenPrice(tokenSymbol);
          
          if (tokenPrice) {
            dispatch({
              type: 'ADD_MESSAGE',
              payload: {
                id: Date.now().toString(),
                content: `
## ${tokenSymbol} Current Price

**Price:** $${tokenPrice.price.toFixed(6)}
**24h Change:** ${tokenPrice.priceChange24h && tokenPrice.priceChange24h > 0 ? '+' : ''}${tokenPrice.priceChange24h !== undefined ? tokenPrice.priceChange24h.toFixed(2) : '0.00'}%
**Volume (24h):** ${tokenPrice.volume24h ? `$${(tokenPrice.volume24h).toLocaleString()}` : 'N/A'}
**Market Cap:** ${tokenPrice.marketCap ? `$${(tokenPrice.marketCap).toLocaleString()}` : 'N/A'}

Data sourced from external APIs. Prices are for reference only.
                `,
                role: 'assistant',
                timestamp: new Date()
              }
            });
            return;
          }
        } catch (error) {
          console.error("Error fetching token price:", error);
        }
      }

      // Check for wallet-related queries
      if (message.toLowerCase().includes('wallet') || 
          message.toLowerCase().includes('balance') ||
          message.toLowerCase().includes('trades')) {
        await analyzeWallet();
        return;
      }

      // For any other message, provide a helpful response
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: `I received your message: "${message}". To analyze your wallet or trades, please say "analyze my wallet" or "check my trades".`,
          role: 'assistant',
          timestamp: new Date()
        }
      });
      
      // Auto scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

    } catch (error) {
      console.error("Error processing message:", error);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: "I'm sorry, but I encountered an error processing your request. Please try again.",
          role: 'assistant',
          timestamp: new Date()
        }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Analyze wallet function
  const analyzeWallet = async () => {
    if (!isConnected) {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: "Please connect your wallet first to view your trading analysis.",
          role: 'assistant',
          timestamp: new Date()
        }
      });
      return;
    }
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // Check if wallet is properly connected
      const walletInfo = walletService.getWalletInfo();
      if (!walletInfo || !walletInfo.address) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: Date.now().toString(),
            content: "There seems to be an issue with your wallet connection. Please disconnect and reconnect your wallet.",
            role: 'assistant',
            timestamp: new Date()
          }
        });
        return;
      }
      
      // Add message that we're analyzing
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: `I'm analyzing your wallet (${walletInfo.address.substring(0, 4)}...${walletInfo.address.substring(walletInfo.address.length - 4)}) for SPL token trades. This will take a moment...`,
          role: 'assistant',
          timestamp: new Date()
        }
      });
      
      // Get wallet analytics
      const analysis = await tradeAnalysisService.getLastMonthWalletAnalysis();
      
      // Update state with the analysis
      dispatch({ type: 'SET_WALLET_ANALYSIS', payload: analysis });
      
      // Check if we're using test data
      const isUsingTestData = tradeService.isUsingTestData();
      setDataSource(isUsingTestData ? 'test' : 'real');
      
      // Get the actual trades for display
      const trades = await tradeService.getLast4SPLTrades();
        // Format a nice response with the analysis
      const message = `
## SPL Token Trade Analysis ${isUsingTestData ? '(Demo Data)' : '(Your Real Transactions)'}

I've analyzed your ${isUsingTestData ? 'simulated' : 'recent'} SPL token trades (swaps between SOL and tokens):

### Summary
- Trades Analyzed: ${isUsingTestData ? '4 sample trades' : `${trades.length} recent trades`}
- Performance: ${analysis && analysis.totalProfitLoss >= 0 ? '+' : ''}$${analysis ? Math.abs(analysis.totalProfitLoss).toFixed(2) : '0.00'} overall
${analysis && analysis.averageHoldTime && analysis.averageHoldTime !== 'N/A' ? `- Average Hold Time: ${analysis.averageHoldTime}` : ''}

### Token Performance
- Most Profitable: ${analysis ? analysis.mostProfitableToken : 'Unknown'}
${analysis && analysis.leastProfitableToken ? `- Least Profitable: ${analysis.leastProfitableToken}` : ''}

### Recent SPL Trades
${trades.map((trade, index) => 
  `${index + 1}. ${trade.type.toUpperCase()} ${trade.amount.toLocaleString()} ${trade.cryptoAsset} @ $${trade.price.toFixed(6)} 
   (${new Date(trade.timestamp).toLocaleDateString()}) via ${trade.exchange}`
).join('\n')}

### Recommendations
${analysis && analysis.recommendations ? analysis.recommendations.map(rec => `- ${rec}`).join('\n') : '- Not enough data for recommendations'}

${isUsingTestData ? 
  '**Note: This analysis uses sample data since we couldn\'t parse your real transactions or you don\'t have enough SOL-SPL swap history in your wallet.**' : 
  '**This analysis is based on your actual SPL transaction history.**'}

${isUsingTestData ? '_To see real data, you need a wallet with recent SPL token swap transactions with SOL._' : ''}
`;
      
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: message,
          role: 'assistant',
          timestamp: new Date()
        }
      });
      
      // Auto scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error("Error during wallet analysis:", error);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: `I encountered an error analyzing your wallet: ${error instanceof Error ? error.message : 'Unknown error'}. This could be due to API rate limits or connection issues. Please try again later.`,
          role: 'assistant',
          timestamp: new Date()
        }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Add this somewhere in your component, where appropriate
  const toggleForceRealData = () => {
    const currentValue = localStorage.getItem('forceRealData') === 'true';
    localStorage.setItem('forceRealData', (!currentValue).toString());
    
    // Show feedback to the user
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        id: Date.now().toString(),
        content: `Force real data mode is now ${!currentValue ? 'ON' : 'OFF'}. ${!currentValue ? 'The app will attempt to analyze your real transactions even if they cannot be parsed as trades.' : 'The app will fall back to sample data if no trades can be parsed.'}`,
        role: 'assistant',
        timestamp: new Date()
      }
    });
  };

  // Update the switchNetwork function to handle errors gracefully
  const switchNetwork = (selectedNetwork: 'mainnet' | 'devnet') => {
    try {
      setNetwork(selectedNetwork);
      
      // Check if the wallet service has the switchNetwork method
      if (typeof walletService.switchNetwork === 'function') {
        walletService.switchNetwork(selectedNetwork);
        
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: Date.now().toString(),
            content: `Network switched to ${selectedNetwork.toUpperCase()}. Your wallet data will now be fetched from ${selectedNetwork}.`,
            role: 'assistant',
            timestamp: new Date()
          }
        });
      } else {
        // Fall back if the method doesn't exist
        console.error("switchNetwork method not available in walletService");
        
        // Just update UI but show a message about the issue
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: Date.now().toString(),
            content: `Network switching is temporarily unavailable. Please refresh the page and try again.`,
            role: 'assistant',
            timestamp: new Date()
          }
        });
      }
    } catch (error) {
      console.error("Error switching network:", error);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: `Error switching network: ${error instanceof Error ? error.message : 'Unknown error'}`,
          role: 'assistant',
          timestamp: new Date()
        }
      });
    }
  };

  // Add this function to your component
  const refreshWalletBalance = async () => {
    if (!isConnected) return;
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const walletInfo = walletService.getWalletInfo();
      if (walletInfo && walletInfo.address) {
        const balanceData = await tradeAnalysisService.getWalletBalance(walletInfo.address);
        
        dispatch({ 
          type: 'SET_WALLET_BALANCE', 
          payload: balanceData
        });
        
        // Show a message with the updated balance
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            id: Date.now().toString(),
            content: `
## Wallet Balance Refreshed
- SOL Balance: ${balanceData.sol.toFixed(6)} SOL
- Value: $${balanceData.usdValue.toFixed(2)} USD
          `,
            role: 'assistant',
            timestamp: new Date()
          }
        });
      }
    } catch (error) {
      console.error("Error refreshing wallet balance:", error);
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          content: "I couldn't refresh your wallet balance. Please try again later.",
          role: 'assistant',
          timestamp: new Date()
        }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Add this function to your component
  const clearChat = () => {
    dispatch({ type: 'CLEAR_MESSAGES' });
    // Reset the data source indicator too
    setDataSource('test');
  };

  // Render function for messages
  const renderMessageContent = (content: string) => {
    const parsedContent = marked.parse(content) as string; // Ensure synchronous parsing
    const sanitizedContent = DOMPurify.sanitize(parsedContent);
    return <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;
  };

  // Return the UI
  return (
    <div className="ai-advisor">
      <div className="chat-container">
        {state.messages.length === 0 ? (
          <div className="empty-chat">
            <p>Welcome! Connect your wallet to get started.</p>
          </div>
        ) : (
          <div className="messages-container">
            {state.messages.map((message, index) => (
              <div 
                key={`${message.id}-${index}`} // Add index to ensure uniqueness
                className={`message ${message.role === 'assistant' ? 'ai-message' : 'user-message'}`}
              >
                {renderMessageContent(message.content)}
              </div>
            ))}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
        )}
      </div>
      
      {isConnected && (
        <div className={`data-source-indicator ${dataSource}`}>
          <span className="indicator-dot"></span>
          {dataSource === 'real' ? 'Using Real Transaction Data' : 'Using Demo Data'}
        </div>
      )}

      <div className="app-settings">
        <div className="setting-item">
          <span>Force Real Data:</span>
          <label className="switch">
            <input 
              type="checkbox"
              checked={localStorage.getItem('forceRealData') === 'true'}
              onChange={toggleForceRealData}
            />
            <span className="slider round"></span>
          </label>
        </div>
        
        <div className="setting-item">
          <span>Network:</span>
          <div className="network-selector">
            <button 
              className={network === 'mainnet' ? 'active' : ''}
              onClick={() => switchNetwork('mainnet')}
            >
              Mainnet
            </button>
            <button 
              className={network === 'devnet' ? 'active' : ''}
              onClick={() => switchNetwork('devnet')}
            >
              Devnet
            </button>
          </div>
        </div>
      </div>

      <div className="chat-input">
        <textarea
          ref={chatInputRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me about your trading history..."
          disabled={state.isLoading || !isConnected}
        />
        <button 
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || state.isLoading || !isConnected}
        >
          Send
        </button>
      </div>

      <button 
        className="refresh-button"
        onClick={refreshWalletBalance}
        disabled={!isConnected || state.isLoading}
      >
        Refresh Balance
      </button>

      <button 
        className="clear-chat-button"
        onClick={clearChat}
        disabled={state.isLoading || state.messages.length === 0}
      >
        Clear Chat
      </button>
    </div>
  );
};

export default AIAdvisor;
