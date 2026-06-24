/** Full retest: list, doctor executor_probe, call_tool, search multi-word. */
const port = process.argv[2] || "28992";

async function parse(text) {
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
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: text ? await parse(text) : null };
}

async function callTool(sid, name, args) {
  const r = await mcp("tools/call", { name, arguments: args }, 20, sid);
  const text = r.body?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : r.body;
}

console.log("\n========== cli-to-mcp 重新测试 @", port, "==========\n");

const init = await mcp(
  "initialize",
  { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "retest", version: "1" } },
  1,
);
if (init.status !== 200) {
  console.error("FAIL initialize", init.status);
  process.exit(1);
}
const sid = init.sid;
await mcp("notifications/initialized", undefined, undefined, sid);

const list = await mcp("tools/list", {}, 2, sid);
const tools = list.body?.result?.tools ?? [];
const callToolSchema = tools.find((t) => t.name === "call_tool")?.inputSchema;
console.log("1) tools/list:", tools.length, "tools");
console.log("   call_tool in list:", tools.some((t) => t.name === "call_tool"));
console.log("   call_tool schema has 'name' prop:", !!callToolSchema?.properties?.name);

const doctor = await callTool(sid, "doctor", {});
console.log("\n2) doctor connectors:");
for (const c of doctor.connectors ?? []) {
  const p = c.executor_probe ?? {};
  console.log(`   ${c.name}: executor_probe.ok=${p.ok} binary_on_path=${c.binary_on_path}`);
  if (p.stderr_snippet) console.log(`      stderr: ${p.stderr_snippet.slice(0, 100)}`);
  if (p.tried_argv) console.log(`      tried: ${p.tried_argv.join(" ")}`);
}

const search = await callTool(sid, "search_tools", { query: "git status", limit: 5 });
console.log("\n3) search_tools('git status'):", (search.tools ?? []).map((t) => t.name).join(", ") || "(none)");

const badCat = await callTool(sid, "list_tools_by_category", { category: "prefix:gh:doesnotexist", limit: 5 });
console.log("\n4) list_tools_by_category invalid id:");
console.log("   unknown_category:", badCat.unknown_category, badCat.hint ? "hint=yes" : "");

for (const [label, args] of [
  ["git_status plain", { name: "git_status", arguments: {} }],
  ["gh_auth_status plain", { name: "gh_auth_status", arguments: {} }],
  ["nested JSON name fix", { name: '{"name":"git_status"}', arguments: {} }],
]) {
  const r = await callTool(sid, "call_tool", args);
  console.log(`\n5) call_tool ${label}:`);
  console.log("   ok:", r.ok, "tool:", r.tool, "exit:", r.exit_code);
  if (r.hint) console.log("   hint:", r.hint);
  if (r.stderr) console.log("   stderr:", String(r.stderr).slice(0, 120));
}

console.log("\n========== done ==========\n");