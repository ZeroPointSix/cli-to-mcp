/** Print tools/list names from running cli-to-mcp. Usage: node scripts/list-tools-mcp.mjs [port] */
const port = process.argv[2] || "28989";

function parse(text) {
  const t = text.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  for (const line of t.split("\n")) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) return JSON.parse(m[1]);
  }
  throw new Error(text.slice(0, 400));
}

async function mcp(method, params, id, sid) {
  const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sid) h["mcp-session-id"] = sid;
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: text ? parse(text) : null };
}

const META = new Set([
  "list_connectors", "doctor", "refresh_tools", "get_skills", "get_tool_source",
  "list_tool_categories", "list_tools_by_category", "search_tools", "get_tool_schema", "call_tool",
]);

const init = await mcp("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "list-tools", version: "1" },
}, 1);
if (init.status !== 200) {
  console.error("initialize failed", init.status, init.body);
  process.exit(1);
}
const sid = init.sid;
await mcp("notifications/initialized", undefined, undefined, sid);
const list = await mcp("tools/list", {}, 2, sid);
const tools = list.body?.result?.tools ?? [];
const names = tools.map((t) => t.name).sort();
const meta = names.filter((n) => META.has(n));
const dynamic = names.filter((n) => !META.has(n));
console.log("URL: http://127.0.0.1:" + port + "/mcp");
console.log("total:", names.length);
console.log("meta (" + meta.length + "/10):", meta.join(", ") || "(NONE)");
console.log("dynamic (" + dynamic.length + "):", dynamic.slice(0, 12).join(", ") + (dynamic.length > 12 ? " ..." : ""));
if (meta.length < 10) {
  console.error("\nMISSING meta tools. Rebuild: npm run build. Ensure you run dist/cli/main.js from this repo, not old global npm.");
  process.exit(2);
}