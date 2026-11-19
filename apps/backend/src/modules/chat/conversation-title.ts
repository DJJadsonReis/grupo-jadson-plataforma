import { CompletionInput } from "../providers/provider.types";

type Stream = (input: CompletionInput) => Promise<Response>;

/** Generate a short title with the configured provider; null means the caller keeps its fallback. */
export async function generateConversationTitle(stream: Stream, model: string | undefined, userText: string, answer: string, provider?: "openai" | "anthropic"): Promise<string | null> {
  try {
    const response = await stream({
      ...(model ? { model } : {}),
      ...(provider ? { provider } : {}),
      generationConfig: { temperature: 0.2, maxTokens: 48 },
      messages: [
        { role: "system", content: "Crie um título curto em português (até 8 palavras) para esta conversa. Responda somente com o título." },
        { role: "user", content: `Mensagem: ${userText.slice(0, 1200)}\nResposta: ${answer.slice(0, 1600)}` },
      ],
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "", title = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) title += titleDelta(line);
      if (title.length > 300) break;
    }
    pending += decoder.decode();
    if (pending) title += titleDelta(pending);
    const clean = title.trim().replace(/^['"“”]+|['"“”]+$/g, "").replace(/\s+/g, " ").slice(0, 80);
    return clean || null;
  } catch {
    return null;
  }
}

function titleDelta(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    const event = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[] };
    return event.choices?.[0]?.delta?.content ?? "";
  } catch { return ""; }
}
