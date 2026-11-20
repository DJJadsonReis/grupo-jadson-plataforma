import { describe, expect, it } from "vitest";
import { attachmentsForChatRequest, regenerationFields } from "./chat-request";

describe("payload de regeneração do chat", () => {
  it("reenvia o dataUrl do anexo original e marca regenerate", () => {
    const attachment = { id: "img-1", name: "imagem.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,AQID" };
    expect(attachmentsForChatRequest([attachment], true)).toEqual([attachment]);
    expect(regenerationFields(true)).toEqual({ regenerate: true });
  });
});
