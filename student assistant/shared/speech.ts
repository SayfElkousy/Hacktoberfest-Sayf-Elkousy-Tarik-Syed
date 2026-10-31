/**
 * Speech is generated a sentence at a time so the first one plays quickly. The
 * server and the site both split text this way, so a sentence the server
 * prepared in advance is exactly what the site asks for.
 */
export function splitSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}
