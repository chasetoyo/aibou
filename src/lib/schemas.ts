import { z } from 'zod';

/**
 * One word/segment of a Japanese sentence. Joining every `surface` in order
 * must reproduce the original sentence exactly (punctuation included), so the
 * UI can render the sentence from tokens alone.
 */
export const TokenSchema = z.object({
  surface: z.string().describe('The text exactly as it appears in the sentence.'),
  reading: z
    .string()
    .describe('Reading in hiragana (katakana words stay katakana). Empty string for punctuation.'),
  meaning: z
    .string()
    .describe('Short English gloss in context, e.g. "to eat (polite past)". Empty for punctuation.'),
  dictionary_form: z
    .string()
    .describe('Dictionary form, e.g. 食べる for 食べました. Same as surface if uninflected.'),
  part_of_speech: z.string().describe('e.g. noun, verb, i-adjective, particle, punctuation.'),
});

export const AnnotatedSentenceSchema = z.object({
  tokens: z.array(TokenSchema),
  translation: z.string().describe('Natural English translation.'),
});

export const BuddyTurnSchema = z.object({
  user_analysis: z.object({
    tokens: z
      .array(TokenSchema)
      .describe("The learner's latest message split into tokens. Empty array if it contained no Japanese."),
    translation: z.string().describe("English translation of the learner's message. Empty if it was English."),
    correction: z
      .string()
      .describe(
        'A more natural or correct way to say what the learner meant, in Japanese. Empty string if their Japanese was already natural or they wrote in English.',
      ),
    feedback: z
      .string()
      .describe('One or two short English sentences explaining the correction. Empty if no correction.'),
  }),
  reply: AnnotatedSentenceSchema.describe('Your spoken reply, in Japanese.'),
  explanation: z
    .string()
    .describe(
      'English explanation when the learner asked about grammar, vocabulary, culture, or a concept. Empty string otherwise.',
    ),
});

export const WordLookupSchema = z.object({
  word: z.string(),
  reading: z.string().describe('Hiragana reading.'),
  meanings: z.array(z.string()).describe('Main English meanings, most common first.'),
  part_of_speech: z.string(),
  jlpt_level: z.string().describe('Approximate JLPT level (N5–N1), or empty if unknown.'),
  explanation: z
    .string()
    .describe('A short English explanation of nuance, usage, and anything that commonly confuses learners.'),
  examples: z.array(AnnotatedSentenceSchema).describe('Two or three simple example sentences.'),
});

export const SuggestionsSchema = z.object({
  suggestions: z.array(AnnotatedSentenceSchema).describe('Three things the learner could say next.'),
});

export type Token = z.infer<typeof TokenSchema>;
export type AnnotatedSentence = z.infer<typeof AnnotatedSentenceSchema>;
export type BuddyTurn = z.infer<typeof BuddyTurnSchema>;
export type WordLookup = z.infer<typeof WordLookupSchema>;
