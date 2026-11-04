import { BadRequestException } from "@nestjs/common";
import { validateImageAttachment } from "./image-attachments";

describe("image attachment validation", () => {
  it("accepts a PNG data URL only when type and signature match", () => {
    const dataUrl = `data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10]).toString("base64")}`;
    expect(validateImageAttachment({ name: "print.png", type: "image/png", size: 8, dataUrl })).toMatchObject({ name: "print.png", type: "image/png", size: 8 });
    expect(() => validateImageAttachment({ name: "bad.png", type: "image/png", size: 3, dataUrl: "data:image/png;base64,YWJj" })).toThrow(BadRequestException);
  });
  it("rejects unsupported formats", () => {
    expect(() => validateImageAttachment({ name: "test.svg", type: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" })).toThrow(BadRequestException);
  });
});
