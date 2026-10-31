import type { StudentProgress } from '../../shared/types.ts';

const UNIT_LABEL: Record<string, string> = { deg: '°' };

export function DonePanel({ student, onLeave }: { student: StudentProgress; onLeave: () => void }) {
  const correct = student.answers.filter((answer) => answer.correct).length;

  return (
    <div className="panel-body">
      <p className="eyebrow">Finished</p>
      <h2 className="step-title">Nice work, {student.name}</h2>
      <p className="instruction">You've reached the end of the lab. Clean up your bench and check in with your teacher.</p>

      {student.measurements.length > 0 && (
        <>
          <h3 className="section-label">Your measurements</h3>
          <ul className="results">
            {student.measurements.map((measurement) => (
              <li key={`${measurement.stepId}-${measurement.at}`}>
                <span>{measurement.label}</span>
                <strong>
                  {measurement.value}
                  {UNIT_LABEL[measurement.unit] ?? ` ${measurement.unit}`}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}

      {student.answers.length > 0 && (
        <p className="progress-note">
          {correct} of {student.answers.length} questions answered correctly
        </p>
      )}

      <button className="secondary" onClick={onLeave}>
        Leave this lab
      </button>
    </div>
  );
}
