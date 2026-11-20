import { Client } from "pg";
import { migrationId, up } from "./037-agent-model-routing";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("037-agent-model-routing migration on PostgreSQL", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });

  it("adds a JSONB column with the empty routing default to a temporary agents table", async () => {
    await client.query("CREATE TEMP TABLE agents(id uuid PRIMARY KEY)");
    await up(client as never);
    const result = await client.query("INSERT INTO agents(id) VALUES('123e4567-e89b-42d3-a456-426614174000') RETURNING model_routing");
    expect(migrationId).toBe("037-agent-model-routing");
    expect(result.rows[0]?.model_routing).toEqual({});
  });
});
