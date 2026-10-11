// Qué se ve mientras algo tarda, en una pantalla de verdad (`lib/espera.ts`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// Abre el panel de Archivos tres veces, haciendo que la lectura de la carpeta
// tarde 60, 450 y 2.400 milisegundos, y mira la pantalla cada 25 ms. Lo que la
// cuenta suelta (`scripts/espera-check.ts`) no puede ver:
//   · Si llega en un suspiro o en medio segundo, el «Leyendo…» no sale NUNCA.
//     Antes salía en el acto y se iba: un parpadeo.
//   · Si tarda de verdad, la rueda sale con su texto pasado el segundo, no
//     antes, y se va en cuanto llega la carpeta.
//
// Lo que no mira: el apagado de entre la décima y el segundo. En una lista que
// todavía está vacía no hay nada que apagar; se ve en la guía al cambiar de
// idioma, que conserva el texto anterior.
//
// Devuelve { casos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const casos = {};
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lateral", "archivos");
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "Web · consola", cwd: "C:\\proyectos\\Web" }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
    } catch { /* sin almacenamiento */ }
    // La lectura de la carpeta tarda lo que diga la prueba, y apunta cuándo se
    // pidió y cuándo llegó. El panel la pide solo, nada más montarse, así que
    // todo esto tiene que estar puesto antes de que arranque la página.
    const tauri = window.__TAURI_INTERNALS__;
    if (!tauri || tauri.__lento) return;
    tauri.__lento = true;
    const deVerdad = tauri.invoke;
    tauri.invoke = (cmd, args, opciones) => {
      const ms = Number(sessionStorage.getItem("__tarda") || 0);
      if (cmd !== "listar_carpeta" || !ms) return deVerdad(cmd, args, opciones);
      window.__pedido ??= performance.now();
      return new Promise((r) => setTimeout(r, ms)).then(() => {
        window.__llego ??= performance.now();
        return deVerdad(cmd, args, opciones);
      });
    };
    // El vigía: qué hay en pantalla cada 25 ms, contado desde que se pide la carpeta.
    window.__muestras = [];
    window.__vigia = setInterval(() => {
      if (window.__pedido === undefined) return;
      const aviso = document.querySelector(".arch-vacio.espera");
      window.__muestras.push({
        t: Math.round(performance.now() - window.__pedido),
        rueda: !!aviso?.querySelector(".espera-rueda"),
        texto: /Leyendo/.test(document.querySelector(".arch")?.textContent ?? ""),
      });
    }, 25);
  });

  for (const ms of [60, 450, 2400]) {
    await page.evaluate((n) => sessionStorage.setItem("__tarda", String(n)), ms);
    await page.goto("http://localhost:1420/");
    await page.waitForTimeout(ms + 3200);
    const m = await page.evaluate(() => {
      clearInterval(window.__vigia);
      return { muestras: window.__muestras, tardo: window.__llego === undefined ? null : Math.round(window.__llego - window.__pedido) };
    });
    const conRueda = m.muestras.filter((x) => x.rueda);
    const conTexto = m.muestras.filter((x) => x.texto);
    const caso = { tardo: m.tardo, muestras: m.muestras.length, primeraRueda: conRueda[0]?.t ?? null, ultimaRueda: conRueda[conRueda.length - 1]?.t ?? null, vecesConTexto: conTexto.length };
    casos[ms] = caso;
    if (m.tardo === null || m.muestras.length < 10) { fallos.push(`a ${ms} ms no se llegó a pedir la carpeta o no hay muestras: la prueba no prueba nada`); continue; }
    if (ms < 1000) {
      if (conRueda.length) fallos.push(`a ${ms} ms salió la rueda (a los ${conRueda[0].t} ms): tenía que no verse nada`);
      if (conTexto.length) fallos.push(`a ${ms} ms se llegó a leer «Leyendo…» ${conTexto.length} veces: es el parpadeo que se quitaba`);
    } else {
      if (!conRueda.length) fallos.push(`a ${ms} ms no salió la rueda en ningún momento`);
      else {
        if (caso.primeraRueda < 1000) fallos.push(`a ${ms} ms la rueda salió a los ${caso.primeraRueda} ms: antes del segundo`);
        if (caso.primeraRueda > 1200) fallos.push(`a ${ms} ms la rueda tardó ${caso.primeraRueda} ms en salir: tenía que salir al segundo`);
        if (conRueda.some((x) => !x.texto)) fallos.push(`a ${ms} ms la rueda salió sin su texto`);
        if (caso.ultimaRueda > m.tardo + 150) fallos.push(`a ${ms} ms la rueda siguió ${caso.ultimaRueda - m.tardo} ms después de llegar la carpeta`);
      }
    }
  }
  await page.evaluate(() => sessionStorage.removeItem("__tarda"));
  return { casos, fallos };
}
