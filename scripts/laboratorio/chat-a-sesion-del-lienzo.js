// Lo que escribes en el Chat llega a la sesión aunque esté abierta en el Lienzo.
//
// Medido el 2026-10-31: `enviarAlChat` solo buscaba la sesión entre los paneles
// de la Cabina. Si estaba en el Lienzo, la daba por cerrada, llamaba a
// `onResume` (que salta al Lienzo y no abre nada, para no duplicar la sesión),
// esperaba cinco segundos a un panel que nunca nacía en la Cabina y devolvía
// el mensaje a tu caja con el aviso de que no llegó. Y además te sacaba del Chat.
//
// Con Vite en marcha y DESPUÉS de cargar el doble (`doble-conserje.js`), en la
// misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/chat-a-sesion-del-lienzo.js" })
// o, sin el MCP, con un ejecutor que pase `page` a cada fichero.
async (page) => {
  const A = "bbbb1111-2222-4333-8444-000000000001";
  const TITULO = "Sesion en el lienzo";
  const MENSAJE = "hola desde el chat";
  await page.addInitScript(([id, title]) => {
    window.__sesiones.push({ id, cwd: "C:\\proyectos\\Vidorq", title, project: "Vidorq", live: false, estado: "lista", hours: 1 });
  }, [A, TITULO]);
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(4000);
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);

  // 1. Abrir A en el Lienzo desde la barra.
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(1200);
  if (!(await page.locator(`[data-sesion="${A}"]`).count())) {
    await page.locator(".view-cabina .sidebar .project-main", { hasText: "Vidorq" }).first().click();
    await page.waitForTimeout(600);
  }
  await page.locator(`[data-sesion="${A}"] button.session`).first().click();
  await page.waitForTimeout(1500);
  const spawns = await page.evaluate(
    (s) => window.__llamadas.filter(([c, a]) => c === "pty_spawn" && (a.command ?? []).join(" ").includes(s)).map(([, a]) => a),
    A,
  );
  ok("A se abrió una vez en el lienzo", spawns.length === 1, `abiertas: ${spawns.length}`);
  const idPanel = spawns[0]?.id;

  // 2. Escribirle desde el Chat.
  await page.locator('[data-tab="chat"]').first().click();
  await page.waitForTimeout(800);
  await page.locator(".chat-fila", { hasText: TITULO }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".chat-input").fill(MENSAJE);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  const enviados = await page.evaluate(
    (m) => window.__llamadas.filter(([c, a]) => c === "pty_send" && String(a.texto).includes(m)).map(([, a]) => a),
    MENSAJE,
  );
  ok("el mensaje llega a la terminal del lienzo", enviados.length === 1, `pty_send con el texto: ${enviados.length}`);
  ok("y a la de A, no a otra", enviados[0]?.id === idPanel, `id ${enviados[0]?.id} / panel ${idPanel}`);

  // 3. Esperar más que el plazo de antes (5 s): el texto no vuelve a la caja.
  await page.waitForTimeout(5500);
  const enChat = (await page.locator(".chat-input").count()) > 0;
  ok("sigues en el Chat", enChat, "la app saltó a otra vista");
  const caja = enChat ? await page.locator(".chat-input").inputValue() : "(sin chat)";
  ok("el texto no vuelve a la caja", caja === "", `caja: «${caja}»`);
  const aviso = enChat ? await page.locator(".chat-view").innerText() : "";
  ok("sin aviso de que no llegó", !/No pude enviar|no llegó/i.test(aviso));
  ok("A no se abrió otra vez", (await page.evaluate((s) => window.__llamadas.filter(([c, a]) => c === "pty_spawn" && (a.command ?? []).join(" ").includes(s)).length, A)) === 1);
  return r.join("\n");
}
