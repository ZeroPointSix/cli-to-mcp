/**
 * Smoke demo: flat vs lazy tools/list + progressive meta tools.
 * Usage: node scripts/smoke-issue15.mjs [port]
 */
const port = Number(process.argv[2] || 28998);

async function parseRes(text) {
  const t = text.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  for (const line of t.split("\n")) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) return JSON.parse(m[1]);
  }
  throw new Error("bad response: " + text.slice(0, 300));
}

async function mcp(method, params, id, sid) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sid) headers["mcp-session-id"] = sid;
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: text ? await parseRes(text) : null };
}

async function callTool(sid, name, args = {}) {
  const r = await mcp("tools/call", { name, arguments: args }, 10, sid);
  const text = r.body?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : r.body;
}

async function main() {
  console.log(`\n=== cli-to-mcp issue #15 smoke @ http://127.0.0.1:${port}/mcp ===\n`);

  const init = await mcp(
    "initialize",
    { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
    1,
  );
  if (init.status !== 200) throw new Error("initialize failed " + init.status);
  const sid = init.sid;
  await mcp("notifications/initialized", undefined, undefined, sid);

  const list = await mcp("tools/list", {}, 2, sid);
  const tools = list.body?.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  const metaNames = [
    "list_connectors",
    "doctor",
    "refresh_tools",
    "get_skills",
    "get_tool_source",
    "list_tool_categories",
    "list_tools_by_category",
    "search_tools",
    "get_tool_schema",
  ];
  const dynamic = names.filter((n) => !metaNames.includes(n));

  console.log("tools/list 总数:", names.length);
  console.log("  - meta 工具:", metaNames.filter((m) => names.includes(m)).length, "/", metaNames.length);
  console.log("  - 动态 CLI 工具:", dynamic.length);
  if (dynamic.length > 0 && dynamic.length <= 15) {
    console.log("  - 动态样例:", dynamic.join(", "));
  } else if (dynamic.length > 15) {
    console.log("  - 动态样例:", dynamic.slice(0, 8).join(", "), `... +${dynamic.length - 8} more`);
  }

  const doctor = await callTool(sid, "doctor", {});
  console.log("\ndoctor:");
  for (const c of doctor.connectors ?? []) {
    console.log(`  connector ${c.name}: tool_count=${c.tool_count} parser_resolved=${c.parser_resolved}`);
  }

  const cats = await callTool(sid, "list_tool_categories", {});
  console.log("\nlist_tool_categories:", (cats.categories ?? []).length, "类");
  for (const c of (cats.categories ?? []).slice(0, 6)) {
    console.log(`  ${c.id} (${c.tool_count})`);
  }
  if ((cats.categories ?? []).length > 6) console.log("  ...");

  const firstCat = cats.categories?.[0]?.id;
  if (firstCat) {
    const byCat = await callTool(sid, "list_tools_by_category", { category: firstCat, limit: 5 });
    console.log(`\nlist_tools_by_category("${firstCat}") 前几条:`);
    for (const t of byCat.tools ?? []) {
      console.log(`  - ${t.name}: ${t.description.slice(0, 60)}`);
    }
  }

  const search = await callTool(sid, "search_tools", { query: "pr", limit: 5 });
  console.log('\nsearch_tools("pr"):', (search.tools ?? []).map((t) => t.name).join(", ") || "(无)");

  const sample = search.tools?.[0]?.name || dynamic[0];
  if (sample) {
    const schema = await callTool(sid, "get_tool_schema", { name: sample });
    if (schema.ok) {
      const props = Object.keys(schema.inputSchema?.properties ?? {});
      console.log(`\nget_tool_schema("${sample}") 参数:`, props.length ? props.join(", ") : "(无)");
    }
  }

  console.log("\n=== smoke 完成 ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});