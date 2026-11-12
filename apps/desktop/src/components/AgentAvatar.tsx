import { useState } from "react";
import type { Agent } from "../lib/workspace";

export type AgentAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Avatar único de agente: usa a foto quando existe e cai para a inicial do nome se não houver foto
 * ou se a imagem não carregar. Use em todos os pontos que mostram um agente.
 */
export function AgentAvatar({ agent, size = "md", className = "" }: {
  agent: Pick<Agent, "name" | "avatar">;
  size?: AgentAvatarSize;
  className?: string;
}) {
  // A chave por foto faz a falha de uma imagem não bloquear a próxima.
  return <AgentAvatarImage key={agent.avatar ?? ""} agent={agent} size={size} className={className} />;
}

function AgentAvatarImage({ agent, size, className }: { agent: Pick<Agent, "name" | "avatar">; size: AgentAvatarSize; className: string }) {
  const [failed, setFailed] = useState(false);
  const letter = agent.name.trim().slice(0, 1).toUpperCase() || "A";
  const classes = `gx-avatar gx-avatar-${size} ${className}`.trim();
  if (!agent.avatar || failed) {
    return <span className={classes} aria-hidden="true">{letter}</span>;
  }
  return (
    <span className={classes}>
      <img src={agent.avatar} alt={agent.name} onError={() => setFailed(true)} />
    </span>
  );
}
