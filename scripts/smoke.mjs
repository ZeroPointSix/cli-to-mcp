// End-to-end smoke test against the running server.
// Usage: node --experimental-sqlite scripts/smoke.mjs <port>
const port = process.argv[2] || "8787";
const base = `http://127.0.0.1:${port}/mcp`;

function parseSse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  for (const line of trimmed.split("\n")) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* next */ }
    }
  }
  throw new Error(`unparseable: ${text.slice(0, 200)}`);
}

async function req(method, params, id, sid) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sid) headers["mcp-session-id"] = sid;
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const r = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, sid: r.headers.get("mcp-session-id"), body: text ? parseSse(text) : null };
}

function section(title) { console.log(`\n=== ${title} ===`); }
function payload(body) {
  if (!body?.result?.content?.[0]?.text) return null;
  try { return JSON.parse(body.result.content[0].text); } catch { return body.result.content[0].text; }
}

const init = await req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0.1" } }, 1);
const sid = init.sid;
console.log(`session: ${sid}`);
await req("notifications/initialized", undefined, undefined, sid);

section("tools/list");
const list = await req("tools/list", {}, 2, sid);
console.log(list.body.result.tools.map(t => `  ${t.name}: ${t.description}`).join("\n"));

section("list_connectors");
const lc = await req("tools/call", { name: "list_connectors", arguments: {} }, 3, sid);
console.log(payload(lc.body));

section("doctor");
const doc = await req("tools/call", { name: "doctor", arguments: {} }, 4, sid);
console.log(payload(doc.body));

section("get_tool_source gh_pr_view");
const src = await req("tools/call", { name: "get_tool_source", arguments: { name: "gh_pr_view" } }, 5, sid);
console.log(payload(src.body));

section("gh_repo_view cli/cli (REAL gh call)");
const rv = await req("tools/call", { name: "gh_repo_view", arguments: { repo: "cli/cli" } }, 6, sid);
console.log(payload(rv.body));

section("gh_pr_list cli/cli (REAL gh call)");
const pl = await req("tools/call", { name: "gh_pr_list", arguments: { limit: 3 } }, 7, sid);
console.log(payload(pl.body));

section("refresh_tools");
const rt = await req("tools/call", { name: "refresh_tools", arguments: {} }, 8, sid);
console.log(payload(rt.body));

console.log("\n=== smoke test done ===");
process.exit(0);
