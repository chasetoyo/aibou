import { useColorScheme } from 'react-native';

const light = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F1ECE4',
  text: '#1F1B16',
  textMuted: '#6B635A',
  border: '#E3DCD1',
  accent: '#C8553D',
  accentText: '#FFFFFF',
  userBubble: '#2E4057',
  userText: '#FFFFFF',
  userMuted: '#B8C4D4',
  correction: '#E8F3EC',
  correctionText: '#1E5B38',
  explanation: '#FFF4DB',
  explanationText: '#5C4410',
  highlight: '#FCE3D9',
  danger: '#B3261E',
};

const dark: typeof light = {
  background: '#141210',
  surface: '#1F1C19',
  surfaceMuted: '#2A2622',
  text: '#F2EDE6',
  textMuted: '#A59C91',
  border: '#3A342E',
  accent: '#E07A5F',
  accentText: '#1A0E0A',
  userBubble: '#3B5270',
  userText: '#FFFFFF',
  userMuted: '#C3CEDC',
  correction: '#1C3326',
  correctionText: '#9FD8B3',
  explanation: '#3A2F17',
  explanationText: '#F2D899',
  highlight: '#4A2A20',
  danger: '#F2B8B5',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
