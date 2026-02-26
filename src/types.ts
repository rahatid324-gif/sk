export type SignalType = 'BUY' | 'SELL' | 'HOLD';

export interface TradingSignal {
  type: SignalType;
  confidence: number;
  timeframe: string;
  explanation: string;
}

export interface HistoryItem {
  id: number;
  image_data: string;
  signal_type: SignalType;
  confidence: number;
  timeframe: string;
  explanation: string;
  language: 'en' | 'bn';
  created_at: string;
}

export type Language = 'en' | 'bn';
