import React, { useState, useEffect } from 'react';
import { userProfileService } from '../services/userProfileService';
import './TradeJournal.css';

interface JournalEntry {
  date: Date;
  content: string;
  mood: 'positive' | 'neutral' | 'negative';
  tags: string[];
}

const TradeJournal: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [newEntry, setNewEntry] = useState({
    content: '',
    mood: 'neutral' as 'positive' | 'neutral' | 'negative',
    tags: ''
  });
  
  useEffect(() => {
    // Load journal entries from profile
    const profile = userProfileService.getProfile();
    setEntries(profile.journalEntries || []);
  }, []);
  
  const handleAddEntry = () => {
    if (!newEntry.content.trim()) return;
    
    const entry: Omit<JournalEntry, 'date'> = {
      content: newEntry.content,
      mood: newEntry.mood,
      tags: newEntry.tags
        ? newEntry.tags.split(',').map(tag => tag.trim())
        : []
    };
    
    userProfileService.addJournalEntry(entry);
    
    // Update local state
    const profile = userProfileService.getProfile();
    setEntries(profile.journalEntries || []);
    
    // Reset form
    setNewEntry({
      content: '',
      mood: 'neutral',
      tags: ''
    });
  };
  
  return (
    <div className="trade-journal">
      <h2>Trading Journal</h2>
      <p className="journal-intro">
        Record your thoughts, strategies, and emotions to improve future decisions.
        Aibo will analyze your entries to help identify patterns in your trading psychology.
      </p>
      
      <div className="new-entry-form">
        <h3>Add New Entry</h3>
        
        <div className="form-group">
          <label>How are you feeling about the market?</label>
          <div className="mood-selector">
            <button
              className={`mood-button ${newEntry.mood === 'positive' ? 'selected' : ''}`}
              onClick={() => setNewEntry({...newEntry, mood: 'positive'})}
            >
              ?? Positive
            </button>
            <button
              className={`mood-button ${newEntry.mood === 'neutral' ? 'selected' : ''}`}
              onClick={() => setNewEntry({...newEntry, mood: 'neutral'})}
            >
              ?? Neutral
            </button>
            <button
              className={`mood-button ${newEntry.mood === 'negative' ? 'selected' : ''}`}
              onClick={() => setNewEntry({...newEntry, mood: 'negative'})}
            >
              ?? Negative
            </button>
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="journal-content">Your thoughts:</label>
          <textarea
            id="journal-content"
            value={newEntry.content}
            onChange={(e) => setNewEntry({...newEntry, content: e.target.value})}
            placeholder="Share your thoughts on recent trades, market conditions, or strategies you're considering..."
            rows={4}
          ></textarea>
        </div>
        
        <div className="form-group">
          <label htmlFor="journal-tags">Tags (comma separated):</label>
          <input
            id="journal-tags"
            type="text"
            value={newEntry.tags}
            onChange={(e) => setNewEntry({...newEntry, tags: e.target.value})}
            placeholder="e.g., strategy, bitcoin, risk management"
          />
        </div>
        
        <button className="add-entry-button" onClick={handleAddEntry}>
          Save Journal Entry
        </button>
      </div>
      
      <div className="entries-list">
        <h3>Your Journal Entries</h3>
        
        {entries.length === 0 ? (
          <p className="no-entries">No journal entries yet. Start recording your thoughts!</p>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className={`journal-entry mood-${entry.mood}`}>
              <div className="entry-header">
                <span className="entry-date">
                  {entry.date.toLocaleDateString()} at {entry.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
                <span className="entry-mood">
                  {entry.mood === 'positive' && '??'}
                  {entry.mood === 'neutral' && '??'}
                  {entry.mood === 'negative' && '??'}
                </span>
              </div>
              
              <p className="entry-content">{entry.content}</p>
              
              {entry.tags.length > 0 && (
                <div className="entry-tags">
                  {entry.tags.map((tag, i) => (
                    <span key={i} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TradeJournal;
