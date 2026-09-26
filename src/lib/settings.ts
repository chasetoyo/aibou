export type Level = 'beginner' | 'elementary' | 'intermediate';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Best explanations and corrections' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Faster replies, lower cost' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const LEVELS: { id: Level; label: string; note: string }[] = [
  { id: 'beginner', label: 'Beginner', note: '~N5 · very short, polite sentences' },
  { id: 'elementary', label: 'Elementary', note: '~N4 · everyday conversation' },
  { id: 'intermediate', label: 'Intermediate', note: '~N3 · natural speech' },
];

export interface Settings {
  level: Level;
  model: ModelId;
  topic: string;
  /** Read the buddy's replies aloud automatically. */
  autoSpeak: boolean;
  /** After the buddy finishes speaking, start listening again automatically. */
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
  level: 'elementary',
  model: 'claude-opus-5',
  topic: '',
  autoSpeak: true,
  handsFree: false,
  autoSendSpeech: true,
  onDeviceRecognition: true,
  showFurigana: true,
  showRomaji: true,
  showTranslation: false,
  speechRate: 0.9,
};
