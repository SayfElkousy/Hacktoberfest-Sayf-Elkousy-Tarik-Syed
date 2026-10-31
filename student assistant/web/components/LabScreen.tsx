import { useCallback, useEffect, useRef, useState } from 'react';
import { api, listenForEvents, Superseded } from '../api.ts';
import { useCamera } from '../camera.ts';
import { voice } from '../voice.ts';
import { AskBar } from './AskBar.tsx';
import { CameraView, EMPTY_OVERLAY } from './CameraView.tsx';
import type { Overlay } from './CameraView.tsx';
import { DonePanel } from './DonePanel.tsx';
import { EquipmentPanel } from './EquipmentPanel.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import { PromptCard } from './PromptCard.tsx';
import { StepActions } from './StepActions.tsx';
import type {
  ComponentStatus,
  PublicPrompt,
  StepStatus,
  StudentEvent,
  StudentProgress,
  StudentSession,
} from '../../shared/types.ts';

const EQUIPMENT_LOOK_MS = 2_500;
const MAX_EQUIPMENT_LOOKS = 8;
const STEP_LOOK_MS = 10_000;

const MAX_HISTORY = 30;
const LOOKING = 'Looking at your work…';
const MEASURING = 'Measuring…';

const STEP_STATUS_LABEL: Partial<Record<StepStatus, string>> = {
  passed: 'Looks good',
  needs_attention: 'Needs another look',
};

const STEP_ROW_LABEL: Record<StepStatus, string> = {
  pending: 'To do',
  active: 'Current',
  passed: 'Done',
  needs_attention: 'Check again',
  skipped: 'Skipped',
};

/** Keeps teacher instructions, AI guidance and the student's own words clearly apart. */
const HISTORY_FROM: Record<HistoryEntry['from'], { label: string; icon: IconName }> = {
  teacher: { label: 'Your teacher', icon: 'teacher' },
  ai: { label: 'AI guidance', icon: 'sparkle' },
  you: { label: 'You', icon: 'user' },
};

interface HistoryEntry {
  id: number;
  from: 'teacher' | 'ai' | 'you';
  text: string;
}

type Tone = 'neutral' | 'good' | 'warn';

interface Message {
  text: string;
  tone: Tone;
}

interface Props {
  session: StudentSession;
  onLeave: () => void;
}

