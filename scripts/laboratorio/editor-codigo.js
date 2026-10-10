// El editor de archivos como editor de código: colores, buscar, ir a una línea,
// corchetes y el ajuste de línea (`lib/editorCodigo.ts`).
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/editor-codigo.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// Monta lo mismo que `editor-se-ve.js` (tres archivos del repo en un panel) y
// comprueba, con teclado de verdad:
//   · Las palabras clave se pintan con el magenta del esquema de la terminal,
//     no con el morado oscuro de CodeMirror que no se leía sobre el cristal.
//   · Cambiar de esquema repinta EN EL MISMO editor (no se monta otro).
//   · Ctrl+F abre el buscador en español y marca lo que encuentra; Esc lo quita.
//   · Ctrl+G lleva a la línea que escribas.
//   · Un paréntesis se cierra solo.
//   · Alt+Z quita y pone el ajuste de línea, y se recuerda.
//   · Un `.rs` y un `.md` también salen coloreados.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const crudo = await (await fetch("http://localhost:1420/scripts/laboratorio/editor-se-ve.js?raw")).text();
  const montar = (0, eval)(`(${(0, eval)(`(${crudo.split("\n")[0].replace(/^export default /, "").replace(/;\s*$/, "")})`)}\n)`);
  await montar(page);

  const hoja = '.ed-hoja[data-visible="true"]';
  const pasos = {};
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  /** El color con que se pinta una palabra del código, buscada por su texto. */
  const colorDe = (palabra) => page.evaluate(([h, p]) => {
    const s = [...document.querySelectorAll(`${h} .cm-line span`)].find((x) => x.textContent === p);
    return s ? getComputedStyle(s).color : null;
  }, [hoja, palabra]);
  const esquema = () => page.evaluate(async () => {
    const m = await import("/src/lib/temasTerm.ts");
    return m.coloresTerm();
  });

  // 1. Los colores salen del esquema de la terminal.
  const casa = await esquema();
  pasos.clave = await colorDe("export");
  if (pasos.clave !== rgb(casa.magenta)) fallos.push(`«export» se pinta ${pasos.clave} y no el magenta del esquema (${rgb(casa.magenta)})`);
  pasos.cadena = await colorDe('"cierre:pedido"');
  if (pasos.cadena !== rgb(casa.green)) fallos.push(`un texto entre comillas se pinta ${pasos.cadena} y no el verde del esquema (${rgb(casa.green)})`);

  // 2. Cambiar de esquema repinta en el mismo editor.
  await page.evaluate((h) => { window.__cm = document.querySelector(`${h} .cm-editor`); }, hoja);
  await page.evaluate(async () => (await import("/src/lib/temasTerm.ts")).guardarTemaTerm("dracula"));
  await page.waitForTimeout(300);
  const otro = await esquema();
  pasos.claveOtro = await colorDe("export");
  if (otro.magenta === casa.magenta) fallos.push("el esquema «dracula» no existe o tiene el mismo magenta: la prueba no prueba nada");
  if (pasos.claveOtro !== rgb(otro.magenta)) fallos.push(`tras cambiar de esquema «export» sigue en ${pasos.claveOtro}`);
  if (!(await page.evaluate((h) => window.__cm === document.querySelector(`${h} .cm-editor`), hoja))) fallos.push("cambiar de esquema montó otro editor: se pierde el cursor y el deshacer");
  await page.evaluate(async () => (await import("/src/lib/temasTerm.ts")).guardarTemaTerm("casa"));

  // 3. Buscar.
  await page.locator(`${hoja} .cm-content`).click();
  await page.keyboard.press("Control+f");
  await page.waitForTimeout(250);
  pasos.buscador = await page.locator(`${hoja} .cm-search`).innerText().catch(() => "");
  if (!/siguiente/.test(pasos.buscador) || !/reemplazar todas/.test(pasos.buscador)) fallos.push(`el buscador no sale o no está en español: «${pasos.buscador.replace(/\s+/g, " ")}»`);
  await page.keyboard.type("AL_CERRAR_KEY");
  await page.waitForTimeout(300);
  pasos.encontradas = await page.locator(`${hoja} .cm-searchMatch`).count();
  if (pasos.encontradas < 2) fallos.push(`buscando AL_CERRAR_KEY marca ${pasos.encontradas} y hay varias`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (await page.locator(`${hoja} .cm-search`).count()) fallos.push("Esc no quita el buscador");

  // 4. Ir a una línea.
  await page.locator(`${hoja} .cm-content`).click();
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(250);
  pasos.irA = await page.locator(`${hoja} .cm-goto-line`).innerText().catch(() => "");
  if (!/Ir a la línea/.test(pasos.irA)) fallos.push(`Ctrl+G no abre «Ir a la línea»: «${pasos.irA}»`);
  await page.keyboard.type("23");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  pasos.linea = await page.locator(`${hoja} .cm-activeLineGutter`).first().innerText().catch(() => "");
  if (pasos.linea.trim() !== "23") fallos.push(`tras ir a la 23 el cursor está en la «${pasos.linea}»`);

  // 5. Un paréntesis se cierra solo (y se deshace para no dejar el archivo tocado).
  await page.keyboard.press("End");
  await page.keyboard.type("(");
  pasos.parentesis = await page.locator(`${hoja} .cm-activeLine`).first().innerText();
  if (!pasos.parentesis.trimEnd().endsWith("()")) fallos.push(`el paréntesis no se cierra solo: «${pasos.parentesis}»`);
  await page.keyboard.press("Control+z");

  // 6. El ajuste de línea.
  const ajustado = () => page.evaluate((h) => document.querySelector(`${h} .cm-content`).classList.contains("cm-lineWrapping"), hoja);
  pasos.ajusteAntes = await ajustado();
  await page.keyboard.press("Alt+z");
  await page.waitForTimeout(200);
  pasos.ajusteDespues = await ajustado();
  pasos.ajusteGuardado = await page.evaluate(() => localStorage.getItem("adeorq-editor-ajuste"));
  if (!pasos.ajusteAntes || pasos.ajusteDespues) fallos.push(`Alt+Z no quita el ajuste (antes ${pasos.ajusteAntes}, después ${pasos.ajusteDespues})`);
  if (pasos.ajusteGuardado !== "0") fallos.push(`no se recuerda: quedó «${pasos.ajusteGuardado}»`);
  await page.keyboard.press("Alt+z");
  await page.waitForTimeout(200);
  if (!(await ajustado())) fallos.push("Alt+Z otra vez no devuelve el ajuste");

  // 7. Los otros dos archivos también tienen color.
  for (const [pestana, palabra] of [["cierre.rs", "pub"], ["ARCHIVOS.md", null]]) {
    await page.locator(".ed-pest", { hasText: pestana }).click();
    await page.waitForTimeout(500);
    const colores = await page.evaluate((h) => new Set([...document.querySelectorAll(`${h} .cm-line span`)].map((s) => getComputedStyle(s).color)).size, hoja);
    pasos[pestana] = colores;
    if (colores < 2) fallos.push(`${pestana} se abre sin colores (${colores})`);
    if (palabra && (await colorDe(palabra)) !== rgb(casa.magenta)) fallos.push(`en ${pestana}, «${palabra}» no va en el magenta del esquema`);
  }

  return { pasos, fallos };
}
