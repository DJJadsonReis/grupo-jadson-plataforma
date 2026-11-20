import { DatabaseService } from "../database/database.service";
import { CheckinsService } from "./checkins.service";
const databaseUrl=process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres=databaseUrl?describe:describe.skip;

describeWithPostgres("check-ins com PostgreSQL descartável",()=>{
  let database:DatabaseService;
  const owner=`checkin-pg-${Date.now()}`;
  const agentId="00000000-0000-4000-8000-000000000021";
  beforeAll(async()=>{process.env.DATABASE_URL=databaseUrl;database=new DatabaseService();await database.onModuleInit();await database.getPool().query("INSERT INTO agents(id,name,description,instructions,model,enabled,owner_id) VALUES($1,'Checkin test','','','',true,$2) ON CONFLICT(id) DO NOTHING",[agentId,owner]);});
  afterAll(async()=>{if(database?.isReady()){await database.getPool().query("DELETE FROM checkins WHERE owner_id=$1",[owner]);await database.getPool().query("DELETE FROM agents WHERE id=$1 AND owner_id=$2",[agentId,owner]);}await database?.onModuleDestroy?.();});
  it("claims a due check-in once across concurrent service instances and stores the no-news reason",async()=>{
    const providers={stream:jest.fn(async()=>new Response('data: {"choices":[{"delta":{"content":"Nada novo desde a última verificação"}}]}\n\ndata: [DONE]\n\n'))};
    const tools={catalog:()=>[],invoke:jest.fn(),maskSecretText:async(value:string)=>value};const permissions={access:jest.fn(async()=>"owner")};
    const agents={get:jest.fn(async()=>({id:agentId,ownerId:owner,name:"Bot",enabled:true,instructions:"",model:"",provider:"openai",generationConfig:{},toolsAllowed:[]}))};
    const audit={record:jest.fn(async()=>undefined)},notifications={create:jest.fn(async()=>undefined)},policies={decisionFor:jest.fn(async()=>null)},skills={loadPromptSkills:jest.fn(async()=>[])};
    const make=()=>new CheckinsService(database,agents as never,permissions as never,providers as never,tools as never,policies as never,audit as never,notifications as never,skills as never);
    const first=make(),second=make();
    const inserted=await database.getPool().query("INSERT INTO checkins(id,owner_id,agent_id,focus,interval_minutes,next_run_at) VALUES(gen_random_uuid(),$1,$2,'acompanhar',60,now()-interval '1 minute') RETURNING id",[owner,agentId]);const id=(inserted.rows[0] as {id:string}).id;
    await Promise.all([first.tick(new Date()),second.tick(new Date())]);
    expect(providers.stream).toHaveBeenCalledTimes(1);expect(notifications.create).not.toHaveBeenCalled();
    expect((await database.getPool().query("SELECT last_status FROM checkins WHERE id=$1",[id])).rows[0]?.last_status).toBe("Nada novo desde a última verificação");
  });
});
