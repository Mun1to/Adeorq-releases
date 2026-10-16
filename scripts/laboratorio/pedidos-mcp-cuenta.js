// Un encargo programado abre su terminal con la cuenta y el modelo que eligió
// (2026-10-16). Rust manda `account` y `model` en el `open_pane` (`abrir` en
// `programados.rs`) y la ventana nace con esa cuenta (`cuentaPedida` en
// `lib/frenoCuota.ts`) y ese modelo; una cuenta que ya no está, o de otro
// agente, no se cambia por otra en silencio: el pedido falla diciéndolo.
//
// Con `pnpm dev` en marcha, el doble primero:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/doble-conserje.js scripts/laboratorio/pedidos-mcp-cuenta.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-accounts", JSON.stringify({ accounts: [{ id: "c2", label: "Segunda", dir: "C:\\cuentas\\segunda", provider: "claude" }], defaultAccount: "main:claude" }));
    } catch { /* sin almacén */ }
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(3000);
  const pedidos = [
    { peticion: 1, clase: "open_pane", cli: "claude", project: "Adeorq", brief: "revisa", account: "c2", model: "opus" },
    { peticion: 2, clase: "open_pane", cli: "claude", project: "Adeorq", brief: "revisa", account: "c9" },
    { peticion: 3, clase: "open_pane", cli: "codex", project: "Adeorq", brief: "revisa", account: "c2" },
    { peticion: 4, clase: "open_pane", cli: "claude", project: "Adeorq", brief: "revisa", model: "gpt-9" },
    { peticion: 5, clase: "open_pane", cli: "claude", project: "Adeorq", brief: "revisa", account: "main:claude" },
  ];
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  for (const p of pedidos) {
    await page.evaluate((x) => window.__emitir("mcp:pedido", x), p);
    await page.waitForTimeout(1600);
  }
  const pasos = await page.evaluate(() => {
    const nuevas = window.__llamadas.slice(window.__desde);
    return {
      respuestas: Object.fromEntries(nuevas.filter(([c]) => c === "mcp_reply").map(([, a]) => [a.peticion, a.respuesta])),
      spawns: nuevas.filter(([c]) => c === "pty_spawn").map(([, a]) => ({ linea: (a.command ?? []).join(" "), env: a.env ?? null })),
    };
  });
  const [r, s] = [pasos.respuestas, pasos.spawns];
  debe(typeof r[1]?.pane_id === "number", `con su cuenta y su modelo se abre (${JSON.stringify(r[1])})`);
  debe(s[0]?.env?.CLAUDE_CONFIG_DIR === "C:\\cuentas\\segunda", `nace en la cuenta que pidió (${JSON.stringify(s[0]?.env)})`);
  debe(/--model opus/.test(s[0]?.linea ?? ""), `y con su modelo (${s[0]?.linea})`);
  debe(/ya no está/.test(r[2]?.error ?? ""), `una cuenta que ya no está lo dice (${JSON.stringify(r[2])})`);
  debe(/no es de ese agente/.test(r[3]?.error ?? ""), `una cuenta de otro agente lo dice (${JSON.stringify(r[3])})`);
  debe(typeof r[4]?.pane_id === "number" && !/--model/.test(s[1]?.linea ?? "--model"), `un modelo que no es de la casa no llega a la línea (${s[1]?.linea})`);
  debe(typeof r[5]?.pane_id === "number" && !s[2]?.env?.CLAUDE_CONFIG_DIR, `pedir la principal nace sin carpeta de otra cuenta (${JSON.stringify(s[2]?.env)})`);
  debe(s.length === 3, `solo nacen las tres que podían (${s.length})`);
  return { pasos, fallos };
}
