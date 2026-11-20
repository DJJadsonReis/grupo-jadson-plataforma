/** Cliente mínimo da API do Notion. O token é da integração "notion" (cifrado) e nunca sai do servidor. */
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

async function call(token: string, path: string, init: { method?: string; body?: unknown; base?: string } = {}): Promise<unknown> {
  const response = await fetch(`${(init.base ?? API).replace(/\/$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    const messages: Record<number, string> = { 401: "Token inválido ou expirado.", 403: "A integração não tem acesso a esta página.", 404: "Página não encontrada ou sem acesso.", 429: "Limite de requisições do Notion atingido. Tente novamente." };
    throw new Error(messages[response.status] ?? `Notion respondeu HTTP ${response.status}.`);
  }
  return data;
}

export interface NotionHit { id: string; tipo: string; titulo: string; url: string | null }

/** Aceita um UUID do Notion ou URL terminada no identificador da página. */
export function parseNotionPageId(value: string): string {
  const match = value.trim().match(/([\da-f]{8}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{12})\/?$/i);
  if (!match) throw new Error("Informe um id ou URL válida de página do Notion.");
  const hex = (match[1] ?? "").replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type RichText = { plain_text?: string };
type NotionBlock = { type: string; [key: string]: unknown };
const TEXT_BLOCKS = new Set(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote", "callout", "code"]);

function blockText(block: NotionBlock): string {
  if (!TEXT_BLOCKS.has(block.type)) return `[bloco ${block.type}]`;
  const content = block[block.type] as { rich_text?: RichText[]; checked?: boolean } | undefined;
  const text = (content?.rich_text ?? []).map((part) => part.plain_text ?? "").join("");
  if (block.type === "to_do") return `${content?.checked ? "[x]" : "[ ]"} ${text}`;
  return text;
}

/** Lê título e até três páginas de blocos de primeiro nível. */
export async function readNotionPage(token: string, pagina: string, base?: string): Promise<{ id: string; titulo: string; texto: string; truncado: boolean }> {
  const id = parseNotionPageId(pagina);
  const page = (await call(token, `/pages/${id}`, base ? { base } : {})) as { id: string; properties?: Record<string, { type?: string; title?: RichText[] }>; title?: RichText[] };
  const title = page.properties ? Object.values(page.properties).find((property) => property.type === "title")?.title : page.title;
  const titulo = title?.map((part) => part.plain_text ?? "").join("") || "(sem título)";
  const lines: string[] = [];
  let cursor: string | undefined;
  for (let request = 0; request < 3; request++) {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const result = (await call(token, `/blocks/${id}/children?${query}`, base ? { base } : {})) as { results: NotionBlock[]; has_more: boolean; next_cursor?: string | null };
    for (const block of result.results ?? []) lines.push(blockText(block));
    cursor = result.next_cursor ?? undefined;
    if (!result.has_more || !cursor) break;
  }
  const fullText = lines.join("\n");
  return { id: page.id ?? id, titulo, texto: fullText.slice(0, 6000), truncado: fullText.length > 6000 };
}

/** Acrescenta parágrafos ao fim de uma página existente. */
export async function appendNotionText(token: string, pagina: string, texto: string, base?: string): Promise<{ acrescentados: number }> {
  const id = parseNotionPageId(pagina);
  const paragraphs = texto.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) throw new Error("Informe o texto que deseja anexar.");
  if (paragraphs.length > 50) throw new Error("O limite é de 50 parágrafos por chamada.");
  if (paragraphs.some((part) => part.length > 1900)) throw new Error("Cada parágrafo pode ter no máximo 1900 caracteres.");
  await call(token, `/blocks/${id}/children`, { method: "PATCH", ...(base ? { base } : {}), body: { children: paragraphs.map((content) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content } }] } })) } });
  return { acrescentados: paragraphs.length };
}

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
