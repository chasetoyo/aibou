import { useCallback, useEffect, useRef, useState } from 'react';
import { annotateExchange, buddyTurn, streamTalkReply } from './ai';
import { joinTokens, looksLikeEcho, takeSentences } from './japanese';
import { toHistory, type UserMessage, useStore } from './store';
import { useVoiceInput } from './useVoiceInput';
import { loadVoice, SpeechQueue } from './voice';

/** idle: waiting for the learner. thinking: waiting for the AI. speaking: Aibou is talking. */
export type Phase = 'idle' | 'thinking' | 'speaking';

/**
 * Runs the back-and-forth: hears the learner, gets Aibou's reply, speaks it, and
 * goes back to listening. In free talk the reply streams in and each sentence is
 * spoken as soon as it's complete, and the learner can talk over Aibou to cut it off.
 */
export function useConversation(apiKey: string | null | undefined) {
  const settings = useStore((s) => s.settings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  /** The reply as it streams in, before it's saved as a message. */
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const queueRef = useRef<SpeechQueue | null>(null);
  /** The saved message Aibou is currently speaking, if its text has finished streaming. */
  const speakingMessageId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnId = useRef(0);
  const sendRef = useRef<(text: string) => void>(() => {});

  const voice = useVoiceInput({
    openMic: settings.openMic,
    pauseMs: settings.pauseMs,
    preferOnDevice: settings.onDeviceRecognition,
    onUtterance: (text) => {
      const s = settingsRef.current;
      if (s.openMic || s.autoSendSpeech) sendRef.current(text);
      else setDraft(text);
    },
    onPartial: (heard) => {
      if (phaseRef.current !== 'speaking') return 'keep';
      if (!settingsRef.current.bargeIn) return 'ignore';
      if (looksLikeEcho(heard, queueRef.current?.spokenText ?? '')) return 'ignore';
      interrupt();
      return 'keep';
    },
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    loadVoice();
    return () => {
      queueRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  /** Aibou has finished speaking: hand the turn back to the learner. */
  const finishTurn = useCallback(() => {
    setPhase('idle');
    const s = settingsRef.current;
    if (s.openMic) voiceRef.current.resume();
    else if (s.handsFree) voiceRef.current.start();
  }, []);

  const startOutput = useCallback((): SpeechQueue | null => {
    const s = settingsRef.current;
    if (!s.autoSpeak) return null;
    const queue: SpeechQueue = new SpeechQueue({
      rate: s.speechRate,
      shareAudioSession: s.openMic,
      onStart: () => {
        setPhase('speaking');
        // Listen while Aibou talks, so the learner can interrupt.
        if (s.openMic && s.bargeIn) voiceRef.current.resume();
      },
      onIdle: () => {
        if (queueRef.current !== queue) return;
        queueRef.current = null;
        speakingMessageId.current = null;
        finishTurn();
      },
    });
    queueRef.current = queue;
    return queue;
  }, [finishTurn]);

  /** Stop Aibou mid-reply: stop talking and stop writing. */
  const interrupt = useCallback(() => {
    const queue = queueRef.current;
    if (queue?.speaking && speakingMessageId.current) {
      useStore.getState().markInterrupted(speakingMessageId.current, queue.heardText);
    }
    speakingMessageId.current = null;
    queue?.stop();
    queueRef.current = null;
    abortRef.current?.abort();
    if (phaseRef.current !== 'idle') {
      setPhase('idle');
      if (settingsRef.current.openMic) voiceRef.current.resume();
    }
  }, []);

  const runTurn = useCallback(
    async (userMessage: UserMessage | null) => {
      if (!apiKey) {
        setError('Add your Anthropic API key in Settings to start talking.');
        return;
      }
      const id = ++turnId.current;
      const s = settingsRef.current;
      const store = useStore.getState();
      voiceRef.current.suspend();
      setPhase('thinking');
      setError(null);
      const history = toHistory(store.messages);

      try {
        if (s.mode === 'learn') {
          const turn = await buddyTurn(apiKey, s, history);
          if (id !== turnId.current) return;
          store.applyBuddyTurn(userMessage?.id ?? null, turn);
          const queue = startOutput();
          if (!queue) return finishTurn();
          const saved = useStore.getState().messages;
          speakingMessageId.current = saved[saved.length - 1]?.id ?? null;
          queue.enqueue(joinTokens(turn.reply.tokens));
          queue.close();
          return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const queue = startOutput();
        let full = '';
        let unspoken = '';
        const result = await streamTalkReply(
          apiKey,
          s,
          history,
          (delta) => {
            full += delta;
            setLive(full);
            const { sentences, rest } = takeSentences(unspoken + delta);
            unspoken = rest;
            sentences.forEach((sentence) => queue?.enqueue(sentence));
          },
          controller.signal,
        );
        if (abortRef.current === controller) abortRef.current = null;
        setLive(null);
        if (id !== turnId.current) return;

        const text = result.text.trim();
        if (text) {
          const message = store.addBuddyText(text, result.interrupted, queue?.heardText);
          if (!result.interrupted) speakingMessageId.current = message.id;
          // Fill in readings and word lookups in the background.
          annotateExchange(apiKey, s, userMessage?.text ?? null, text)
            .then((annotation) => useStore.getState().applyAnnotation(userMessage?.id ?? null, message.id, annotation))
            .catch(() => {});
        }
        if (result.interrupted) return;
        if (!queue) return finishTurn();
        queue.enqueue(unspoken);
        queue.close();
        if (!text) finishTurn();
      } catch (e) {
        if (id !== turnId.current) return;
        setLive(null);
        queueRef.current?.stop();
        queueRef.current = null;
        setError((e as Error).message);
        setPhase('idle');
        if (settingsRef.current.openMic) voiceRef.current.resume();
      }
    },
    [apiKey, finishTurn, startOutput],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || phaseRef.current === 'thinking') return;
      if (phaseRef.current === 'speaking') interrupt();
      setDraft('');
      runTurn(useStore.getState().addUserMessage(trimmed));
    },
    [interrupt, runTurn],
  );
  sendRef.current = send;

  /** Open mic: start the conversation. Aibou says hello if the chat is empty. */
  const startConversation = useCallback(async () => {
    setError(null);
    await voiceRef.current.start();
    if (useStore.getState().messages.length === 0) runTurn(null);
  }, [runTurn]);

  const endConversation = useCallback(() => {
    interrupt();
    voiceRef.current.stop();
  }, [interrupt]);

  const retry = useCallback(() => {
    const messages = useStore.getState().messages;
    const last = messages[messages.length - 1];
    runTurn(last?.role === 'user' ? last : null);
  }, [runTurn]);

  return {
    phase,
    live,
    error,
    draft,
    setDraft,
    voice,
    send,
    runTurn,
    interrupt,
    retry,
    startConversation,
    endConversation,
  };
}
