import { Client } from "pg";
import { up } from "./053-checkins";
const databaseUrl=process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres=databaseUrl?describe:describe.skip;

describeWithPostgres("053-checkins migration on PostgreSQL",()=>{
  let client:Client;
  let connected=false;
  const schema=`checkins_migration_${Date.now()}`;
  beforeAll(async()=>{client=new Client({connectionString:databaseUrl});await client.connect();connected=true;await client.query("BEGIN");await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET LOCAL search_path TO ${schema}`);await client.query("CREATE TABLE agents(id uuid PRIMARY KEY)");await client.query("CREATE TABLE notifications(id uuid PRIMARY KEY,kind text CONSTRAINT notifications_kind_check CHECK(kind IN ('approval.pending','task.completed')))" );});
  afterAll(async()=>{if(connected)await client?.query("ROLLBACK").catch(()=>undefined);await client?.end().catch(()=>undefined);});
  it("creates both tables, supports the new notification and is safe to reapply",async()=>{
    await up(client as never);await up(client as never);
    await client.query("INSERT INTO agents(id) VALUES('123e4567-e89b-42d3-a456-426614174000')");
    await client.query("INSERT INTO checkins(id,owner_id,agent_id,focus,interval_minutes,next_run_at) VALUES('123e4567-e89b-42d3-a456-426614174001','owner','123e4567-e89b-42d3-a456-426614174000','acompanhar',60,now())");
    await client.query("INSERT INTO checkin_suggestions(id,owner_id,checkin_id,title,text) VALUES('123e4567-e89b-42d3-a456-426614174002','owner','123e4567-e89b-42d3-a456-426614174001','Novidade','Texto')");
    await client.query("INSERT INTO notifications(id,kind) VALUES('123e4567-e89b-42d3-a456-426614174003','checkin.message')");
    await expect(client.query("INSERT INTO notifications(id,kind) VALUES('123e4567-e89b-42d3-a456-426614174004','unknown')")).rejects.toThrow();
    expect((await client.query("SELECT count(*)::int AS count FROM checkin_suggestions")).rows[0]?.count).toBe(1);
  });
});
