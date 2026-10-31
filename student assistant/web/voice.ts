// Speaks out loud with the Kokoro voice from the server. If the voice is still
// loading or the server can't provide it, the browser's own voice steps in so a
// student never misses an instruction.

import { splitSentences } from '../shared/speech.ts';

/** Speech recognition lags, so a phrase can arrive this long after the voice has stopped. */
const ECHO_TAIL_MS = 2_000;
/** This share of a phrase's words matching what was just said makes it an echo. */
const ECHO_MATCH = 0.6;

function plainWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
}

class Voice {
  muted = false;
  /** Told everything that gets said, so it can be shown as captions, even while muted. */
  onCaption: ((text: string) => void) | null = null;

  private studentId: string | null = null;
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** Bumped by each new message, so older speech knows to stop. */
  private generation = 0;
  private speaking = false;
  private stoppedAt = 0;
  private lastSaid = '';

  /** Call from a click: browsers only allow sound after the user has interacted. */
  start(): void {
    this.context ??= new AudioContext();
    void this.context.resume();
  }

  setStudent(id: string): void {
    this.studentId = id;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  stop(): void {
    this.generation++;
    this.source?.stop();
    this.source = null;
    this.finished();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /**
   * True if the microphone most likely just heard this voice rather than the student.
   * Going by the words, not just by timing, lets a student talk over the assistant.
   */
  isEcho(heard: string): boolean {
    const browserSpeaking = 'speechSynthesis' in window && speechSynthesis.speaking;
    if (!this.speaking && !browserSpeaking && Date.now() - this.stoppedAt > ECHO_TAIL_MS) return false;

    const said = new Set(plainWords(this.lastSaid).split(' '));
    const words = plainWords(heard).split(' ');
    return words.filter((word) => said.has(word)).length / words.length >= ECHO_MATCH;
  }

  /** Says `text`, cutting off anything still being spoken. */
  async say(text: string): Promise<void> {
    this.stop();
    if (!text.trim()) return;
    this.onCaption?.(text);
    this.lastSaid = text;
    if (this.muted) return;

    const generation = this.generation;
    const sentences = splitSentences(text);
    this.speaking = true;

    // Ask for each sentence as soon as the one before is playing, so there's no gap.
    let upcoming = this.fetchAudio(sentences[0]);
    for (let i = 0; i < sentences.length; i++) {
      const audio = await upcoming;
      if (generation !== this.generation) return;

      if (!audio) {
        // Finish the message in the browser voice rather than switching mid-way.
        this.sayWithBrowser(sentences.slice(i).join(' '));
        this.finished();
        return;
      }

      if (i + 1 < sentences.length) upcoming = this.fetchAudio(sentences[i + 1]);
      await this.play(audio);
      if (generation !== this.generation) return;
    }
    this.finished();
  }

  private finished(): void {
    if (this.speaking) this.stoppedAt = Date.now();
    this.speaking = false;
  }

  private async fetchAudio(sentence: string): Promise<AudioBuffer | null> {
    if (!this.studentId || !this.context) return null;
    try {
      const response = await fetch(`/api/students/${this.studentId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
      });
      if (!response.ok) return null;
      return await this.context.decodeAudioData(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  private play(audio: AudioBuffer): Promise<void> {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    this.source = source;

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  private sayWithBrowser(text: string): void {
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

export const voice = new Voice();
