// La terminal de la página del móvil a 390 px, contra el doble
// (`node scripts/laboratorio/doble-movil.mjs [puerto]`), con lo que Munir no
// podía hacer el 2026-10-08: leer el historial entero de una sesión, leerlo
// bien (títulos, tablas, herramientas contadas), copiar su mensaje de
// compactación y dejar `/compact <bloque>` en la caja con un toque.
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-historial.js")
//
// Mide las dos páginas a la vez: 4391 con la de antes (PAGINA=<la de HEAD>) y
// 4390 con la de ahora. Si solo hay una levantada, la otra sale «sin servidor».
async (page) => {
  const medir = async (puerto) => {
    const origen = `http://127.0.0.1:${puerto}`;
    try { await page.goto(`${origen}/`); } catch (_) { return { puerto, error: "sin servidor" }; }
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: origen });
    // El perfil del banco tiene 127.0.0.1 al 200 %: se pide el viewport que da 390 px de página.
    await page.setViewportSize({ width: 780, height: 1600 });
    const k = 780 / (await page.evaluate(() => innerWidth));
    await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(800 * k) });
    await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));

    const abrir = async (panel) => {
      await page.goto(`${origen}/?p=${panel}#terminal=${panel}`);
      await page.waitForTimeout(1200);
    };
    const estado = () => page.evaluate(() => {
      const visible = (el) => el && !el.hidden && el.offsetParent !== null;
      const conversa = document.getElementById("conversa");
      const pre = document.getElementById("pantalla");
      const caja = document.getElementById("caja");
      const texto = (visible(conversa) ? conversa : pre)?.innerText ?? "";
      const lineas = texto.split("\n");
      return {
        cara: visible(conversa) ? "conversa" : "pantalla",
        pestanas: !document.getElementById("pestanas")?.hidden && !!document.getElementById("pestanas"),
        lineas: lineas.length,
        llegaAlFinDelBloque: texto.includes("FIN-DEL-BLOQUE"),
        empiezaPorElPaso1: texto.includes("Paso 1:"),
        deLado: Math.max(pre?.scrollWidth - pre?.clientWidth || 0, document.documentElement.scrollWidth - innerWidth),
        cajaEnPantalla: !!caja && caja.getBoundingClientRect().bottom <= innerHeight + 1,
        copiar: document.querySelectorAll(".copiar").length,
        // Abajo del todo, que es donde se queda al entrar: el «Copiar» del
        // último bloque tiene que verse sin subir hasta su principio.
        copiarALaVista: (() => {
          const b = [...document.querySelectorAll(".copiar")].at(-1);
          if (!b || !visible(conversa)) return null;
          const r = b.getBoundingClientRect(), c = conversa.getBoundingClientRect();
          return r.top >= c.top && r.bottom <= c.bottom;
        })(),
        lineasConSangria: pre ? getComputedStyle(pre.querySelector(".l") ?? pre).textIndent : null,
        // Fuera del bloque de código: dentro, un `##` es texto y está bien.
        titulosCrudos: [...(conversa?.querySelectorAll(".burbuja > p") ?? [])].filter((p) => /^#{1,6} /.test(p.innerText)).length,
        tablasCrudas: [...(conversa?.querySelectorAll(".burbuja > p") ?? [])].filter((p) => /^\|.*\|$/m.test(p.innerText)).length,
        tablas: conversa?.querySelectorAll(".tabla table").length ?? 0,
        herramientasMax: Math.max(0, ...[...document.querySelectorAll(".herramientas")].map((h) => h.textContent.length)),
        compactar: document.querySelectorAll(".compactar").length,
      };
    });

    await abrir(1);
    const claude = await estado();
    let copiado = null;
    if (claude.copiar) {
      await page.evaluate(() => [...document.querySelectorAll(".copiar")].at(-1).click());
      await page.waitForTimeout(300);
      const t = await page.evaluate(() => navigator.clipboard.readText());
      copiado = { empieza: t.split("\n")[0], acaba: t.trim().split("\n").at(-1), lineas: t.split("\n").length };
    }
    // Un toque en «Compactar con esto» y la caja lleva la orden con el bloque.
    let compactado = null;
    if (claude.compactar) {
      await page.evaluate(() => [...document.querySelectorAll(".compactar")].at(-1).click());
      await page.waitForTimeout(200);
      compactado = await page.evaluate(() => {
        const t = document.getElementById("texto").value;
        return { empieza: t.split("\n")[0], acaba: t.trim().split("\n").at(-1), enviarListo: !document.getElementById("enviar").disabled };
      });
    }
    // Subir por el historial saca «Ir al final», y tocarlo vuelve abajo.
    const irAlFinal = await page.evaluate(async () => {
      const c = document.getElementById("conversa");
      const b = document.getElementById("bajar");
      if (!c || !b || c.hidden) return null;
      const alPrincipio = b.hidden;
      c.scrollTop = 0;
      c.dispatchEvent(new Event("scroll"));
      const arriba = !b.hidden;
      b.click();
      return { escondidoAbajo: alPrincipio, saleAlSubir: arriba, vuelveAbajo: c.scrollHeight - c.scrollTop - c.clientHeight < 60 && b.hidden };
    });
    await abrir(2);
    const codex = await estado();
    const notaCodex = await page.evaluate(() => document.getElementById("conversa")?.innerText.slice(0, 90) ?? null);
    await abrir(3);
    const consola = await estado();
    // Una terminal que ya no está: lo que no se pudo mandar se queda a la
    // vista aunque el sondeo dé otra vuelta.
    await abrir(9);
    const fallo = await page.evaluate(async () => {
      const t = document.getElementById("texto");
      t.value = "hola";
      t.dispatchEvent(new Event("input"));
      document.getElementById("enviar").click();
      await new Promise((r) => setTimeout(r, 3800));
      const f = document.getElementById("fallo");
      return { subtitulo: document.getElementById("sub")?.textContent ?? null, nota: f && !f.hidden ? f.textContent : null };
    });
    return { puerto, claude, copiado, compactado, irAlFinal, codex, notaCodex, consola, fallo };
  };
  return { antes: await medir(4391), ahora: await medir(4390) };
}
