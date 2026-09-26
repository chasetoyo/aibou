import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type LookupTarget, WordSheet } from '../components/WordSheet';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { speakJapanese } from '../lib/voice';

export default function VocabScreen() {
  const theme = useTheme();
  const { vocab, removeWord, settings } = useStore();
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<LookupTarget | null>(null);

  const search = () => {
    const q = query.trim();
    if (q) setLookup({ query: q });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Look up a word (日本語 or English)"
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        />
      </View>
      <FlatList
        data={vocab}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            Words you save from conversations show up here. Tap any word in a chat bubble, then “Save word”.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              setLookup({
                query: item.word,
                context: item.context,
                token: {
                  surface: item.word,
                  reading: item.reading,
                  meaning: item.meaning,
                  dictionary_form: item.word,
                  part_of_speech: '',
                },
              })
            }
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: '600' }}>{item.word}</Text>
              {!!item.reading && <Text style={{ color: theme.textMuted }}>{item.reading}</Text>}
              <Text style={{ color: theme.text }}>{item.meaning}</Text>
              {!!item.context && (
                <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={2}>
                  「{item.context}」
                </Text>
              )}
            </View>
            <View style={{ gap: 12, alignItems: 'center' }}>
              <Pressable hitSlop={8} onPress={() => speakJapanese(item.word, { rate: settings.speechRate })}>
                <Text style={{ fontSize: 20 }}>🔊</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => removeWord(item.id)} accessibilityLabel="Delete word">
                <Text style={{ fontSize: 16, color: theme.textMuted }}>✕</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
      <WordSheet target={lookup} onClose={() => setLookup(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { paddingHorizontal: 16, paddingTop: 8 },
  search: { height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24, lineHeight: 22 },
  card: { flexDirection: 'row', padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
});
