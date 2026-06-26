// Single source of truth for which AI provider Settoku Chat is actually using at runtime.
// Both the chat route and the UI badge read this, so what the user SEES is what the server
// USES — a real guarantee the chat is on free Groq, not a hand-typed label.

export interface ActiveProvider {
  provider: "groq" | "anthropic";
  model: string;
  free: boolean;
  /** e.g. "Groq · llama-3.3-70b-versatile (free)" */
  label: string;
}

export function activeProvider(): ActiveProvider {
  const resolved = (process.env.AI_CHAT_PROVIDER ?? (process.env.GROQ_API_KEY ? "groq" : "anthropic")).toLowerCase();
  if (resolved === "groq") {
    const model = process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile";
    return { provider: "groq", model, free: true, label: `Groq · ${model} (free)` };
  }
  const model = process.env.AI_CHAT_MODEL ?? "claude-sonnet-4-6";
  return { provider: "anthropic", model, free: false, label: `Anthropic · ${model}` };
}
