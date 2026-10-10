// El aviso al cerrar la ventana, en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/al-cerrar.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Rust (`cierre.rs`) para el cierre y manda `cierre:pedido`; aquí se hace de
// Rust con un doble que apunta qué comandos le llegan. Lo que se prueba, que la
// lógica suelta (`scripts/al-cerrar-check.ts`) no puede ver:
//   · Sin terminales, la X cierra sin preguntar.
//   · Con terminales sale el aviso, dice cuántas hay, y Esc lo quita sin tocar nada.
//   · «Seguir en segundo plano» manda esconder la ventana con sus tres textos.
//   · «No volver a preguntar» + «Cerrar todo» deja fijado el cierre: la X
//     siguiente ya no pregunta.
//   · Fijado a segundo plano, si esconder falla, la X no se queda en nada: sale
//     el aviso con el motivo.
//   · El ajuste de Ajustes › Terminales cambia lo fijado.
//   · La ventana contesta SIEMPRE «te oigo» (`cierre_acuse`): sin eso el seguro
//     de Rust cerraría la app al segundo y medio.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    const vacio = new URLSearchParams(location.search).has("vacio");
    // Lo fijado tiene que sobrevivir de una X a la siguiente: solo se limpia
    // al entrar, no en cada recarga del banco.
    if (!sessionStorage.getItem("banco-al-cerrar")) {
      localStorage.clear();
      sessionStorage.setItem("banco-al-cerrar", "1");
    }
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    if (vacio) localStorage.removeItem("adeorq-layout");
    else
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [
          { name: "Adeorq · uno", cwd: "C:\\proyectos\\Adeorq" },
          { name: "Adeorq · dos", cwd: "C:\\proyectos\\Adeorq" },
        ],
        cols: [{ w: 0.5, hs: [1], idx: [0] }, { w: 0.5, hs: [1], idx: [1] }],
      }));
    window.__llegan = [];
    window.__fallaFondo = false;
    const oyentes = {};
    window.__emitir = (evento, payload = null) => {
      for (const h of oyentes[evento] ?? []) window[`_${h}`]?.({ event: evento, id: h, payload });
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    let escucha = 1;
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "cierre_puede_fondo": return true;
        case "cierre_acuse":
        case "cierre_salir":
          window.__llegan.push(cmd);
          return null;
        case "cierre_a_fondo":
          window.__llegan.push(`${cmd}:${args.abrir}|${args.salir}|${args.pista}`);
          if (window.__fallaFondo) throw new Error("la bandeja no contestó");
          return null;
        default:
          throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window[`_${id}`] = cb;
          return id;
        },
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });

  const pasos = {};
  const aviso = () => page.locator(".al-cerrar").count().then((n) => n > 0);
  const llegan = () => page.evaluate(() => window.__llegan.splice(0));
  const fijado = () => page.evaluate(() => localStorage.getItem("adeorq-al-cerrar"));
  const laX = async () => {
    await page.evaluate(() => window.__emitir("cierre:pedido"));
    await page.waitForTimeout(350);
  };
  const abrir = async (ruta) => {
    await page.goto(`http://localhost:1420/${ruta}`);
    await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
    await page.locator('[data-tab="cabina"]').click();
    await page.waitForTimeout(2500);
    await llegan();
  };

  await page.setViewportSize({ width: 1920, height: 1000 });

  // 1. Sin terminales: cierra sin preguntar.
  await abrir("?vacio");
  pasos.panelesVacio = await page.locator(".pane-head").count();
  if (pasos.panelesVacio) fallos.push(`el caso vacío tiene ${pasos.panelesVacio} terminales: no prueba nada`);
  await laX();
  pasos.vacio = await llegan();
  if (await aviso()) fallos.push("sin terminales sale el aviso");
  if (pasos.vacio.join() !== "cierre_acuse,cierre_salir") fallos.push(`sin terminales llega «${pasos.vacio.join()}» y no «cierre_acuse,cierre_salir»`);

  // 2. Con dos terminales: pregunta, dice cuántas y Esc lo quita sin tocar nada.
  await abrir("");
  pasos.paneles = await page.locator(".pane-head").count();
  if (pasos.paneles !== 2) fallos.push(`hay ${pasos.paneles} terminales y no 2`);
  await laX();
  if (!(await aviso())) fallos.push("con terminales no sale el aviso");
  pasos.texto = await page.locator(".al-cerrar .modal-text").first().textContent().catch(() => "");
  if (!/2 terminales abiertas/.test(pasos.texto)) fallos.push(`el aviso no dice cuántas hay: «${pasos.texto}»`);
  pasos.foco = await page.evaluate(() => document.activeElement?.dataset.paso ?? document.activeElement?.tagName);
  if (pasos.foco !== "fondo") fallos.push(`el teclado no nace en «Seguir en segundo plano» (${pasos.foco})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  if (await aviso()) fallos.push("Esc no quita el aviso");
  pasos.trasEsc = await llegan();
  if (pasos.trasEsc.join() !== "cierre_acuse") fallos.push(`tras cancelar llegó «${pasos.trasEsc.join()}»: solo debía llegar el acuse`);

  // 3. «Seguir en segundo plano».
  await laX();
  await page.locator('.al-cerrar [data-paso="fondo"]').click();
  await page.waitForTimeout(300);
  pasos.fondo = await llegan();
  if (pasos.fondo[1] !== "cierre_a_fondo:Abrir Adeorq|Cerrar Adeorq del todo|Adeorq sigue en segundo plano") fallos.push(`a segundo plano llega «${pasos.fondo.join()}»`);
  if (await aviso()) fallos.push("tras esconderse sigue el aviso");
  if (await fijado()) fallos.push("se fijó algo sin marcar «no volver a preguntar»");

  // 4. «No volver a preguntar» + «Cerrar todo»: queda fijado.
  await laX();
  await page.locator(".al-cerrar-fijar input").check();
  await page.locator('.al-cerrar [data-paso="cerrar"]').click();
  await page.waitForTimeout(300);
  pasos.cerrar = await llegan();
  pasos.fijado = await fijado();
  if (pasos.cerrar.join() !== "cierre_acuse,cierre_salir") fallos.push(`«Cerrar todo» manda «${pasos.cerrar.join()}»`);
  if (pasos.fijado !== "cerrar") fallos.push(`quedó fijado «${pasos.fijado}» y no «cerrar»`);
  await abrir("");
  await laX();
  pasos.yaFijado = await llegan();
  if (await aviso()) fallos.push("con el cierre fijado vuelve a preguntar");
  if (pasos.yaFijado.join() !== "cierre_acuse,cierre_salir") fallos.push(`con el cierre fijado llega «${pasos.yaFijado.join()}»`);

  // 5. El ajuste, en Ajustes › Terminales.
  await page.locator('[data-tab="ajustes"]').click();
  await page.locator(".set-tab", { hasText: "Terminales" }).first().click();
  await page.waitForTimeout(400);
  pasos.ajuste = await page.evaluate(() => [...document.querySelectorAll("[data-al-cerrar]")].map((b) => `${b.dataset.alCerrar}${b.dataset.on === "true" ? "*" : ""}`));
  if (pasos.ajuste.join() !== "preguntar,fondo,cerrar*") fallos.push(`el ajuste enseña «${pasos.ajuste.join()}»`);
  await page.locator('[data-al-cerrar="fondo"]').click();
  if ((await fijado()) !== "fondo") fallos.push("el ajuste no cambia lo fijado");

  // 6. Fijado a segundo plano: se esconde sin preguntar, y si falla, pregunta.
  await laX();
  pasos.fondoFijado = await llegan();
  if (await aviso()) fallos.push("fijado a segundo plano, pregunta");
  if (!/^cierre_a_fondo:/.test(pasos.fondoFijado[1] ?? "")) fallos.push(`fijado a segundo plano llega «${pasos.fondoFijado.join()}»`);
  await page.evaluate(() => { window.__fallaFondo = true; });
  await laX();
  pasos.falloVisible = (await aviso()) ? await page.locator(".al-cerrar .modal-warn-note").textContent().catch(() => "") : "(sin aviso)";
  if (!/la bandeja no contestó/.test(pasos.falloVisible)) fallos.push(`si esconder falla, la X se queda en nada o sin motivo: «${pasos.falloVisible}»`);

  return { pasos, fallos };
}
