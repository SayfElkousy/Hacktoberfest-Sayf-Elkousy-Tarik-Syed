import { useState } from 'react';
import type { FormEvent } from 'react';
import { MicButton } from './Listen.tsx';

export function AskBar({ onAsk }: { onAsk: (question: string) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    try {
      await onAsk(question);
      setQuestion('');
    } finally {
      setAsking(false);
    }
  }

  return (
    <form className="ask" onSubmit={submit}>
      <input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={asking ? 'Thinking…' : 'Stuck? Ask a question'}
        aria-label="Ask a question"
        disabled={asking}
      />
      <MicButton onText={setQuestion} />
      <button className="secondary" disabled={asking || !question.trim()}>
        Ask
      </button>
    </form>
  );
}
