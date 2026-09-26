import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { HistoryTurn } from './ai';
import { joinTokens } from './japanese';
import type { AnnotatedSentence, BuddyTurn, ExchangeAnnotation, Token } from './schemas';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export interface UserMessage {
  id: string;
  role: 'user';
  createdAt: number;
  text: string;
  /** Filled in once the buddy has replied. */
  analysis?: BuddyTurn['user_analysis'];
}

export interface BuddyMessage {
  id: string;
  role: 'buddy';
  createdAt: number;
  /** What Aibou said, in plain Japanese. */
  text: string;
  /** Word-by-word reader view. In free talk this arrives shortly after the text. */
  reply?: AnnotatedSentence;
  explanation: string;
  /** The learner talked over Aibou. */
  interrupted?: boolean;
  /** When interrupted: the part the learner actually heard. */
  heard?: string;
}

export type Message = UserMessage | BuddyMessage;

export interface VocabEntry {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  /** The sentence it was found in, if any. */
  context?: string;
  addedAt: number;
}

interface State {
  settings: Settings;
  messages: Message[];
  vocab: VocabEntry[];
  updateSettings: (patch: Partial<Settings>) => void;
  addUserMessage: (text: string) => UserMessage;
  applyBuddyTurn: (userMessageId: string | null, turn: BuddyTurn) => void;
  addBuddyText: (text: string, interrupted: boolean, heard?: string) => BuddyMessage;
  markInterrupted: (buddyMessageId: string, heard: string) => void;
  applyAnnotation: (userMessageId: string | null, buddyMessageId: string, annotation: ExchangeAnnotation) => void;
  clearConversation: () => void;
  saveWord: (token: Token, context?: string) => void;
  removeWord: (id: string) => void;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useStore = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      messages: [],
      vocab: [],
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      addUserMessage: (text) => {
        const message: UserMessage = { id: newId(), role: 'user', createdAt: Date.now(), text };
        set((s) => ({ messages: [...s.messages, message] }));
        return message;
      },
      applyBuddyTurn: (userMessageId, turn) =>
        set((s) => ({
          messages: [
            ...s.messages.map((m) =>
              m.id === userMessageId && m.role === 'user' ? { ...m, analysis: turn.user_analysis } : m,
            ),
            {
              id: newId(),
              role: 'buddy',
              createdAt: Date.now(),
              text: joinTokens(turn.reply.tokens),
              reply: turn.reply,
              explanation: turn.explanation,
            },
          ],
        })),
      addBuddyText: (text, interrupted, heard) => {
        const message: BuddyMessage = {
          id: newId(),
          role: 'buddy',
          createdAt: Date.now(),
          text,
          explanation: '',
          interrupted,
          heard: interrupted ? heard : undefined,
        };
        set((s) => ({ messages: [...s.messages, message] }));
        return message;
      },
      markInterrupted: (buddyMessageId, heard) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === buddyMessageId && m.role === 'buddy' ? { ...m, interrupted: true, heard } : m,
          ),
        })),
      applyAnnotation: (userMessageId, buddyMessageId, annotation) =>
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id === buddyMessageId && m.role === 'buddy') return { ...m, reply: annotation.reply };
            if (m.id === userMessageId && m.role === 'user' && !m.analysis) {
              return {
                ...m,
                analysis: {
                  tokens: annotation.learner.tokens,
                  translation: annotation.learner.translation,
                  correction: '',
                  feedback: '',
                },
              };
            }
            return m;
          }),
        })),
      clearConversation: () => set({ messages: [] }),
      saveWord: (token, context) =>
        set((s) => {
          const word = token.dictionary_form || token.surface;
          if (s.vocab.some((v) => v.word === word)) return s;
          const entry: VocabEntry = {
            id: newId(),
            word,
            reading: token.reading,
            meaning: token.meaning,
            context,
            addedAt: Date.now(),
          };
          return { vocab: [entry, ...s.vocab] };
        }),
      removeWord: (id) => set((s) => ({ vocab: s.vocab.filter((v) => v.id !== id) })),
    }),
    {
      name: 'aibou-store',
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { messages?: Message[] };
        // v1 buddy messages had only the annotated reply, not plain text.
        if (version < 2 && state.messages) {
          state.messages = state.messages.map((m) =>
            m.role === 'buddy' && !m.text && m.reply ? { ...m, text: joinTokens(m.reply.tokens) } : m,
          );
        }
        return state as State;
      },
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        // New settings added in later versions pick up their defaults.
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

/** How the conversation is replayed to the model. */
export function toHistory(messages: Message[]): HistoryTurn[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', text: m.text };
    // If the learner cut Aibou off, the model should only remember what was heard.
    let text = m.interrupted ? `${m.heard ?? m.text}… [interrupted]` : m.text;
    if (m.explanation) text += `\n\n[Explanation I gave in English: ${m.explanation}]`;
    return { role: 'assistant', text };
  });
}
