import { Logger } from "@nestjs/common";
import { MaskedLogger } from "./masked-logger";

describe("MaskedLogger", () => {
  const spies: jest.SpyInstance[] = [];

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    delete process.env.TEST_SERVICE_TOKEN;
  });

  it("mascara segredos na mensagem antes de chamar o logger Nest", () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    spies.push(warn);

    new MaskedLogger("teste").warn("token sk-ABCDEFGH12345678 recusado");

    expect(warn).toHaveBeenCalledWith("token [REDACTED] recusado");
  });

  it("mascara segredo do ambiente na mensagem, stack e context", () => {
    const token = "fictitious-service-token-1234";
    const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    spies.push(error);
    process.env.TEST_SERVICE_TOKEN = token;

    new MaskedLogger("teste").error(`erro com ${token}`, `stack com ${token}`, `contexto ${token}`);

    const args = error.mock.calls[0] as unknown[];
    expect(args).toHaveLength(3);
    expect(args.every((argument) => typeof argument === "string" && !argument.includes(token))).toBe(true);
  });

  it.each([
    ["log", "log"],
    ["error", "error"],
    ["warn", "warn"],
    ["debug", "debug"],
    ["verbose", "verbose"],
    ["fatal", "fatal"],
  ] as const)("mascara pelo método %s", (method, message) => {
    const spy = jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    spies.push(spy);

    new MaskedLogger("teste")[method](`${message} sk-ABCDEFGH12345678`);

    expect(spy).toHaveBeenCalledWith(`${message} [REDACTED]`);
  });

  it("mascara strings aninhadas em objetos sem mudar sua forma", () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    spies.push(log);
    const input = { nested: { authorization: "Bearer fictitious-bearer-token-1234" }, count: 2 };

    new MaskedLogger("teste").log("objeto", input);

    expect(log).toHaveBeenCalledWith("objeto", {
      nested: { authorization: "[REDACTED]" },
      count: 2,
    });
  });
});
