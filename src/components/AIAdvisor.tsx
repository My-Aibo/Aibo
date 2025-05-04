// src/components/AIAdvisor.tsx
import React, { useState, useEffect, useRef } from 'react';
import { tradeAnalysisService } from '../services/tradeAnalysisService';
import { useWallet } from '../contexts/WalletContext';
import './AIAdvisor.css';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
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
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletAnalysis, setWalletAnalysis] = useState<WalletAnalysis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isConnected, walletInfo } = useWallet(); // Use the wallet context

  // Start analysis when wallet is connected
  useEffect(() => {
    if (isConnected && walletInfo) {
      analyzeWallet();
    }
  }, [isConnected, walletInfo]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const analyzeWallet = async () => {
    setLoading(true);
    
    // Add initial message
    addMessage('I\'m analyzing your wallet history now. This will take just a moment...', 'ai');
    
    try {
      // Fetch wallet analysis data
      const analysis = await tradeAnalysisService.getWalletAnalysis();
      setWalletAnalysis(analysis);
      
      // Generate and display analysis message
      const welcomeMessage = generateWelcomeMessage(analysis);
      addMessage(welcomeMessage, 'ai');
    } catch (error) {
      console.error('Error analyzing wallet:', error);
      addMessage('Sorry, I had trouble analyzing your wallet. Please make sure you have some trading history or try again later.', 'ai');
    } finally {
      setLoading(false);
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

What would you like to know more about? You can ask me about specific tokens, your trading patterns, or how to improve your strategy.
    `;
  };

  const addMessage = (content: string, sender: 'user' | 'ai') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      sender,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    // Add user message
    addMessage(inputText, 'user');
    
    // Clear input
    setInputText('');
    
    // Process user message and generate AI response
    setLoading(true);
    
    try {
      const response = await tradeAnalysisService.getAIResponse(inputText, walletAnalysis);
      addMessage(response, 'ai');
    } catch (error) {
      console.error('Error getting AI response:', error);
      addMessage('Sorry, I encountered an error processing your request. Please try again.', 'ai');
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (message: Message) => {
    return (
      <div 
        key={message.id} 
        className={`message ${message.sender === 'ai' ? 'ai-message' : 'user-message'}`}
      >
        <div className="message-bubble">
          {message.sender === 'ai' ? (
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
        <div className="message-time">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    );
  };

  // Handle wallet connection state using context
  if (!isConnected) {
    return (
      <div className="ai-advisor">
        <h2>Aibo Trading Advisor</h2>
        <div className="connect-wallet-prompt">
          <div className="prompt-icon">🔗</div>
          <h3>Connect Your Wallet</h3>
          <p>Please connect your wallet using the button in the upper right corner to receive personalized trading analysis and insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-advisor">
      <h2>Aibo Trading Advisor</h2>
      
      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="ai-large-icon">🤖</div>
              <h3>Aibo Advisor</h3>
              <p>Your personal trading assistant is analyzing your wallet...</p>
            </div>
          ) : (
            messages.map(message => renderMessage(message))
          )}
          {loading && (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask about your trading history or specific tokens..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !inputText.trim()}>
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