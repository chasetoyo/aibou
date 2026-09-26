import { isJapanese, isKana, toHiragana, toRomaji } from 'wanakana';
import type { Token } from './schemas';

export function joinTokens(tokens: Token[]): string {
  return tokens.map((t) => t.surface).join('');
}

// Particles are pronounced differently from how they're spelled.
const PARTICLE_ROMAJI: Record<string, string> = { は: 'wa', へ: 'e', を: 'o' };

/** Romaji for a single token, computed locally from its kana reading. */
export function tokenRomaji(token: Token): string {
  if (token.part_of_speech === 'particle' && PARTICLE_ROMAJI[token.surface]) {
    return PARTICLE_ROMAJI[token.surface];
  }
  if (isPunctuation(token)) return toRomaji(token.surface).trim();
  const source = token.reading || (isKana(token.surface) ? token.surface : '');
  if (!source) return isJapanese(token.surface) ? '' : token.surface;
  return toRomaji(source);
}

/** Romaji for a whole sentence, with spaces between words. */
export function tokensToRomaji(tokens: Token[]): string {
  return tokens
    .map(tokenRomaji)
    .filter((r) => r.trim().length > 0)
    .join(' ')
    .replace(/\s+([.,!?、。！？])/g, '$1');
}

/** True if the token contains kanji, i.e. it's worth showing furigana above it. */
export function needsFurigana(token: Token): boolean {
  return /[一-龯㐀-䶿々]/.test(token.surface) && token.reading.length > 0;
}

/**
 * Normalise the model's reading to hiragana, except for words written in katakana,
 * where the katakana reading is the more useful thing to show.
 */
export function normaliseReading(token: Token): Token {
  if (!token.reading) return token;
  const katakanaWord = /^[゠-ヿー]+$/.test(token.surface);
  return { ...token, reading: katakanaWord ? token.reading : toHiragana(token.reading) };
}

export function isPunctuation(token: Token): boolean {
  return token.part_of_speech === 'punctuation' || /^[\s、。！？!?,.「」『』（）()…・〜ー]+$/.test(token.surface);
}
