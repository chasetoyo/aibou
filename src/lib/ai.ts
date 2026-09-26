import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { normaliseReading } from './japanese';
import {
  annotateSystemPrompt,
  buddySystemPrompt,
  lookupSystemPrompt,
  suggestionsSystemPrompt,
  talkSystemPrompt,
} from './prompts';
import {
  type AnnotatedSentence,
  type BuddyTurn,
  BuddyTurnSchema,
  type ExchangeAnnotation,
  ExchangeAnnotationSchema,
  SuggestionsSchema,
  type WordLookup,
  WordLookupSchema,
} from './schemas';
import type { ModelId, Settings } from './settings';

export type Effort = 'low' | 'medium' | 'high';

/** A turn of conversation as the model sees it. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export class BuddyError extends Error {}

const OPENING = '(The learner just opened the app. Greet them and start a conversation.)';

// On iOS/Android, Expo's global `fetch` supports streamed responses, which the
// SDK needs for `messages.stream`.
function client(apiKey: string) {
  return new Anthropic({
    apiKey,
    // The key is the learner's own, entered on this device and kept in the
    // device keychain. The SDK only needs this flag when running on web.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

/** If Opus declines a request, let the API retry it on a fallback model. */
function fallbackParams(model: ModelId) {
  return model === 'claude-opus-5'
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};
}

async function ask<T>(
  apiKey: string,
  model: ModelId,
  schema: z.ZodType<T>,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  effort: Effort,
): Promise<T> {
  try {
    const response = await client(apiKey).beta.messages.parse({
      model,
      max_tokens: 16000,
      // Caches the growing conversation so each turn only pays for the new part.
      cache_control: { type: 'ephemeral' },
      system,
      messages,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      ...fallbackParams(model),
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
    settings.model,
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
    settings.model,
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
    settings.mode === 'talk' ? settings.talkModel : settings.model,
    SuggestionsSchema,
    suggestionsSystemPrompt(settings.level),
    [{ role: 'user', content: transcript || 'The conversation has not started yet. Suggest ways to open it.' }],
    'low',
  );
  return result.suggestions.map(cleanSentence);
}

/**
 * Free talk: stream a plain-Japanese reply so it can be spoken sentence by
 * sentence while the rest is still being written. Aborting `signal` (the
 * learner talked over Aibou) returns whatever was written so far.
 */
export async function streamTalkReply(
  apiKey: string,
  settings: Settings,
  history: HistoryTurn[],
  onText: (delta: string) => void,
  signal: AbortSignal,
): Promise<{ text: string; interrupted: boolean }> {
  let text = '';
  try {
    const stream = client(apiKey).beta.messages.stream(
      {
        model: settings.talkModel,
        max_tokens: 16000,
        cache_control: { type: 'ephemeral' },
        system: talkSystemPrompt(settings.level, settings.topic.trim()),
        messages: toMessages(history),
        output_config: { effort: 'low' },
        ...fallbackParams(settings.talkModel),
      },
      { signal },
    );
    stream.on('text', (delta) => {
      text += delta;
      onText(delta);
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new BuddyError("Aibou couldn't answer that one. Try saying it another way?");
    }
    return { text, interrupted: false };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return { text, interrupted: true };
    throw toBuddyError(error);
  }
}

/**
 * Free talk: after a reply has been spoken, fill in the reader view (readings,
 * romaji, word lookups) for the learner's message and the reply.
 */
export async function annotateExchange(
  apiKey: string,
  settings: Settings,
  learnerText: string | null,
  replyText: string,
): Promise<ExchangeAnnotation> {
  const prompt = `Learner: ${learnerText ?? '(nothing — Aibou opened the conversation)'}\nAibou: ${replyText}`;
  const result = await ask(
    apiKey,
    settings.talkModel,
    ExchangeAnnotationSchema,
    annotateSystemPrompt(),
    [{ role: 'user', content: prompt }],
    'low',
  );
  return { learner: cleanSentence(result.learner), reply: cleanSentence(result.reply) };
}
