import { promises as fs } from "fs";
import { isAbsolute, join, relative, resolve } from "path";

/** Pasta do computador que os agentes podem ver e alterar. Padrão: <raiz do projeto>\workspace. */
export function workspaceRoot(): string {
  const configured = process.env.WORKSPACE_DIR?.trim();
  return resolve(configured || join(process.cwd(), "..", "..", "workspace"));
}

const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 200_000;

/**
 * Resolve um caminho relativo dentro da pasta de trabalho. Recusa caminho absoluto, ".." que
 * saia da pasta e links simbólicos que apontem para fora.
 */
export async function safePath(relativePath: string): Promise<string> {
  const root = workspaceRoot();
  const rel = relativePath.trim() || ".";
  if (isAbsolute(rel)) throw new Error("Use um caminho relativo à pasta de trabalho.");
  const target = resolve(root, rel);
  const within = relative(root, target);
  if (within.startsWith("..") || isAbsolute(within)) throw new Error("Caminho fora da pasta de trabalho.");
  const real = await fs.realpath(target).catch(() => target);
  const realRoot = await fs.realpath(root).catch(() => root);
  const realWithin = relative(realRoot, real);
  if (realWithin.startsWith("..") || isAbsolute(realWithin)) throw new Error("Caminho fora da pasta de trabalho.");
  return target;
}

export async function listFiles(relativePath: string): Promise<{ nome: string; tipo: "pasta" | "arquivo"; bytes: number }[]> {
  const dir = await safePath(relativePath);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: { nome: string; tipo: "pasta" | "arquivo"; bytes: number }[] = [];
  for (const entry of entries.slice(0, 200)) {
    const stat = entry.isFile() ? await fs.stat(join(dir, entry.name)).catch(() => null) : null;
    out.push({ nome: entry.name, tipo: entry.isDirectory() ? "pasta" : "arquivo", bytes: stat?.size ?? 0 });
  }
  return out;
}

export async function readText(relativePath: string): Promise<{ conteudo: string; truncado: boolean }> {
  const file = await safePath(relativePath);
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error("Não é um arquivo.");
  const buffer = await fs.readFile(file);
  const truncado = buffer.length > MAX_READ_BYTES;
  return { conteudo: buffer.subarray(0, MAX_READ_BYTES).toString("utf8"), truncado };
}

export async function writeText(relativePath: string, content: string): Promise<{ bytes: number }> {
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) throw new Error("Conteúdo grande demais (máximo 200 KB).");
  const file = await safePath(relativePath);
  await fs.mkdir(join(file, ".."), { recursive: true });
  await fs.writeFile(file, content, "utf8");
  return { bytes: Buffer.byteLength(content, "utf8") };
}
