import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, "apps/desktop/src-tauri/resources/dictation-model");
const modelUrl = "https://huggingface.co/onnx-community/whisper-base/resolve/main/";
const files = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
];

async function digest(path) {
  const bytes = await readFile(path);
  return { size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function verify() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(destination, "manifest.json"), "utf8"));
  } catch {
    return false;
  }
  if (manifest.model !== "onnx-community/whisper-base" || !Array.isArray(manifest.files) || manifest.files.length !== files.length) return false;
  if (files.some((name) => manifest.files.filter((entry) => entry.name === name).length !== 1)) return false;
  for (const name of files) {
    const expected = manifest.files.find((entry) => entry.name === name);
    if (!expected || !Number.isSafeInteger(expected.size) || !/^[a-f0-9]{64}$/.test(expected.sha256)) return false;
    try {
      const actual = await digest(join(destination, name));
      if (actual.size !== expected.size || actual.sha256 !== expected.sha256) return false;
    } catch {
      return false;
    }
  }
  return true;
}

if (process.argv.includes("--verify")) {
  if (!(await verify())) {
    console.error("O modelo local de ditado está ausente ou não passou na verificação.");
    process.exitCode = 1;
  }
} else if (await verify()) {
  console.log("Modelo local de ditado já conferido; nenhum arquivo foi baixado.");
} else {
  await mkdir(destination, { recursive: true });
  const entries = [];
  for (const name of files) {
    const path = join(destination, name);
    await mkdir(dirname(path), { recursive: true });
    const response = await fetch(new URL(name, modelUrl));
    if (!response.ok) throw new Error(`Não foi possível obter um arquivo necessário para o modelo local (${response.status}).`);
    const temporary = `${path}.download`;
    await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
    await rename(temporary, path);
    entries.push({ name, ...(await digest(path)) });
  }
  await writeFile(join(destination, "manifest.json"), `${JSON.stringify({ model: "onnx-community/whisper-base", files: entries }, null, 2)}\n`, "utf8");
  console.log("Modelo local de ditado baixado e manifesto criado.");
}
