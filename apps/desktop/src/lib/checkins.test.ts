import { describe, expect, it } from "vitest";
import { suggestionAction, validateCheckinForm, visibleSuggestions, type CheckinSuggestion } from "./checkins";

describe("check-in helpers", () => {
  it("validates focus, interval and active capacity", () => {
    expect(validateCheckinForm(" ",60,0)).toContain("foco");
    expect(validateCheckinForm("Foco",59,0)).toContain("60");
    expect(validateCheckinForm("Foco",1441,0)).toContain("1.440");
    expect(validateCheckinForm("Foco",60,5)).toContain("5 check-ins");
    expect(validateCheckinForm("Foco",60,5,true)).toBeNull();
    expect(validateCheckinForm("Foco",60,4)).toBeNull();
  });
  it("shows only open suggestions belonging to this bot", () => {
    const items = [{id:"1",checkinId:"a",title:"A",text:"x",status:"aberta"},{id:"2",checkinId:"b",title:"B",text:"x",status:"aberta"},{id:"3",checkinId:"a",title:"C",text:"x",status:"ocultada"}] as CheckinSuggestion[];
    expect(visibleSuggestions(items,new Set(["a"])).map((item)=>item.id)).toEqual(["1"]);
  });
  it("starts once and opens the existing conversation after that", () => {
    expect(suggestionAction({id:"s",checkinId:"c",title:"T",text:"x",status:"aberta",createdAt:""})).toEqual({kind:"start",suggestionId:"s"});
    expect(suggestionAction({id:"s",checkinId:"c",title:"T",text:"x",status:"iniciada",conversationId:"conv",createdAt:""})).toEqual({kind:"open",conversationId:"conv"});
  });
});
