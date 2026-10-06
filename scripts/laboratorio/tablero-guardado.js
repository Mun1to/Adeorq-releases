// El tablero de la Cabina, de ida y de vuelta, con una huella para comparar.
//
// Adeorq guarda el tablero en cada cambio (`adeorq-layout`) y lo devuelve al
// abrir: las mismas terminales, en sus carpetas, cada agente retomando SU
// conversación, y el mosaico con sus tamaños. Esto recorre las dos mitades y
// devuelve dos huellas, que tienen que salir iguales antes y después de tocar
// ese código (`lib/tablero.ts`):
//
//   guardado  dos terminales, la costura arrastrada, y lo que queda escrito;
//   renacido  un tablero sembrado (un Claude, un Codex apartado y una consola,
//             en dos columnas de 70/30) y con qué renace cada panel.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/tablero-guardado.js" })
// La siembra cuelga de una marca en `sessionStorage` que se quita al acabar,
// así que no ensucia lo que se pruebe después en la misma pestaña.
async (page) => {
  const huella = (texto) => {
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };
  const sinIds = (s) => String(s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{22}/g, "<uuid>");
  const cabina = async () => {
    await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
    await page.waitForTimeout(600);
  };

  /* ── La ida: lo que queda guardado ────────────────────────────────────── */
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(3000);
  await cabina();
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude").click());
    await page.waitForTimeout(1800);
  }
  await cabina();
  const c = await page.evaluate(() => { const b = document.querySelector('[data-div="c0"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  // Los anchos, a cuatro decimales: el arrastre los suma de frame en frame y el
  // último bit baila de una pasada a otra (0.6 o 0.6000000000000001).
  const redondo = (texto) => {
    try {
      const t = JSON.parse(texto);
      for (const col of t.cols ?? []) {
        col.w = Math.round(col.w * 1e4) / 1e4;
        col.hs = (col.hs ?? []).map((h) => Math.round(h * 1e4) / 1e4);
      }
      return JSON.stringify(t);
    } catch {
      return texto;
    }
  };
  const guardado = redondo(sinIds(await page.evaluate(() => localStorage.getItem("adeorq-layout") ?? "")));

  /* ── La vuelta: con qué renace un tablero sembrado ────────────────────── */
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "Adeorq · claude", cwd: "C:\\proyectos\\Adeorq", command: ["cmd.exe", "/k", "chcp 65001 >nul && claude --permission-mode acceptEdits --session-id 11111111-2222-4333-8444-555555555555"] },
      { name: "Vidorq · codex", cwd: "C:\\proyectos\\Vidorq", command: ["cmd.exe", "/k", "chcp 65001 >nul && codex resume 01a0cafe-0d0b-7201-b479-050ab2e5bde8"], minimizado: true },
      { name: "VoCript · consola", cwd: "C:\\proyectos\\VoCript" },
    ],
    cols: [{ w: 0.7, hs: [1, 2], idx: [0, 2] }, { w: 0.3, hs: [1], idx: [1] }],
    ocultos: [],
  });
  await page.addInitScript((texto) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  }, SEMBRADO);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(5500);
  const vuelta = await page.evaluate(() => ({
    spawns: window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => `${a.id} ${a.cwd} | ${(a.command ?? ["(consola)"]).join(" ")}`),
    paneles: [...document.querySelectorAll("[data-pane-id]")].map((e) => `${e.getAttribute("data-pane-id")}: ${e.style.left} ${e.style.top} ${e.style.width} ${e.style.height}`),
    costuras: [...document.querySelectorAll("[data-div]")].map((e) => e.getAttribute("data-div")),
    nombres: [...document.querySelectorAll("[data-pane-id] .pane-name")].map((e) => e.textContent),
    guardadoDespues: localStorage.getItem("adeorq-layout") ?? "",
  }));
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));
  vuelta.guardadoDespues = redondo(vuelta.guardadoDespues);
  const renacido = JSON.stringify(vuelta);

  return {
    guardado: { huella: huella(guardado), largo: guardado.length },
    renacido: { huella: huella(renacido), largo: renacido.length, spawns: vuelta.spawns.length, paneles: vuelta.paneles, costuras: vuelta.costuras },
  };
}
