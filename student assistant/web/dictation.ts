import { useCallback, useEffect, useRef, useState } from 'react';
import { voice } from './voice.ts';

interface RecognitionResultEvent {
  results: { 0: { transcript: string } }[] & { length: number };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

const browser = window as unknown as {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

const RecognitionClass = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;

/** Speech to text through the browser. Hidden on browsers without it; typing always works. */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;

  useEffect(() => () => recognition.current?.stop(), []);

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    if (!RecognitionClass) return;

    // Otherwise the microphone picks up the assistant's own voice.
    voice.stop();

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
    };

    recognition.current = instance;
    setListening(true);
    instance.start();
  }, []);

  return { supported: Boolean(RecognitionClass), listening, toggle };
}
