// Speaks out loud with the Kokoro voice from the server. If the voice is still
// loading or the server can't provide it, the browser's own voice steps in so a
// student never misses an instruction.

import { splitSentences } from '../shared/speech.ts';

class Voice {
  muted = false;

  private studentId: string | null = null;
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** Bumped by each new message, so older speech knows to stop. */
  private generation = 0;

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
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /** Says `text`, cutting off anything still being spoken. */
  async say(text: string): Promise<void> {
    this.stop();
    if (this.muted || !text.trim()) return;

    const generation = this.generation;
    const sentences = splitSentences(text);

    // Ask for each sentence as soon as the one before is playing, so there's no gap.
    let upcoming = this.fetchAudio(sentences[0]);
    for (let i = 0; i < sentences.length; i++) {
      const audio = await upcoming;
      if (generation !== this.generation) return;

      if (!audio) {
        // Finish the message in the browser voice rather than switching mid-way.
        this.sayWithBrowser(sentences.slice(i).join(' '));
        return;
      }

      if (i + 1 < sentences.length) upcoming = this.fetchAudio(sentences[i + 1]);
      await this.play(audio);
      if (generation !== this.generation) return;
    }
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
