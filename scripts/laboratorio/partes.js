// Las partes que se apagan enteras (`lib/partes.ts`), en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/partes.js
//
// Rust se hace con un doble que apunta qué le llega (`fijar_partes`, que es la
// copia que leen el hilo de la memoria y el MCP). Lo que fija (Munir,
// 2026-10-17, A2 B1 C2), que la lógica suelta (`partes-check.ts`) no ve:
//   · una parte apagada no sale en la cabecera ni en la paleta, y el Lienzo
//     apagado ni se monta;
//   · al abrir, la ventana le pasa a Rust lo apagado;
//   · Ajustes › Partes de Adeorq la vuelve a encender, y no deja apagar la
//     Cabina y el Lienzo a la vez, diciendo por qué;
//   · la Cabina apagada con terminales abiertas sigue a la vista, avisando;
//   · la bienvenida pregunta qué usar, y lo aplica en cuanto se marca.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    const q = new URLSearchParams(location.search);
    if (sessionStorage.getItem("banco-partes") !== q.get("vez")) {
      localStorage.clear();
      sessionStorage.setItem("banco-partes", q.get("vez") ?? "");
      localStorage.setItem("adeorq-lang", "es");
      localStorage.setItem("adeorq-perfil", JSON.stringify({ nombre: "Sam", sinRaiz: true, hecho: !q.has("bienvenida"), clis: ["claude"] }));
      if (q.get("partes")) localStorage.setItem("adeorq-partes", JSON.stringify(q.get("partes").split(",")));
      if (q.has("dos")) {
        localStorage.setItem("adeorq-layout", JSON.stringify({
          panes: [{ name: "Adeorq · uno", cwd: "C:\\proyectos\\Adeorq" }, { name: "Adeorq · dos", cwd: "C:\\proyectos\\Adeorq" }],
          cols: [{ w: 0.5, hs: [1], idx: [0] }, { w: 0.5, hs: [1], idx: [1] }],
        }));
      }
    }
    window.__partes = [];
    const oyentes = {};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    let escucha = 1;
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "fijar_partes": window.__partes.push(args.apagadas.join(",")); return null;
        default: throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_${id}`] = cb; return id; },
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });
  const pasos = {};
  const pestanas = () => page.$$eval("[data-tab]", (b) => [...new Set(b.map((x) => x.dataset.tab))]);
  const aRust = () => page.evaluate(() => window.__partes.splice(0));
  await page.setViewportSize({ width: 1920, height: 1000 });

  // 1. Con el Lienzo y la Memoria apagados.
  await page.goto("http://localhost:1420/?vez=1&partes=lienzo,memoria");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  pasos.cabecera = await pestanas();
  debe(!pasos.cabecera.includes("lienzo") && !pasos.cabecera.includes("memoria") && pasos.cabecera.includes("cabina") && pasos.cabecera.includes("chat"), `la cabecera sin las apagadas (${pasos.cabecera})`);
  pasos.lienzoMontado = await page.locator(".view-lienzo").count();
  debe(pasos.lienzoMontado === 0, "el Lienzo apagado ni se monta");
  pasos.alAbrir = await aRust();
  debe(pasos.alAbrir.includes("lienzo,memoria"), `al abrir se le pasa a Rust lo apagado (${JSON.stringify(pasos.alAbrir)})`);
  await page.keyboard.press("Control+k");
  await page.locator(".paleta-fila").first().waitFor({ timeout: 5000 });
  pasos.paleta = await page.$$eval(".paleta-fila", (f) => f.map((x) => x.textContent.trim()));
  debe(!pasos.paleta.some((x) => /^(Lienzo|Memoria)Pestaña/.test(x)) && pasos.paleta.some((x) => /^CabinaPestaña/.test(x)), `la paleta tampoco las ofrece (${pasos.paleta.slice(0, 12)})`);
  await page.keyboard.press("Escape");

  // 2. Ajustes › Partes de Adeorq.
  await page.locator('[data-tab="ajustes"]').click();
  const tarjeta = page.locator(".panel-card", { has: page.locator("h2", { hasText: "Partes de Adeorq" }) });
  await tarjeta.waitFor({ timeout: 5000 });
  const filas = () => tarjeta.locator(".parte-fila").evaluateAll((l) => l.map((f) => `${f.querySelector(".cab-nombre").firstChild.textContent}:${f.querySelector("input").checked ? "sí" : "no"}`));
  pasos.ajustes = await filas();
  debe(pasos.ajustes.join() === "Cabina:sí,Lienzo:no,Memoria:no,Chat:sí", `las cuatro, con lo apagado sin marcar (${pasos.ajustes})`);
  await tarjeta.locator(".parte-fila").nth(0).locator("input").click();
  await page.waitForTimeout(300);
  pasos.lasDos = { filas: await filas(), aviso: await tarjeta.locator(".parte-aviso").allTextContents() };
  debe(pasos.lasDos.filas[0] === "Cabina:sí" && /no se pueden apagar a la vez/.test(pasos.lasDos.aviso.join()), `no deja apagar la Cabina con el Lienzo apagado, y dice por qué (${JSON.stringify(pasos.lasDos)})`);
  await tarjeta.locator(".parte-fila").nth(1).locator("input").click();
  await page.waitForTimeout(800);
  pasos.encendido = { cabecera: await pestanas(), rust: await aRust(), montado: await page.locator(".view-lienzo").count() };
  debe(pasos.encendido.cabecera.includes("lienzo") && pasos.encendido.montado === 1 && pasos.encendido.rust.at(-1) === "memoria", `encender el Lienzo lo devuelve entero (${JSON.stringify(pasos.encendido)})`);

  // 3. Apagar la Cabina con dos terminales abiertas: se ve hasta cerrarlas.
  await page.goto("http://localhost:1420/?vez=3&dos");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.locator('[data-tab="ajustes"]').click();
  await tarjeta.waitFor({ timeout: 5000 });
  await tarjeta.locator(".parte-fila").nth(0).locator("input").click();
  await page.waitForTimeout(500);
  pasos.conTerminales = await pestanas();
  debe(pasos.conTerminales.includes("cabina"), `con terminales abiertas la Cabina apagada sigue a la vista (${pasos.conTerminales})`);
  pasos.avisoCabina = (await tarjeta.locator(".parte-aviso").allTextContents()).join();
  debe(/cierres sus 2 terminales abiertas/.test(pasos.avisoCabina), `y Ajustes dice por qué se sigue viendo (${pasos.avisoCabina})`);
  // Al reiniciar con la Cabina apagada, sus paneles no renacen (como los del
  // Lienzo apagado) y lo guardado se queda para cuando vuelva.
  await page.reload();
  await page.locator('[data-tab="lienzo"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  pasos.trasReiniciar = {
    cabecera: await pestanas(),
    guardados: await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-layout") ?? "{}").panes?.length ?? 0),
  };
  debe(!pasos.trasReiniciar.cabecera.includes("cabina") && pasos.trasReiniciar.guardados === 2, `al reiniciar con la Cabina apagada no renacen sus paneles, y siguen guardados (${JSON.stringify(pasos.trasReiniciar)})`);
  // Y una terminal nueva nace en el Lienzo, que es la que queda.
  const nodos = () => page.locator(".view-lienzo .react-flow__node").count();
  const antes = await nodos();
  await page.keyboard.press("Control+Shift+T");
  await page.waitForTimeout(1500);
  pasos.nueva = { antes, despues: await nodos(), vista: await page.evaluate(() => getComputedStyle(document.querySelector(".view-lienzo")).display), cabecera: await pestanas() };
  debe(pasos.nueva.despues === antes + 1 && pasos.nueva.vista === "flex" && !pasos.nueva.cabecera.includes("cabina"), `una terminal nueva nace en el Lienzo (${JSON.stringify(pasos.nueva)})`);

  // 4. La bienvenida pregunta qué usar.
  await page.goto("http://localhost:1420/?vez=4&bienvenida");
  await page.locator(".onb").waitFor({ timeout: 15000 });
  for (let i = 0; i < 3; i++) {
    await page.locator(".onb-pie .np-btn").click();
    await page.waitForTimeout(250);
  }
  pasos.titulo = await page.textContent(".onb-tit");
  const casillas = page.locator(".onb-cuerpo .onb-check");
  pasos.casillas = await casillas.evaluateAll((l) => l.map((c) => `${c.querySelector("strong").textContent}:${c.querySelector("input").checked ? "sí" : "no"}`));
  debe(pasos.titulo === "¿Qué quieres usar?" && pasos.casillas.join() === "Cabina:sí,Lienzo:sí,Memoria:sí,Chat:sí", `el paso de las partes, todas marcadas de fábrica (${pasos.titulo} ${pasos.casillas})`);
  await aRust();
  await casillas.nth(2).locator("input").click();
  await page.waitForTimeout(300);
  pasos.sinMemoria = await aRust();
  debe(pasos.sinMemoria.at(-1) === "memoria", `quitar la Memoria se aplica en el acto (${JSON.stringify(pasos.sinMemoria)})`);
  await casillas.nth(0).locator("input").click();
  await casillas.nth(1).locator("input").click();
  await page.waitForTimeout(300);
  pasos.lasDosBienvenida = { casillas: await casillas.evaluateAll((l) => l.map((c) => c.querySelector("input").checked)), mal: await page.locator(".onb-cuerpo .onb-mal").textContent().catch(() => "") };
  debe(pasos.lasDosBienvenida.casillas.join() === "false,true,false,true" && /no se pueden apagar a la vez/.test(pasos.lasDosBienvenida.mal), `tampoco aquí se apagan las dos de terminales (${JSON.stringify(pasos.lasDosBienvenida)})`);
  return { pasos, fallos };
}
