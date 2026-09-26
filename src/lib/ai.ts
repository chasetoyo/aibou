import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { normaliseReading } from './japanese';
import { buddySystemPrompt, lookupSystemPrompt, suggestionsSystemPrompt } from './prompts';
import {
  type AnnotatedSentence,
  type BuddyTurn,
  BuddyTurnSchema,
  SuggestionsSchema,
  type WordLookup,
  WordLookupSchema,
} from './schemas';
import type { Settings } from './settings';

export type Effort = 'low' | 'medium' | 'high';

/** A turn of conversation as the model sees it. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export class BuddyError extends Error {}

const OPENING = '(The learner just opened the app. Greet them and start a conversation.)';

function client(apiKey: string) {
  return new Anthropic({
    apiKey,
    // The key is the learner's own, entered on this device and kept in the
    // device keychain. The SDK only needs this flag when running on web.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

async function ask<T>(
  apiKey: string,
  settings: Settings,
  schema: z.ZodType<T>,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  effort: Effort,
): Promise<T> {
  try {
    const response = await client(apiKey).beta.messages.parse({
      model: settings.model,
      max_tokens: 16000,
      // Caches the growing conversation so each turn only pays for the new part.
      cache_control: { type: 'ephemeral' },
      system,
      messages,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // If Opus declines a request, let the API retry it on a fallback model.
      ...(settings.model === 'claude-opus-5'
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });

    if (response.stop_reason === 'refusal') {
      throw new BuddyError("Aibou couldn't answer that one. Try rephrasing?");
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new BuddyError('The reply got cut off. Please try again.');
    }
    return response.parsed_output as T;
  } catch (error) {
    throw toBuddyError(error);
  }
}

function toBuddyError(error: unknown): Error {
  if (error instanceof BuddyError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new BuddyError('Your Anthropic API key was rejected. Check it in Settings.');
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new BuddyError("Your API key doesn't have access to this model. Try another model in Settings.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new BuddyError('Too many requests right now. Wait a moment and try again.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new BuddyError("Couldn't reach the server. Check your internet connection.");
  }
  if (error instanceof Anthropic.APIError) {
    return new BuddyError(`Something went wrong (${error.status ?? 'unknown'}). Please try again.`);
  }
  return error instanceof Error ? error : new BuddyError(String(error));
}

function cleanSentence(sentence: AnnotatedSentence): AnnotatedSentence {
  return { ...sentence, tokens: sentence.tokens.map(normaliseReading) };
}

/** The API needs alternating roles starting with the user; merge anything that isn't. */
function toMessages(history: HistoryTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of history) {
    const last = messages[messages.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${turn.text}`;
    } else {
      messages.push({ role: turn.role, content: turn.text });
    }
  }
  // The buddy speaks first in a new conversation, so give it something to reply to.
  // Kept identical on every turn so the cached prefix stays valid.
  if (messages.length === 0 || messages[0].role === 'assistant') {
    messages.unshift({ role: 'user', content: OPENING });
  }
  return messages;
}

export async function buddyTurn(apiKey: string, settings: Settings, history: HistoryTurn[]): Promise<BuddyTurn> {
  const turn = await ask(
    apiKey,
    settings,
    BuddyTurnSchema,
    buddySystemPrompt(settings.level, settings.topic.trim()),
    toMessages(history),
    'low',
  );
  return {
    ...turn,
    reply: cleanSentence(turn.reply),
    user_analysis: { ...turn.user_analysis, tokens: turn.user_analysis.tokens.map(normaliseReading) },
  };
}

export async function lookupWord(
  apiKey: string,
  settings: Settings,
  query: string,
  context?: string,
): Promise<WordLookup> {
  const prompt = context
    ? `Explain 「${query}」 as it's used in this sentence: 「${context}」`
    : `Look up: ${query}`;
  const result = await ask(
    apiKey,
    settings,
    WordLookupSchema,
    lookupSystemPrompt(settings.level),
    [{ role: 'user', content: prompt }],
    'low',
  );
  return { ...result, examples: result.examples.map(cleanSentence) };
}

export async function suggestReplies(
  apiKey: string,
  settings: Settings,
  history: HistoryTurn[],
): Promise<AnnotatedSentence[]> {
  const transcript = history
    .slice(-10)
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Buddy'}: ${t.text}`)
    .join('\n');
  const result = await ask(
    apiKey,
    settings,
    SuggestionsSchema,
    suggestionsSystemPrompt(settings.level),
    [{ role: 'user', content: transcript || 'The conversation has not started yet. Suggest ways to open it.' }],
    'low',
  );
  return result.suggestions.map(cleanSentence);
}
