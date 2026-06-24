/** Test call_tool over HTTP. Usage: node scripts/smoke-call-tool.mjs [port] */
const port = process.argv[2] || "28992";

async function parse(text) {
  const t = text.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  for (const line of t.split("\n")) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) return JSON.parse(m[1]);
  }
  throw new Error(text.slice(0, 300));
}

async function mcp(method, params, id, sid) {
  const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sid) h["mcp-session-id"] = sid;
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: text ? await parse(text) : null };
}

const init = await mcp(
  "initialize",
  { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  1,
);
if (init.status !== 200) {
  console.error("init failed", init.status);
  process.exit(1);
}
const sid = init.sid;
await mcp("notifications/initialized", undefined, undefined, sid);

const list = await mcp("tools/list", {}, 2, sid);
const names = (list.body?.result?.tools ?? []).map((t) => t.name);
console.log("tools/list:", names.length, "has call_tool:", names.includes("call_tool"));

for (const target of ["gh_auth_status", "git_status"]) {
  const call = await mcp(
    "tools/call",
    { name: "call_tool", arguments: { name: target, arguments: {} } },
    10,
    sid,
  );
  const text = call.body?.result?.content?.[0]?.text;
  const payload = text ? JSON.parse(text) : call.body;
  console.log("\ncall_tool ->", target);
  console.log("  ok:", payload.ok, "tool:", payload.tool);
  if (payload.hint) console.log("  hint:", payload.hint);
  if (payload.exit_code !== undefined) console.log("  exit_code:", payload.exit_code);
  if (payload.stderr) console.log("  stderr:", String(payload.stderr).slice(0, 120));
  if (payload.stdout) console.log("  stdout:", String(payload.stdout).slice(0, 200));
}

console.log("\n=== done ===\n");