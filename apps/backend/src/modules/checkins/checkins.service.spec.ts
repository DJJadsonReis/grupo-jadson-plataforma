import { BadRequestException, NotFoundException } from "@nestjs/common";
import { parseSuggestions, titleKey, validateCheckinInput, CheckinsService } from "./checkins.service";

describe("check-in validation and suggestion rules", () => {
  it("requires focus and an interval between 60 and 1440 minutes", () => {
    expect(() => validateCheckinInput({ focus:"  ",intervalMinutes:60 })).toThrow(BadRequestException);
    expect(() => validateCheckinInput({ focus:"x",intervalMinutes:59 })).toThrow(BadRequestException);
    expect(() => validateCheckinInput({ focus:"x",intervalMinutes:1441 })).toThrow(BadRequestException);
    expect(validateCheckinInput({ focus:"  Projeto  ",intervalMinutes:60 })).toEqual({focus:"Projeto",intervalMinutes:60});
  });
  it("normalizes case, whitespace and trailing punctuation in suggestion titles", () => {
    expect(titleKey("  Relatório   NOVO!!! ")).toBe(titleKey("relatório novo"));
    expect(titleKey("Decisão importante.")).toBe(titleKey("decisão importante"));
  });
  it("parses at most five suggestions and recognizes an empty check-in", () => {
    const input=JSON.stringify({suggestions:Array.from({length:7},(_,index)=>({title:`Título ${index}`,text:"Texto"}))});
    expect(parseSuggestions(input)).toHaveLength(5);
    expect(parseSuggestions("Nada novo desde a última verificação")).toEqual([]);
  });
  it("scopes suggestion reads and hides to the request owner, auditing only a successful hide", async () => {
    const query=jest.fn().mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rowCount:1,rows:[{id:"suggestion-1"}]});
    const audit={record:jest.fn().mockResolvedValue(undefined)};
    const service=new CheckinsService({getPool:()=>({query})} as never,{} as never,{} as never,{} as never,{} as never,{} as never,audit as never,{} as never);
    await expect(service.hide({id:"owner-a",name:"A",role:"viewer"},"suggestion-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
    await service.hide({id:"owner-b",name:"B",role:"viewer"},"suggestion-1");
    expect(query).toHaveBeenNthCalledWith(2,expect.stringContaining("owner_id=$2"),["suggestion-1","owner-b"]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({actor:"owner-b",action:"checkin.suggestion.hidden"}));
  });
  it("claims a due check-in once when two ticks race", async () => {
    let claimed=false;
    const row={id:"123e4567-e89b-42d3-a456-426614174001",ownerId:"owner",agentId:"123e4567-e89b-42d3-a456-426614174002",focus:"Novidades",intervalMinutes:60,enabled:true,nextRunAt:new Date().toISOString(),lastRunAt:null,lastStatus:null,failureStreak:0,disabledReason:null,createdAt:"",updatedAt:"",claimToken:"123e4567-e89b-42d3-a456-426614174003",runsToday:0,runsDay:null};
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes("WITH due AS")){if(claimed)return{rowCount:0,rows:[]};claimed=true;return{rowCount:1,rows:[row]};}
      if(sql.includes("SET runs_today"))return{rowCount:1,rows:[{runs_today:1}]};
      if(sql.includes("SELECT title,text FROM checkin_suggestions"))return{rowCount:0,rows:[]};
      if(sql.includes("SELECT min(next_run_at)"))return{rowCount:1,rows:[{next:null}]};
      return{rowCount:1,rows:[]};
    });
    const providers={stream:jest.fn(async()=>new Response('data: {"choices":[{"delta":{"content":"Nada novo desde a última verificação"}}]}\n\ndata: [DONE]\n\n'))};
    const tools={catalog:()=>[],invoke:jest.fn(),maskSecretText:async(value:string)=>value};const permissions={access:jest.fn(async()=>"owner")};
    const agents={get:jest.fn(async()=>({id:row.agentId,ownerId:row.ownerId,name:"Bot",enabled:true,instructions:"",model:"",provider:"openai",generationConfig:{},toolsAllowed:[]}))};
    const audit={record:jest.fn(async()=>undefined)},notifications={create:jest.fn(async()=>undefined)},policies={decisionFor:jest.fn(async()=>null)},skills={loadPromptSkills:jest.fn(async()=>[])};
    const database={isReady:()=>true,getPool:()=>({query})};
    const make=()=>new CheckinsService(database as never,agents as never,permissions as never,providers as never,tools as never,policies as never,audit as never,notifications as never,skills as never);
    await Promise.all([make().tick(),make().tick()]);
    expect(providers.stream).toHaveBeenCalledTimes(1);expect(notifications.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({actor:"routine",subject:`checkin:${row.id}`}));
  });
  it("creates the bot conversation once and returns it when start is repeated", async () => {
    let started=false;let conversationId="";
    const clientQuery=jest.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes("SELECT s.id,s.title")){if(started)return{rowCount:0,rows:[]};return{rowCount:1,rows:[{id:"suggestion-1",title:"Atualização",text:"O projeto mudou.",checkin_id:"checkin-1",agent_id:"agent-1"}]};}
      if(sql.includes("SELECT conversation_id AS id"))return{rowCount:1,rows:[{id:conversationId}]};
      if(sql.includes("INSERT INTO conversations")){started=true;conversationId=String(params?.[0]);return{rowCount:1,rows:[]};}
      return{rowCount:1,rows:[]};
    });
    const pool={query:jest.fn(),connect:async()=>({query:clientQuery,release:jest.fn()})};
    const audit={record:jest.fn(async()=>undefined)},permissions={access:jest.fn(async()=>"owner")};
    const service=new CheckinsService({getPool:()=>pool} as never,{} as never,permissions as never,{} as never,{} as never,{} as never,audit as never,{} as never);
    const principal={id:"owner-1",name:"Pessoa",role:"viewer" as const};
    const first=await service.start(principal,"suggestion-1");
    expect(first.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await service.start(principal,"suggestion-1")).toEqual(first);
    expect(clientQuery.mock.calls.filter(([sql])=>String(sql).includes("INSERT INTO conversations"))).toHaveLength(1);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO messages"),expect.arrayContaining([expect.any(String),expect.any(String),"O projeto mudou.","agent-1"]));
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
