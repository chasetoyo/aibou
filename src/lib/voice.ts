import * as Speech from 'expo-speech';

let preferredVoice: string | undefined;
let voiceLookup: Promise<void> | null = null;

/**
 * Prefer the best-quality Japanese voice installed on the device. On iOS you can
 * download "Enhanced"/"Premium" Japanese voices in Settings → Accessibility →
 * Spoken Content → Voices → Japanese, and they'll be picked up here.
 */
function findVoice() {
  voiceLookup ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const japanese = voices.filter((v) => v.language.toLowerCase().startsWith('ja'));
      const rank = (q: string) => (q === 'Enhanced' ? 1 : 0);
      japanese.sort((a, b) => rank(b.quality) - rank(a.quality));
      preferredVoice = japanese[0]?.identifier;
    })
    .catch(() => {});
  return voiceLookup;
}

export async function speakJapanese(
  text: string,
  { rate = 0.9, onDone }: { rate?: number; onDone?: () => void } = {},
) {
  await findVoice();
  await Speech.stop();
  Speech.speak(text, {
    language: 'ja-JP',
    voice: preferredVoice,
    rate,
    // Use a separate audio session so playback stays loud after the mic was used.
    useApplicationAudioSession: false,
    onDone,
  });
}

export function stopSpeaking() {
  return Speech.stop();
}
