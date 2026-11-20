import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type ResponseStyle = "concise" | "balanced" | "detailed";
export interface UserPreferences { instructions: string; responseStyle: ResponseStyle; }
const DEFAULTS: UserPreferences = { instructions: "", responseStyle: "balanced" };

@Injectable()
export class UserPreferencesService {
  constructor(private readonly database: DatabaseService) {}

  async read(owner: string): Promise<UserPreferences> {
    const result = await this.database.getPool().query(`SELECT instructions, response_style AS "responseStyle" FROM user_preferences WHERE owner = $1`, [owner]);
    return result.rowCount ? result.rows[0] as UserPreferences : DEFAULTS;
  }

  async update(owner: string, input: Partial<UserPreferences>): Promise<UserPreferences> {
    if (input.instructions !== undefined && (typeof input.instructions !== "string" || input.instructions.length > 3000)) {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Instruções devem ter até 3000 caracteres." });
    }
    if (input.responseStyle !== undefined && !["concise", "balanced", "detailed"].includes(input.responseStyle)) {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Estilo de resposta inválido." });
    }
    const current = await this.read(owner);
    const next = { instructions: input.instructions ?? current.instructions, responseStyle: input.responseStyle ?? current.responseStyle };
    const result = await this.database.getPool().query(
      `INSERT INTO user_preferences(owner, instructions, response_style) VALUES ($1,$2,$3)
       ON CONFLICT(owner) DO UPDATE SET instructions=EXCLUDED.instructions,response_style=EXCLUDED.response_style,updated_at=now()
       RETURNING instructions,response_style AS "responseStyle"`,
      [owner, next.instructions, next.responseStyle],
    );
    return result.rows[0] as UserPreferences;
  }
}
