// Lanzar una nota del lienzo con el botón de la propia nota: en una terminal
// abierta, en una sesión nueva de un proyecto, o repartida por el Capataz.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lanzar-nota.js" })
//
// Monta en el lienzo una terminal de Claude y una nota con una casilla, y mira
// lo que las reglas (`scripts/notas-check.ts`) no pueden ver:
//   · El botón de la nota abre la lista de terminales, con su nombre y su estado.
//   · Elegir una GUARDA la nota (el agente va a abrir el archivo) y luego le
//     escribe el encargo y pulsa Intro.
//   · A una terminal que te está preguntando algo no se le puede lanzar.
//   · Debajo salen los proyectos, con el del lienzo arriba; si la nota nombra
//     uno, ese sube. Elegir uno guarda la nota y abre en SU carpeta una terminal
//     que nace con el encargo dentro y se llama como la nota.
//   · Con dos tareas sin marcar aparece el Capataz, que abre el Reparto con una
//     tarea por línea y no abre ninguna terminal por su cuenta.
//
// Devuelve { pasos, fallos, huella, suma }: `fallos` vacío es que va bien. La
// `huella` es con qué nace la sesión nueva (carpeta, comando sin su id de
// sesión, lo que se apunta y cómo se llama) y `suma` es ella en corto: tienen
// que salir IGUALES antes y después de mover de sitio lo que abre esa sesión.
async (page) => {
  const fallos = [];
  const pasos = {};
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="lienzo"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="lienzo"]').click();
  await page.waitForTimeout(1500);
  await page.locator('.cb-spawn[data-tip^="Nueva sesión de Claude Code aquí"]').first().click();
  await page.waitForTimeout(2500);
  const panel = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => a.id).pop());
  if (panel == null) fallos.push("no nació la terminal del lienzo");

  // La nota, desde «Añadir».
  await page.locator('.cb-btn[data-tip^="Pomodoro"]').click();
  await page.getByText("Nota", { exact: true }).first().click();
  await page.locator(".wdg.note").first().waitFor({ timeout: 8000 });
  const nota = page.locator(".wdg.note").first();
  await nota.locator(".note-body, .note-vacia, .note-text").first().click().catch(() => {});
  await page.waitForTimeout(300);
  const area = nota.locator("textarea").first();
  if (await area.count()) {
    await area.fill("- [ ] revisar el contraste de la web");
    await nota.locator(".note-head").click({ position: { x: 20, y: 8 } });
  } else fallos.push("la nota no deja escribir: no se pudo poner la casilla");
  await page.waitForTimeout(300);

  const textos = (sel) => nota.locator(sel).evaluateAll((bs) => bs.map((b) => `${b.innerText.replace(/\s+/g, " ").trim()}${b.disabled ? " (no)" : ""}`));

  // 1. El botón abre la lista: la terminal, y debajo los proyectos.
  await nota.locator("[data-lanzar]").click();
  await page.waitForTimeout(300);
  pasos.lista = await textos(".note-lanzar [data-terminal]");
  if (pasos.lista.length !== 1) fallos.push(`la lista tiene ${pasos.lista.length} terminales y hay una`);
  pasos.proyectos = await textos(".note-lanzar [data-proyecto]");
  if (pasos.proyectos.join("|") !== "Adeorq el de este lienzo|Vidorq|VoCript") fallos.push(`los proyectos no salen con el del lienzo arriba: ${pasos.proyectos.join("|")}`);
  if (await nota.locator("[data-repartir]").count()) fallos.push("con una sola tarea se ofrece repartir");

  // 2. Elegirla: guarda y manda, con Intro.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator(".note-lanzar [data-terminal]").first().click();
  await page.waitForTimeout(800);
  const llamadas = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "note_write" || c === "pty_send").map(([c, a]) => ({ c, id: a.id, enviar: a.enviar, texto: (a.texto ?? a.text ?? "").slice(0, 400) })));
  pasos.llamadas = llamadas.map((l) => `${l.c}${l.c === "pty_send" ? `→${l.id}${l.enviar ? " con Intro" : ""}` : ""}`);
  const envio = llamadas.find((l) => l.c === "pty_send");
  if (pasos.llamadas[0] !== "note_write") fallos.push(`no se guarda la nota antes de lanzarla (${pasos.llamadas.join(", ")})`);
  if (!envio || envio.id !== panel || !envio.enviar) fallos.push(`no se le manda a la terminal ${panel} con Intro (${JSON.stringify(pasos.llamadas)})`);
  if (envio && (!/Estás conectado a mi nota/.test(envio.texto) || !/revisar el contraste/.test(envio.texto))) fallos.push(`el encargo no trae la nota: «${envio.texto.slice(0, 120)}»`);
  pasos.dicho = await nota.locator(".note-dicho").innerText().catch(() => "");
  if (!/Lanzada/.test(pasos.dicho)) fallos.push(`la nota no dice que se lanzó («${pasos.dicho}»)`);
  if (await nota.locator(".note-lanzar").count()) fallos.push("la lista sigue abierta tras lanzar");

  // 3. A una que te pregunta algo, no.
  await page.evaluate((id) => window.__emitir("pty-data", { id, data: "\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No, and tell Claude what to do differently\r\n" }), panel);
  let bloqueada = "";
  for (let i = 0; i < 30 && !/\(no\)/.test(bloqueada); i++) {
    await page.waitForTimeout(500);
    if (!(await nota.locator(".note-lanzar").count())) await nota.locator("[data-lanzar]").click();
    bloqueada = (await textos(".note-lanzar [data-terminal]")).join();
  }
  pasos.preguntando = bloqueada;
  if (!/te está preguntando algo \(no\)/.test(bloqueada)) fallos.push(`a la que pregunta se le puede lanzar: «${bloqueada}»`);
  await nota.locator("[data-lanzar]").click();

  // 4. Una segunda tarea que nombra un proyecto: ese sube, y aparece el Capataz.
  await nota.locator(".note-body").first().click();
  await page.waitForTimeout(300);
  await nota.locator("textarea").first().fill("- [ ] revisar el contraste de la web\n- [ ] el dictado de vocript, que se corta");
  await nota.locator(".note-head").click({ position: { x: 20, y: 8 } });
  await page.waitForTimeout(300);
  await nota.locator("[data-lanzar]").click();
  await page.waitForTimeout(300);
  pasos.nombrado = await textos(".note-lanzar [data-proyecto]");
  if (pasos.nombrado[0] !== "VoCript lo nombra la nota") fallos.push(`el proyecto que la nota nombra no sube: ${pasos.nombrado.join("|")}`);
  pasos.capataz = (await textos(".note-lanzar [data-repartir]")).join();
  if (pasos.capataz !== "Repartir las 2 tareas Capataz") fallos.push(`con dos tareas no se ofrece el Capataz: «${pasos.capataz}»`);

  // 5. Una sesión nueva en otro proyecto: guarda, y nace allí con el encargo.
  const nombres = () => page.locator(".react-flow__node .pane-name").evaluateAll((ns) => ns.map((n) => n.innerText.trim()));
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator('.note-lanzar [data-proyecto="Vidorq"]').click();
  // La frase dura cuatro segundos: se lee nada más salir, no al final.
  for (let i = 0; i < 15 && !pasos.dichoNueva; i++) {
    await page.waitForTimeout(200);
    pasos.dichoNueva = await nota.locator(".note-dicho").innerText().catch(() => "");
  }
  await page.waitForTimeout(2500);
  // Fuera lo que cambia en cada pasada: el id de la sesión y el del archivo de la nota.
  const sinId = (s) => String(s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<sesión>").replace(/(notas\\+)[a-z0-9]+(\.md)/g, "$1<nota>$2");
  const nueva = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => ["note_write", "pty_spawn", "save_encargo"].includes(c)).map(([c, a]) => ({ c, cwd: a.cwd, command: a.command, env: a.env, todo: c === "save_encargo" ? a : null })));
  pasos.nueva = nueva.map((l) => l.c);
  const nace = nueva.find((l) => l.c === "pty_spawn");
  const apunta = nueva.find((l) => l.c === "save_encargo");
  if (pasos.nueva[0] !== "note_write") fallos.push(`no se guarda la nota antes de abrir la sesión (${pasos.nueva.join(", ")})`);
  if (!nace) fallos.push("no nació ninguna terminal para la nota");
  else {
    if (nace.cwd !== "C:\\proyectos\\Vidorq") fallos.push(`la sesión nace en ${nace.cwd} y se eligió Vidorq`);
    const linea = (nace.command ?? []).join(" ");
    if (!/Estás conectado a mi nota/.test(linea) || !/dictado de vocript/.test(linea)) fallos.push(`la sesión nace sin el encargo dentro: «${linea.slice(0, 160)}»`);
  }
  if (!/Abriendo una sesión en Vidorq/.test(pasos.dichoNueva ?? "")) fallos.push(`la nota no dice dónde la abre («${pasos.dichoNueva}»)`);
  pasos.terminales = await nombres();
  // Se llama como la nota (sin título, como su primera tarea) y se apunta lo
  // que escribiste: el envoltorio del encargo no es ni nombre ni descripción.
  if (!pasos.terminales.some((n) => /revisar el contraste/.test(n))) fallos.push(`la sesión no se llama como la nota: ${pasos.terminales.join(" | ")}`);
  if (pasos.terminales.some((n) => /Estás conectado/.test(n))) fallos.push(`la sesión se llama como el envoltorio del encargo: ${pasos.terminales.join(" | ")}`);
  pasos.apuntado = apunta?.todo?.encargo?.encargo ?? "";
  if (!/dictado de vocript/.test(pasos.apuntado) || /Archivo:|edita ese archivo/.test(pasos.apuntado)) fallos.push(`lo que se apunta de la sesión no es lo que escribiste: «${pasos.apuntado.slice(0, 120)}»`);
  pasos.modelo = (nace?.command ?? []).join(" ").match(/--model (\S+)/)?.[1] ?? "";
  const huella = {
    cwd: nace?.cwd,
    command: (nace?.command ?? []).map(sinId),
    env: nace?.env ?? null,
    apunta: apunta ? JSON.parse(sinId(JSON.stringify(apunta.todo)).replace(/"cuando":"[^"]*"/, '"cuando":"<hora>"')) : null,
    terminales: pasos.terminales,
  };

  // 6. El Capataz: abre el Reparto con una tarea por línea, y nada más.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator("[data-lanzar]").click();
  await nota.locator("[data-repartir]").click();
  await page.waitForTimeout(1200);
  pasos.reparto = await page.locator("textarea").evaluateAll((as) => as.map((a) => a.value).filter((v) => /contraste/.test(v)));
  if (pasos.reparto.join() !== "revisar el contraste de la web\nel dictado de vocript, que se corta") fallos.push(`el Reparto no se abre con las dos tareas: ${JSON.stringify(pasos.reparto)}`);
  pasos.alRepartir = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "pty_spawn").length);
  if (pasos.alRepartir) fallos.push("pedir el Reparto abre terminales antes de que digas que sí");

  // La misma huella en corto, para compararla de un vistazo entre dos pasadas.
  let suma = 5381;
  for (const c of JSON.stringify(huella)) suma = ((suma * 33) ^ c.codePointAt(0)) >>> 0;
  return { pasos, fallos, huella, suma: suma.toString(16) };
}
