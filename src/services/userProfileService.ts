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
  tradingBehavior: TradingBehavior;
  lessons: TradingLesson[];
  watchlist: string[];
  preferredSources: {
    news: string[];
    influencers: string[];
    analysts: string[];
  };
  journalEntries: {
    date: Date;
    content: string;
    mood: 'positive' | 'neutral' | 'negative';
    tags: string[];
  }[];
}

class UserProfileService {
  private profile: UserProfile;
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
      journalEntries: [],
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
    this.profile.tradingBehavior = {
      ...this.profile.tradingBehavior,
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
  
  addJournalEntry(entry: Omit<UserProfile['journalEntries'][0], 'date'>) {
    this.profile.journalEntries.unshift({
      date: new Date(),
      ...entry
    });
    this.saveProfile();
  }
  
  updatePreferredSources(sources: Partial<UserProfile['preferredSources']>) {
    this.profile.preferredSources = {
      ...this.profile.preferredSources,
      ...sources
    };
    this.saveProfile();
  }
}

export const userProfileService = new UserProfileService();
export type { UserProfile, TradingBehavior, TradingLesson };
