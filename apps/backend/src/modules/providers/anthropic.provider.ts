import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CompletionInput, LanguageModelProvider, ProviderMessage } from "./provider.types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-haiku-latest";

export function translateAnthropicRequest(input: CompletionInput, defaultModel = DEFAULT_MODEL) {
  const system = input.messages.filter((message) => message.role === "system").map((message) => typeof message.content === "string" ? message.content : "").filter(Boolean).join("\n\n");
  const messages = input.messages.filter((message) => message.role !== "system").map((message) => {
    if (message.role === "tool") return { role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id ?? "", content: typeof message.content === "string" ? message.content : "" }] };
    if (message.role === "assistant" && message.tool_calls?.length) {
      const content = [ ...(typeof message.content === "string" && message.content ? [{ type: "text", text: message.content }] : []), ...message.tool_calls.map((call) => ({ type: "tool_use", id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) })) ];
      return { role: "assistant", content };
    }
    return { role: message.role as "user" | "assistant", content: translateContent(message) };
  });
  return {
    model: input.model || defaultModel,
    max_tokens: input.generationConfig?.maxTokens ?? 1024,
    ...(system ? { system } : {}),
    messages,
    stream: true,
    ...(input.tools?.length ? { tools: input.tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })) } : {}),
    ...(input.generationConfig?.temperature === undefined ? {} : { temperature: input.generationConfig.temperature }),
  };
}

function parseArguments(raw: string): Record<string, unknown> {
  try { const value = JSON.parse(raw || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

function translateContent(message: ProviderMessage): unknown {
  if (typeof message.content === "string" || message.content == null) return message.content ?? "";
  return message.content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const url = part.image_url.url;
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (match) return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
    return { type: "image", source: { type: "url", url } };
  });
}

/** Convert Anthropic's content-block SSE into the OpenAI-compatible shape used by ChatController. */
export function anthropicStreamToOpenAi(response: Response): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); return; }
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event: any; try { event = JSON.parse(payload); } catch { continue; }
          let delta: any = null;
          if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
            delta = { tool_calls: [{ index: event.index, id: event.content_block.id, type: "function", function: { name: event.content_block.name, arguments: "" } }] };
          } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            delta = { content: event.delta.text };
          } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
            delta = { tool_calls: [{ index: event.index, function: { arguments: event.delta.partial_json } }] };
          }
          if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`));
        }
      }
    },
    cancel() { void reader.cancel(); },
  });
  return new Response(stream, { status: response.status, headers: { "Content-Type": "text/event-stream" } });
}

@Injectable()
export class AnthropicProvider implements LanguageModelProvider {
  readonly id = "anthropic";
  isConfigured(): boolean { return Boolean(process.env.ANTHROPIC_API_KEY?.trim()); }

  async stream(input: CompletionInput, signal?: AbortSignal): Promise<Response> {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException({ code: "AI_PROVIDER_NOT_CONFIGURED", message: "Defina ANTHROPIC_API_KEY para usar o provedor Anthropic." });
    const model = input.model || DEFAULT_MODEL;
    const availability = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
      method: "GET", signal: signal ?? AbortSignal.timeout(5_000), headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    }).catch(() => null);
    if (!availability) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: "Não foi possível verificar a disponibilidade do modelo Anthropic." });
    if (availability.status === 404) throw new ServiceUnavailableException({ code: "MODEL_UNAVAILABLE", message: `O modelo '${model}' não existe ou esta chave não tem acesso a ele.` });
    if (availability.status === 401 || availability.status === 403) throw new ServiceUnavailableException({ code: "MODEL_CREDENTIAL_REJECTED", message: "A Anthropic recusou a chave ao verificar o acesso ao modelo." });
    if (!availability.ok) throw new ServiceUnavailableException({ code: "MODEL_CHECK_FAILED", message: `A Anthropic não confirmou o modelo '${model}' (HTTP ${availability.status}).` });
    let response: Response;
    try {
      response = await fetch(ENDPOINT, { method: "POST", signal: signal ?? null, headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(translateAnthropicRequest(input)) });
    } catch { throw new ServiceUnavailableException({ code: "AI_PROVIDER_REQUEST_FAILED", message: "Não foi possível conectar ao provedor Anthropic." }); }
    if (!response.ok) throw new ServiceUnavailableException({ code: "AI_PROVIDER_REQUEST_FAILED", message: `Anthropic respondeu com HTTP ${response.status}. Confira a chave e o modelo.` });
    return anthropicStreamToOpenAi(response);
  }
}
