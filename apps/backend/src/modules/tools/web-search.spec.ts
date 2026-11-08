import { searchTavily, searchWikipedia } from "./web-search";

function fakeFetch(body: unknown, ok = true, status = 200) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } | undefined }[] = [];
  const fetcher = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body };
  };
  return { fetcher, calls };
}

describe("busca sem chave (Wikipédia)", () => {
  it("monta a consulta na API oficial e limpa o HTML dos trechos", async () => {
    const { fetcher, calls } = fakeFetch({ query: { search: [{ title: "Brasil", pageid: 7, snippet: 'país da <span class="x">América</span> &quot;Sul&quot;' }] } });
    const hits = await searchWikipedia("Brasil capital", fetcher);
    expect(calls[0]?.url).toContain("pt.wikipedia.org/w/api.php");
    expect(calls[0]?.url).toContain("srsearch=Brasil%20capital");
    expect(hits).toEqual([{ title: "Brasil", url: "https://pt.wikipedia.org/?curid=7", snippet: 'país da América "Sul"' }]);
  });

  it("recusa consulta vazia", async () => {
    const { fetcher } = fakeFetch({});
    await expect(searchWikipedia("   ", fetcher)).rejects.toThrow();
  });
});

describe("busca com chave (Tavily)", () => {
  it("sem chave, avisa em vez de chamar a rede", async () => {
    const { fetcher, calls } = fakeFetch({});
    await expect(searchTavily("teste", undefined, fetcher)).rejects.toThrow("TAVILY_API_KEY");
    expect(calls).toHaveLength(0);
  });

  it("com chave, envia como Bearer e limita a 5 resultados", async () => {
    const results = Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, url: `https://x/${i}`, content: "c" }));
    const { fetcher, calls } = fakeFetch({ results });
    const hits = await searchTavily("notícias", "CHAVE-DE-TESTE", fetcher);
    expect(calls[0]?.init?.headers?.Authorization).toBe("Bearer CHAVE-DE-TESTE");
    expect(hits).toHaveLength(5);
  });
});
