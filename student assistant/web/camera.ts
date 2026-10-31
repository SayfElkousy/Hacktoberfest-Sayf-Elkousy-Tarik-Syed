import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from '../shared/types.ts';

// Gemma gets more image detail from a bigger picture, up to about 2,000 pixels wide.
const FRAME_WIDTH = 1440;
const FRAME_HEIGHT = 960;

export type CameraStatus = 'starting' | 'ready' | 'blocked' | 'missing';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    canvasRef.current = document.createElement('canvas');

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => {});
        }
        setStatus('ready');
      })
      .catch((error: DOMException) => {
        if (!cancelled) setStatus(error.name === 'NotFoundError' ? 'missing' : 'blocked');
      });

    if (!navigator.mediaDevices) setStatus('blocked');

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  /**
   * Frames are stretched to 3:2 because Gemma's positions come back distorted for
   * any other shape, widescreen included. Its coordinates are fractions of the
   * image, so they still map straight onto the real picture, whose true size is
   * what gets reported here.
   */
  const capture = useCallback((): Frame | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return null;

    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    canvas.getContext('2d')!.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    return {
      image: canvas.toDataURL('image/jpeg', 0.88).split(',')[1],
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }, []);

  return { videoRef, status, capture };
}
