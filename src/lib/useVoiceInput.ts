import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

const IGNORED_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout', 'nomatch']);
const ON_DEVICE_UNAVAILABLE = new Set(['language-not-supported', 'service-not-allowed']);
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture']);
/** Stop the open mic after this long without hearing anything, to save battery. */
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

export type PartialVerdict = 'keep' | 'ignore';

interface Options {
  /** Keep listening for the whole conversation instead of one utterance per tap. */
  openMic: boolean;
  /** Open mic: how long a pause ends the learner's turn. */
  pauseMs: number;
  preferOnDevice: boolean;
  /** A finished utterance: the learner paused (open mic) or tapped stop. */
  onUtterance: (text: string) => void;
  /**
   * Open mic: called as speech comes in. Return 'ignore' to drop it, e.g. when
   * it's Aibou's own voice coming back through the speaker.
   */
  onPartial?: (text: string) => PartialVerdict;
}

/**
 * Japanese speech recognition using the phone's built-in recognizer (Apple Speech
 * on iOS, Google on Android). Prefers on-device recognition so audio stays on the
 * phone, and falls back to the platform's servers if the Japanese on-device model
 * isn't available.
 *
 * Two ways to use it:
 * - Tap to talk: `start()` listens for one utterance, delivered when you pause or `stop()`.
 * - Open mic: `start()` begins a conversation. The mic stays on, each pause of
 *   `pauseMs` delivers an utterance, and it keeps listening until `stop()`.
 *   `suspend()`/`resume()` mute it temporarily, e.g. while Aibou is thinking.
 */
