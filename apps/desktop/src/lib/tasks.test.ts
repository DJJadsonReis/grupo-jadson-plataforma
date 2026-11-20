import { describe, expect, it } from "vitest";
import { buildCreateBody, buildPatch, readErrorMessage, statusLabel, validateDescription, validateTitle, type TaskRecord } from "./tasks";

const task: TaskRecord = {
  id: "task-1", ownerId: "person-1", title: "Original", description: "Description",
  status: "aberta", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("task helpers", () => {
  it("validates title boundaries and whitespace", () => {
    expect(validateTitle("")).not.toBeNull();
    expect(validateTitle("   ")).not.toBeNull();
    expect(validateTitle("x".repeat(121))).not.toBeNull();
    expect(validateTitle(" title")).not.toBeNull();
    expect(validateTitle("title ")).not.toBeNull();
    expect(validateTitle("x")).toBeNull();
    expect(validateTitle("x".repeat(120))).toBeNull();
  });

  it("validates description length", () => {
    expect(validateDescription("x".repeat(2001))).not.toBeNull();
    expect(validateDescription("x".repeat(2000))).toBeNull();
  });

  it("builds create body with an empty description", () => {
    expect(buildCreateBody("title", "")).toEqual({ title: "title", description: "" });
  });

  it("builds patches containing only changed fields or null", () => {
    expect(buildPatch(task, { ...task, title: "Changed" })).toEqual({ title: "Changed" });
    expect(buildPatch(task, { ...task, status: "concluida" })).toEqual({ status: "concluida" });
    expect(buildPatch(task, { ...task })).toBeNull();
  });

  it("reads backend errors and uses fallback for invalid bodies", () => {
    expect(readErrorMessage({ code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." }, "Erro")).toBe("Tarefa não encontrada.");
    expect(readErrorMessage(null, "Erro")).toBe("Erro");
    expect(readErrorMessage("bad", "Erro")).toBe("Erro");
    expect(readErrorMessage({}, "Erro")).toBe("Erro");
  });

  it("labels task statuses", () => {
    expect(statusLabel("aberta")).toBe("Aberta");
    expect(statusLabel("concluida")).toBe("Concluída");
    expect(statusLabel("arquivada")).toBe("Arquivada");
  });
});
