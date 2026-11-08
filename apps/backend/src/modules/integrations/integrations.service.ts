import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type IntegrationName = "tavily";
const NAMES: IntegrationName[] = ["tavily"];

/**
 * Chaves de serviços externos. A chave é gravada no banco local e nunca sai pela API:
 * a tela só recebe se está configurada ou não.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}

  async status(): Promise<Record<IntegrationName, { configured: boolean }>> {
    const result = await this.database.getPool().query(`SELECT name FROM integrations`);
    const saved = new Set((result.rows as { name: string }[]).map((row) => row.name));
    return { tavily: { configured: saved.has("tavily") || Boolean(process.env.TAVILY_API_KEY) } };
  }

  async save(name: IntegrationName, secret: string): Promise<void> {
    if (!NAMES.includes(name)) throw new BadRequestException({ code: "INVALID_INTEGRATION", message: "Integração desconhecida." });
    const value = secret.trim();
    if (value.length < 8 || value.length > 200) throw new BadRequestException({ code: "INVALID_INTEGRATION", message: "A chave parece inválida." });
    await this.database.getPool().query(
      `INSERT INTO integrations(name, secret, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now()`,
      [name, value],
    );
  }

  async remove(name: IntegrationName): Promise<void> {
    await this.database.getPool().query(`DELETE FROM integrations WHERE name = $1`, [name]);
  }

  /** Chave para uso interno (ferramentas). Não é exposta por rota nenhuma. */
  async secret(name: IntegrationName): Promise<string | undefined> {
    const result = await this.database.getPool().query(`SELECT secret FROM integrations WHERE name = $1`, [name]);
    if (result.rowCount && result.rows[0]) return (result.rows[0] as { secret: string }).secret;
    return name === "tavily" ? process.env.TAVILY_API_KEY : undefined;
  }
}
