import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executarCli, montarManifesto } from "../../scripts/gerar-manifesto-atualizacao.mjs";

const temporarios: string[] = [];

async function arquivoTemporario(conteudoAssinatura?: string) {
  const pasta = await mkdtemp(join(tmpdir(), "manifesto-updater-"));
  temporarios.push(pasta);
  const artefato = join(pasta, "instalador teste-á.exe");
  await writeFile(artefato, "artefato de teste");
  if (conteudoAssinatura !== undefined) await writeFile(`${artefato}.sig`, conteudoAssinatura);
  return artefato;
}

afterEach(async () => {
  await Promise.all(temporarios.splice(0).map((pasta) => rm(pasta, { recursive: true, force: true })));
});

describe("manifesto de atualização do desktop", () => {
  it("monta o formato estático esperado com data UTC RFC 3339", () => {
    const pubDate = new Date("2026-11-19T12:00:00.000Z");
    expect(montarManifesto({
      versao: "1.2.3",
      baseUrl: "https://updates.example.com/releases/",
      nomeArquivo: "Grupo Jadson_1.2.3_x64-setup.exe",
      assinatura: "assinatura integral\n",
      notas: "Correções",
      dataPublicacao: pubDate,
    })).toEqual({
      version: "1.2.3",
      notes: "Correções",
      pub_date: "2026-11-19T12:00:00.000Z",
      platforms: {
        "windows-x86_64": {
          signature: "assinatura integral\n",
          url: "https://updates.example.com/releases/Grupo%20Jadson_1.2.3_x64-setup.exe",
        },
      },
    });
  });

  it("rejeita URL HTTP", () => {
    expect(() => montarManifesto({ versao: "1.2.3", baseUrl: "http://updates.example.com", nomeArquivo: "app.exe", assinatura: "sig" }))
      .toThrow("HTTPS");
  });

  it("rejeita versão SemVer inválida", () => {
    expect(() => montarManifesto({ versao: "v1.2", baseUrl: "https://updates.example.com", nomeArquivo: "app.exe", assinatura: "sig" }))
      .toThrow("SemVer");
  });

  it("rejeita arquivo .sig ausente", async () => {
    const artefato = await arquivoTemporario();
    await expect(executarCli(["--version", "1.2.3", "--base-url", "https://updates.example.com", "--artifact", artefato]))
      .rejects.toThrow("Assinatura não encontrada");
  });

  it("rejeita arquivo .sig vazio", async () => {
    const artefato = await arquivoTemporario("");
    await expect(executarCli(["--version", "1.2.3", "--base-url", "https://updates.example.com", "--artifact", artefato]))
      .rejects.toThrow("vazia");
  });

  it("codifica espaços e acentos no nome e produz JSON parseável via CLI", async () => {
    const artefato = await arquivoTemporario("assinatura de teste\n");
    const pastaTemporaria = temporarios.at(-1);
    if (!pastaTemporaria) throw new Error("Diretório temporário não foi criado.");
    const saida = join(pastaTemporaria, "latest.json");
    await executarCli(["--version", "1.2.3", "--base-url", "https://updates.example.com/", "--artifact", artefato, "--out", saida]);
    const manifesto = JSON.parse(await readFile(saida, "utf8"));
    expect(manifesto.platforms["windows-x86_64"].url)
      .toBe("https://updates.example.com/instalador%20teste-%C3%A1.exe");
    expect(manifesto.platforms["windows-x86_64"].signature).toBe("assinatura de teste\n");
  });
});
