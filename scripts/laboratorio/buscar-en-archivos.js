// «Buscar en los archivos», el tercer modo de la paleta (`Paleta.tsx`,
// `buscar_en_archivos`, `lib/irALinea.ts`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página. Lo que fija:
//   · Ctrl+K trae «Buscar en los archivos», y elegirla cambia la caja de modo;
//   · con una letra no busca, y lo dice;
//   · lo escrito sale con su archivo y su línea;
//   · Enter abre el archivo EN ESA LÍNEA, seleccionada;
//   · y elegir otro sitio del mismo archivo, ya abierto, lo lleva a la suya.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lateral", "archivos");
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "Web · consola", cwd: "C:\\proyectos\\Web" }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
    } catch { /* sin almacenamiento */ }
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(600);
  await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
  await page.waitForTimeout(800);
  const raiz = await page.locator(".arch-raiz").first().getAttribute("data-tip");
  await page.evaluate((R) => {
    const lineas = Array.from({ length: 60 }, (_, i) => `linea ${i + 1}`);
    lineas[41] = "const tesoro = 'aquí';";
    lineas[9] = "// el primer tesoro";
    window.__archivos = { [`${R}\\web\\mapa.ts`]: lineas.join("\n") + "\n" };
    window.__sitios = [
      { ruta: "web/mapa.ts", linea: 10, texto: "// el primer tesoro" },
      { ruta: "web/mapa.ts", linea: 42, texto: "const tesoro = 'aquí';" },
      { ruta: "README.md", linea: 3, texto: "Nada que ver" },
    ];
  }, raiz);
  // Fuera de una terminal, para que Ctrl+K no lo coja la consola.
  await page.locator(".arch-raiz").first().click();

  const abrir = async () => {
    await page.keyboard.press("Control+k");
    await page.locator(".paleta-input").waitFor({ timeout: 3000 });
    await page.keyboard.type("buscar en los");
    await page.waitForTimeout(150);
    pasos.entrada = await page.locator(".paleta-fila").first().innerText();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  };
  await abrir();
  debe(/Buscar en los archivos/.test(pasos.entrada), `Ctrl+K la trae («${pasos.entrada}»)`);
  pasos.placeholder = await page.locator(".paleta-input").getAttribute("placeholder");
  debe(/dentro de los archivos/.test(pasos.placeholder ?? ""), `la caja cambia de modo («${pasos.placeholder}»)`);
  await page.keyboard.type("t");
  await page.waitForTimeout(400);
  pasos.unaLetra = await page.locator(".paleta-vacio").innerText().catch(() => "");
  debe(/dos letras/.test(pasos.unaLetra), `con una letra no busca y lo dice («${pasos.unaLetra}»)`);
  await page.keyboard.type("esoro");
  await page.waitForTimeout(700);
  pasos.filas = await page.locator(".paleta-fila").allInnerTexts();
  debe(pasos.filas.length === 2 && /web\/mapa\.ts:10/.test(pasos.filas[0]) && /web\/mapa\.ts:42/.test(pasos.filas[1]), `salen con su archivo y su línea (${pasos.filas.join(" | ")})`);
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  pasos.leido = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "leer_archivo").map(([, a]) => a.ruta));
  debe(pasos.leido.some((r) => /web\\mapa\.ts$/.test(r)), `abre el archivo entero (${pasos.leido})`);
  const seleccion = () => page.evaluate(() => window.getSelection()?.toString() ?? "");
  pasos.enLinea = await seleccion();
  debe(pasos.enLinea === "const tesoro = 'aquí';", `en su línea, seleccionada («${pasos.enLinea}»)`);

  // Otro sitio del mismo archivo, ya abierto: a la suya, sin volver a cargar.
  await page.locator(".arch-raiz").first().click();
  await abrir();
  await page.keyboard.type("primer tes");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  pasos.otraLinea = await seleccion();
  debe(pasos.otraLinea === "// el primer tesoro", `ya abierto, va a la otra línea («${pasos.otraLinea}»)`);
  await page.screenshot({ path: ".playwright-mcp/buscar-en-archivos.png" });
  return { pasos, fallos };
}
