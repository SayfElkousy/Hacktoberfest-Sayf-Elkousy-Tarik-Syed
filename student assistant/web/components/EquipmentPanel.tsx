import { Icon } from './Icon.tsx';
import type { ComponentStatus, LabComponent } from '../../shared/types.ts';

interface Props {
  components: LabComponent[];
  statuses: Record<string, ComponentStatus>;
  looking: boolean;
  /** False with no working camera, or once the camera has stopped looking. */
  scanning: boolean;
  onSet: (id: string, status: ComponentStatus) => void;
  onStart: () => void;
}

const STATUS_LABEL: Record<ComponentStatus, string> = {
  unknown: 'Not found yet',
  seen: 'Found on camera',
  confirmed: 'You have it',
  missing: 'Missing',
};

export function EquipmentPanel({ components, statuses, looking, scanning, onSet, onStart }: Props) {
  const ready = components.filter((component) => ['seen', 'confirmed'].includes(statuses[component.id])).length;
  const missing = components.some((component) => statuses[component.id] === 'missing');

  return (
    <div className="panel-body">
      <p className="eyebrow">Equipment</p>
      <h2 className="step-title">Show me what you have</h2>
      <p className="instruction">
        {scanning ? 'Put each item where your camera can see it.' : 'Tell me which of these you have.'}
      </p>

      <ul className="equipment">
        {components.map((component) => {
          const status = statuses[component.id];
          return (
            <li key={component.id} className={`equipment-item is-${status}`}>
              <span className="equipment-mark" aria-hidden="true">
                {(status === 'seen' || status === 'confirmed') && <Icon name="check" size={15} />}
                {status === 'missing' && <Icon name="alert" size={15} />}
              </span>
              <span className="equipment-name">
                {component.quantity > 1 && `${component.quantity} × `}
                {component.name}
                <small>{STATUS_LABEL[status]}</small>
              </span>
              {status === 'unknown' && (
                <span className="equipment-actions">
                  <button className="text-button" onClick={() => onSet(component.id, 'confirmed')}>
                    I have it
                  </button>
                  <button className="text-button" onClick={() => onSet(component.id, 'missing')}>
                    Missing
                  </button>
                </span>
              )}
              {status === 'seen' && (
                <span className="equipment-actions">
                  <button className="text-button" onClick={() => onSet(component.id, 'missing')}>
                    That's wrong
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="progress-note">
        {ready} of {components.length} ready{looking ? ' · looking now…' : ''}
        {missing && ' · your teacher has been told about what is missing'}
      </p>

      <button className="primary" onClick={onStart}>
        {ready === components.length ? 'Start the lab' : 'Continue anyway'}
      </button>
    </div>
  );
}
