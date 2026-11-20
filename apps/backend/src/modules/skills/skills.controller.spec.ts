import { BadRequestException } from "@nestjs/common";
import { SkillsController } from "./skills.controller";

const principal = { id: "person-1", name: "Person", role: "operator" as const };

describe("SkillsController", () => {
  it("uses the authenticated principal for listing and creation", async () => {
    const skills = { list: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new" }), remove: jest.fn() };
    const controller = new SkillsController(skills as never);
    await controller.list({ principal });
    await controller.create({ slug: "research", title: "Research", instructions: "Guide" }, { principal });
    expect(skills.list).toHaveBeenCalledWith("person-1");
    expect(skills.create).toHaveBeenCalledWith("person-1", { slug: "research", title: "Research", instructions: "Guide" });
  });

  it("returns a deleted response and propagates a uniform not found", async () => {
    const skills = { list: jest.fn(), create: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
    const controller = new SkillsController(skills as never);
    await expect(controller.remove("research", { principal })).resolves.toEqual({ deleted: true });
    skills.remove.mockRejectedValueOnce(new BadRequestException("Habilidade não encontrada."));
    await expect(controller.remove("foreign", { principal })).rejects.toThrow("Habilidade não encontrada.");
    expect(skills.remove).toHaveBeenLastCalledWith("person-1", "foreign");
  });
});
