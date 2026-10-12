// Una terminal de Codex que termina su turno avisa, como una de Claude.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/codex-estado.js" })
//
// Hasta el 2026-10-11 el panel solo leía el transcript de Claude: uno de Codex
// no decía nunca si trabajaba o había acabado, así que ni Adeo ni la campana se
// enteraban. Ahora, en cuanto el panel sabe su sesión (`codex_session_since`,
// que el doble da a la segunda pregunta), lee su estado con `codex_context`.
//
// Siembra un Codex en la Cabina y mira, en la ventana de verdad:
//   · Que se pregunte `codex_context` con la sesión aprendida, no con otra.
//   · Que a medias Adeo teclee, y al terminar salte con «1» en la campana.
//   · Que la fila del aviso diga que es ese Codex y que terminó.
//   · Que la cabecera no pinte ningún porcentaje de contexto, que de Codex no se cuenta.
//
// Con `{ antes: true }` hace como si `codex_context` no existiera, para ver el
// fallo de antes: el banco tiene que salir en rojo así. Tarda cerca de un minuto.
async (page, opciones = {}) => {
  const fallos = [];
  const pasos = {};
  const SID = "01a0cafe-0d0b-7201-b479-050ab2e5bde8";
  const SEMBRADO = JSON.stringify({
    panes: [{ name: "Adeorq · codex", cwd: "C:\\proyectos\\Adeorq", command: ["cmd.exe", "/k", "chcp 65001 >nul && codex"] }],
    cols: [{ w: 1, hs: [1], idx: [0] }],
    ocultos: [],
  });
  await page.addInitScript(([texto, antes]) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
    window.__estadoCodex = "a_medias";
    window.__sinCodexContext = antes;
  }, [SEMBRADO, !!opciones.antes]);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));

  const animo = () => page.locator(".campana .mascota").getAttribute("data-animo");
  const numero = () => page.locator(".campana-n").textContent({ timeout: 300 }).catch(() => "");
  const hasta = async (quiero, segundos) => {
    for (let i = 0; i < segundos * 2; i++) {
      if ((await animo()) === quiero) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const nacio = await page.evaluate(() => window.__llamadas.some(([c]) => c === "pty_spawn"));
  if (!nacio) fallos.push("no nació ninguna terminal: la prueba no prueba nada");

  // 1. Aprende su sesión y se pone a trabajar. La sesión llega a los ~20 s.
  pasos.trabaja = await hasta("trabaja", 40);
  pasos.preguntas = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "codex_context").map(([, a]) => a.sessionId));
  if (!pasos.trabaja) fallos.push(`con Codex a medias Adeo está «${await animo()}» y no «trabaja»`);
  if (!opciones.antes && !pasos.preguntas.length) fallos.push("nadie preguntó por el estado de la sesión de Codex");
  if (pasos.preguntas.some((s) => s !== SID)) fallos.push(`se preguntó por otra sesión: ${pasos.preguntas.join(", ")}`);

  // 2. Termina su turno: salta, con un aviso que dice quién.
  await page.evaluate(() => { window.__estadoCodex = "lista"; });
  pasos.termina = await hasta("lista", 30);
  pasos.numero = await numero();
  if (!pasos.termina) fallos.push(`terminado, Adeo está «${await animo()}» y no «lista»`);
  if (pasos.numero !== "1") fallos.push(`al terminar la campana lleva «${pasos.numero}» y no «1»`);
  await page.locator(".campana").click();
  await page.waitForTimeout(300);
  pasos.filas = await page.evaluate(() => [...document.querySelectorAll(".avisos .aviso")].map((f) => ({ tipo: f.dataset.tipo, texto: f.innerText.replace(/\s+/g, " ").trim() })));
  const f = pasos.filas[0];
  if (!f || f.tipo !== "hecho" || !/codex/i.test(f.texto)) fallos.push(`el aviso no dice que ese Codex terminó: ${JSON.stringify(pasos.filas)}`);
  await page.keyboard.press("Escape");

  // 3. Ningún porcentaje inventado en su cabecera.
  pasos.contexto = await page.locator(".pane-ctx").count();
  if (pasos.contexto) fallos.push("la cabecera del Codex pinta un porcentaje de contexto");

  return { pasos, fallos };
}
