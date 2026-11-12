import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "./secret-box";

export type IntegrationName = "tavily" | "notion" | "modelo_chave" | "modelo_endereco" | "modelo_padrao";
const NAMES: IntegrationName[] = ["tavily", "notion", "modelo_chave", "modelo_endereco", "modelo_padrao"];
const MIN_LENGTH: Record<IntegrationName, number> = { tavily: 8, notion: 20, modelo_chave: 8, modelo_endereco: 1, modelo_padrao: 1 };
const LABELS: Record<IntegrationName, string> = {
  tavily: "Busca na web",
  notion: "Notion",
  modelo_chave: "Chave do modelo",
  modelo_endereco: "Endereço do modelo",
  modelo_padrao: "Nome do modelo",
};

/**
 * Chaves e configurações de serviços externos. Ficam no banco local; a chave é cifrada e
 * nenhuma rota devolve o valor (a tela só recebe se está configurada).
 */
@Injectable()
export class IntegrationsService {
  private readonly box = new SecretBox();

  constructor(private readonly database: DatabaseService) {}

  async status(): Promise<Record<IntegrationName, { configured: boolean; label: string }>> {
    const result = await this.database.getPool().query(`SELECT name FROM integrations`);
    const saved = new Set((result.rows as { name: string }[]).map((row) => row.name));
    return {
      tavily: { configured: saved.has("tavily") || Boolean(process.env.TAVILY_API_KEY), label: LABELS.tavily },
      notion: { configured: saved.has("notion") || Boolean(process.env.NOTION_TOKEN), label: LABELS.notion },
      modelo_chave: { configured: saved.has("modelo_chave") || Boolean(process.env.OPENAI_API_KEY), label: LABELS.modelo_chave },
      modelo_endereco: { configured: saved.has("modelo_endereco") || Boolean(process.env.OPENAI_BASE_URL), label: LABELS.modelo_endereco },
      modelo_padrao: { configured: saved.has("modelo_padrao") || Boolean(process.env.OPENAI_MODEL), label: LABELS.modelo_padrao },
    };
  }

  async save(name: IntegrationName, secret: string): Promise<void> {
    if (!NAMES.includes(name)) throw new BadRequestException({ code: "INVALID_INTEGRATION", message: "Integração desconhecida." });
    const value = secret.trim();
    if (value.length < MIN_LENGTH[name] || value.length > 300) {
      throw new BadRequestException({ code: "INVALID_INTEGRATION", message: `${LABELS[name]} parece inválida.` });
    }
    await this.database.getPool().query(
      `INSERT INTO integrations(name, secret, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now()`,
      [name, this.box.encrypt(value)],
    );
  }

  async remove(name: IntegrationName): Promise<void> {
    if (!NAMES.includes(name)) throw new BadRequestException({ code: "INVALID_INTEGRATION", message: "Integração desconhecida." });
    await this.database.getPool().query(`DELETE FROM integrations WHERE name = $1`, [name]);
  }

  /** Valor para uso interno (ferramentas e provedor de modelo). Não é exposto por rota nenhuma. */
  async secret(name: IntegrationName): Promise<string | undefined> {
    const result = await this.database.getPool().query(`SELECT secret FROM integrations WHERE name = $1`, [name]);
    if (result.rowCount && result.rows[0]) {
      const stored = (result.rows[0] as { secret: string }).secret;
      if (!this.box.isEncrypted(stored)) {
        // Valor gravado antes da cifragem: regrava cifrado na primeira leitura.
        await this.database.getPool().query(`UPDATE integrations SET secret = $2 WHERE name = $1`, [name, this.box.encrypt(stored)]);
      }
      return this.box.decrypt(stored);
    }
    const fallback: Record<IntegrationName, string | undefined> = {
      tavily: process.env.TAVILY_API_KEY,
      notion: process.env.NOTION_TOKEN,
      modelo_chave: process.env.OPENAI_API_KEY,
      modelo_endereco: process.env.OPENAI_BASE_URL,
      modelo_padrao: process.env.OPENAI_MODEL,
    };
    return fallback[name];
  }
}
