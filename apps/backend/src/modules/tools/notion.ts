/** Cliente mínimo da API do Notion. O token é da integração "notion" (cifrado) e nunca sai do servidor. */
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

async function call(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(`Notion respondeu HTTP ${response.status}${data.message ? `: ${data.message}` : ""}`);
  return data;
}

export interface NotionHit { id: string; tipo: string; titulo: string; url: string | null }

export async function searchNotion(token: string, query: string): Promise<NotionHit[]> {
  const data = (await call(token, "/search", { method: "POST", body: { query, page_size: 10 } })) as {
    results: { id: string; object: string; url?: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }>; title?: { plain_text: string }[] }[];
  };
  return data.results.map((item) => {
    const titleProp = item.properties ? Object.values(item.properties).find((p) => p.type === "title") : undefined;
    const titleParts = titleProp?.title ?? item.title ?? [];
    return { id: item.id, tipo: item.object, titulo: titleParts.map((p) => p.plain_text).join("") || "(sem título)", url: item.url ?? null };
  });
}

/** Cria uma página dentro de outra página do Notion, com um parágrafo de texto. */
export async function createNotionPage(token: string, parentPageId: string, title: string, text: string): Promise<{ id: string; url: string | null }> {
  const data = (await call(token, "/pages", {
    method: "POST",
    body: {
      parent: { page_id: parentPageId },
      properties: { title: { title: [{ text: { content: title.slice(0, 200) } }] } },
      children: text ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 1900) } }] } }] : [],
    },
  })) as { id: string; url?: string };
  return { id: data.id, url: data.url ?? null };
}
