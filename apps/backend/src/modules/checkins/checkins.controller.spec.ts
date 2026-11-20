import { NotFoundException } from "@nestjs/common";
import { CheckinsController } from "./checkins.controller";

describe("CheckinsController principal scoping", () => {
  const principal={id:"owner-a",name:"Pessoa A",role:"viewer" as const};
  it("uses the request principal for check-ins and suggestions", async () => {
    const service={list:jest.fn().mockResolvedValue([]),suggestions:jest.fn().mockResolvedValue([]),create:jest.fn().mockResolvedValue({id:"c"})};
    const controller=new CheckinsController(service as never);
    await controller.list({principal},"123e4567-e89b-42d3-a456-426614174000");
    await controller.suggestions({principal});
    await controller.create({agentId:"123e4567-e89b-42d3-a456-426614174000",focus:"Acompanhar",intervalMinutes:60},{principal});
    expect(service.list).toHaveBeenCalledWith("owner-a","123e4567-e89b-42d3-a456-426614174000");
    expect(service.suggestions).toHaveBeenCalledWith("owner-a");
    expect(service.create).toHaveBeenCalledWith(principal,"123e4567-e89b-42d3-a456-426614174000",expect.objectContaining({focus:"Acompanhar"}));
  });
  it("returns 404 when the service cannot find another person's suggestion", async () => {
    const service={hide:jest.fn().mockRejectedValue(new NotFoundException())};
    const controller=new CheckinsController(service as never);
    await expect(controller.hide("foreign-suggestion",{principal})).rejects.toBeInstanceOf(NotFoundException);
    expect(service.hide).toHaveBeenCalledWith(principal,"foreign-suggestion");
  });
});
