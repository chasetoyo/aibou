import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../lib/theme';

export function Button({
  label,
  onPress,
  primary,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        {
          backgroundColor: primary ? theme.accent : theme.surfaceMuted,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={{ color: primary ? theme.accentText : theme.text, fontWeight: '600', fontSize: small ? 13 : 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  small: { paddingHorizontal: 12, paddingVertical: 6 },
});
