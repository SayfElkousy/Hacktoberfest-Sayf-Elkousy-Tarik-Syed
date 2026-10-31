import { useCallback, useEffect, useRef, useState } from 'react';
import { voice } from './voice.ts';

interface RecognitionResultEvent {
  resultIndex: number;
  results: ({ 0: { transcript: string }; isFinal: boolean })[] & { length: number };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

const browser = window as unknown as {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

const RecognitionClass = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;

/** Chrome ends a recognizer after a stretch of silence, so it gets started again. */
const RESTART_MS = 300;

/**
 * Chrome runs one recognizer at a time, so a mic button borrows the microphone
 * from the always-on listener. Resolves once the listener has let go.
 */
let borrowMic: (() => Promise<void>) | null = null;
let returnMic: (() => void) | null = null;

/** Speech to text through the browser. Hidden on browsers without it; typing always works. */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;

  useEffect(() => () => recognition.current?.stop(), []);

  const toggle = useCallback(async () => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    if (!RecognitionClass) return;

    // Otherwise the microphone picks up the assistant's own voice.
    voice.stop();
    await borrowMic?.();

    const instance = new RecognitionClass();
    instance.lang = 'en-US';
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = (event) => {
      callback.current(Array.from(event.results, (result) => result[0].transcript).join(' '));
    };
    instance.onerror = () => undefined;
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
      returnMic?.();
    };

    recognition.current = instance;
    setListening(true);
    instance.start();
  }, []);

  return { supported: Boolean(RecognitionClass), listening, toggle };
}

export type ListeningStatus = 'off' | 'on' | 'blocked' | 'unsupported';

/**
 * Keeps the microphone open while `enabled`, passing on each finished phrase.
 * The assistant's own voice is left out, or it would record its own numbers.
 */
export function useLiveListening(enabled: boolean, onPhrase: (text: string) => void) {
  const [status, setStatus] = useState<ListeningStatus>(RecognitionClass ? 'off' : 'unsupported');
  const [partial, setPartial] = useState('');
  const callback = useRef(onPhrase);
  callback.current = onPhrase;

  useEffect(() => {
    if (!enabled || !RecognitionClass) return;

    let stopped = false;
    let lent = false;
    let current: Recognition | null = null;
    let restart: ReturnType<typeof setTimeout>;
    let released: (() => void) | null = null;

    const begin = () => {
      if (stopped || lent) return;
      const instance = new RecognitionClass();
      instance.lang = 'en-US';
      instance.interimResults = true;
      instance.continuous = true;
      instance.onresult = (event) => {
        let speaking = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript.trim();
          if (!text || voice.isEcho(text)) continue;
          if (event.results[i].isFinal) callback.current(text);
          else speaking += `${text} `;
        }
        setPartial(speaking.trim());
      };
      instance.onerror = ({ error }) => {
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          stopped = true;
          setStatus('blocked');
        }
      };
      instance.onend = () => {
        current = null;
        setPartial('');
        released?.();
        released = null;
        if (!stopped && !lent) restart = setTimeout(begin, RESTART_MS);
      };
      current = instance;
      setStatus('on');
      try {
        instance.start();
      } catch {
        // Chrome refuses while the last one is still shutting down, so try again shortly.
        current = null;
        restart = setTimeout(begin, RESTART_MS);
      }
    };

    borrowMic = () => {
      lent = true;
      clearTimeout(restart);
      if (!current) return Promise.resolve();
      current.stop();
      return new Promise((resolve) => {
        released = resolve;
      });
    };
    returnMic = () => {
      lent = false;
      begin();
    };

    begin();

    return () => {
      stopped = true;
      clearTimeout(restart);
      current?.stop();
      borrowMic = null;
      returnMic = null;
      setStatus('off');
    };
  }, [enabled]);

  return { status, partial };
}
