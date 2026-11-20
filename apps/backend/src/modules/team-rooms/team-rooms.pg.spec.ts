import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { up } from "../database/migrations/032-team-rooms";
import { TeamRoomsService } from "./team-rooms.service";

describe("team rooms PostgreSQL integration", () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const enabled = Boolean(databaseUrl);
  (enabled ? it : it.skip)("isolates members and enforces room limits against PostgreSQL", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const first = randomUUID(), second = randomUUID();
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,name text NOT NULL,role text NOT NULL,token_hash text NOT NULL UNIQUE,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS agents(id uuid PRIMARY KEY,name text NOT NULL,description text NOT NULL DEFAULT '',instructions text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',enabled boolean NOT NULL DEFAULT true,avatar text NOT NULL DEFAULT '',role text NOT NULL DEFAULT '',department text NOT NULL DEFAULT '',specialties jsonb NOT NULL DEFAULT '[]',provider text NOT NULL DEFAULT 'openai',generation_config jsonb NOT NULL DEFAULT '{}',tools_allowed jsonb NOT NULL DEFAULT '[]',owner_id text NOT NULL DEFAULT 'sistema',provider_kind text NOT NULL DEFAULT 'model',endpoint_url text,endpoint_token_secret text)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS teams(id uuid PRIMARY KEY,name text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS team_members(team_id uuid NOT NULL REFERENCES teams(id),user_id uuid NOT NULL REFERENCES users(id),added_by text NOT NULL,PRIMARY KEY(team_id,user_id))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS agent_shares(agent_id uuid NOT NULL REFERENCES agents(id),user_id uuid REFERENCES users(id),team_id uuid REFERENCES teams(id),role text NOT NULL,granted_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(agent_id,user_id),UNIQUE(agent_id,team_id))`);
      await up(pool);
      await pool.query("INSERT INTO users(id,name,role,token_hash) VALUES($1,'Ana','viewer',$1),($2,'Bia','operator',$2) ON CONFLICT(id) DO NOTHING", [first, second]);
      const service = new TeamRoomsService({ getPool: () => pool } as never, { access: async () => "none" } as never, { stream: async () => { throw new Error("unexpected provider call"); } } as never, { record: async () => undefined } as never);
      const room = await service.create("Sala de teste", { id: first, name: "Ana", role: "viewer" });
      await expect(service.get(room.id, { id: second, name: "Bia", role: "operator" })).rejects.toMatchObject({ response: { code: "ROOM_NOT_FOUND" } });
      await service.addMember(room.id, second, { id: first, name: "Ana", role: "viewer" });
      await expect(service.get(room.id, { id: second, name: "Bia", role: "operator" })).resolves.toMatchObject({ id: room.id });
      const filler = await service.create("Limite de membros", { id: first, name: "Ana", role: "viewer" });
      for (let i = 0; i < 49; i++) {
        const id = randomUUID();
        await pool.query("INSERT INTO users(id,name,role,token_hash) VALUES($1,$2,'viewer',$1)", [id, `Pessoa ${i}`, id]);
        await service.addMember(filler.id, id, { id: first, name: "Ana", role: "viewer" });
      }
      const extra = randomUUID();
      await pool.query("INSERT INTO users(id,name,role,token_hash) VALUES($1,'Extra','viewer',$1)", [extra]);
      await expect(service.addMember(filler.id, extra, { id: first, name: "Ana", role: "viewer" })).rejects.toMatchObject({ status: 409 });
    } finally {
      await pool.query("DELETE FROM team_rooms WHERE created_by=$1", [first]).catch(() => undefined);
      await pool.query("DELETE FROM users WHERE id IN ($1,$2)", [first, second]).catch(() => undefined);
      await pool.end();
    }
  });
});
