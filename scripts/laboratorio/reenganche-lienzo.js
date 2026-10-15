// Volver a abrir Adeorq con terminales DEL LIENZO que aguantaron una caída en
// el proceso de terminales (`terminales.rs`, `lib/reenganche.ts`,
// `lib/tablero.ts`, el tablero que vuelve solo en `CanvasView`).
//
// La Cabina ya recogía las suyas (`reenganche.js`); el lienzo no: cada terminal
// viva del lienzo salía en la Cabina como «· recuperada» Y el lienzo abría otro
// proceso para el mismo nodo con su `--resume`, o sea dos Claudes sobre una
// sesión. Lo que fija esto, con la app de verdad y un doble de Tauri:
//   · el nodo del lienzo cuya terminal sigue viva se la queda: su mismo número,
//     su comando de verdad (sin `--resume`) y lo que dijo escrito en su xterm;
//   · también un tablero guardado antes de que el nodo llevara su número (`pty`),
//     por el id del nodo;
//   · la Cabina no la enseña como «recuperada», y la suya sigue siendo suya;
//   · un nodo cuya terminal murió nace como siempre (con su `--resume`) y con
//     un número por encima de todo lo vivo;
//   · lo vivo que no es de nadie sale como «recuperada», como antes;
//   · la flecha entre dos nodos recogidos sigue en su sitio, y el tablero que
//     se guarda después lleva el número de cada terminal.
//
// Con el doble cargado antes, sobre la misma página:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/doble-conserje.js scripts/laboratorio/reenganche-lienzo.js
// (o con el MCP de Playwright: browser_run_code_unsafe con cada guion en orden).
// Devuelve { fallos: [...] }: vacío es que todo está en su sitio.
async (page) => {
  const BASE = "http://localhost:1420/";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const claude = (sid) => ["cmd.exe", "/k", `chcp 65001 >nul && claude --permission-mode acceptEdits --session-id ${sid}`];
  const SID_CABINA = "11111111-2222-4333-8444-555555555555";
  const SID_LIENZO = "77777777-2222-4333-8444-555555555555";
  const SID_MUERTA = "55555555-2222-4333-8444-555555555555";
  const CONSOLA = ["powershell.exe", "-NoLogo"];
  const CABINA = JSON.stringify({
    panes: [{ name: "Adeorq · claude", cwd: "C:\\proyectos\\Adeorq", pty: 4, command: claude(SID_CABINA) }],
    cols: [{ w: 1, hs: [1], idx: [0] }],
    ocultos: [],
  });
  const term = (id, x, extra) => ({ tipo: "term", id, x, y: 0, w: 640, h: 420, ...extra });
  const LIENZO = JSON.stringify({
    kind: "adeorq-lienzo",
    v: 1,
    guardado: "2026-10-15T10:00:00.000Z",
    proyecto: "Vidorq",
    nodos: [
      // El de hoy: con su número apuntado.
      term("7", 0, { kind: "claude", proyecto: "Vidorq", ruta: "C:\\proyectos\\Vidorq", cmd: claude(SID_LIENZO), pty: 7 }),
      // Uno guardado antes de que existiera `pty`: su número es el id del nodo.
      term("8", 700, { kind: "shell", proyecto: "VoCript", ruta: "C:\\proyectos\\VoCript", cmd: CONSOLA }),
      // Uno cuya terminal ya no vive: nace como siempre, retomando su sesión.
      term("5", 1400, { kind: "claude", proyecto: "Adeorq", ruta: "C:\\proyectos\\Adeorq", cmd: claude(SID_MUERTA), pty: 5 }),
    ],
    flechas: [{ id: "e1", de: "7", a: "8", encargo: "pásale el resumen", auto: false }],
    trazos: [],
  });
  const VIVAS = JSON.stringify([
    // La de la Cabina.
    { id: 4, cwd: "C:\\proyectos\\Adeorq", command: claude(SID_CABINA) },
    // Las dos del lienzo, la carpeta con otras mayúsculas.
    { id: 7, cwd: "c:\\proyectos\\vidorq", command: claude(SID_LIENZO) },
    { id: 8, cwd: "C:\\proyectos\\VoCript\\", command: CONSOLA },
    // Una que no es de nadie.
    { id: 9, cwd: "C:\\proyectos\\Huerfana", command: ["cmd.exe", "/k", "codex"] },
  ]);

  await page.addInitScript(([cabina, lienzo, vivas]) => {
    try {
      if (!sessionStorage.getItem("__sembrar")) return;
      localStorage.setItem("adeorq-layout", cabina);
      sessionStorage.setItem("__tablero", lienzo);
      sessionStorage.setItem("__vivas", vivas);
      sessionStorage.setItem("__hist-4", "HISTORIA-DE-LA-CUATRO\r\n");
      sessionStorage.setItem("__hist-7", "\x1b[32mHISTORIA-DE-LA-SIETE\x1b[0m\r\n");
      sessionStorage.setItem("__hist-8", "HISTORIA-DE-LA-OCHO\r\n");
      sessionStorage.setItem("__hist-9", "HISTORIA-DE-LA-NUEVE\r\n");
      // Las sesiones de Claude tienen su conversación en disco: así un nodo que
      // vuelve sin su terminal pide `--resume`, que es lo que NO debe pasarle a
      // uno que la encuentra viva.
      const t = window.__TAURI_INTERNALS__;
      const base = t.invoke;
      t.invoke = (cmd, args) => {
        if (cmd !== "transcript_exists") return base(cmd, args);
        window.__llamadas.push([cmd, args]);
        return Promise.resolve(true);
      };
    } catch { /* sin almacenamiento no hay siembra */ }
  }, [CABINA, LIENZO, VIVAS]);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto(BASE);
  await page.waitForTimeout(4500);
  await page.locator('[data-tab="lienzo"]').first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const t = await import("/src/lib/terminales.ts");
    const texto = (id) => [...(t.historiaDe(id, 40) ?? []), ...(t.pantallaDe(id) ?? [])].join("\n");
    const tablero = JSON.parse(sessionStorage.getItem("__tablero") ?? "{}");
    return {
      spawns: window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => ({ id: a.id, cwd: a.cwd, command: a.command })),
      historiales: window.__llamadas.filter(([c]) => c === "pty_historial").map(([, a]) => a.id),
      nodos: [...document.querySelectorAll(".view-lienzo .react-flow__node-term")].map((n) => n.getAttribute("data-id")),
      flechas: [...document.querySelectorAll(".view-lienzo .react-flow__edge")].length,
      cabina: [...document.querySelectorAll("[data-pane-id]")]
        .filter((e) => !e.closest(".view-lienzo"))
        .map((e) => ({ id: Number(e.getAttribute("data-pane-id")), nombre: e.querySelector(".pane-name")?.textContent ?? "" })),
      siete: texto(7),
      ocho: texto(8),
      guardado: (tablero.nodos ?? []).filter((n) => n.tipo === "term").map((n) => ({ id: n.id, pty: n.pty })),
      flechasGuardadas: (tablero.flechas ?? []).map((f) => `${f.de}→${f.a}`),
    };
  });
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));

  const de = (id) => r.spawns.filter((s) => s.id === id);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  debe(r.nodos.includes("7") && r.nodos.includes("8"), `los nodos del lienzo se quedan su número, la 7 y la 8 (${JSON.stringify(r.nodos)})`);
  debe(de(7).length === 1 && igual(de(7)[0].command, claude(SID_LIENZO)), `la 7 se engancha con su comando de verdad, sin --resume (${JSON.stringify(de(7))})`);
  debe(de(8).length === 1 && igual(de(8)[0].command, CONSOLA), `la 8 (tablero sin «pty») se engancha por el id de su nodo (${JSON.stringify(de(8))})`);
  const dobles = r.spawns.filter((s) => s.id !== 7 && (s.command ?? []).join(" ").includes(SID_LIENZO));
  debe(!dobles.length, `ningún segundo Claude sobre la sesión de la 7 (${JSON.stringify(dobles)})`);
  debe(/HISTORIA-DE-LA-SIETE/.test(r.siete), `la 7 trae lo que dijo escrito en su xterm («${r.siete.slice(0, 80)}»)`);
  debe(/HISTORIA-DE-LA-OCHO/.test(r.ocho), `y la 8 también («${r.ocho.slice(0, 80)}»)`);
  debe(r.historiales.includes(7) && r.historiales.includes(8), `se pidió lo que dijo cada una del lienzo (${r.historiales})`);
  const recuperadas = r.cabina.filter((p) => /recuperada/.test(p.nombre)).map((p) => p.id);
  debe(!recuperadas.includes(7) && !recuperadas.includes(8), `la Cabina no enseña las del lienzo como recuperadas (${JSON.stringify(r.cabina)})`);
  debe(!r.cabina.some((p) => p.id === 7 || p.id === 8), "ni las pinta en su mosaico");
  debe(r.cabina.some((p) => p.id === 4 && !/recuperada/.test(p.nombre)), `la Cabina se queda la suya, la 4 (${JSON.stringify(r.cabina)})`);
  debe(recuperadas.includes(9), `lo vivo que no es de nadie sigue saliendo como recuperada (${JSON.stringify(r.cabina)})`);
  const muerta = r.spawns.find((s) => (s.command ?? []).join(" ").includes(SID_MUERTA));
  debe(muerta && muerta.id >= 10, `el nodo cuya terminal murió nace por encima de todo lo vivo (${JSON.stringify(muerta)})`);
  debe(muerta && /--resume/.test(muerta.command.join(" ")), "y retomando su conversación, como siempre");
  debe(!r.nodos.includes("5"), "y no con su número viejo");
  debe(r.flechas >= 1 && r.flechasGuardadas.includes("7→8"), `la flecha entre las dos recogidas sigue (${r.flechas}, ${JSON.stringify(r.flechasGuardadas)})`);
  const conNumero = r.guardado.filter((n) => n.pty === Number(n.id)).map((n) => n.pty).sort((a, b) => a - b);
  debe(conNumero.includes(7) && conNumero.includes(8) && conNumero.length === r.guardado.length, `el tablero del lienzo se guarda con el número de cada terminal (${JSON.stringify(r.guardado)})`);
  return { fallos, nodos: r.nodos, cabina: r.cabina, spawns: r.spawns.map((s) => `${s.id} ${s.cwd} ${(s.command ?? []).join(" ").slice(-60)}`) };
}
