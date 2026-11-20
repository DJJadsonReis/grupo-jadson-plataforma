import { BadRequestException } from "@nestjs/common";
import { AgentSkillsController } from "./agent-skills.controller";

const principal = { id: "owner", name: "Pessoa", role: "operator" as const };

describe("AgentSkillsController", () => {
  it("passes the principal and bot id to list and attach", async () => {
    const skills = { listForAgent: jest.fn().mockResolvedValue([]), attach: jest.fn().mockResolvedValue({ slug: "research" }), detach: jest.fn() };
    const controller = new AgentSkillsController(skills as never);
    await controller.list("agent-id", { principal });
    await controller.attach("agent-id", { slug: "research" }, { principal });
    expect(skills.listForAgent).toHaveBeenCalledWith("owner", "agent-id");
    expect(skills.attach).toHaveBeenCalledWith("owner", "agent-id", "research");
  });

  it("validates attach body and returns deleted after detach", async () => {
    const skills = { listForAgent: jest.fn(), attach: jest.fn(), detach: jest.fn().mockResolvedValue(undefined) };
    const controller = new AgentSkillsController(skills as never);
    expect(() => controller.attach("agent-id", {}, { principal })).toThrow(BadRequestException);
    await expect(controller.detach("agent-id", "research", { principal })).resolves.toEqual({ deleted: true });
    expect(skills.detach).toHaveBeenCalledWith("owner", "agent-id", "research");
  });
});
