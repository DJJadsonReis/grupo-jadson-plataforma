const readline = require("node:readline");

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request.method === "notifications/initialized") return;
  let result = {};
  if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-mcp", version: "1" } };
  if (request.method === "tools/list") result = { tools: [{ name: "ping", description: "Ferramenta de teste", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }] };
  if (request.method === "tools/call") result = { content: [{ type: "text", text: process.env.MCP_E2E_SECRET || "pong" }] };
  if (request.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
});
