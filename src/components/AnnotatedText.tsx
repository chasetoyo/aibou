import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isPunctuation, needsFurigana, tokenRomaji } from '../lib/japanese';
import type { Token } from '../lib/schemas';
import { useTheme } from '../lib/theme';

interface Props {
  tokens: Token[];
  showFurigana: boolean;
  showRomaji: boolean;
  onTokenPress?: (token: Token) => void;
  selected?: Token | null;
  size?: number;
  color?: string;
  /** Colour for furigana and romaji. */
  mutedColor?: string;
}

/**
 * A Japanese sentence rendered word by word: furigana above kanji, romaji
 * underneath, and every word tappable for a lookup.
 */
export function AnnotatedText({
  tokens,
  showFurigana,
  showRomaji,
  onTokenPress,
  selected,
  size = 22,
  color,
  mutedColor,
}: Props) {
  const theme = useTheme();
  const textColor = color ?? theme.text;
  const muted = mutedColor ?? theme.textMuted;
  const small = Math.round(size * 0.5);

  return (
    <View style={styles.row}>
      {tokens.map((token, i) => {
        const punct = isPunctuation(token);
        const romaji = tokenRomaji(token);
        const isSelected = selected === token;
        return (
          <Pressable
            key={i}
            disabled={punct || !onTokenPress}
            onPress={() => onTokenPress?.(token)}
            style={({ pressed }) => [
              styles.token,
              punct && styles.punct,
              (pressed || isSelected) && { backgroundColor: theme.highlight },
            ]}
            accessibilityRole={punct ? undefined : 'button'}
            accessibilityLabel={punct ? undefined : `${token.surface}, ${token.reading}, ${token.meaning}`}
          >
            {showFurigana && (
              <Text style={{ fontSize: small, color: muted }}>
                {needsFurigana(token) ? token.reading : ' '}
              </Text>
            )}
            <Text style={{ fontSize: size, color: textColor }}>{token.surface}</Text>
            {showRomaji && (
              <Text style={[styles.romaji, { fontSize: small, color: muted }]}>
                {punct ? ' ' : romaji || ' '}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  token: { alignItems: 'center', paddingHorizontal: 2, paddingVertical: 1, borderRadius: 6 },
  punct: { paddingHorizontal: 0 },
  romaji: { fontStyle: 'italic' },
});
