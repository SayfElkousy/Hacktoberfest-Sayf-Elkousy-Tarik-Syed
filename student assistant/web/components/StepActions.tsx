import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { connectSensor, parseReadings, sensorSupported } from '../sensor.ts';
import type { SensorConnection } from '../sensor.ts';
import type { MeasureResult, StudentLab } from '../../shared/types.ts';

type Step = StudentLab['plan']['steps'][number];

export interface StepHandlers {
  onCheck: () => void;
  onConfirm: () => void;
  onMeasure: () => Promise<MeasureResult | null>;
  onRecord: (value: number) => void;
  onSensor: (readings: number[], unit: string) => void;
}

interface Props extends StepHandlers {
  step: Step;
  busy: boolean;
  /** False with no working camera. Every step can still be finished without one. */
  cameraReady: boolean;
  /** Once a step has passed, moving on is the main action, not these. */
  passed: boolean;
}

/** The control that fits how this step gets verified. */
export function StepActions({ step, busy, cameraReady, passed, ...handlers }: Props) {
  const main = passed ? 'secondary' : 'primary';

  switch (step.mode) {
    case 'camera':
      return (
        <div className="actions">
          {cameraReady && (
            <button className={main} onClick={handlers.onCheck} disabled={busy}>
              Check my work
            </button>
          )}
          <button className={cameraReady ? 'secondary' : main} onClick={handlers.onConfirm} disabled={busy}>
            {cameraReady ? "Camera can't see it" : "I've done this"}
          </button>
        </div>
      );
    case 'measure':
      return <MeasureActions step={step} busy={busy} cameraReady={cameraReady} passed={passed} {...handlers} />;
    case 'sensor':
      return <SensorActions busy={busy} onSensor={handlers.onSensor} />;
    default:
      // With its own questions, answering them is the check.
      if (step.questionCount > 0) return null;
      return (
        <div className="actions">
          <button className="primary" onClick={handlers.onConfirm} disabled={busy}>
            I've done this
          </button>
        </div>
      );
  }
}

function MeasureActions({ step, busy, cameraReady, passed, onMeasure, onRecord }: Props) {
  const [askedForManual, setManual] = useState(false);
  const manual = askedForManual || !cameraReady;
  const [value, setValue] = useState('');
  const goal = step.measurement!;
  const unit = goal.unit === 'deg' ? '°' : ' cm';

  function submit(event: FormEvent) {
    event.preventDefault();
    const number = Number(value);
    if (value.trim() && Number.isFinite(number)) onRecord(number);
  }

  return (
    <>
      {goal.target !== null && (
        <p className="target">
          Target <strong>{goal.target}{unit}</strong>
          {goal.tolerance !== null && <> ± {goal.tolerance}{unit}</>}
        </p>
      )}
      {cameraReady && (
        <div className="actions">
          <button
            className={passed ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={async () => {
              const result = await onMeasure();
              if (result && !result.measured) setManual(true);
            }}
          >
            Measure it
          </button>
          <button className="secondary" onClick={() => setManual((open) => !open)}>
            Enter it myself
          </button>
        </div>
      )}
      {manual && (
        <form className="inline-form" onSubmit={submit}>
          <label>
            Your measurement of {goal.subject}
            <span className="input-with-unit">
              <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" autoFocus />
              {unit.trim()}
            </span>
          </label>
          <button className="secondary" disabled={!value.trim()}>Save</button>
        </form>
      )}
    </>
  );
}

function SensorActions({ busy, onSensor }: Pick<Props, 'busy' | 'onSensor'>) {
  const [readings, setReadings] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const [pasted, setPasted] = useState('');
  const [unit, setUnit] = useState('');
  const [baud, setBaud] = useState(9600);
  const [error, setError] = useState<string | null>(null);
  const connection = useRef<SensorConnection | null>(null);

  async function connect() {
    setError(null);
    try {
      connection.current = await connectSensor(baud, (value) => setReadings((list) => [...list, value]));
      setConnected(true);
    } catch (failure) {
      if ((failure as Error).name !== 'NotFoundError') setError((failure as Error).message);
    }
  }

  async function disconnect() {
    await connection.current?.stop();
    connection.current = null;
    setConnected(false);
  }

  const collected = [...readings, ...parseReadings(pasted)];

  return (
    <div className="sensor">
      {sensorSupported && (
        <div className="actions">
          {connected ? (
            <button className="secondary" onClick={disconnect}>
              Stop reading
            </button>
          ) : (
            <button className="secondary" onClick={connect}>
              Connect USB sensor
            </button>
          )}
          <label className="baud">
            Speed
            <select value={baud} onChange={(event) => setBaud(Number(event.target.value))} disabled={connected}>
              <option value={9600}>9600</option>
              <option value={115200}>115200</option>
            </select>
          </label>
        </div>
      )}
      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        placeholder="Or type or paste your readings here"
        rows={2}
      />
      <label className="optional-field">
        Units
        <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="e.g. m/s" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || collected.length === 0} onClick={() => onSensor(collected, unit)}>
          Save {collected.length || ''} {collected.length === 1 ? 'reading' : 'readings'}
        </button>
      </div>
    </div>
  );
}
