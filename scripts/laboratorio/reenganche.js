// Volver a abrir Adeorq con terminales que aguantaron una caída en el proceso
// de terminales (`terminales.rs`, `lib/reenganche.ts`, `lib/tablero.ts`).
//
// Munir, 2026-10-11: si Adeorq se cae sola, los agentes «aguantan». Lo que
// fija esto, con la app de verdad y un doble de Tauri:
//   · el panel guardado que encuentra su terminal viva se la queda: su mismo
//     número, su comando de verdad (no un `--resume` nuevo encima) y lo que dijo
//     escrito en su xterm;
//   · el que no la encuentra nace como siempre, con un número por encima de todo
//     lo vivo, para no pisar a nadie;
//   · lo vivo que no es de ningún panel sale como «recuperada», con lo suyo:
//     nunca se mata en silencio;
//   · y el tablero que se guarda después lleva el número de cada terminal.
//
//   1. `pnpm dev`
//   2. con el MCP de Playwright, en una pestaña nueva:
//        browser_run_code_unsafe({ filename: "scripts/laboratorio/reenganche.js" })
// Devuelve { fallos: [...] }: vacío es que todo está en su sitio.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const CLAUDE = ["cmd.exe", "/k", "chcp 65001 >nul && claude --permission-mode acceptEdits --session-id 11111111-2222-4333-8444-555555555555"];
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "Adeorq · claude", cwd: "C:\\proyectos\\Adeorq", pty: 4, command: CLAUDE },
      { name: "VoCript · consola", cwd: "C:\\proyectos\\VoCript", pty: 6 },
    ],
    cols: [{ w: 1, hs: [1, 1], idx: [0, 1] }],
    ocultos: [],
  });
  const VIVAS = JSON.stringify([
    // La suya: mismo número, la carpeta con otras mayúsculas.
    { id: 4, cwd: "c:\\proyectos\\adeorq", command: CLAUDE },
    // Una que siguió viva y no está en el tablero.
    { id: 9, cwd: "C:\\proyectos\\Vidorq", command: ["cmd.exe", "/k", "codex"] },
  ]);

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.addInitScript(([texto, vivas]) => {
    try {
      if (!sessionStorage.getItem("__sembrar")) return;
      localStorage.setItem("adeorq-layout", texto);
      sessionStorage.setItem("__vivas", vivas);
      sessionStorage.setItem("__hist-4", "\x1b[32mHISTORIA-DE-LA-CUATRO\x1b[0m\r\n");
      sessionStorage.setItem("__hist-9", "HISTORIA-DE-LA-NUEVE\r\n");
    } catch { /* sin almacenamiento no hay siembra */ }
  }, [SEMBRADO, VIVAS]);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4500);
  await page.locator('[data-tab="cabina"]').click().catch(() => {});
  await page.waitForTimeout(1200);

  const r = await page.evaluate(async () => {
    const t = await import("/src/lib/terminales.ts");
    return {
      spawns: window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => ({ id: a.id, cwd: a.cwd, command: a.command })),
      historiales: window.__llamadas.filter(([c]) => c === "pty_historial").map(([, a]) => a.id),
      paneles: [...document.querySelectorAll("[data-pane-id]")].map((e) => ({ id: Number(e.getAttribute("data-pane-id")), nombre: e.querySelector(".pane-name")?.textContent ?? "" })),
      // Lo que subió por encima de la pantalla y lo que se ve: el volcado puede
      // quedarse entero en la pantalla si es corto.
      cuatro: [...(t.historiaDe(4, 40) ?? []), ...(t.pantallaDe(4) ?? [])].join("\n"),
      nueve: [...(t.historiaDe(9, 40) ?? []), ...(t.pantallaDe(9) ?? [])].join("\n"),
      guardado: JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}"),
    };
  });
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));

  const ids = r.paneles.map((p) => p.id).sort((a, b) => a - b);
  const deLa = (id) => r.spawns.find((s) => s.id === id);
  debe(ids.includes(4), `el panel guardado se queda su terminal viva, la 4 (${JSON.stringify(r.paneles)})`);
  debe(JSON.stringify(deLa(4)?.command) === JSON.stringify(CLAUDE), `con su comando de verdad, no un --resume encima (${JSON.stringify(deLa(4))})`);
  debe(/HISTORIA-DE-LA-CUATRO/.test(r.cuatro), `y con lo que dijo escrito en su xterm («${r.cuatro.slice(0, 80)}»)`);
  const nueva = r.spawns.find((s) => /VoCript/.test(s.cwd));
  debe(nueva && nueva.id >= 10, `el que no encuentra la suya nace por encima de todo lo vivo (${JSON.stringify(nueva)})`);
  debe(!ids.includes(6), "y no con su número viejo, que ya no es de nadie");
  const recuperada = r.paneles.find((p) => p.id === 9);
  debe(recuperada && /recuperada/.test(recuperada.nombre), `lo vivo sin panel sale como recuperada (${JSON.stringify(recuperada)})`);
  debe(/HISTORIA-DE-LA-NUEVE/.test(r.nueve), "con lo suyo escrito");
  debe(r.historiales.includes(4) && r.historiales.includes(9), `se pidió lo que dijo cada viva (${r.historiales})`);
  const guardados = (r.guardado.panes ?? []).map((p) => p.pty).sort((a, b) => a - b);
  debe(guardados.includes(4) && guardados.includes(9), `el tablero que se guarda lleva el número de cada terminal (${guardados})`);
  return { fallos, paneles: r.paneles, spawns: r.spawns.map((s) => `${s.id} ${s.cwd}`) };
}
