export const TASK_STATUSES = ["aberta", "concluida", "arquivada"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskRecord = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type TaskCreateBody = { title: string; description: string };
export type TaskPatch = Partial<Pick<TaskRecord, "title" | "description" | "status">>;
export type EditedTask = Pick<TaskRecord, "title" | "description" | "status">;

export function validateTitle(value: string): string | null {
  if (!value.trim()) return "Informe um título.";
  if (value !== value.trim()) return "O título não pode ter espaços no início ou no fim.";
  if (value.length > 120) return "O título deve ter no máximo 120 caracteres.";
  return null;
}

export function validateDescription(value: string): string | null {
  return value.length > 2000 ? "A descrição deve ter no máximo 2000 caracteres." : null;
}

export function buildCreateBody(title: string, description: string): TaskCreateBody {
  return { title, description: description || "" };
}

export function buildPatch(original: TaskRecord, edited: EditedTask): TaskPatch | null {
  const patch: TaskPatch = {};
  if (edited.title !== original.title) patch.title = edited.title;
  if (edited.description !== original.description) patch.description = edited.description;
  if (edited.status !== original.status) patch.status = edited.status;
  return Object.keys(patch).length ? patch : null;
}

export function readErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "aberta": return "Aberta";
    case "concluida": return "Concluída";
    case "arquivada": return "Arquivada";
  }
}
