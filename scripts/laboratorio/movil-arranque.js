// Un aviso de una terminal tocado después de reiniciar Adeorq no abre ni le
// escribe a la terminal que hoy tiene ese número. Los números de panel vuelven
// a empezar en cada arranque, así que el aviso lleva el suyo
// (`/#terminal=<panel>@<arranque>`, `sellar_aviso` en movil.rs) y el PC no deja
// leer ni escribir con el de otro (`mismo_arranque`).
//
//   node scripts/laboratorio/doble-movil.mjs 4390      (el doble va por el arranque 111)
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-arranque.js")
//
// Mide las dos a la vez, como movil-historial.js: 4390 con la de ahora y 4391
// con la de antes (el doble y la página de HEAD copiados fuera del repo). Si
// solo hay una levantada, la otra sale «sin servidor». En la de antes, los
// avisos de otro arranque abren la terminal 3 de hoy y le escriben: ese es el
// fallo.
async (page) => {
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const medir = async (puerto) => {
    const B = `http://127.0.0.1:${puerto}`;
    try { await page.goto(`${B}/`); } catch (_) { return { puerto, error: "sin servidor" }; }
    await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
    let vez = 0;
    const escrito = async () => (await (await page.request.get(`${B}/api/escrito?panel=3`, { headers: AUT })).json()).texto;
    // Abre la página como la abre un aviso y prueba a escribir.
    const probar = async (hash, texto) => {
      await page.goto(`${B}/?vez=${++vez}${hash}`);
      await page.waitForSelector("#sub");
      await page.waitForFunction(() => !/cargando/.test(document.getElementById("sub")?.textContent || ""), null, { timeout: 8000 });
      const sub = await page.textContent("#sub");
      const pantalla = await page.textContent("#pantalla");
      await page.fill("#texto", texto);
      await page.click("#enviar");
      await page.waitForTimeout(900);
      const fallo = await page.$eval("#fallo", (x) => (x.hidden ? "" : x.textContent));
      return { sub, seVePantalla: /Vidorq/.test(pantalla), escrito: (await escrito()) === texto, fallo };
    };
    const r = { puerto };
    r.deOtroArranque = await probar("#terminal=3@110", "aviso de ayer");
    r.sinArranque = await probar("#terminal=3", "aviso de una version vieja");
    r.deEsteArranque = await probar("#terminal=3@111", "aviso de hoy");
    // Y desde la lista del cajón, con el arranque que dice la lista. (La 3 es
    // una consola quieta: desde el 2026-10-15 «En marcha», en la portada, solo
    // enseña lo que trabaja.)
    await page.goto(`${B}/?vez=${++vez}`);
    await page.click("#abrir-cajon");
    await page.click('#cajon .fila[data-panel="3"]');
    await page.waitForFunction(() => /Vidorq/.test(document.getElementById("pantalla")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
    r.desdeLaLista = /Vidorq/.test(await page.textContent("#pantalla"));
    return r;
  };
  const ahora = await medir(4390);
  const antes = await medir(4391);
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  if (!ahora.error) {
    for (const k of ["deOtroArranque", "sinArranque"]) {
      debe(/antes de reiniciar Adeorq/.test(ahora[k].sub), `${k}: lo dice arriba («${ahora[k].sub}»)`);
      debe(!ahora[k].seVePantalla, `${k}: no enseña la terminal de hoy`);
      debe(!ahora[k].escrito, `${k}: no le escribe a la terminal de hoy`);
      debe(/antes de reiniciar Adeorq/.test(ahora[k].fallo), `${k}: al mandar, dice por qué no («${ahora[k].fallo}»)`);
    }
    debe(ahora.deEsteArranque.seVePantalla && ahora.deEsteArranque.escrito && !ahora.deEsteArranque.fallo, "el aviso de este arranque abre y escribe");
    debe(ahora.desdeLaLista, "desde la portada se abre con el arranque de la lista");
  } else {
    fallos.push("sin el doble de ahora en 4390");
  }
  return { veredicto: fallos.length ? "MAL" : "BIEN", fallos, ahora, antes };
}
