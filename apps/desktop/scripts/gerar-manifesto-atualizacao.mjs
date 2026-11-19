import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function montarManifesto({ versao, baseUrl, nomeArquivo, assinatura, notas, dataPublicacao = new Date() }) {
  if (typeof versao !== "string" || !SEMVER.test(versao)) {
    throw new Error("--version deve conter uma versão SemVer válida.");
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("--base-url deve ser uma URL HTTPS com host válido.");
  }
  if (base.protocol !== "https:" || !base.hostname || base.search || base.hash) {
    throw new Error("--base-url deve ser uma URL HTTPS com host e sem query string ou fragmento.");
  }
  if (!nomeArquivo || nomeArquivo === "." || nomeArquivo === "..") {
    throw new Error("O artefato informado deve ter um nome de arquivo válido.");
  }
  if (typeof assinatura !== "string" || assinatura.trim().length === 0) {
    throw new Error("A assinatura (.sig) está ausente ou vazia.");
  }
  if (Number.isNaN(dataPublicacao.getTime())) {
    throw new Error("A data de publicação é inválida.");
  }

  const raiz = base.toString().replace(/\/+$/, "");
  const manifesto = {
    version: versao,
    pub_date: dataPublicacao.toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: assinatura,
        url: `${raiz}/${encodeURIComponent(nomeArquivo)}`,
      },
    },
  };
  if (notas !== undefined) manifesto.notes = notas;
  return manifesto;
}

function argumentosCli(args) {
  const valores = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const chave = args[i];
    if (!["--version", "--base-url", "--artifact", "--notes", "--out"].includes(chave)) {
      throw new Error(`Argumento desconhecido: ${chave}`);
    }
    const valor = args[i + 1];
    if (!valor || valor.startsWith("--")) throw new Error(`Informe um valor para ${chave}.`);
    valores.set(chave, valor);
    i += 1;
  }
  for (const obrigatorio of ["--version", "--base-url", "--artifact"]) {
    if (!valores.has(obrigatorio)) throw new Error(`Argumento obrigatório ausente: ${obrigatorio}.`);
  }
  return valores;
}

export async function executarCli(args = process.argv.slice(2)) {
  const opcoes = argumentosCli(args);
  const caminhoArtefato = resolve(opcoes.get("--artifact"));
  let info;
  try {
    info = await stat(caminhoArtefato);
  } catch {
    throw new Error(`Instalador não encontrado: ${caminhoArtefato}`);
  }
  if (!info.isFile()) throw new Error(`O artefato não é um arquivo: ${caminhoArtefato}`);

  const caminhoAssinatura = `${caminhoArtefato}.sig`;
  let assinatura;
  try {
    assinatura = await readFile(caminhoAssinatura, "utf8");
  } catch {
    throw new Error(`Assinatura não encontrada: ${caminhoAssinatura}`);
  }
  const manifesto = montarManifesto({
    versao: opcoes.get("--version"),
    baseUrl: opcoes.get("--base-url"),
    nomeArquivo: basename(caminhoArtefato),
    assinatura,
    ...(opcoes.has("--notes") ? { notas: opcoes.get("--notes") } : {}),
  });
  const json = `${JSON.stringify(manifesto, null, 2)}\n`;
  const destino = opcoes.get("--out");
  if (destino) await writeFile(resolve(destino), json, "utf8");
  else process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executarCli().catch((erro) => {
    process.stderr.write(`Erro: ${erro.message}\n`);
    process.exitCode = 1;
  });
}
