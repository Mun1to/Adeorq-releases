// Ajustes > Terminales > Valla del ratón (`AjustesValla.tsx`, `valla.rs`), con el doble:
// tres pantallas y dos ventanas de mentira, y la valla que se pone, se quita y se suelta
// sola. Ningún ratón de verdad se toca: los `valla_*` los contesta este guion.
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ajustes-valla.js
// (carga el doble él mismo). Con FOTO=<carpeta> deja una foto de la tarjeta en cada paso.
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const foto = globalThis.process?.env?.FOTO;

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });

  // Detrás del doble: los comandos de la valla, con la forma del serde de `valla.rs`.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lang", "es");
      localStorage.setItem("adeorq-ajustes-seccion", "terminales");
    } catch { /* sin almacén */ }
    const sitios = {
      pantallas: [
        { n: 1, ancho: 2560, alto: 1440, principal: false, raton: false },
        { n: 2, ancho: 1920, alto: 1080, principal: true, raton: true },
        { n: 3, ancho: 1920, alto: 1080, principal: false, raton: false },
      ],
      ventanas: [
        { id: 1001, titulo: "adeorq.com y 3 pestañas más", app: "brave" },
        { id: 1002, titulo: "Visual Studio Code", app: "Code" },
      ],
    };
    const estado = { disponible: true, puesta: null, motivo: null };
    window.__valla = [];
    const doble = window.__TAURI_INTERNALS__;
    const antes = doble.invoke;
    doble.invoke = (cmd, args) => {
      if (!cmd.startsWith("valla_")) return antes(cmd, args);
      window.__valla.push([cmd, args]);
      if (cmd === "valla_sitios") return Promise.resolve(sitios);
      if (cmd === "valla_poner") {
        const v = sitios.ventanas.find((x) => x.id === args.ventana);
        estado.puesta = args.pantalla != null
          ? { pantalla: args.pantalla, ventana: null, nombre: `la pantalla ${args.pantalla}` }
          : { pantalla: null, ventana: args.ventana, nombre: v.titulo };
        estado.motivo = null;
      }
      if (cmd === "valla_quitar") Object.assign(estado, { puesta: null, motivo: "pedido" });
      return Promise.resolve({ ...estado });
    };
    window.__soltarValla = () => {
      Object.assign(estado, { puesta: null, motivo: "ventanaFuera" });
      window.__emitir("valla", { ...estado });
    };
  });

  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
  const tarjeta = page.locator(".panel-card", { has: page.locator("h2", { hasText: "Valla del ratón" }) });
  await tarjeta.waitFor({ state: "visible", timeout: 10000 });
  const leer = () => tarjeta.evaluate((t) => ({
    texto: t.textContent.replace(/\s+/g, " ").trim(),
    filas: [...t.querySelectorAll(".mcp-cliente")].map((f) => f.textContent.replace(/\s+/g, " ").trim()),
  }));
  const retratar = async (n) => { if (foto) await tarjeta.screenshot({ path: `${foto}/valla-${n}.png` }); };

  pasos.inicio = await leer();
  await retratar("1-inicio");
  debe(pasos.inicio.texto.includes("Ctrl+Alt+L"), "no dice con qué atajo se quita");
  debe(pasos.inicio.filas.length === 4, `tendría que haber tres pantallas y «Una ventana», y hay ${pasos.inicio.filas.length} filas`);
  debe(pasos.inicio.filas[1]?.includes("1920 × 1080, la principal, aquí tienes el ratón"), "la pantalla 2 no dice que es la principal y que tiene el ratón");

  await tarjeta.locator(".mcp-cliente", { hasText: "Pantalla 2" }).getByRole("button", { name: "Encerrar aquí" }).click();
  await page.waitForTimeout(300);
  pasos.puesta = await leer();
  await retratar("2-pantalla");
  debe(pasos.puesta.filas[1]?.includes("Puesta: el ratón no sale de esta pantalla.Quitar"), "tras ponerla, su fila no dice que está puesta ni se quita desde ahí");
  debe(pasos.puesta.filas.length === 4, "con la valla puesta tienen que seguir las demás filas, para cambiarla de sitio");
  const poner = await page.evaluate(() => window.__valla.find(([c]) => c === "valla_poner")?.[1]);
  debe(poner?.pantalla === 2 && poner?.ventana === null, `valla_poner llegó con ${JSON.stringify(poner)}`);

  await tarjeta.getByRole("button", { name: "Quitar" }).click();
  await page.waitForTimeout(300);
  pasos.quitada = await leer();
  debe(pasos.quitada.filas.length === 4 && !pasos.quitada.texto.includes("Puesta en"), "al quitarla no vuelven las pantallas");

  await tarjeta.getByRole("button", { name: "Elegir" }).click();
  await page.waitForTimeout(300);
  pasos.ventanas = await leer();
  await retratar("3-ventanas");
  debe(pasos.ventanas.filas.some((f) => f.includes("Visual Studio Code") && f.includes("Code")), "no salen las ventanas con su programa");
  pasos.ventanasAparte = await tarjeta.evaluate((t) => t.querySelectorAll(":scope > .cab-lista > .mcp-cliente").length);
  debe(pasos.ventanasAparte === 2, "las ventanas no van en su propio bloque: se mezclan con las pantallas");

  await tarjeta.locator(".mcp-cliente", { hasText: "Visual Studio Code" }).getByRole("button", { name: "Encerrar aquí" }).click();
  await page.waitForTimeout(300);
  pasos.ventana = await leer();
  await retratar("4-ventana");
  debe(pasos.ventana.texto.includes("«Visual Studio Code»Puesta: se suelta sola"), "en una ventana no dice cuál ni que se suelta sola");
  debe(pasos.ventana.filas.length === 4, "con la ventana elegida, la lista se cierra y quedan las cuatro filas");

  // Rust la suelta (la ventana se minimizó) y avisa: la tarjeta lo dice sin tocar nada.
  await page.evaluate(() => window.__soltarValla());
  await page.waitForTimeout(300);
  pasos.sola = await leer();
  await retratar("5-sola");
  debe(pasos.sola.texto.includes("Se quitó sola: la ventana se minimizó o se cerró."), "no dice que se soltó sola");

  return { pasos, fallos };
}
