import { Client } from "pg";
import { migrationId, up } from "./050-agent-endpoint-protocol";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("050-agent-endpoint-protocol migration on PostgreSQL", () => {
  let client: Client;
  beforeAll(async () => { client = new Client({ connectionString: databaseUrl }); await client.connect(); });
  afterAll(async () => { await client?.end(); });
  it("is idempotent, defaults to json, and rejects values outside the check", async () => {
    await client.query("CREATE TEMP TABLE agents(id uuid PRIMARY KEY)");
    await up(client as never);
    await up(client as never);
    expect(migrationId).toBe("050-agent-endpoint-protocol");
    const result = await client.query("INSERT INTO agents(id) VALUES('123e4567-e89b-42d3-a456-426614174000') RETURNING endpoint_protocol");
    expect(result.rows[0]?.endpoint_protocol).toBe("json");
    await expect(client.query("UPDATE agents SET endpoint_protocol='invalid'")).rejects.toThrow();
  });
});
