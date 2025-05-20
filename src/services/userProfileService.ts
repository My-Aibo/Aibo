import { Trade, TradingPattern } from '../types';

interface TradingBehavior {
  riskTolerance: number; // 1-100 scale
  preferredAssets: string[];
  tradingFrequency: 'high' | 'medium' | 'low';
  averageHoldingPeriod: number; // in days
  psychologicalPatterns: {
    fomoTendency: number; // 1-100 scale
    panicSelling: number; // 1-100 scale
    overconfidence: number; // 1-100 scale
    lossAversion: number; // 1-100 scale
  };
  successfulStrategies: string[];
  preferredExchanges: string[];
}

interface TradingLesson {
  id: string;
  date: Date;
  title: string;
  description: string;
  actionItems: string[];
  relatedTrades: string[]; // Trade IDs
  acknowledged: boolean;
}

interface UserProfile {
  userId: string;
  username: string;
  joinedDate: Date;
  tradingBehavior: TradingBehavior;
  lessons: TradingLesson[];
  watchlist: string[];
  preferredSources: {
    news: string[];
    influencers: string[];
    analysts: string[];
  };
  preferences: {
    theme: string;
    riskTolerance: string;
    investmentGoals: string[];
    notifications: {
      priceAlerts: boolean;
      newsFeed: boolean;
      marketSummary: boolean;
    }
  };
  journalEntries: {
    date: Date;
    content: string;
    mood: 'positive' | 'neutral' | 'negative';
    tags: string[];
  }[];
  tradeJournal: any[];
}

class UserProfileService {
  private profile: UserProfile = {
    userId: '',
    username: '',
    joinedDate: new Date(),
    tradingBehavior: {
      riskTolerance: 50,
      preferredAssets: [],
      tradingFrequency: 'medium',
      averageHoldingPeriod: 30,
      psychologicalPatterns: {
        fomoTendency: 50,
        panicSelling: 50,
        overconfidence: 50,
        lossAversion: 50,
      },
      successfulStrategies: [],
      preferredExchanges: [],
    },
    lessons: [],
    watchlist: [],
    preferredSources: {
      news: [],
      influencers: [],
      analysts: [],
    },
    preferences: {
      theme: 'light',
      riskTolerance: 'medium',
      investmentGoals: [],
      notifications: {
        priceAlerts: true,
        newsFeed: true,
        marketSummary: true
      }
    },
    journalEntries: [],
    tradeJournal: []
  };
  private readonly STORAGE_KEY = 'aibo_user_profile';
  
  constructor() {
    // Initialize with defaults or load from storage
    const savedProfile = localStorage.getItem(this.STORAGE_KEY);
    
    if (savedProfile) {
      try {
        const parsedProfile = JSON.parse(savedProfile);
        // Convert string dates back to Date objects
        if (parsedProfile.lessons) {
          parsedProfile.lessons.forEach((lesson: any) => {
            lesson.date = new Date(lesson.date);
          });
        }
        if (parsedProfile.journalEntries) {
          parsedProfile.journalEntries.forEach((entry: any) => {
            entry.date = new Date(entry.date);
          });
        }
        this.profile = parsedProfile;
      } catch (error) {
        console.error('Error parsing saved profile:', error);
        this.initializeDefaultProfile();
      }
    } else {
      this.initializeDefaultProfile();
    }
  }
    private initializeDefaultProfile() {
    this.profile = {
      userId: `user_${new Date().getTime()}`,
      username: 'DefaultUser',
      joinedDate: new Date(),
      tradingBehavior: {
        riskTolerance: 50,
        preferredAssets: ['SOL'],
        tradingFrequency: 'medium',
        averageHoldingPeriod: 30,
        psychologicalPatterns: {
          fomoTendency: 50,
          panicSelling: 50,
          overconfidence: 50,
          lossAversion: 50,
        },
        successfulStrategies: [],
        preferredExchanges: ['System Program'],
      },
      lessons: [],
      watchlist: ['SOL', 'ETH', 'BTC'],
      preferredSources: {
        news: [],
        influencers: [],
        analysts: [],
      },
      preferences: {
        theme: 'light',
        riskTolerance: 'medium',
        investmentGoals: ['Growth', 'Income'],
        notifications: {
          priceAlerts: true,
          newsFeed: true,
          marketSummary: true
        }
      },
      journalEntries: [],
      tradeJournal: []
    };
    
    // Save to storage
    this.saveProfile();
  }
  
  private saveProfile() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.profile));
  }
  
  getProfile(): UserProfile {
    return {...this.profile};
  }
    updateTradingBehavior(behavior: Partial<TradingBehavior>) {
    // Ensure we maintain all required properties and merge in the updates
    this.profile.tradingBehavior = {
      riskTolerance: this.profile.tradingBehavior.riskTolerance,
      preferredAssets: this.profile.tradingBehavior.preferredAssets,
      tradingFrequency: this.profile.tradingBehavior.tradingFrequency,
      averageHoldingPeriod: this.profile.tradingBehavior.averageHoldingPeriod,
      psychologicalPatterns: this.profile.tradingBehavior.psychologicalPatterns,
      successfulStrategies: this.profile.tradingBehavior.successfulStrategies,
      preferredExchanges: this.profile.tradingBehavior.preferredExchanges,
      ...behavior
    };
    this.saveProfile();
  }
  
  addLesson(lesson: Omit<TradingLesson, 'id' | 'date' | 'acknowledged'>) {
    const newLesson: TradingLesson = {
      id: `lesson_${new Date().getTime()}`,
      date: new Date(),
      ...lesson,
      acknowledged: false
    };
    
    this.profile.lessons.unshift(newLesson);
    this.saveProfile();
    return newLesson;
  }
  
  acknowledgeLesson(lessonId: string) {
    const lesson = this.profile.lessons.find(l => l.id === lessonId);
    if (lesson) {
      lesson.acknowledged = true;
      this.saveProfile();
    }
  }
  
  addToWatchlist(asset: string) {
    if (!this.profile.watchlist.includes(asset)) {
      this.profile.watchlist.push(asset);
      this.saveProfile();
    }
  }
  
  removeFromWatchlist(asset: string) {
    this.profile.watchlist = this.profile.watchlist.filter(a => a !== asset);
    this.saveProfile();
  }
  
  addJournalEntry(entry: { content: string; mood: 'positive' | 'neutral' | 'negative'; tags: string[] }) {
    this.profile.journalEntries.unshift({
      date: new Date(),
      content: entry.content,
      mood: entry.mood,
      tags: entry.tags
    });
    this.saveProfile();
  }
  
  updatePreferredSources(sources: Partial<UserProfile['preferredSources']>) {
    // Ensure we maintain all required properties
    if (sources.news) {
      this.profile.preferredSources.news = sources.news;
    }
    if (sources.influencers) {
      this.profile.preferredSources.influencers = sources.influencers;
    }
    if (sources.analysts) {
      this.profile.preferredSources.analysts = sources.analysts;
    }
    this.saveProfile();
  }
}

export const userProfileService = new UserProfileService();
export type { UserProfile, TradingBehavior, TradingLesson };
