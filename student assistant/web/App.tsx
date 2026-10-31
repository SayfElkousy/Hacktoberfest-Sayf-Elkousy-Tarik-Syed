import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { JoinScreen } from './components/JoinScreen.tsx';
import { LabScreen } from './components/LabScreen.tsx';
import type { StudentSession } from '../shared/types.ts';

const STORAGE_KEY = 'lab-assistant-student';

function readSavedId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage a page refresh just means joining again.
  }
}

export function App() {
  const [session, setSession] = useState<StudentSession | null>(null);
  const [restoring, setRestoring] = useState(() => readSavedId() !== null);

  useEffect(() => {
    const id = readSavedId();
    if (!id) return;
    api
      .session(id)
      .then(setSession)
      .catch(() => saveId(null))
      .finally(() => setRestoring(false));
  }, []);

  if (restoring) return null;

  if (!session) {
    return (
      <JoinScreen
        onJoined={(joined) => {
          saveId(joined.student.id);
          setSession(joined);
        }}
      />
    );
  }

  return (
    <LabScreen
      session={session}
      onLeave={() => {
        saveId(null);
        setSession(null);
      }}
    />
  );
}
