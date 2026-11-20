import { providerKeyStatus } from "./provider-key-status";

describe("providerKeyStatus", () => {
  const cases: [Parameters<typeof providerKeyStatus>[0], ReturnType<typeof providerKeyStatus>][] = [
    [null, "nao_testada"],
    [{ ok: true, models: [{ id: "m" }] }, "valida"],
    [{ ok: true, models: [] }, "sem_modelos"],
    [{ ok: false, httpStatus: 401 }, "invalida"],
    [{ ok: false, httpStatus: 403 }, "invalida"],
    [{ ok: false, httpStatus: 429 }, "limite_atingido"],
    [{ ok: false, message: "Limite de cota" }, "limite_atingido"],
    [{ ok: false, httpStatus: 500 }, "erro"],
    [{ ok: false, message: "timeout" }, "erro"],
  ];
  cases.forEach(([result, status]) => {
    it(`maps ${JSON.stringify(result)}`, () => expect(providerKeyStatus(result)).toBe(status));
  });
});
