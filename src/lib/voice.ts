import * as Speech from 'expo-speech';

let preferredVoice: string | undefined;
let voiceLookup: Promise<void> | null = null;

/**
 * Prefer the best-quality Japanese voice installed on the device. On iOS you can
 * download "Enhanced"/"Premium" Japanese voices in Settings → Accessibility →
 * Spoken Content → Voices → Japanese, and they'll be picked up here.
 */
export function loadVoice() {
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
  await loadVoice();
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

/**
 * Speaks a reply one sentence at a time as it streams in. The platform speech
 * engines queue utterances, so each sentence starts as soon as the one before
 * it ends. `onIdle` fires once the reply is closed and everything has been said.
 */
export class SpeechQueue {
  private pending = 0;
  private closed = false;
  private stopped = false;
  private idleFired = false;
  /** Everything queued so far, for telling Aibou's own voice apart from the learner's. */
  spokenText = '';
  /** Sentences that have started playing: roughly what the learner has heard. */
  heardText = '';

  constructor(
    private readonly options: {
      rate: number;
      /**
       * iOS: play through the app's audio session. Needed while the microphone
       * stays open, so playback and recognition share one session.
       */
      shareAudioSession: boolean;
      onStart?: () => void;
      onIdle: () => void;
    },
  ) {}

  enqueue(sentence: string) {
    const text = sentence.trim();
    if (!text || this.stopped) return;
    if (this.pending === 0 && !this.spokenText) this.options.onStart?.();
    this.pending++;
    this.spokenText += text;
    const finished = () => {
      if (this.stopped) return;
      this.pending--;
      this.maybeIdle();
    };
    Speech.speak(text, {
      language: 'ja-JP',
      voice: preferredVoice,
      rate: this.options.rate,
      useApplicationAudioSession: this.options.shareAudioSession,
      onStart: () => {
        if (!this.stopped) this.heardText += text;
      },
      onDone: finished,
      onError: finished,
    });
  }

  /** No more sentences are coming. */
  close() {
    this.closed = true;
    this.maybeIdle();
  }

  /** Cut Aibou off mid-sentence. `onIdle` won't fire. */
  stop() {
    this.stopped = true;
    Speech.stop();
  }

  get speaking() {
    return !this.stopped && this.pending > 0;
  }

  private maybeIdle() {
    if (this.closed && this.pending === 0 && !this.idleFired && !this.stopped) {
      this.idleFired = true;
      this.options.onIdle();
    }
  }
}
