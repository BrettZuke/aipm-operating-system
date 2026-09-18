// Which provider answered each AI call. What comes back depends on it (a video Gemini watched is a
// different thing from a caption a text model read), so every call leaves one line in the server
// log, and a script can listen in to collect them.

export interface AiCall {
  /** A video or image model, a text model, or speech to text. */
  kind: "gemini" | "llm" | "whisper";
  /** What the call was for, such as "breakdown" or "adapt". */
  label: string;
  /** The slot that answered, such as "gemini-2" or "groq". Never the key itself. */
  provider: string;
  model: string;
  ms: number;
}

const listeners = new Set<(call: AiCall) => void>();

export function recordAiCall(call: AiCall): void {
  console.log(`[research:${call.kind}] ${call.label} answered by ${call.provider} (${call.model}) in ${call.ms}ms`);
  for (const listen of listeners) listen(call);
}

/** Listen to every AI call in this process. Returns the function that stops listening. */
export function onAiCall(listen: (call: AiCall) => void): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
