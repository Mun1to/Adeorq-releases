// Lo que la ventana le contesta al MCP, con una huella para comparar.
//
// Rust no sabe montar un panel, así que cada pedido del MCP que toca la ventana
// (abrir, cerrar, enlazar, leer una pantalla, listar los paneles) llega por el
// evento `mcp:pedido` y se contesta con `mcp_reply`. Esto manda doce pedidos,
// siempre los mismos, y devuelve una huella de todo lo que pasó: las doce
// respuestas, los procesos que se lanzaron, los que se mataron y lo que quedó
// en la Cabina. Si tocas ese oyente (`lib/puenteMcp.ts`), la huella de antes y
// la de después tienen que ser la misma.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), que es quien emite los eventos:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/pedidos-mcp.js" })
async (page) => {
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(3000);
  await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
  await page.waitForTimeout(800);
  const pedidos = [
    { peticion: 1, clase: "paneles" },
    { peticion: 2, clase: "pantalla", paneId: 99 },
    { peticion: 3, clase: "close_pane", paneId: 0 },
    { peticion: 4, clase: "link_panes", from: 1, to: 2 },
    { peticion: 5, clase: "open_pane", cli: "claude", project: "adeorq", brief: "mira el radar" },
    { peticion: 6, clase: "nada" },
    { peticion: 7, clase: "open_pane", cli: "inventado", project: "Adeorq" },
    { peticion: 8, clase: "open_pane", cli: "codex", project: "NoExiste" },
    { peticion: 9, clase: "open_pane", cli: "shell", cwd: "C:\\proyectos\\Vidorq", name: "consola", from: 1 },
    { peticion: 10, clase: "paneles" },
    { peticion: 11, clase: "close_pane", paneId: 1 },
    { peticion: 12, clase: "paneles" },
  ];
  for (const p of pedidos) {
    await page.evaluate((x) => window.__emitir("mcp:pedido", x), p);
    await page.waitForTimeout(p.clase === "open_pane" ? 1600 : 500);
  }
  // Los ids de sesión son nuevos en cada pasada: fuera, o la huella no se repite.
  const limpio = (s) => String(s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{22}/g, "<uuid>");
  const r = await page.evaluate(() => ({
    respuestas: window.__llamadas.filter(([c]) => c === "mcp_reply").map(([, a]) => `${a.peticion}: ${JSON.stringify(a.respuesta)}`),
    spawns: window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => `${a.id} ${a.cwd} | ${(a.command ?? ["(consola)"]).join(" ")}`),
    kills: window.__llamadas.filter(([c]) => c === "pty_kill").map(([, a]) => a.id),
    enCabina: [...document.querySelectorAll("[data-pane-id]")].map((e) => e.getAttribute("data-pane-id")),
  }));
  const texto = JSON.stringify({ ...r, respuestas: r.respuestas.map(limpio), spawns: r.spawns.map(limpio) });
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return { huella: h.toString(16), largo: texto.length, respuestas: r.respuestas.length, spawns: r.spawns.length, kills: r.kills, enCabina: r.enCabina };
}