export function useVoiceInput(options: Options) {
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pausedForIdle, setPausedForIdle] = useState(false);

  const opts = useRef(options);
  opts.current = options;

  const activeRef = useRef(false);
  const suspendedRef = useRef(false);
  const runningRef = useRef(false);
  /** Recognized text: finished segments plus the segment in progress. */
  const segments = useRef('');
  const current = useRef('');
  /** Transcript that was ignored (e.g. echo). Stripped while the transcript still starts with it. */
  const ignored = useRef('');
  const usedOnDevice = useRef(false);
  const retryWithoutOnDevice = useRef(false);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentRestarts = useRef<number[]>([]);

  const heard = () => {
    const full = segments.current + current.current;
    return (ignored.current && full.startsWith(ignored.current) ? full.slice(ignored.current.length) : full).trim();
  };

  const resetBuffer = () => {
    segments.current = '';
    current.current = '';
    ignored.current = '';
    setTranscript('');
  };

  const clearTimer = (timer: typeof silenceTimer) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const begin = useCallback((onDevice: boolean) => {
    if (runningRef.current) return;
    runningRef.current = true;
    usedOnDevice.current = onDevice;
    const openMic = opts.current.openMic;
    ExpoSpeechRecognitionModule.start({
      lang: 'ja-JP',
      interimResults: true,
      continuous: openMic,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDevice,
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
        mode: 'default',
      },
      // Echo cancellation, so the mic hears less of Aibou's voice from the speaker.
      iosVoiceProcessingEnabled: openMic,
    });
  }, []);

  const beginPreferred = useCallback(() => {
    begin(opts.current.preferOnDevice && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
  }, [begin]);

  const armIdleTimer = useCallback(() => {
    clearTimer(idleTimer);
    if (!opts.current.openMic) return;
    idleTimer.current = setTimeout(() => {
      if (!suspendedRef.current && activeRef.current) {
        activeRef.current = false;
        setActive(false);
        setPausedForIdle(true);
        ExpoSpeechRecognitionModule.abort();
      }
    }, IDLE_TIMEOUT_MS);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPausedForIdle(false);
    resetBuffer();
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone or speech recognition permission was denied. Enable it in the Settings app.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Speech recognition is not available on this device.');
      return;
    }
    activeRef.current = true;
    suspendedRef.current = false;
    setActive(true);
    armIdleTimer();
    beginPreferred();
  }, [armIdleTimer, beginPreferred]);

  /** Tap to talk: finish the utterance. Open mic: end the conversation. */
  const stop = useCallback(() => {
    if (opts.current.openMic) {
      activeRef.current = false;
      setActive(false);
      clearTimer(silenceTimer);
      clearTimer(idleTimer);
      resetBuffer();
      ExpoSpeechRecognitionModule.abort();
    } else {
      ExpoSpeechRecognitionModule.stop();
    }
  }, []);

  /** Open mic: stop listening for now (e.g. while Aibou is thinking). */
  const suspend = useCallback(() => {
    suspendedRef.current = true;
    clearTimer(silenceTimer);
    resetBuffer();
    if (runningRef.current) ExpoSpeechRecognitionModule.abort();
  }, []);

  /** Open mic: start listening again after `suspend()`. */
  const resume = useCallback(() => {
    suspendedRef.current = false;
    if (!activeRef.current || !opts.current.openMic) return;
    armIdleTimer();
    beginPreferred();
  }, [armIdleTimer, beginPreferred]);

  const commit = useCallback(() => {
    clearTimer(silenceTimer);
    const text = heard();
    if (!text) return;
    resetBuffer();
    // Restart recognition so the next utterance starts from an empty transcript.
    // (Parents usually call suspend() from onUtterance, which already does this.)
    if (runningRef.current) ExpoSpeechRecognitionModule.abort();
    opts.current.onUtterance(text);
  }, []);

  useSpeechRecognitionEvent('start', () => setListening(true));

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current || suspendedRef.current) return;
    const text = event.results[0]?.transcript ?? '';
    if (event.isFinal && opts.current.openMic) {
      // Continuous recognition can start a fresh transcript after each final
      // segment, so keep what's been said so far.
      segments.current += text;
      current.current = '';
    } else {
      current.current = text;
    }
    const soFar = heard();
    setTranscript(soFar);
    if (!opts.current.openMic || !soFar) return;

    armIdleTimer();
    if (opts.current.onPartial?.(soFar) === 'ignore') {
      ignored.current = segments.current + current.current;
      setTranscript('');
      clearTimer(silenceTimer);
      return;
    }
    clearTimer(silenceTimer);
    silenceTimer.current = setTimeout(commit, opts.current.pauseMs);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (usedOnDevice.current && ON_DEVICE_UNAVAILABLE.has(event.error)) {
      retryWithoutOnDevice.current = true;
      return;
    }
    if (IGNORED_ERRORS.has(event.error)) return;
    setError(event.message || event.error);
    if (FATAL_ERRORS.has(event.error)) {
      activeRef.current = false;
      setActive(false);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    runningRef.current = false;
    setListening(false);

    if (retryWithoutOnDevice.current) {
      retryWithoutOnDevice.current = false;
      begin(false);
      return;
    }

    if (!opts.current.openMic) {
      // Tap to talk: one utterance per session.
      const text = heard();
      resetBuffer();
      activeRef.current = false;
      setActive(false);
      if (text) opts.current.onUtterance(text);
      return;
    }

    // Open mic: sessions end on their own (time limits, silence, our own
    // restarts). Keep listening unless the conversation was stopped or muted.
    if (!activeRef.current || suspendedRef.current) return;
    const leftover = heard();
    if (leftover) {
      commit();
      return;
    }
    const now = Date.now();
    recentRestarts.current = [...recentRestarts.current.filter((t) => now - t < 5000), now];
    if (recentRestarts.current.length > 5) {
      activeRef.current = false;
      setActive(false);
      setError('Speech recognition keeps stopping. Tap to try again.');
      return;
    }
    setTimeout(() => {
      if (activeRef.current && !suspendedRef.current) beginPreferred();
    }, 250);
  });

  useEffect(
    () => () => {
      clearTimer(silenceTimer);
      clearTimer(idleTimer);
      if (runningRef.current) ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  return {
    /** Tap to talk: listening for an utterance. Open mic: a conversation is going. */
    active,
    /** The recognizer is running right now. */
    listening,
    transcript,
    error,
    pausedForIdle,
    start,
    stop,
    suspend,
    resume,
    clearError: () => setError(null),
  };
}
