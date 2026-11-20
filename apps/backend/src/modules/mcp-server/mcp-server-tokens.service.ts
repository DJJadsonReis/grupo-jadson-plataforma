import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface McpServerTokenRecord { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
const COLUMNS = `id,name,created_at AS "createdAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt"`;
export const hashMcpToken = (token: string): string => createHash("sha256").update(token).digest("hex");

@Injectable()
export class McpServerTokensService {
  constructor(private readonly database: DatabaseService) {}

  async create(ownerId: string, name: string): Promise<{ token: string; record: McpServerTokenRecord }> {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) throw new BadRequestException("Informe um nome de até 80 caracteres.");
    const token = `gjm_${randomBytes(32).toString("base64url")}`;
    const result = await this.database.getPool().query(
      `INSERT INTO mcp_server_tokens(id,owner_id,name,token_hash) VALUES($1,$2,$3,$4) RETURNING ${COLUMNS}`,
      [randomUUID(), ownerId, cleanName, hashMcpToken(token)],
    );
    return { token, record: result.rows[0] as McpServerTokenRecord };
  }

  async list(ownerId: string): Promise<McpServerTokenRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM mcp_server_tokens WHERE owner_id=$1 ORDER BY created_at DESC`, [ownerId]);
    return result.rows as McpServerTokenRecord[];
  }

  async revoke(ownerId: string, id: string): Promise<boolean> {
    const result = await this.database.getPool().query(
      "UPDATE mcp_server_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND owner_id=$2 RETURNING id", [id, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async resolve(token: string): Promise<{ ownerId: string; tokenId: string; name: string; role: "admin" | "operator" | "viewer" } | null> {
    if (!token.startsWith("gjm_") || token.length > 100) return null;
    const result = await this.database.getPool().query(
      `UPDATE mcp_server_tokens t SET last_used_at=now() FROM users u WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND u.id::text=t.owner_id AND u.active=true RETURNING t.owner_id AS "ownerId",t.id AS "tokenId",u.name,u.role`,
      [hashMcpToken(token)],
    );
    return result.rows[0] as { ownerId: string; tokenId: string; name: string; role: "admin" | "operator" | "viewer" } | undefined ?? null;
  }
}
