import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { saveApiKey, useApiKey } from '../lib/apiKey';
import { useStore } from '../lib/store';
import { LEVELS, MODELS, type Settings } from '../lib/settings';
import { useTheme } from '../lib/theme';
import { speakJapanese } from '../lib/voice';

export default function SettingsScreen() {
  const theme = useTheme();
  const apiKey = useApiKey();
  const { settings, updateSettings, clearConversation } = useStore();
  const [keyDraft, setKeyDraft] = useState('');
  const [topic, setTopic] = useState(settings.topic);

  useEffect(() => {
    if (apiKey) setKeyDraft(apiKey);
  }, [apiKey]);

  const toggle = (key: keyof Settings, label: string, note?: string) => (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 16 }}>{label}</Text>
        {note && <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{note}</Text>}
      </View>
      <Switch
        value={settings[key] as boolean}
        onValueChange={(v) => updateSettings({ [key]: v })}
        trackColor={{ true: theme.accent }}
      />
    </View>
  );

  const choice = <T extends string>(
    options: readonly { id: T; label: string; note: string }[],
    value: T,
    onChange: (id: T) => void,
  ) =>
    options.map((o) => (
      <Pressable
        key={o.id}
        onPress={() => onChange(o.id)}
        style={[
          styles.choice,
          { borderColor: value === o.id ? theme.accent : theme.border, backgroundColor: theme.surface },
        ]}
      >
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: value === o.id ? '600' : '400' }}>{o.label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{o.note}</Text>
      </Pressable>
    ));

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.heading, { color: theme.textMuted }]}>Anthropic API key</Text>
      <TextInput
        value={keyDraft}
        onChangeText={setKeyDraft}
        placeholder="sk-ant-..."
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
      />
      <Text style={[styles.note, { color: theme.textMuted }]}>
        Stored in the device keychain and sent only to Anthropic. Create one at console.anthropic.com.
      </Text>
      <Button
        primary
        label={apiKey && keyDraft.trim() === apiKey ? 'Saved ✓' : 'Save key'}
        onPress={() => saveApiKey(keyDraft)}
      />

      <Text style={[styles.heading, { color: theme.textMuted }]}>Your level</Text>
      {choice(LEVELS, settings.level, (level) => updateSettings({ level }))}

      <Text style={[styles.heading, { color: theme.textMuted }]}>Topic or scenario (optional)</Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        onEndEditing={() => updateSettings({ topic })}
        placeholder="e.g. ordering at a café, my weekend, anime"
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
      />

      <Text style={[styles.heading, { color: theme.textMuted }]}>Display</Text>
      {toggle('showFurigana', 'Furigana', 'Readings above kanji')}
      {toggle('showRomaji', 'Romaji', 'Romanized pronunciation under each word')}
      {toggle('showTranslation', 'Show English by default')}

      <Text style={[styles.heading, { color: theme.textMuted }]}>Voice</Text>
      {toggle('autoSpeak', 'Read replies aloud')}
      {toggle('handsFree', 'Hands-free conversation', 'Start listening again after Aibou finishes speaking')}
      {toggle('autoSendSpeech', 'Send speech automatically', 'Off: review and edit what was heard before sending')}
      {toggle(
        'onDeviceRecognition',
        'On-device speech recognition',
        'Keeps your voice on the phone when a Japanese model is installed; otherwise falls back to Apple/Google servers',
      )}
      <View style={[styles.row, { borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>Speaking speed</Text>
        {[0.6, 0.75, 0.9, 1.0].map((rate) => (
          <Pressable
            key={rate}
            onPress={() => {
              updateSettings({ speechRate: rate });
              speakJapanese('よろしくお願いします。', { rate });
            }}
            style={[
              styles.rate,
              { borderColor: settings.speechRate === rate ? theme.accent : theme.border },
            ]}
          >
            <Text style={{ color: theme.text }}>{rate}×</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.heading, { color: theme.textMuted }]}>AI model</Text>
      {choice(MODELS, settings.model, (model) => updateSettings({ model }))}

      <Text style={[styles.heading, { color: theme.textMuted }]}>Conversation</Text>
      <Button
        label="Start a new conversation"
        onPress={() =>
          Alert.alert('New conversation?', 'This clears the current chat. Saved words are kept.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear',
              style: 'destructive',
              onPress: () => {
                clearConversation();
                router.back();
              },
            },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  heading: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16 },
  input: { height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  note: { fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choice: { padding: 12, borderRadius: 12, borderWidth: 1.5, gap: 2 },
  rate: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
});
