import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { BuddyBubble, LiveBubble, UserBubble } from '../components/MessageBubble';
import { type LookupTarget, WordSheet } from '../components/WordSheet';
import { suggestReplies } from '../lib/ai';
import { useApiKey } from '../lib/apiKey';
import { joinTokens } from '../lib/japanese';
import type { AnnotatedSentence, Token } from '../lib/schemas';
import { MODES } from '../lib/settings';
import { type Message, toHistory, useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { useConversation } from '../lib/useConversation';
import { speakJapanese, stopSpeaking } from '../lib/voice';

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const apiKey = useApiKey();
  const { settings, messages, updateSettings } = useStore();
  const convo = useConversation(apiKey);
  const { voice, phase } = convo;

  const [lookup, setLookup] = useState<LookupTarget | null>(null);
  const [suggestions, setSuggestions] = useState<AnnotatedSentence[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const talk = settings.mode === 'talk';
  const openMic = settings.openMic;
  const error = convo.error ?? suggestionError;

  const send = (text: string) => {
    setSuggestions(null);
    convo.send(text);
  };

  const showSuggestions = async () => {
    if (suggestions) return setSuggestions(null);
    if (!apiKey) return setSuggestionError('Add your Anthropic API key in Settings first.');
    setLoadingSuggestions(true);
    setSuggestionError(null);
    try {
      setSuggestions(await suggestReplies(apiKey, settings, toHistory(messages)));
    } catch (e) {
      setSuggestionError((e as Error).message);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, phase, convo.live]);

  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  const openLookup = (token: Token, context: string) => setLookup({ token, query: token.surface, context });

  const status = (() => {
    if (voice.error) return { text: voice.error, color: theme.danger };
    if (voice.pausedForIdle) return { text: 'Paused after a quiet spell. Tap Resume to keep talking.', color: theme.textMuted };
    if (!voice.active) return { text: 'Tap Start and just talk. A short pause ends your turn.', color: theme.textMuted };
    if (phase === 'thinking') return { text: '考え中…', color: theme.textMuted };
    if (phase === 'speaking') {
      return {
        text: settings.bargeIn ? 'Speaking… just talk to interrupt' : 'Speaking… tap to interrupt',
        color: theme.textMuted,
      };
    }
    return { text: voice.transcript || '聞いています… go ahead', color: voice.transcript ? theme.text : theme.textMuted };
  })();

  const textRow = (
    <>
      <TextInput
        value={convo.draft}
        onChangeText={convo.setDraft}
        placeholder="日本語で話してみよう…"
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        multiline
        onFocus={() => {
          if (phase === 'speaking') convo.interrupt();
          else stopSpeaking();
        }}
      />
      <Pressable
        onPress={() => send(convo.draft)}
        disabled={phase === 'thinking' || !convo.draft.trim()}
        style={[
          styles.iconButton,
          { backgroundColor: theme.accent, opacity: phase === 'thinking' || !convo.draft.trim() ? 0.5 : 1 },
        ]}
        accessibilityLabel="Send"
      >
        <Text style={{ color: theme.accentText, fontSize: 18, fontWeight: '700' }}>↑</Text>
      </Pressable>
    </>
  );

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

      <View style={[styles.modes, { backgroundColor: theme.surfaceMuted }]}>
        {MODES.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => updateSettings({ mode: m.id })}
            style={[styles.modeButton, settings.mode === m.id && { backgroundColor: theme.surface }]}
            accessibilityRole="button"
            accessibilityState={{ selected: settings.mode === m.id }}
          >
            <Text style={{ color: settings.mode === m.id ? theme.text : theme.textMuted, fontWeight: '600' }}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

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
              onTokenPress={openLookup}
              onExplain={
                talk
                  ? undefined
                  : (sentence) =>
                      send(`Could you explain 「${sentence}」 in English? Break down the grammar and vocabulary.`)
              }
            />
          ) : (
            <UserBubble message={item} settings={settings} onTokenPress={openLookup} />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>こんにちは！</Text>
            <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
              {talk
                ? 'Aibou is your Japanese conversation partner. Tap Start and just talk: no buttons, just pause when you’re done. Tap any word later to look it up.'
                : 'Aibou will correct your Japanese and explain anything you ask about. Talk, or ask in English when you’re stuck. Tap any word to look it up, or 💡 for ideas.'}
            </Text>
            {apiKey === null && <Button primary label="Add your API key" onPress={() => router.push('/settings')} />}
            {apiKey && !openMic && (
              <Button primary label="Start a conversation" onPress={() => convo.runTurn(null)} disabled={phase !== 'idle'} />
            )}
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {convo.live !== null && <LiveBubble text={convo.live} />}
            {phase === 'thinking' && convo.live === null && (
              <View style={styles.thinking}>
                <ActivityIndicator color={theme.accent} />
                <Text style={{ color: theme.textMuted }}>考え中…</Text>
              </View>
            )}
            {error && (
              <View style={[styles.error, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger, flex: 1 }}>{error}</Text>
                {apiKey && lastIsUser && phase === 'idle' && !!convo.error && (
                  <Button small label="Retry" onPress={convo.retry} />
                )}
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
                  if (!openMic) convo.setDraft(text);
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

      {!openMic && (voice.active || voice.error) && (
        <View style={[styles.live, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: voice.error ? theme.danger : theme.text, fontSize: 18 }}>
            {voice.error ?? (voice.transcript || '聞いています… Listening')}
          </Text>
        </View>
      )}

      {openMic ? (
        <View style={[styles.bar, { borderColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
          {typing && <View style={styles.row}>{textRow}</View>}
          <View style={styles.row}>
            <Pressable
              onPress={showSuggestions}
              style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}
              accessibilityLabel="Suggest what to say"
            >
              {loadingSuggestions ? <ActivityIndicator color={theme.accent} /> : <Text style={{ fontSize: 20 }}>💡</Text>}
            </Pressable>
            <Pressable
              onPress={() => {
                voice.clearError();
                if (phase === 'speaking') convo.interrupt();
              }}
              style={[styles.status, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessibilityLiveRegion="polite"
            >
              {voice.active && phase === 'idle' && <View style={[styles.dot, { backgroundColor: theme.danger }]} />}
              <Text style={{ color: status.color, fontSize: 16, flex: 1 }} numberOfLines={3}>
                {status.text}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTyping((v) => !v)}
              style={[styles.iconButton, { backgroundColor: theme.surfaceMuted }]}
              accessibilityLabel="Type instead"
            >
              <Text style={{ fontSize: 18 }}>⌨️</Text>
            </Pressable>
          </View>
          {voice.active ? (
            <Button label="End conversation" onPress={convo.endConversation} />
          ) : (
            <Button
              primary
              label={voice.pausedForIdle || messages.length > 0 ? '🎙 Resume talking' : '🎙 Start talking'}
              onPress={convo.startConversation}
              disabled={!apiKey || phase === 'thinking'}
            />
          )}
        </View>
      ) : (
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
          {convo.draft.trim() ? (
            textRow
          ) : (
            <>
              <TextInput
                value={convo.draft}
                onChangeText={convo.setDraft}
                placeholder="日本語で話してみよう…"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                multiline
                onFocus={() => stopSpeaking()}
              />
              <Pressable
                onPress={() => {
                  voice.clearError();
                  if (phase === 'speaking') convo.interrupt();
                  if (voice.active) voice.stop();
                  else voice.start();
                }}
                disabled={phase === 'thinking'}
                style={[
                  styles.mic,
                  {
                    backgroundColor: voice.active ? theme.danger : theme.accent,
                    opacity: phase === 'thinking' ? 0.5 : 1,
                  },
                ]}
                accessibilityLabel={voice.active ? 'Stop listening' : 'Speak'}
              >
                <Text style={{ fontSize: 24 }}>{voice.active ? '■' : '🎤'}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <WordSheet target={lookup} onClose={() => setLookup(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  emptyTitle: { fontSize: 32, fontWeight: '700' },
  emptyBody: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  modes: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, padding: 3, borderRadius: 12 },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9 },
  bar: { gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
