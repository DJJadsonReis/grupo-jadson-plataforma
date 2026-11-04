import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AgentRecord } from "../agents/agents.service";
import { GroupRecord } from "../agents/groups.service";
import { resolveGroupRecipient } from "./group-routing";

const researcher = { id: "d1eb7e27-ff37-46d2-b88e-71a52c451736", name: "Pesquisador", enabled: true } as AgentRecord;
const designer = { ...researcher, id: "e4fdf3b0-8e4a-4c83-8bb4-6211be769e91", name: "Designer" } as AgentRecord;
const group = { id: "f114b48a-9560-4ff5-8596-6716ea8b8b77", agentIds: [researcher.id, designer.id], mode: "mention", archived: false } as GroupRecord;

describe("group message routing", () => {
  it("resolves persisted agent IDs from @mentions", () => {
    expect(resolveGroupRecipient(group, [researcher, designer], "@Pesquisador revise isso.")).toEqual({ agentId: researcher.id, mentions: [{ agentId: researcher.id, agentName: "Pesquisador", start: 0, end: 12 }] });
  });
  it("requires a selected active member in manual mode", () => {
    expect(() => resolveGroupRecipient({ ...group, mode: "manual" }, [researcher], "olá")).toThrow(BadRequestException);
    expect(resolveGroupRecipient({ ...group, mode: "manual" }, [researcher], "olá", researcher.id).agentId).toBe(researcher.id);
  });
  it("does not pretend coordinated mode is implemented without a delegation runtime", () => {
    expect(() => resolveGroupRecipient({ ...group, mode: "coordinated" }, [researcher], "olá")).toThrow(ServiceUnavailableException);
  });
});
