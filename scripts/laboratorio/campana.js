// La campana de avisos y la mascota, en la ventana de verdad.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/campana.js" })
//
// Siembra un Claude en la Cabina y le hace pasar por lo que pasa un agente: se
// pone a trabajar, pinta un menú de permiso, se le «contesta» y termina. Lo
// que la lógica suelta (`scripts/campana-check.ts`) no puede ver:
//   · La mascota cambia de postura con lo que pasa (trabaja, te espera, terminó)
//     y lleva encima el número de lo que te reclama.
//   · La lista dice qué terminal es y por qué, y pulsar la fila te lleva a ella.
//   · Lo que ya pasó se queda en la lista apagado, y «Ahora» lo esconde.
//   · Cerrar la lista da los avisos por leídos; abrirla, no.
//
// El estado del transcript lo relee cada panel cada veinte segundos, así que
// la prueba tarda cerca de un minuto. Devuelve { pasos, fallos }.
async (page) => {
  const fallos = [];
  const pasos = {};
  const SEMBRADO = JSON.stringify({
    panes: [
      { name: "Adeorq · barra", cwd: "C:\\proyectos\\Adeorq", command: ["cmd.exe", "/k", "chcp 65001 >nul && claude --permission-mode acceptEdits --session-id 11111111-2222-4333-8444-555555555555"] },
    ],
    cols: [{ w: 1, hs: [1], idx: [0] }],
    ocultos: [],
  });
  await page.addInitScript((texto) => {
    try {
      if (sessionStorage.getItem("__sembrar")) localStorage.setItem("adeorq-layout", texto);
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
    window.__estadoPanel = "a_medias";
  }, SEMBRADO);
  await page.evaluate(() => sessionStorage.setItem("__sembrar", "1"));
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.evaluate(() => sessionStorage.removeItem("__sembrar"));

  const animo = () => page.locator(".campana .mascota").getAttribute("data-animo");
  const numero = () => page.locator(".campana-n").textContent({ timeout: 300 }).catch(() => "");
  /** Espera a que la mascota esté de un ánimo, mirando cada medio segundo. */
  const hasta = async (quiero, segundos) => {
    for (let i = 0; i < segundos * 2; i++) {
      if ((await animo()) === quiero) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const filas = () => page.evaluate(() => [...document.querySelectorAll(".avisos .aviso")].map((f) => ({
    tipo: f.dataset.tipo,
    vigente: f.dataset.vigente,
    nuevo: f.dataset.nuevo !== undefined,
    texto: f.innerText.replace(/\s+/g, " ").trim(),
  })));
  const panel = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => a.id)[0]);
  const pintar = (texto) => page.evaluate(([id, t]) => window.__emitir("pty-data", { id, data: t }), [panel, texto]);
  if (panel == null) fallos.push("no nació ninguna terminal: la prueba no prueba nada");

  // 1. Trabajando: postura de trabajo y sin número.
  pasos.trabaja = await hasta("trabaja", 30);
  if (!pasos.trabaja) fallos.push(`con el agente a medias la mascota está «${await animo()}» y no «trabaja»`);
  if (await numero()) fallos.push("hay número en la campana sin que nadie te reclame");

  // 2. Pinta un menú de permiso: te espera, con su número.
  await pintar("\r\n Bash command\r\n   rm -rf dist\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No, and tell Claude what to do differently\r\n");
  pasos.espera = await hasta("espera", 15);
  pasos.numero = await numero();
  if (!pasos.espera) fallos.push(`con un menú en pantalla la mascota está «${await animo()}» y no «espera»`);
  if (pasos.numero !== "1") fallos.push(`la campana lleva «${pasos.numero}» y no «1»`);

  // 3. La lista: qué terminal y por qué. Abrirla no da nada por leído.
  await page.locator(".campana").click();
  await page.waitForTimeout(300);
  pasos.lista = await filas();
  const f = pasos.lista[0];
  if (pasos.lista.length !== 1 || !f) fallos.push(`la lista tiene ${pasos.lista.length} filas y no 1`);
  else {
    if (!/Adeorq · barra/.test(f.texto) || !/te espera/.test(f.texto)) fallos.push(`la fila no dice qué terminal es ni que te espera: «${f.texto}»`);
    if (!/Do you want to proceed/.test(f.texto)) fallos.push(`la fila no dice por qué: «${f.texto}»`);
    if (!f.nuevo || f.vigente !== "true") fallos.push(`la fila no sale como nueva y vigente: ${JSON.stringify(f)}`);
  }
  if ((await numero()) !== "1") fallos.push("abrir la lista quitó el número: se da por leído al cerrar, no al abrir");

  // 4. Pulsar la fila lleva a la terminal y cierra la lista.
  await page.locator('[data-tab="ajustes"]').click({ force: true }).catch(() => {});
  await page.locator(".campana").click();
  await page.waitForTimeout(200);
  if (!(await page.locator(".avisos").count())) await page.locator(".campana").click();
  await page.locator(".avisos .aviso").first().click();
  await page.waitForTimeout(400);
  pasos.vista = await page.evaluate(() => document.querySelector('[data-tab][data-active="true"]')?.dataset.tab);
  if (pasos.vista !== "cabina") fallos.push(`pulsar el aviso deja la vista en «${pasos.vista}» y no en la Cabina`);
  if (await page.locator(".avisos").count()) fallos.push("pulsar el aviso no cierra la lista");
  if (await numero()) fallos.push("tras cerrar la lista sigue el número: no se dieron por leídos");
  if ((await animo()) !== "espera") fallos.push("leído, pero sigue esperándote: la mascota tenía que seguir saludando");

  // 5. Se le contesta: el menú se va y vuelve a trabajar. El aviso pasa a historia.
  await pintar("\x1b[2J\x1b[H✻ Trabajando…\r\n");
  pasos.vuelve = await hasta("trabaja", 20);
  if (!pasos.vuelve) fallos.push(`contestado, la mascota está «${await animo()}» y no «trabaja»`);

  // 6. Termina (lo dice el transcript, que se relee cada 20 s): salta y número.
  await page.evaluate(() => { window.__estadoPanel = "lista"; });
  pasos.termina = await hasta("lista", 45);
  pasos.numeroFin = await numero();
  if (!pasos.termina) fallos.push(`terminado, la mascota está «${await animo()}» y no «lista»`);
  if (pasos.numeroFin !== "1") fallos.push(`al terminar la campana lleva «${pasos.numeroFin}»`);

  // 7. La lista ahora: lo nuevo arriba, lo pasado apagado, y «Ahora» lo esconde.
  await page.locator(".campana").click();
  await page.waitForTimeout(300);
  pasos.listaFin = await filas();
  if (pasos.listaFin.length !== 2) fallos.push(`al final hay ${pasos.listaFin.length} filas y no 2`);
  else {
    if (pasos.listaFin[0].tipo !== "hecho" || pasos.listaFin[0].vigente !== "true") fallos.push(`la primera fila no es el «terminó» vigente: ${JSON.stringify(pasos.listaFin[0])}`);
    if (pasos.listaFin[1].tipo !== "espera" || pasos.listaFin[1].vigente !== "false") fallos.push(`la segunda no es el «te espera» ya pasado: ${JSON.stringify(pasos.listaFin[1])}`);
  }
  await page.locator(".avisos-filtros .choice", { hasText: "Ahora" }).click();
  pasos.soloAhora = (await filas()).length;
  if (pasos.soloAhora !== 1) fallos.push(`«Ahora» enseña ${pasos.soloAhora} y solo una sigue vigente`);
  await page.locator(".avisos-filtros .choice", { hasText: "Todos" }).click();
  await page.locator(".avisos-pie .mini").click();
  pasos.trasQuitar = (await filas()).length;
  if (pasos.trasQuitar !== 1) fallos.push(`«Quitar los que ya pasaron» deja ${pasos.trasQuitar} filas`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (await page.locator(".avisos").count()) fallos.push("Esc no cierra la lista");
  pasos.alFinal = await animo();
  if (pasos.alFinal !== "quieta") fallos.push(`visto todo y nadie trabajando, la mascota está «${pasos.alFinal}» y no «quieta»`);

  return { pasos, fallos };
}
