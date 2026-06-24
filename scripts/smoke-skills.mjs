/** Smoke get_skills after fake skills wired. Usage: node scripts/smoke-skills.mjs [port] */
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
  return { sid: res.headers.get("mcp-session-id"), body: text ? await parse(text) : null };
}

async function call(sid, args) {
  const r = await mcp("tools/call", { name: "get_skills", arguments: args }, 10, sid);
  return JSON.parse(r.body.result.content[0].text);
}

const init = await mcp(
  "initialize",
  { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "skills", version: "1" } },
  1,
);
const sid = init.sid;
await mcp("notifications/initialized", undefined, undefined, sid);

console.log("\n=== get_skills 假 skill 测试 ===\n");

const listGh = await call(sid, { connector: "gh", list: true });
console.log("gh list:", listGh.files?.join(", "));

const fileGh = await call(sid, { connector: "gh", file: "lazy-agent-flow.md" });
console.log("gh file lazy-agent-flow:", fileGh.ok, fileGh.content?.slice(0, 40) + "...");

const connGh = await call(sid, { connector: "gh" });
console.log("gh connector skills count:", connGh.skills?.length);

const tool = await call(sid, { tool: "gh_pr_list" });
console.log("gh_pr_list tool skills:", tool.skills?.map((s) => s.ref.split(/[/\\]/).pop()).join(", "));

const doctor = JSON.parse(
  (await mcp("tools/call", { name: "doctor", arguments: {} }, 11, sid)).body.result.content[0].text,
);
for (const c of doctor.connectors) {
  console.log(`doctor ${c.name} skills exists:`, c.skills?.map((s) => `${s.path.split(/[/\\]/).pop()}:${s.exists}`).join(" "));
}

console.log("\n=== done ===\n");