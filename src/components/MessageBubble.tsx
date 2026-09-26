import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { joinTokens } from '../lib/japanese';
import type { Token } from '../lib/schemas';
import type { BuddyMessage, UserMessage } from '../lib/store';
import type { Settings } from '../lib/settings';
import { useTheme } from '../lib/theme';
import { speakJapanese } from '../lib/voice';
import { AnnotatedText } from './AnnotatedText';
import { Button } from './Button';

interface CommonProps {
  settings: Settings;
  onTokenPress: (token: Token, sentence: string) => void;
}

export function BuddyBubble({
  message,
  settings,
  onTokenPress,
  onExplain,
}: CommonProps & { message: BuddyMessage; onExplain: (sentence: string) => void }) {
  const theme = useTheme();
  const [showTranslation, setShowTranslation] = useState(settings.showTranslation);
  const sentence = joinTokens(message.reply.tokens);

  return (
    <View style={styles.buddyRow}>
      <View style={[styles.bubble, styles.buddyBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {!!message.explanation && (
          <View style={[styles.note, { backgroundColor: theme.explanation }]}>
            <Text style={{ color: theme.explanationText, lineHeight: 21 }}>{message.explanation}</Text>
          </View>
        )}
        <AnnotatedText
          tokens={message.reply.tokens}
          showFurigana={settings.showFurigana}
          showRomaji={settings.showRomaji}
          onTokenPress={(t) => onTokenPress(t, sentence)}
        />
        <Pressable onPress={() => setShowTranslation((v) => !v)} hitSlop={8}>
          <Text style={[styles.translation, { color: theme.textMuted }]}>
            {showTranslation ? message.reply.translation : 'Show English'}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Button small label="🔊 Replay" onPress={() => speakJapanese(sentence, { rate: settings.speechRate })} />
          <Button small label="🐢 Slow" onPress={() => speakJapanese(sentence, { rate: 0.6 })} />
          <Button small label="Explain" onPress={() => onExplain(sentence)} />
        </View>
      </View>
    </View>
  );
}

export function UserBubble({ message, settings, onTokenPress }: CommonProps & { message: UserMessage }) {
  const theme = useTheme();
  const analysis = message.analysis;
  const hasJapanese = !!analysis && analysis.tokens.length > 0;

  return (
    <View style={styles.userRow}>
      <View style={[styles.bubble, { backgroundColor: theme.userBubble }]}>
        {hasJapanese ? (
          <AnnotatedText
            tokens={analysis.tokens}
            showFurigana={settings.showFurigana}
            showRomaji={settings.showRomaji}
            onTokenPress={(t) => onTokenPress(t, message.text)}
            color={theme.userText}
            mutedColor={theme.userMuted}
            size={19}
          />
        ) : (
          <Text style={{ color: theme.userText, fontSize: 18 }}>{message.text}</Text>
        )}
        {hasJapanese && settings.showTranslation && !!analysis.translation && (
          <Text style={[styles.translation, { color: theme.userText, opacity: 0.75 }]}>{analysis.translation}</Text>
        )}
      </View>
      {!!analysis?.correction && (
        <Pressable
          onPress={() => speakJapanese(analysis.correction, { rate: settings.speechRate })}
          style={[styles.note, styles.correction, { backgroundColor: theme.correction }]}
        >
          <Text style={{ color: theme.correctionText, fontWeight: '600' }}>More natural: {analysis.correction} 🔊</Text>
          {!!analysis.feedback && (
            <Text style={{ color: theme.correctionText, marginTop: 4, lineHeight: 20 }}>{analysis.feedback}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buddyRow: { alignItems: 'flex-start', marginVertical: 6 },
  userRow: { alignItems: 'flex-end', marginVertical: 6 },
  bubble: { maxWidth: '92%', padding: 14, borderRadius: 18, gap: 8 },
  buddyBubble: { borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 },
  translation: { fontSize: 14, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  note: { padding: 10, borderRadius: 12 },
  correction: { maxWidth: '92%', marginTop: 6 },
});
