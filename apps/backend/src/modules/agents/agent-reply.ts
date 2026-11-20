import { AgentRecord } from "./agents.service";
import { ProvidersService } from "../providers/providers.service";
import { ProviderMessage } from "../providers/provider.types";
import { callAgentEndpoint, streamAgUiEndpoint } from "./agent-endpoint";
import { SecretBox } from "../integrations/secret-box";

const secretBox = new SecretBox();

export async function replyAsAgent(input: { agent: AgentRecord; messages: ProviderMessage[]; providers: ProvidersService; conversationId: string }): Promise<string> {
  const { agent, messages } = input;
  if (agent.providerKind === "endpoint" && agent.endpointUrl) {
    if (agent.endpointTokenSecret && !process.env.CREDENTIAL_KEY) throw new Error("agent credential unavailable");
    const token = agent.endpointTokenSecret ? secretBox.decrypt(agent.endpointTokenSecret) : undefined;
    const endpointMessages = messages.map((message) => ({ role: message.role, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "") }));
    const options = { url: agent.endpointUrl, ...(token ? { token } : {}), conversationId: input.conversationId, messages: endpointMessages, agent: { id: agent.id, name: agent.name } };
    if (agent.endpointProtocol === "agui") {
      let text = "";
      for await (const delta of streamAgUiEndpoint(options)) text += delta;
      if (!text.trim()) throw new Error("empty completion");
      return text.trim().slice(0, 20_000);
    }
    return callAgentEndpoint(options);
  }
  const response = await input.providers.stream({ messages, provider: agent.provider === "anthropic" ? "anthropic" : "openai", ...(agent.model ? { model: agent.model } : {}), tools: [], generationConfig: agent.generationConfig });
  return readProviderText(response);
}

async function readProviderText(response: Response): Promise<string> {
  if (!response.body) throw new Error("provider unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", output = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) output += completionDelta(line);
    }
    pending += decoder.decode(); output += completionDelta(pending);
  } finally { reader.releaseLock(); }
  if (!output.trim()) throw new Error("empty completion");
  return output.trim().slice(0, 20_000);
}

function completionDelta(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try { const event = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }; return event.choices?.[0]?.delta?.content ?? ""; } catch { return ""; }
}