export function LabScreen({ session, onLeave }: Props) {
  const { lab } = session;
  const { plan } = lab;
  const id = session.student.id;

  const [student, setStudent] = useState<StudentProgress>(session.student);
  const [prompts, setPrompts] = useState<PublicPrompt[]>(session.pending);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);

  const [scanFinished, setScanFinished] = useState(false);
  const [connected, setConnected] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyId = useRef(0);

  const { videoRef, status: cameraStatus, capture } = useCamera();
  const cameraReady = cameraStatus === 'ready';

  const prompt = prompts[0] ?? null;
  const step = student.phase === 'steps' ? plan.steps[student.currentStep] : null;
  const progress = student.phase === 'steps' ? student.steps[student.currentStep] : null;

  // Loops below read these without restarting every time they change.
  const paused = useRef(false);
  paused.current = busy !== null || prompt !== null;

  useEffect(() => {
    voice.setStudent(id);

    // After a page reload there's been no click yet, so sound has to wait for one.
    const unlock = () => voice.start();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [id]);

  const remember = useCallback((from: HistoryEntry['from'], text: string) => {
    setHistory((list) => [...list, { id: (historyId.current += 1), from, text }].slice(-MAX_HISTORY));
  }, []);

  const tell = useCallback((text: string, tone: Tone = 'neutral') => {
    setMessage({ text, tone });
    remember('ai', text);
    void voice.say(text);
  }, [remember]);

  const refresh = useCallback(async () => {
    const latest = await api.session(id);
    setStudent(latest.student);
    return latest.student;
  }, [id]);

  const fail = useCallback((failure: unknown) => {
    if (failure instanceof Superseded) return;
    tell((failure as Error).message, 'warn');
  }, [tell]);

  const addPrompt = useCallback((incoming: PublicPrompt) => {
    setPrompts((list) => (list.some((item) => item.id === incoming.id) ? list : [...list, incoming]));
  }, []);

  // Live events from the teacher.
  useEffect(
    () =>
      listenForEvents(
        id,
        (event: StudentEvent) => {
          if (event.type === 'prompt') {
            addPrompt(event.prompt);
            if (event.prompt.askedBy === 'teacher') remember('teacher', event.prompt.question);
          }
          if (event.type === 'lab-ended') {
            setEnded(true);
            tell('Your teacher has ended this lab.');
          }
        },
        setConnected,
      ),
    [id, addPrompt, tell, remember],
  );

  // Say each question as it comes up.
  const spokenPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (prompt && spokenPrompt.current !== prompt.id) {
      spokenPrompt.current = prompt.id;
      void voice.say(prompt.question);
    }
  }, [prompt]);

  // Say each step as the student reaches it.
  const spokenStep = useRef<string | null>(null);
  useEffect(() => {
    const key = student.phase === 'steps' ? step?.id ?? null : student.phase;
    if (key === spokenStep.current) return;
    spokenStep.current = key;
    setMessage(null);
    setOverlay(EMPTY_OVERLAY);

    if (step) {
      void voice.say([step.instruction, step.safety ? `Safety: ${step.safety}` : ''].filter(Boolean).join(' '));
    } else if (student.phase === 'components') {
      void voice.say(`Welcome to ${plan.title}. Put each piece of equipment where your camera can see it.`);
    } else {
      void voice.say(`That's the end of the lab. Nice work, ${student.name}.`);
    }
  }, [student.phase, student.name, step, plan.title]);

  // While checking equipment, look a limited number of times. Anything still not
  // found after that is left for the student to tick off themselves.
  useEffect(() => {
    if (student.phase !== 'components' || cameraStatus !== 'ready') return;

    let stopped = false;
    (async () => {
      for (let pass = 0; pass < MAX_EQUIPMENT_LOOKS && !stopped; pass++) {
        if (paused.current) {
          pass--;
        } else {
          const frame = capture();
          if (frame) {
            setLooking(true);
            try {
              const result = await api.identify(id, frame);
              if (stopped) return;
              setStudent((current) => ({ ...current, components: result.components }));

              // Each pass only reports what was still missing, so earlier boxes stay up.
              const found = result.items.flatMap((item) => {
                const name = plan.components.find((component) => component.id === item.id)?.name;
                return item.box && name ? [{ box: item.box, label: name }] : [];
              });
              setOverlay((current) => ({ ...current, boxes: [...current.boxes, ...found] }));

              if (Object.values(result.components).every((status) => status !== 'unknown')) break;
            } catch (failure) {
              if (!(failure instanceof Superseded)) console.warn(failure);
            } finally {
              setLooking(false);
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, EQUIPMENT_LOOK_MS));
      }
      if (!stopped) setScanFinished(true);
    })();

    return () => {
      stopped = true;
    };
  }, [student.phase, cameraStatus, capture, id, plan.components]);

  // On camera steps, watch quietly and speak up once the step looks done.
  const stepId = step?.id;
  const watchStep = step?.mode === 'camera' && progress?.status === 'active' && cameraStatus === 'ready';
  useEffect(() => {
    if (!watchStep || !stepId) return;

    let stopped = false;
    (async () => {
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, STEP_LOOK_MS));
        if (stopped || paused.current) continue;

        const frame = capture();
        if (!frame) continue;
        try {
          const result = await api.check(id, stepId, frame, true);
          if (!stopped && result.verdict === 'correct') {
            tell(result.feedback, 'good');
            await refresh();
            return;
          }
        } catch (failure) {
          if (!(failure instanceof Superseded)) console.warn(failure);
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [watchStep, stepId, capture, id, tell, refresh]);

  async function withBusy<T>(label: string, work: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    try {
      return await work();
    } catch (failure) {
      fail(failure);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const checkStep = () =>
    withBusy(LOOKING, async () => {
      if (!step) return;

      // With no picture to look at, the student's word is the check.
      const frame = capture();
      if (!frame) {
        addPrompt(await api.confirm(id, step.id));
        return;
      }

      const result = await api.check(id, step.id, frame);
      tell(result.feedback, result.verdict === 'correct' ? 'good' : result.verdict === 'incorrect' ? 'warn' : 'neutral');
      if (result.followUp) addPrompt(result.followUp);
      await refresh();
    });

  const confirmStep = () =>
    withBusy('One moment…', async () => {
      if (step) addPrompt(await api.confirm(id, step.id));
    });

  const measure = () =>
    withBusy(MEASURING, async () => {
      if (!step) return null;
      const frame = capture();
      if (!frame) {
        tell("I can't see your camera right now, so enter your measurement yourself.", 'warn');
        return null;
      }

      const result = await api.measure(id, step.id, frame);
      tell(result.feedback, result.withinTolerance === false ? 'warn' : result.measured ? 'good' : 'neutral');
      setOverlay({
        ...EMPTY_OVERLAY,
        line: result.line && { ...result.line, label: 'Measured' },
      });
      await refresh();
      return result;
    });

  const record = (value: number) =>
    withBusy('Saving…', async () => {
      if (!step) return;
      const result = await api.record(id, step.id, value);
      tell(result.feedback, result.withinTolerance === false ? 'warn' : 'good');
      await refresh();
    });

  const saveSensor = (readings: number[], unit: string) =>
    withBusy('Saving your readings…', async () => {
      if (!step) return;
      const result = await api.sensor(id, step.id, readings, unit);
      tell(result.feedback, 'good');
      await refresh();
    });

  const next = () =>
    withBusy('One moment…', async () => {
      const result = await api.next(id);
      setStudent(result.student);
      if (result.prompt) addPrompt(result.prompt);
    });

  const ask = async (question: string) => {
    remember('you', question);
    try {
      const result = await api.ask(id, question, capture());
      tell(result.reply);
    } catch (failure) {
      fail(failure);
    }
  };

  const setComponent = async (componentId: string, status: ComponentStatus) => {
    try {
      setStudent(await api.setComponent(id, componentId, status));
    } catch (failure) {
      fail(failure);
    }
  };

  const startSteps = () =>
    withBusy('Starting…', async () => {
      setStudent(await api.startSteps(id));
    });

  const toggleHelp = () =>
    withBusy('One moment…', async () => {
      const requested = !student.helpRequested;
      setStudent(await api.help(id, requested));
      if (requested) tell('Your teacher has been told you need help.');
    });

  const leave = () => {
    voice.stop();
    onLeave();
  };

  const answered = (promptId: string) => setPrompts((list) => list.filter((item) => item.id !== promptId));

  const totalSteps = plan.steps.length;
  const stepsDone = student.phase === 'done' ? totalSteps : student.phase === 'steps' ? student.currentStep : 0;
  const analyzing = looking || busy === LOOKING || busy === MEASURING;
  const analysis = analyzing ? 'Analyzing image' : busy ?? (message ? 'Guidance ready' : null);

  return (
    <div className="lab">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">
            {plan.subject}
            {student.teamName && ` · ${student.teamName}`}
          </p>
          <h1>{plan.title}</h1>
        </div>

        {student.phase !== 'components' && (
          <div className="lab-progress">
            <p>
              {student.phase === 'done' ? 'All steps done' : `Step ${student.currentStep + 1} of ${totalSteps}`}
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Lab progress"
              aria-valuemin={0}
              aria-valuemax={totalSteps}
              aria-valuenow={stepsDone}
            >
              <div className="progress-fill" style={{ width: `${(stepsDone / Math.max(1, totalSteps)) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="topbar-actions">
          <button
            className="icon-button"
            onClick={() => {
              setMuted(!muted);
              voice.setMuted(!muted);
            }}
            aria-pressed={muted}
          >
            <Icon name={muted ? 'speakerOff' : 'speaker'} size={18} />
            {muted ? 'Voice off' : 'Voice on'}
          </button>
          <button className={student.helpRequested ? 'alert-button' : 'secondary'} onClick={toggleHelp}>
            <Icon name="hand" size={18} />
            {student.helpRequested ? 'Teacher notified' : 'Get teacher'}
          </button>
        </div>
      </header>

      <main className="workspace">
        <CameraView videoRef={videoRef} status={cameraStatus} overlay={overlay} connected={connected} analysis={analysis} />

        <aside className="panel" aria-label="Guidance">
          {ended && (
            <div className="banner">
              <p>Your teacher has ended this lab.</p>
              <button className="text-button" onClick={leave}>Leave</button>
            </div>
          )}

          {prompt ? (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onAnswer={async (answer) => {
                remember('you', answer);
                const result = await api.answer(id, prompt.id, answer);
                remember('ai', result.feedback);
                void voice.say(result.feedback);
                return result;
              }}
              onDone={async () => {
                answered(prompt.id);
                // Whatever was on screen before the question is out of date now.
                setMessage(null);
                await refresh();
                if (prompt.continuesStep) void next();
              }}
            />
          ) : student.phase === 'components' ? (
            <EquipmentPanel
              components={plan.components}
              statuses={student.components}
              looking={looking}
              scanning={cameraReady && !scanFinished}
              onSet={setComponent}
              onStart={startSteps}
            />
          ) : step && progress ? (
            <div className="panel-body">
              <p className="eyebrow">
                <span className="source source-teacher">
                  <Icon name="teacher" size={16} />
                  Your teacher's procedure
                </span>
                {STEP_STATUS_LABEL[progress.status] && (
                  <span className={`status-chip is-${progress.status}`}>
                    <Icon name={progress.status === 'passed' ? 'check' : 'alert'} size={14} />
                    {STEP_STATUS_LABEL[progress.status]}
                  </span>
                )}
              </p>
              <h2 className="step-title">{step.title}</h2>
              <p className="instruction">{step.instruction}</p>
              {step.safety && (
                <p className="safety">
                  <Icon name="shield" />
                  {step.safety}
                </p>
              )}

              <StepActions
                step={step}
                busy={busy !== null}
                cameraReady={cameraReady}
                passed={progress.status === 'passed'}
                onCheck={checkStep}
                onConfirm={confirmStep}
                onMeasure={measure}
                onRecord={record}
                onSensor={saveSensor}
              />

              {progress.status === 'passed' ? (
                <button className="primary" onClick={next} disabled={busy !== null}>
                  Next step
                  <Icon name="arrow" size={18} />
                </button>
              ) : step.mode === 'ask' && step.questionCount > 0 ? (
                <button className="primary" onClick={next} disabled={busy !== null}>
                  Answer the question
                  <Icon name="arrow" size={18} />
                </button>
              ) : null}

              <div className="quiet-actions">
                <button className="text-button" onClick={() => void voice.say(step.instruction)}>
                  Hear it again
                </button>
                {progress.status !== 'passed' && !(step.mode === 'ask' && step.questionCount > 0) && (
                  <button className="text-button" onClick={next} disabled={busy !== null}>
                    Skip to next step
                  </button>
                )}
              </div>
            </div>
          ) : (
            <DonePanel student={student} onLeave={leave} />
          )}

          {message && !prompt && (
            <div className={`feedback feedback-${message.tone}`} aria-live="polite">
              <span className="source source-ai">
                <Icon name="sparkle" size={16} />
                AI guidance
              </span>
              {message.text}
            </div>
          )}

          {student.phase !== 'done' && !prompt && <AskBar onAsk={ask} />}

          {student.phase !== 'components' && (
            <details className="more">
              <summary>
                <Icon name="list" size={18} />
                All steps
              </summary>
              <ol className="more-list">
                {plan.steps.map((entry, index) => (
                  <li key={entry.id} className={`step-row ${index === student.currentStep ? 'is-current' : ''}`}>
                    <span className="step-row-title">
                      {index + 1}. {entry.title}
                      <span className="muted">{STEP_ROW_LABEL[student.steps[index].status]}</span>
                    </span>
                    <span className="muted">{entry.instruction}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {history.length > 0 && (
            <details className="more">
              <summary>
                <Icon name="chat" size={18} />
                Recent guidance
              </summary>
              <ul className="more-list">
                {[...history].reverse().map((entry) => (
                  <li key={entry.id}>
                    <span className={`source source-${entry.from}`}>
                      <Icon name={HISTORY_FROM[entry.from].icon} size={15} />
                      {HISTORY_FROM[entry.from].label}
                    </span>
                    {entry.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </main>
    </div>
  );
}
