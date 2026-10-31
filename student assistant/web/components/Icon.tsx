// The site's small icon set, drawn on a 24px grid so they all match.

const PATHS = {
  camera: 'M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm13 3 5-3v8l-5-3',
  cameraOff: 'M3 3l18 18M8 6h6a2 2 0 0 1 2 2v3l5-3v8l-1.5-.9M16 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 1.5-1.9',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M6 12.5a9 9 0 0 1 12 0M9.5 16a4 4 0 0 1 5 0M12 19.5h.01',
  wifiOff: 'M3 3l18 18M9.5 16a4 4 0 0 1 5 0M12 19.5h.01M6 12.5a9 9 0 0 1 4-2.3M2.5 9a14 14 0 0 1 4-2.8M12 5.5a14 14 0 0 1 9.5 3.5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  check: 'M4 12.5l5 5L20 6.5',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  speaker: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
  speakerOff: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  hand: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 16.5h.01',
  teacher: 'M3 9l9-4.5L21 9l-9 4.5zM7 11.5V16c1.5 1.5 3 2 5 2s3.5-.5 5-2v-4.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  chat: 'M4 5.5h16v11H10l-4.5 3.5v-3.5H4z',
  send: 'M4 12 20 4l-4.5 16-3.5-6.5z',
  shield: 'M12 3.5 5 6v5.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  flask: 'M9.5 3.5h5M10.5 3.5v6L5 18.5A1.5 1.5 0 0 0 6.3 21h11.4a1.5 1.5 0 0 0 1.3-2.5L13.5 9.5v-6M8 15h8',
  ruler: 'M3.5 16.5 16.5 3.5l4 4-13 13zM7 13l2 2M10 10l2 2M13 7l2 2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
