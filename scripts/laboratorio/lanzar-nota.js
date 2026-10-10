// Lanzar una nota del lienzo en una terminal, con el botón de la propia nota.
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
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
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

  // 1. El botón abre la lista, con la terminal dentro.
  await nota.locator("[data-lanzar]").click();
  await page.waitForTimeout(300);
  pasos.lista = await nota.locator(".note-lanzar button").evaluateAll((bs) => bs.map((b) => `${b.innerText.replace(/\s+/g, " ").trim()}${b.disabled ? " (no)" : ""}`));
  if (pasos.lista.length !== 1) fallos.push(`la lista tiene ${pasos.lista.length} terminales y hay una`);

  // 2. Elegirla: guarda y manda, con Intro.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator(".note-lanzar button").first().click();
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
    bloqueada = (await nota.locator(".note-lanzar button").evaluateAll((bs) => bs.map((b) => `${b.innerText.replace(/\s+/g, " ").trim()}${b.disabled ? " (no)" : ""}`))).join();
  }
  pasos.preguntando = bloqueada;
  if (!/te está preguntando algo \(no\)/.test(bloqueada)) fallos.push(`a la que pregunta se le puede lanzar: «${bloqueada}»`);

  return { pasos, fallos };
}
