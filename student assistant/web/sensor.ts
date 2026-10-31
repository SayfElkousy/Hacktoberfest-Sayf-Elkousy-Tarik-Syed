// Reads a sensor plugged in over USB through Web Serial (Chrome and Edge).
// Anything that prints one number per line works, such as an Arduino sketch.

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

const serial = (navigator as unknown as { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;

export const sensorSupported = Boolean(serial);

export interface SensorConnection {
  stop(): Promise<void>;
}

export async function connectSensor(baudRate: number, onReading: (value: number) => void): Promise<SensorConnection> {
  if (!serial) throw new Error('This browser cannot read USB sensors. Try Chrome or Edge.');

  const port = await serial.requestPort();
  await port.open({ baudRate });

  const reader = port.readable!.pipeThrough(new TextDecoderStream() as never).getReader() as unknown as ReadableStreamDefaultReader<string>;
  let buffer = '';
  let stopped = false;

  const done = (async () => {
    while (!stopped) {
      const { value, done: finished } = await reader.read();
      if (finished) break;

      buffer += value;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const reading = parseFloat(line.match(/-?\d+(\.\d+)?/)?.[0] ?? '');
        if (Number.isFinite(reading)) onReading(reading);
      }
    }
  })().catch(() => undefined);

  return {
    async stop() {
      stopped = true;
      await reader.cancel().catch(() => undefined);
      await done;
      await port.close().catch(() => undefined);
    },
  };
}

/** Pulls every number out of pasted text, such as a column from a spreadsheet. */
export function parseReadings(text: string): number[] {
  return (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}
