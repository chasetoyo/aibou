import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPunctuation,
  joinTokens,
  looksLikeEcho,
  needsFurigana,
  normaliseReading,
  takeSentences,
  tokensToRomaji,
} from './japanese.ts';

const t = (surface: string, reading: string, part_of_speech = 'noun') => ({
  surface,
  reading,
  meaning: '',
  dictionary_form: surface,
  part_of_speech,
});

const sentence = [
  t('今日', 'きょう'),
  t('は', 'は', 'particle'),
  t('コーヒー', 'コーヒー'),
  t('を', 'を', 'particle'),
  t('飲みました', 'のみました', 'verb'),
  t('。', '', 'punctuation'),
];

test('joinTokens reproduces the sentence', () => {
  assert.equal(joinTokens(sentence), '今日はコーヒーを飲みました。');
});

test('tokensToRomaji spaces words and attaches punctuation', () => {
  assert.equal(tokensToRomaji(sentence), 'kyou wa koohii o nomimashita.');
});

test('needsFurigana only for kanji with a reading', () => {
  assert.equal(needsFurigana(sentence[0]), true);
  assert.equal(needsFurigana(sentence[2]), false);
  assert.equal(needsFurigana(t('今日', '')), false);
});

test('normaliseReading converts katakana readings for kanji words only', () => {
  assert.equal(normaliseReading(t('今日', 'キョウ')).reading, 'きょう');
  assert.equal(normaliseReading(t('コーヒー', 'コーヒー')).reading, 'コーヒー');
});

test('isPunctuation', () => {
  assert.equal(isPunctuation(sentence[5]), true);
  assert.equal(isPunctuation(t('！', '', 'symbol')), true);
  assert.equal(isPunctuation(sentence[1]), false);
});

test('takeSentences splits finished sentences and keeps the remainder', () => {
  assert.deepEqual(takeSentences('そうなんだ！どこに行ったの？私は昨日'), {
    sentences: ['そうなんだ！', 'どこに行ったの？'],
    rest: '私は昨日',
  });
  assert.deepEqual(takeSentences('「いいね。」と言った'), { sentences: ['「いいね。」'], rest: 'と言った' });
  assert.deepEqual(takeSentences('まだ途中'), { sentences: [], rest: 'まだ途中' });
});

test('looksLikeEcho recognises the buddy hearing itself', () => {
  const spoken = '週末は何をする予定ですか？';
  assert.equal(looksLikeEcho('週末は何をする予定', spoken), true);
  assert.equal(looksLikeEcho('えっと', spoken), false);
  assert.equal(looksLikeEcho('ちょっと待って', spoken), false);
  assert.equal(looksLikeEcho('あ', spoken), true);
});
