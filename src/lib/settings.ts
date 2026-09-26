export type Level = 'beginner' | 'elementary' | 'intermediate' | 'advanced';

/** Free talk: a natural conversation partner. Learn: a tutor that corrects and explains. */
export type Mode = 'talk' | 'learn';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Best explanations and corrections' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Faster replies, lower cost' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const LEVELS: { id: Level; label: string; note: string }[] = [
  { id: 'beginner', label: 'Beginner', note: '~N5 · very short, polite sentences' },
  { id: 'elementary', label: 'Elementary', note: '~N4 · everyday conversation' },
  { id: 'intermediate', label: 'Intermediate', note: '~N3 · natural speech' },
  { id: 'advanced', label: 'Advanced', note: 'Talk to me like a Japanese friend would' },
];

export const MODES: { id: Mode; label: string; note: string }[] = [
  { id: 'talk', label: 'Free talk', note: 'Just have a conversation. Fast replies, no corrections.' },
  { id: 'learn', label: 'Learning', note: 'Corrects your Japanese and explains grammar as you go.' },
];

export interface Settings {
  mode: Mode;
  level: Level;
  /** Model for learning mode and word lookups. */
  model: ModelId;
  /** Model for free talk, where reply speed matters most. */
  talkModel: ModelId;
  topic: string;
  /** Read the buddy's replies aloud automatically. */
  autoSpeak: boolean;
  /**
   * Keep the microphone open for the whole conversation: a pause ends your turn,
   * and no buttons are needed.
   */
  openMic: boolean;
  /** With the open mic, talking while Aibou speaks cuts it off. */
  bargeIn: boolean;
  /** How long a pause (ms) ends your turn with the open mic. */
  pauseMs: number;
  /** Tap-to-talk only: after the buddy finishes speaking, start listening again automatically. */
  handsFree: boolean;
  /** Send speech as soon as recognition finishes instead of letting you edit it first. */
  autoSendSpeech: boolean;
  /** Keep audio on the phone (iOS / Android 13+ with a downloaded Japanese model). */
  onDeviceRecognition: boolean;
  showFurigana: boolean;
  showRomaji: boolean;
  showTranslation: boolean;
  speechRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'talk',
  level: 'elementary',
  model: 'claude-opus-5',
  talkModel: 'claude-sonnet-5',
  topic: '',
  autoSpeak: true,
  openMic: true,
  bargeIn: true,
  pauseMs: 1200,
  handsFree: false,
  autoSendSpeech: true,
  onDeviceRecognition: true,
  showFurigana: true,
  showRomaji: true,
  showTranslation: false,
  speechRate: 0.9,
};
