import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api.ts';
import { voice } from '../voice.ts';
import { Icon } from './Icon.tsx';
import type { LabTeam, StudentSession } from '../../shared/types.ts';

const PREPARING_CHECK_MS = 1_500;
/** Long enough for the longest procedure, so a stuck server still ends in a message. */
const PREPARING_LIMIT_MS = 180_000;

export function JoinScreen({ onJoined }: { onJoined: (session: StudentSession) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [teams, setTeams] = useState<LabTeam[] | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'joining' | 'preparing'>('idle');

  async function submit(event: FormEvent) {
    event.preventDefault();
    voice.start();
    setStatus('joining');
    setError(null);

    const giveUpAt = Date.now() + PREPARING_LIMIT_MS;
    try {
      for (;;) {
        const result = await api.join(name, code, teamId);
        if ('chooseTeam' in result) {
          setTeams(result.chooseTeam);
          setStatus('idle');
          return;
        }
        if (!('preparing' in result)) {
          onJoined(result);
          return;
        }
        if (Date.now() > giveUpAt) throw new Error('This is taking too long. Ask your teacher for help.');
        setStatus('preparing');
        await new Promise((resolve) => setTimeout(resolve, PREPARING_CHECK_MS));
      }
    } catch (failure) {
      setError((failure as Error).message);
      setStatus('idle');
    }
  }

  return (
    <main className="join">
      <form className="join-card" onSubmit={submit}>
        <p className="brand">
          <Icon name="flask" />
          Labby
        </p>
        <h1>{teams ? 'Choose your lab group' : 'Join your lab'}</h1>

        {teams ? (
          <fieldset>
            <legend>Which group are you in?</legend>
            {teams.map((team) => (
              <label key={team.id} className="team-option">
                <input
                  type="radio"
                  name="team"
                  checked={teamId === team.id}
                  onChange={() => setTeamId(team.id)}
                  required
                />
                {team.name}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <p className="join-lead">Enter your name and the class code from your teacher. Turn your speakers on, and your webcam if you have one.</p>

            <label>
              Your name
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" autoFocus required />
            </label>

            <label>
              Class code
              <input
                className="code-input"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </label>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            <Icon name="alert" size={18} />
            {error}
          </p>
        )}
        {status === 'preparing' && <p className="join-lead" aria-live="polite">Reading your teacher's procedure…</p>}

        <button className="primary" disabled={status !== 'idle'}>
          {status === 'idle' ? (teams ? 'Join this group' : 'Continue') : 'Joining…'}
          <Icon name="arrow" size={18} />
        </button>
      </form>
    </main>
  );
}
