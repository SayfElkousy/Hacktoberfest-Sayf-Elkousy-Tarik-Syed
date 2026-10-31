import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from './Icon.tsx';
import { MicButton } from './Listen.tsx';
import type { AnswerResult, PublicPrompt } from '../../shared/types.ts';

interface Props {
  prompt: PublicPrompt;
  /** The latest words the microphone caught. */
  spoken: { text: string } | null;
  onAnswer: (answer: string) => Promise<AnswerResult>;
  onDone: (result: AnswerResult) => void;
}

const SOURCE_LABEL: Record<PublicPrompt['askedBy'], string> = {
  teacher: 'Checkpoint from your teacher',
  procedure: 'Checkpoint',
};

export function PromptCard({ prompt, spoken, onAnswer, onDone }: Props) {
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The microphone is always on, so spoken words land here for the student to send.
  useEffect(() => {
    if (spoken) setAnswer((current) => `${current} ${spoken.text}`.trim());
  }, [spoken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setSending(true);
    setError(null);
    try {
      setResult(await onAnswer(answer));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="prompt" aria-live="polite">
      <p className="eyebrow">{SOURCE_LABEL[prompt.askedBy]}</p>
      <h2>{prompt.question}</h2>

      {result ? (
        <>
          <div className={`feedback ${result.correct ? 'feedback-good' : 'feedback-warn'}`}>
            <span className="source source-ai">
              <Icon name={result.correct ? 'check' : 'alert'} size={16} />
              {result.correct ? 'Looks right' : 'Try this'}
            </span>
            {result.feedback}
          </div>
          <button className="primary" onClick={() => onDone(result)} autoFocus>
            Continue
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="input-row">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type or speak your answer"
              rows={2}
              autoFocus
            />
            <MicButton onText={setAnswer} />
          </div>
          {error && (
            <p className="error" role="alert">
              <Icon name="alert" size={18} />
              {error}
            </p>
          )}
          <button className="primary" disabled={sending || !answer.trim()}>
            {sending ? 'Checking…' : 'Send answer'}
          </button>
        </form>
      )}
    </section>
  );
}
