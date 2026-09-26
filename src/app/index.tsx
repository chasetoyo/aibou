import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnotatedText } from '../components/AnnotatedText';
import { Button } from '../components/Button';
import { BuddyBubble, UserBubble } from '../components/MessageBubble';
import { type LookupTarget, WordSheet } from '../components/WordSheet';
import { buddyTurn, suggestReplies } from '../lib/ai';
import { useApiKey } from '../lib/apiKey';
import { joinTokens } from '../lib/japanese';
import type { AnnotatedSentence } from '../lib/schemas';
import { type Message, toHistory, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { useSpeechInput } from '../lib/useSpeechInput';
import { speakJapanese, stopSpeaking } from '../lib/voice';

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const apiKey = useApiKey();
  const { settings, messages, addUserMessage, applyBuddyTurn } = useStore();

  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [lookup, setLookup] = useState<LookupTarget | null>(null);
  const [suggestions, setSuggestions] = useState<AnnotatedSentence[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const startListeningRef = useRef<() => void>(() => {});

  /** Ask the buddy to respond to the conversation as it currently stands. */
  const runTurn = useCallback(
    async (userMessageId: string | null) => {
      if (!apiKey) {
        setError('Add your Anthropic API key in Settings to start talking.');
        return;
      }
      setThinking(true);
      setError(null);
      try {
        const history = toHistory(useStore.getState().messages);
        const turn = await buddyTurn(apiKey, settings, history);
        applyBuddyTurn(userMessageId, turn);
        if (settings.autoSpeak) {
          speakJapanese(joinTokens(turn.reply.tokens), {
            rate: settings.speechRate,
            onDone: settings.handsFree ? () => startListeningRef.current() : undefined,
          });
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setThinking(false);
      }
    },
    [apiKey, settings, applyBuddyTurn],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;
      setDraft('');
      setSuggestions(null);
      const message = addUserMessage(trimmed);
      runTurn(message.id);
    },
    [addUserMessage, runTurn, thinking],
  );

  const speech = useSpeechInput({
    preferOnDevice: settings.onDeviceRecognition,
    onFinal: (text) => (settings.autoSendSpeech ? send(text) : setDraft(text)),
  });
  startListeningRef.current = speech.start;

  const retry = () => {
    const last = messages[messages.length - 1];
    runTurn(last?.role === 'user' ? last.id : null);
  };

  const showSuggestions = async () => {
    if (suggestions) return setSuggestions(null);
    if (!apiKey) return setError('Add your Anthropic API key in Settings first.');
    setLoadingSuggestions(true);
    try {
      setSuggestions(await suggestReplies(apiKey, settings, toHistory(messages)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, thinking]);

  const lastIsUser = messages[messages.length - 1]?.role === 'user';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable hitSlop={10} onPress={() => router.push('/vocab')}>
              <Text style={{ color: theme.accent, fontSize: 16 }}>単語 Words</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable hitSlop={10} onPress={() => router.push('/settings')}>
              <Text style={{ color: theme.accent, fontSize: 16 }}>Settings</Text>
            </Pressable>
          ),
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        renderItem={({ item }) =>
          item.role === 'buddy' ? (
            <BuddyBubble
              message={item}
              settings={settings}
              onTokenPress={(token, context) => setLookup({ token, query: token.surface, context })}
              onExplain={(sentence) =>
                send(`Could you explain 「${sentence}」 in English? Break down the grammar and vocabulary.`)
              }
            />
          ) : (
            <UserBubble
              message={item}
              settings={settings}
              onTokenPress={(token, context) => setLookup({ token, query: token.surface, context })}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>こんにちは！</Text>
            <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
              Aibou is your Japanese speaking buddy. Tap the mic and talk in Japanese. If you get stuck, ask in
              English, tap any word to look it up, or tap 💡 for ideas of what to say.
            </Text>
            {apiKey === null ? (
              <Button primary label="Add your API key" onPress={() => router.push('/settings')} />
            ) : (
              <Button primary label="Start a conversation" onPress={() => runTurn(null)} disabled={thinking} />
            )}
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {thinking && (
              <View style={styles.thinking}>
                <ActivityIndicator color={theme.accent} />
                <Text style={{ color: theme.textMuted }}>考え中…</Text>
              </View>
            )}
            {error && (
              <View style={[styles.error, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger, flex: 1 }}>{error}</Text>
                {apiKey && lastIsUser && !thinking && <Button small label="Retry" onPress={retry} />}
              </View>
            )}
          </View>
        }
      />

      {suggestions && (
        <View style={[styles.suggestions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {suggestions.map((s, i) => {
            const text = joinTokens(s.tokens);
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setDraft(text);
                  speakJapanese(text, { rate: settings.speechRate });
                }}
                style={[styles.suggestion, { backgroundColor: theme.surfaceMuted }]}
              >
                <AnnotatedText tokens={s.tokens} showFurigana={settings.showFurigana} showRomaji size={17} />
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>{s.translation}</Text>
              </Pressable>
            );
          })}
          <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center' }}>
            Tap one to hear it, then try saying it yourself.
          </Text>
        </View>
      )}

      {(speech.listening || speech.error) && (
        <View style={[styles.live, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: speech.error ? theme.danger : theme.text, fontSize: 18 }}>
            {speech.error ?? (speech.transcript || '聞いています… Listening')}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.composer,
          { borderColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <Pressable
          onPress={showSuggestions}
          style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}
          accessibilityLabel="Suggest what to say"
        >
          {loadingSuggestions ? <ActivityIndicator color={theme.accent} /> : <Text style={{ fontSize: 20 }}>💡</Text>}
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="日本語で話してみよう…"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          multiline
          onFocus={() => stopSpeaking()}
        />
        {draft.trim() ? (
          <Pressable
            onPress={() => send(draft)}
            disabled={thinking}
            style={[styles.iconButton, { backgroundColor: theme.accent, opacity: thinking ? 0.5 : 1 }]}
            accessibilityLabel="Send"
          >
            <Text style={{ color: theme.accentText, fontSize: 18, fontWeight: '700' }}>↑</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              speech.clearError();
              if (speech.listening) speech.stop();
              else speech.start();
            }}
            disabled={thinking}
            style={[
              styles.mic,
              { backgroundColor: speech.listening ? theme.danger : theme.accent, opacity: thinking ? 0.5 : 1 },
            ]}
            accessibilityLabel={speech.listening ? 'Stop listening' : 'Speak'}
          >
            <Text style={{ fontSize: 24 }}>{speech.listening ? '■' : '🎤'}</Text>
          </Pressable>
        )}
      </View>

      <WordSheet target={lookup} onClose={() => setLookup(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  emptyTitle: { fontSize: 32, fontWeight: '700' },
  emptyBody: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderRadius: 12 },
  suggestions: { marginHorizontal: 12, padding: 10, gap: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  suggestion: { padding: 10, borderRadius: 12, gap: 4 },
  live: { marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 17,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mic: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
