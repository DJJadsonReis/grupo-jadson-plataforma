/**
 * Busca na web, só de leitura.
 *  - Sem chave: API pública e oficial da Wikipédia (gratuita, sem cadastro).
 *  - Com chave: API do Tavily (plano gratuito, sem cartão). A chave fica no .env do backend.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const MAX_QUERY = 200;
const MAX_HITS = 5;

function cleanQuery(query: string): string {
  const text = query.trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Informe o que pesquisar.");
  return text.slice(0, MAX_QUERY);
}

/** Remove marcações HTML que a Wikipédia coloca nos trechos. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
}

export async function searchWikipedia(query: string, fetcher: FetchLike = fetch as unknown as FetchLike, lang = "pt"): Promise<SearchHit[]> {
  const term = encodeURIComponent(cleanQuery(query));
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=${MAX_HITS}&format=json&srsearch=${term}`;
  const response = await fetcher(url, { headers: { "User-Agent": "grupo-jadson/0.1 (uso local)" } });
  if (!response.ok) throw new Error(`Wikipédia respondeu ${response.status}.`);
  const body = (await response.json()) as { query?: { search?: { title: string; snippet: string; pageid: number }[] } };
  return (body.query?.search ?? []).map((item) => ({
    title: item.title,
    url: `https://${lang}.wikipedia.org/?curid=${item.pageid}`,
    snippet: stripHtml(item.snippet),
  }));
}

export async function searchTavily(query: string, apiKey: string | undefined, fetcher: FetchLike = fetch as unknown as FetchLike): Promise<SearchHit[]> {
  if (!apiKey) throw new Error("Busca com chave não configurada: defina TAVILY_API_KEY no .env do backend.");
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: cleanQuery(query), max_results: MAX_HITS }),
  });
  if (!response.ok) throw new Error(`Tavily respondeu ${response.status}.`);
  const body = (await response.json()) as { results?: { title: string; url: string; content: string }[] };
  return (body.results ?? []).slice(0, MAX_HITS).map((item) => ({ title: item.title, url: item.url, snippet: item.content.slice(0, 500) }));
}
