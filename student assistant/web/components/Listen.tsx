import { useDictation } from '../dictation.ts';

/** Microphone button that fills a text box with what the student says. */
export function MicButton({ onText }: { onText: (text: string) => void }) {
  const { supported, listening, toggle } = useDictation(onText);
  if (!supported) return null;

  return (
    <button
      type="button"
      className={`mic ${listening ? 'mic-on' : ''}`}
      onClick={toggle}
      aria-label={listening ? 'Stop listening' : 'Speak your answer'}
      aria-pressed={listening}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.6a6 6 0 0 0 5-5.9Z"
        />
      </svg>
    </button>
  );
}
