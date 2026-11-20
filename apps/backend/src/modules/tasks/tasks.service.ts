import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export type TaskStatus = "aberta" | "concluida" | "arquivada" | "na_fila" | "em_andamento" | "falhou";
export interface TaskRecord {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  agentId: string | null;
  result: string;
  attempts: number;
  failureMessage: string;
  queuedAt: Date | null;
  finishedAt: Date | null;
}
export interface TaskInput { title: unknown; description?: unknown }
export interface TaskPatch { title?: unknown; description?: unknown; status?: unknown }

export const TASK_COLUMNS = `id,owner_id AS "ownerId",title,description,status,created_at AS "createdAt",updated_at AS "updatedAt",agent_id AS "agentId",result,attempts,failure_message AS "failureMessage",queued_at AS "queuedAt",finished_at AS "finishedAt"`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = new Set<TaskStatus>(["aberta", "concluida", "arquivada"]);

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async list(ownerId: string): Promise<TaskRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE owner_id=$1 AND status<>'arquivada' ORDER BY updated_at DESC`, [ownerId],
    );
    return result.rows as TaskRecord[];
  }

  async create(ownerId: string, input: TaskInput): Promise<TaskRecord> {
    const value = validateCreate(input);
    const result = await this.database.getPool().query(
      `INSERT INTO tasks(id,owner_id,title,description) VALUES($1,$2,$3,$4) RETURNING ${TASK_COLUMNS}`,
      [randomUUID(), ownerId, value.title, value.description],
    );
    return result.rows[0] as TaskRecord;
  }

  async update(ownerId: string, id: string, patch: TaskPatch): Promise<TaskRecord> {
    validateId(id);
    const value = validatePatch(patch);
    const fields: string[] = [];
    const params: unknown[] = [id, ownerId];
    if (value.title !== undefined) { params.push(value.title); fields.push(`title=$${params.length}`); }
    if (value.description !== undefined) { params.push(value.description); fields.push(`description=$${params.length}`); }
    if (value.status !== undefined) { params.push(value.status); fields.push(`status=$${params.length}`); }
    fields.push("updated_at=now()");
    const result = await this.database.getPool().query(
      `UPDATE tasks SET ${fields.join(",")} WHERE id=$1 AND owner_id=$2 RETURNING ${TASK_COLUMNS}`, params,
    );
    if (result.rowCount === 0) throw notFound();
    return result.rows[0] as TaskRecord;
  }

  async archive(ownerId: string, id: string): Promise<TaskRecord> {
    return this.update(ownerId, id, { status: "arquivada" });
  }
}

function validateCreate(input: TaskInput): { title: string; description: string } {
  if (!input || typeof input !== "object" || typeof input.title !== "string" || input.title.length < 1 || input.title.length > 120 || input.title.trim() !== input.title) {
    throw new BadRequestException("O título deve ter de 1 a 120 caracteres e não pode ter espaços nas pontas.");
  }
  const description = input.description === undefined ? "" : input.description;
  if (typeof description !== "string" || description.length > 2000) {
    throw new BadRequestException("A descrição deve ter até 2000 caracteres.");
  }
  return { title: input.title, description };
}

export function validatePatch(patch: TaskPatch): { title?: string; description?: string; status?: TaskStatus } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !["title", "description", "status"].includes(key))) {
    throw new BadRequestException("Informe ao menos um campo válido para atualizar a tarefa.");
  }
  const result: { title?: string; description?: string; status?: TaskStatus } = {};
  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    if (typeof patch.title !== "string" || patch.title.length < 1 || patch.title.length > 120 || patch.title.trim() !== patch.title) {
      throw new BadRequestException("O título deve ter de 1 a 120 caracteres e não pode ter espaços nas pontas.");
    }
    result.title = patch.title;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    if (typeof patch.description !== "string" || patch.description.length > 2000) throw new BadRequestException("A descrição deve ter até 2000 caracteres.");
    result.description = patch.description;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    if (typeof patch.status !== "string" || !STATUS.has(patch.status as TaskStatus)) throw new BadRequestException("Status da tarefa inválido.");
    result.status = patch.status as TaskStatus;
  }
  return result;
}

function validateId(id: string): void { if (typeof id !== "string" || !UUID.test(id)) throw notFound(); }
function notFound(): NotFoundException { return new NotFoundException({ code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." }); }
