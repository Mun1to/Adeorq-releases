// Una terminal que nace mientras vuelve el tablero no se queda sin columna, y el
// cartel «Recuperando…» se va.
//
// Medido el 2026-10-31 (`lib/tablero.ts`): la vuelta termina con un `setCols`
// que pone el mosaico guardado ENTERO, así que una terminal que nace en mitad
// (un clic, o un `open_pane` de un agente que sobrevivió) quedaba en `panes` y
// en ninguna columna: no se pinta, se desmonta y su PTY muere. Con ocho
// paneles guardados, la vuelta dura más de un segundo (400 ms entre uno y otro)
// y es fácil de coger a mitad.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/tablero-vuelta-lenta.js" })
async (page) => {
  const A = "cccc1111-2222-4333-8444-000000000001";
  const SEMBRADO = JSON.stringify({
    panes: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `Guardada ${n}`, cwd: "C:\\proyectos\\Vidorq" })),
    cols: [{ w: 0.5, hs: [1, 1, 1, 1], idx: [0, 1, 2, 3] }, { w: 0.5, hs: [1, 1, 1, 1], idx: [4, 5, 6, 7] }],
  });
  await page.addInitScript(([texto, id]) => {
    window.__sesiones.push({ id, cwd: "C:\\proyectos\\Vidorq", title: "Nace a mitad", project: "Vidorq", live: false, estado: "lista", hours: 1 });
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  }, [SEMBRADO, A]);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto(new URL(page.url()).origin);
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);

  // La vuelta empieza al cargar: la barra sale antes de que acabe (ocho paneles
  // × 400 ms). Se abre la sesión en cuanto exista su fila.
  await page.locator('[data-tab="cabina"]').first().click();
  const enCartel = () => page.locator("text=/Recuperando tus terminales/").count();
  await page.waitForFunction(() => document.body.innerText.includes("Recuperando tus terminales"), null, { timeout: 15000 }).catch(() => {});
  ok("la vuelta está en marcha al abrir la sesión", (await enCartel()) > 0, "no se llegó a ver el cartel");
  if (!(await page.locator(`[data-sesion="${A}"]`).count())) {
    await page.locator(".view-cabina .sidebar .project-main", { hasText: "Vidorq" }).first().click();
    await page.waitForTimeout(300);
  }
  await page.locator(`[data-sesion="${A}"] button.session`).first().click();
  const aunVuelve = (await enCartel()) > 0;
  ok("y sigue en marcha cuando nace la nueva", aunVuelve, "la vuelta ya había acabado: la prueba no vale");

  // Cuando acaba la vuelta.
  await page.waitForFunction(() => !document.body.innerText.includes("Recuperando tus terminales"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const nombres = await page.evaluate(() =>
    [...document.querySelectorAll("[data-pane-id]")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      })
      .map((e) => e.querySelector(".pane-name")?.textContent ?? ""),
  );
  ok("las ocho guardadas están", [1, 2, 3, 4, 5, 6, 7, 8].every((n) => nombres.some((x) => x.includes(`Guardada ${n}`))), nombres.join(" | "));
  ok("la que nació a mitad también se ve", nombres.some((x) => x.includes("Nace a mitad")), nombres.join(" | "));
  const matadas = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_kill").length);
  ok("a la nueva no se le mató el PTY al desmontarse", matadas === 0, `pty_kill: ${matadas}`);
  ok("el cartel «Recuperando…» se fue", (await enCartel()) === 0);

  // Y si la vuelta se cancela a medias (apagas «Recuperar las terminales al
  // abrir» mientras corre), el cartel no se queda con los paneles que faltaban.
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto(new URL(page.url()).origin);
  await page.waitForFunction(() => document.body.innerText.includes("Recuperando tus terminales"), null, { timeout: 15000 }).catch(() => {});
  const vuelve = (await enCartel()) > 0;
  ok("la segunda vuelta está en marcha", vuelve, "no se llegó a ver el cartel");
  await page.locator('[data-tab="ajustes"]').first().click();
  await page.locator(".set-tab", { hasText: "Terminales" }).first().click();
  await page.locator("label.setting-switch", { hasText: "Recuperar las terminales al abrir" }).locator("input").uncheck();
  await page.waitForTimeout(3500);
  const resto = await page.evaluate(() => document.body.innerText.match(/Recuperando tus terminales…\s*(\d+)/)?.[1] ?? "");
  ok("cancelada a medias, el cartel se va", (await enCartel()) === 0, `sigue «Recuperando… ${resto}»`);
  return r.join("\n");
}
