// Importar un tema de Warp o de Ghostty, en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/temas-de-fuera.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// El lector tiene su banco (`scripts/temas-de-fuera-check.ts`); aquí se prueba
// lo que pasa alrededor, con archivos elegidos de verdad en Ajustes › Aspecto:
//   · Un tema de Ghostty entra, sale su tarjeta, queda puesto, y los colores
//     que usarán las terminales son los suyos.
//   · Sigue ahí al recargar.
//   · Uno de fondo claro y un archivo cualquiera se rechazan diciendo por qué,
//     y no dejan tarjeta.
//   · Quitar el que está puesto vuelve al esquema de la casa.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("banco-temas")) {
      localStorage.clear();
      sessionStorage.setItem("banco-temas", "1");
    }
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "list_projects": return [];
        case "cierre_puede_fondo": return true;
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

  const paleta = ["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2", "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"];
  const ghostty = `${paleta.map((c, i) => `palette = ${i}=${c}`).join("\n")}\nbackground = #282a36\nforeground = #f8f8f2\ncursor-color = #f8f8f2\ncursor-text = #282a36\nselection-background = #44475a\n`;
  const nombres = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
  const warpClaro = `accent: "#268bd2"\nbackground: "#fdf6e3"\ndetails: lighter\nforeground: "#586e75"\nterminal_colors:\n  normal:\n${nombres.map((n, i) => `    ${n}: "${paleta[i]}"`).join("\n")}\n  bright:\n${nombres.map((n, i) => `    ${n}: "${paleta[i + 8]}"`).join("\n")}\n`;
  const archivo = (name, texto) => ({ name, mimeType: "text/plain", buffer: Buffer.from(texto, "utf8") });

  const aAspecto = async () => {
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="ajustes"]').waitFor({ timeout: 15000 });
    await page.locator('[data-tab="ajustes"]').click();
    await page.locator(".set-tab", { hasText: "Aspecto" }).first().click();
    await page.locator("[data-importados]").waitFor({ timeout: 8000 });
  };
  const tarjetas = () => page.evaluate(() => [...document.querySelectorAll("[data-importados] [data-tema-term]")].map((b) => `${b.dataset.temaTerm}${b.dataset.on === "true" ? "*" : ""}`));
  const partes = () => page.evaluate(() => [...document.querySelectorAll(".term-partes li")].map((l) => `${l.dataset.ok}: ${l.textContent}`));
  const puesto = () => page.evaluate(() => localStorage.getItem("adeorq-tema-terminal"));
  const colores = () => page.evaluate(async () => {
    const m = await import("/src/lib/temasTerm.ts");
    const c = m.coloresTerm();
    return `${c.foreground} ${c.red} ${c.brightBlack} ${c.selectionBackground}`;
  });
  const pasos = {};

  await page.setViewportSize({ width: 1920, height: 1000 });
  await aAspecto();
  pasos.alEmpezar = await tarjetas();
  if (pasos.alEmpezar.length) fallos.push("ya había importados: la prueba no empieza limpia");
  const deLaCasa = await colores();

  // 1. Un tema de Ghostty entra y queda puesto.
  await page.locator("[data-traer-tema]").setInputFiles(archivo("Dracula", ghostty));
  await page.waitForTimeout(500);
  pasos.trasImportar = await tarjetas();
  pasos.parte = await partes();
  pasos.puesto = await puesto();
  pasos.colores = await colores();
  if (pasos.trasImportar.join() !== "imp-dracula*") fallos.push(`tras importar hay «${pasos.trasImportar.join()}» y no «imp-dracula*»`);
  if (pasos.puesto !== "imp-dracula") fallos.push(`quedó puesto «${pasos.puesto}»`);
  if (pasos.colores !== "#f8f8f2 #ff5555 #6272a4 #44475a") fallos.push(`las terminales usarían «${pasos.colores}»`);
  if (pasos.colores === deLaCasa) fallos.push("los colores no cambiaron respecto a los de la casa");
  if (!/^true: Dracula importado, era de Ghostty/.test(pasos.parte[0] ?? "")) fallos.push(`el parte dice «${pasos.parte.join(" | ")}»`);

  // 2. Sigue ahí al recargar.
  await aAspecto();
  pasos.trasRecargar = await tarjetas();
  if (pasos.trasRecargar.join() !== "imp-dracula*") fallos.push(`al recargar hay «${pasos.trasRecargar.join()}»`);

  // 3. Uno de fondo claro y un archivo cualquiera, los dos a la vez.
  await page.locator("[data-traer-tema]").setInputFiles([archivo("solarized_light.yaml", warpClaro), archivo("notas.txt", "esto no es un tema")]);
  await page.waitForTimeout(500);
  pasos.rechazos = await partes();
  if (!/^false: solarized_light\.yaml.*fondo claro/.test(pasos.rechazos[0] ?? "")) fallos.push(`el claro no se rechaza bien: «${pasos.rechazos[0]}»`);
  if (!/^false: notas\.txt.*No es un tema/.test(pasos.rechazos[1] ?? "")) fallos.push(`el archivo cualquiera no se rechaza bien: «${pasos.rechazos[1]}»`);
  if ((await tarjetas()).join() !== "imp-dracula*") fallos.push("un rechazado dejó tarjeta o quitó la que había");

  // 4. Quitar el que está puesto vuelve al de la casa.
  await page.locator(".term-importado").first().hover();
  await page.locator(".term-quitar").first().click();
  await page.waitForTimeout(300);
  pasos.trasQuitar = await tarjetas();
  pasos.puestoAlFinal = await puesto();
  if (pasos.trasQuitar.length) fallos.push(`tras quitar queda «${pasos.trasQuitar.join()}»`);
  if (pasos.puestoAlFinal !== "casa") fallos.push(`tras quitar el puesto queda «${pasos.puestoAlFinal}» y no «casa»`);
  if ((await colores()) !== deLaCasa) fallos.push("tras quitarlo las terminales no vuelven a los colores de la casa");
  if (!(await page.locator('[data-tema-term="casa"][data-on="true"]').count())) fallos.push("la tarjeta de la casa no queda marcada");

  return { pasos, fallos };
}
