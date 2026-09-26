import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';
import { stopSpeaking } from './voice';

const IGNORED_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout']);
const ON_DEVICE_UNAVAILABLE = new Set(['language-not-supported', 'service-not-allowed']);

/**
 * Push-to-talk Japanese speech recognition using the phone's built-in recognizer
 * (Apple Speech on iOS, Google on Android). Prefers on-device recognition so audio
 * stays on the phone, and falls back to the platform's server recognition if the
 * Japanese on-device model isn't available.
 */
export function useSpeechInput({
  onFinal,
  preferOnDevice,
}: {
  onFinal: (text: string) => void;
  preferOnDevice: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finalText = useRef('');
  const usedOnDevice = useRef(false);
  const retrying = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const begin = useCallback((onDevice: boolean) => {
    usedOnDevice.current = onDevice;
    ExpoSpeechRecognitionModule.start({
      lang: 'ja-JP',
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDevice,
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
        mode: 'default',
      },
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    finalText.current = '';
    await stopSpeaking();

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone or speech recognition permission was denied. Enable it in the Settings app.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Speech recognition is not available on this device.');
      return;
    }
    begin(preferOnDevice && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
  }, [begin, preferOnDevice]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    finalText.current = '';
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (event) => {
    // Keep the latest text even if it never becomes final (e.g. the user tapped stop).
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);
    finalText.current = text;
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (usedOnDevice.current && ON_DEVICE_UNAVAILABLE.has(event.error)) {
      retrying.current = true;
      return;
    }
    if (!IGNORED_ERRORS.has(event.error)) setError(event.message || event.error);
  });
  useSpeechRecognitionEvent('end', () => {
    if (retrying.current) {
      retrying.current = false;
      begin(false);
      return;
    }
    setListening(false);
    const text = finalText.current.trim() || undefined;
    finalText.current = '';
    if (text) onFinalRef.current(text);
  });

  return { listening, transcript, error, start, stop, cancel, clearError: () => setError(null) };
}
