import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AgentRecord } from "../agents/agents.service";
import { GroupRecord } from "../agents/groups.service";

export interface ResolvedMention { agentId: string; agentName: string; start: number; end: number; }
export function resolveGroupRecipient(group: GroupRecord, members: AgentRecord[], text: string, requestedAgentId?: string): { agentId: string; mentions: ResolvedMention[] } {
  if (group.mode === "coordinated") throw new ServiceUnavailableException({ code: "GROUP_ORCHESTRATION_UNAVAILABLE", message: "O backend ainda não possui um runtime de agentes com delegação e limites coordenados; esta conversa não será simulada." });
  const available = members.filter((member) => member.enabled && group.agentIds.includes(member.id));
  if (group.mode === "manual") {
    if (!requestedAgentId || !available.some((member) => member.id === requestedAgentId)) throw new BadRequestException("Escolha um participante ativo deste grupo.");
    return { agentId: requestedAgentId, mentions: [] };
  }
  const matches: ResolvedMention[] = [];
  for (const member of available) {
    const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(expression)) matches.push({ agentId: member.id, agentName: member.name, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  if (!matches.length) throw new BadRequestException("Mencione um participante disponível usando @Nome do agente.");
  const recipients = new Set(matches.map((match) => match.agentId));
  if (recipients.size > 1) throw new BadRequestException("Envie uma menção por mensagem para manter o roteamento explícito.");
  return { agentId: matches[0]!.agentId, mentions: matches };
}
