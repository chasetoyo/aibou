import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lookupWord } from '../lib/ai';
import { useApiKey } from '../lib/apiKey';
import { joinTokens, tokenRomaji } from '../lib/japanese';
import type { Token, WordLookup } from '../lib/schemas';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { speakJapanese } from '../lib/voice';
import { AnnotatedText } from './AnnotatedText';
import { Button } from './Button';

export interface LookupTarget {
  /** Present when the learner tapped a word in a sentence. */
  token?: Token;
  /** What to look up: the tapped word, or free text typed into search. */
  query: string;
  /** The sentence the word came from. */
  context?: string;
}

export function WordSheet({ target, onClose }: { target: LookupTarget | null; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const apiKey = useApiKey();
  const settings = useStore((s) => s.settings);
  const saveWord = useStore((s) => s.saveWord);
  const vocab = useStore((s) => s.vocab);
  const [details, setDetails] = useState<WordLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = target?.token;

  const explain = async () => {
    if (!target || !apiKey) return;
    setLoading(true);
    setError(null);
    try {
      setDetails(await lookupWord(apiKey, settings, target.token?.dictionary_form || target.query, target.context));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDetails(null);
    setError(null);
    // Free-text searches have no local info to show, so go straight to the AI.
    if (target && !target.token) explain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const word = details?.word ?? token?.dictionary_form ?? target?.query ?? '';
  const reading = details?.reading ?? token?.reading ?? '';
  const saved = vocab.some((v) => v.word === word);

  const save = () => {
    const base: Token = token ?? {
      surface: word,
      reading,
      meaning: details?.meanings.join('; ') ?? '',
      dictionary_form: word,
      part_of_speech: details?.part_of_speech ?? '',
    };
    saveWord(
      details ? { ...base, dictionary_form: details.word, reading: details.reading, meaning: details.meanings.join('; ') } : base,
      target?.context,
    );
  };

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.word, { color: theme.text }]}>{word}</Text>
              {!!reading && (
                <Text style={{ color: theme.textMuted, fontSize: 16 }}>
                  {reading} · {tokenRomaji({ surface: word, reading, meaning: '', dictionary_form: word, part_of_speech: '' })}
                </Text>
              )}
            </View>
            {!!reading && <Button label="🔊" onPress={() => speakJapanese(word, { rate: settings.speechRate })} />}
          </View>

          {token && token.surface !== token.dictionary_form && (
            <Text style={{ color: theme.textMuted }}>
              Appears as {token.surface} ({token.part_of_speech})
            </Text>
          )}

          {details ? (
            <>
              <Text style={{ color: theme.text, fontSize: 17 }}>{details.meanings.join('; ')}</Text>
              <Text style={{ color: theme.textMuted }}>
                {details.part_of_speech}
                {details.jlpt_level ? ` · JLPT ${details.jlpt_level}` : ''}
              </Text>
              <Text style={{ color: theme.text, lineHeight: 22 }}>{details.explanation}</Text>
              <Text style={[styles.section, { color: theme.textMuted }]}>Examples</Text>
              {details.examples.map((ex, i) => (
                <Pressable
                  key={i}
                  onPress={() => speakJapanese(joinTokens(ex.tokens), { rate: settings.speechRate })}
                  style={[styles.example, { backgroundColor: theme.surfaceMuted }]}
                >
                  <AnnotatedText tokens={ex.tokens} showFurigana showRomaji={settings.showRomaji} size={18} />
                  <Text style={{ color: theme.textMuted, marginTop: 4 }}>{ex.translation}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            token && <Text style={{ color: theme.text, fontSize: 17 }}>{token.meaning}</Text>
          )}

          {loading && <ActivityIndicator color={theme.accent} />}
          {error && <Text style={{ color: theme.danger }}>{error}</Text>}
          {apiKey === null && <Text style={{ color: theme.danger }}>Add your API key in Settings to use lookups.</Text>}

          <View style={styles.actions}>
            {!details && !loading && token && <Button label="Explain more" onPress={explain} primary />}
            <Button label={saved ? 'Saved ✓' : 'Save word'} onPress={save} disabled={saved || loading} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: { fontSize: 34, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  example: { padding: 12, borderRadius: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
