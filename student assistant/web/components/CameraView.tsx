import { useState } from 'react';
import type { RefObject } from 'react';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';
import type { CameraStatus } from '../camera.ts';
import type { GridBox, GridPoint } from '../../shared/types.ts';

export interface Overlay {
  boxes: { box: GridBox; label: string }[];
  line: { start: GridPoint; end: GridPoint; label: string } | null;
}

export const EMPTY_OVERLAY: Overlay = { boxes: [], line: null };

const CAMERA_MESSAGES: Record<Exclude<CameraStatus, 'ready'>, string> = {
  starting: 'Starting your camera…',
  blocked: "Camera access is blocked. You can keep going, and I'll ask you instead of looking. To use it, allow the camera in your browser and reload.",
  missing: "No camera found. You can keep going, and I'll ask you instead of looking.",
};

const CAMERA_STATE: Record<CameraStatus, { label: string; icon: IconName; tone: StatusTone }> = {
  starting: { label: 'Camera starting', icon: 'camera', tone: 'plain' },
  ready: { label: 'Camera on', icon: 'camera', tone: 'good' },
  blocked: { label: 'Camera blocked', icon: 'cameraOff', tone: 'warn' },
  missing: { label: 'No camera', icon: 'cameraOff', tone: 'warn' },
};

type StatusTone = 'plain' | 'good' | 'warn';

function Status({ icon, label, tone }: { icon: IconName; label: string; tone: StatusTone }) {
  return (
    <span className={`status status-${tone}`}>
      <Icon name={icon} size={16} />
      {label}
    </span>
  );
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  overlay: Overlay;
  connected: boolean;
  /** What the assistant is doing right now, or null when it's idle. */
  analysis: string | null;
}

export function CameraView({ videoRef, status, overlay, connected, analysis }: Props) {
  // Webcams come in different shapes, and the overlay only lines up at the real one.
  const [aspect, setAspect] = useState('16 / 9');
  const camera = CAMERA_STATE[status];

  return (
    <section className="work-area" aria-label="Your webcam">
      <div className="camera" style={{ aspectRatio: aspect }}>
        <video
          ref={videoRef}
          muted
          playsInline
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth && videoHeight) setAspect(`${videoWidth} / ${videoHeight}`);
          }}
        />

        <svg className="overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {overlay.boxes.map(({ box, label }) => (
            <rect
              key={label}
              className="overlay-box"
              x={box.left}
              y={box.top}
              width={box.right - box.left}
              height={box.bottom - box.top}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {overlay.line && (
            <line
              className="overlay-line"
              x1={overlay.line.start.x}
              y1={overlay.line.start.y}
              x2={overlay.line.end.x}
              y2={overlay.line.end.y}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {overlay.boxes.map(({ box, label }) => (
          <span key={label} className="overlay-label" style={{ left: `${box.left / 10}%`, top: `${box.top / 10}%` }}>
            {label}
          </span>
        ))}

        {status !== 'ready' && (
          <p className="camera-message">
            <Icon name={status === 'starting' ? 'camera' : 'cameraOff'} size={28} />
            {CAMERA_MESSAGES[status]}
          </p>
        )}
      </div>

      <div className="status-strip" aria-live="polite">
        <Status icon={camera.icon} label={camera.label} tone={camera.tone} />
        <Status
          icon={connected ? 'wifi' : 'wifiOff'}
          label={connected ? 'Connected' : 'Connection interrupted'}
          tone={connected ? 'good' : 'warn'}
        />
        {analysis && <Status icon="sparkle" label={analysis} tone="plain" />}
      </div>
    </section>
  );
}
