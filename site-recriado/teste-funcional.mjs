import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
].find((c) => existsSync(c));

const url = "http://localhost:4600/";
const navegador = await chromium.launch({ executablePath: chrome, headless: true });
const resultado = {};

for (const [nome, vw, vh] of [["desktop", 1440, 900], ["celular", 390, 844]]) {
  const ctx = await navegador.newContext({ viewport: { width: vw, height: vh }, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  const erros = [];
  p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  p.on("pageerror", (e) => erros.push(String(e)));
  await p.goto(url, { waitUntil: "load" });
  await p.waitForTimeout(600);

  const r = {};
  r.reduzido = await p.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Pico: estados em pontos da rolagem
  r.conta = [];
  for (const f of [0.02, 0.3, 0.5, 0.7, 0.95]) {
    const st = await p.evaluate((f) => {
      const s = document.getElementById("conta");
      scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f);
      return true;
    }, f);
    await p.waitForTimeout(450);
    r.conta.push(await p.evaluate((f) => ({
      f,
      total: document.getElementById("total-valor").textContent.trim(),
      rotulo: document.getElementById("total-rotulo").textContent.trim(),
      visiveis: document.querySelectorAll("#comanda .linha.visivel").length,
      resolvidas: document.querySelectorAll("#comanda .linha.resolvida").length,
      totalAltura: Math.round(document.querySelector(".total b").getBoundingClientRect().height),
      fraseOpacidade: getComputedStyle(document.querySelector(".frase-pico span")).opacity,
    }), f));
  }

  // Trilho de serviços
  r.trilho = [];
  for (const f of [0, 0.5, 1]) {
    await p.evaluate((f) => {
      const s = document.getElementById("servicos");
      scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f);
    }, f);
    await p.waitForTimeout(350);
    r.trilho.push(await p.evaluate((f) => ({
      f,
      transform: getComputedStyle(document.getElementById("trilho")).transform,
      cartaoVisivelDireito: (() => {
        const c = document.querySelectorAll(".cartao")[5].getBoundingClientRect();
        return Math.round(c.right) <= innerWidth + 1;
      })(),
    }), f));
  }

  // Processo: etapa ativa
  r.processo = [];
  for (const f of [0.05, 0.4, 0.7, 0.95]) {
    await p.evaluate((f) => {
      const s = document.getElementById("processo");
      scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f);
    }, f);
    await p.waitForTimeout(450);
    r.processo.push(await p.evaluate((f) => ({
      f,
      ativo: [...document.querySelectorAll("#passos .passo")].findIndex((e) => e.classList.contains("ativo")) + 1,
    }), f));
  }

  // Sobra horizontal e cores
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(300);
  r.sobraHorizontal = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  r.corDores = await p.evaluate(() => getComputedStyle(document.querySelector("#dores h2")).color);
  r.corDoresOpacidade = await p.evaluate(() => { let e = document.querySelector("#dores h2"), o = 1; while (e) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o; });
  r.erros = erros;
  resultado[nome] = r;
  await ctx.close();
}

await navegador.close();
console.log(JSON.stringify(resultado, null, 2));
