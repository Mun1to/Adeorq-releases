// Las Decisiones del móvil se limpian solas: lo que ya no te espera va plegado al
// final, en «Anteriores (N)», y lo que le escribiste a una terminal abierta sale
// de arriba a la hora. Contra el doble recién arrancado (en el 4390):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-decisiones-plegadas.js")
//   node scripts/laboratorio/bancos-movil.mjs plegadas
//
// Munir, 2026-11-25, desde el móvil: «que también se elimine automáticamente
// cuando ya esté decidido o dado por terminado en su sección y no haya que estar
// todo el rato eliminando a mano». Eligió (decisiones d1a213e3b228 y d1a213e6e406):
// quitarlas de la lista al momento, guardadas en un «Anteriores» plegado que solo
// se abre si lo tocas, y lo hablado, una hora arriba por si no era la respuesta.
//
// Lo que fija:
//   · Plegado al entrar: las tarjetas de «Anteriores» no ocupan sitio ni se pueden
//     tocar, y el rótulo dice cuántas hay.
//   · Al tocarlo crece poco a poco (a media animación, ni cerrado ni entero) y
//     las tarjetas se pueden abrir; repintar la lista no lo vuelve a plegar.
//   · Lo hablado hace 10 minutos sigue en «Le escribiste después»; lo de hace dos
//     horas ya está en «Anteriores». La hora es la del PC, no la del móvil.
//
// Devuelve { fallos, r }: `fallos` vacío es que todo está en su sitio.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira", "Content-Type": "application/json" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const r = {};
  await page.goto(`${B}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(844 * k) });
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));

  // Dos habladas del panel 1, que sigue abierto: una de hace 10 minutos y otra de hace dos horas.
  const sembrar = (id, titulo, hace) => fetch(`${B}/api/sembrar-decision`, {
    method: "POST", headers: AUT, body: JSON.stringify({ id, titulo, proyecto: "Adeorq", panel: 1, hablada: Date.now() - hace }),
  });
  await sembrar("d0ab1ada0001", "Hablada hace un rato", 10 * 60000);
  await sembrar("d0ab1ada0002", "Hablada hace dos horas", 2 * 3600000);

  // El reloj del móvil adelantado tres horas: si la página usara el suyo, la de
  // hace 10 minutos se iría también. Manda la hora del PC (`ahora` de /api/decisiones).
  await page.addInitScript(() => {
    const desfase = 3 * 3600000;
    const ahoraDeVerdad = Date.now.bind(Date);
    Date.now = () => ahoraDeVerdad() + desfase;
  });
  await page.goto(`${B}/?c=1`);
  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="decisiones"]');
  await page.waitForSelector("#ver-anteriores");

  const estado = () => page.evaluate(() => {
    const pleg = document.getElementById("anteriores-dec");
    const boton = document.getElementById("ver-anteriores");
    const enAnteriores = [...(pleg?.querySelectorAll(".tarjeta[data-id]") ?? [])].map((t) => t.dataset.id);
    const hablaste = [...document.querySelectorAll("#decisiones .seccion")].find((s) => /Le escribiste/.test(s.textContent));
    const trasHablaste = [];
    for (let el = hablaste?.nextElementSibling; el && !el.matches(".seccion"); el = el.nextElementSibling) {
      if (el.matches(".tarjeta[data-id]")) trasHablaste.push(el.dataset.id);
    }
    // Lo que se pulsaría en el centro de la primera tarjeta plegada: si no es ella, no se puede tocar.
    const primera = pleg?.querySelector(".tarjeta");
    // Abierto, puede quedar por debajo de la pantalla: se trae a la vista antes de mirar el punto.
    if (pleg?.hasAttribute("data-abierto")) primera?.scrollIntoView({ block: "center" });
    const caja = primera?.getBoundingClientRect();
    const tocada = caja && caja.height > 0 ? document.elementFromPoint(caja.x + caja.width / 2, caja.y + Math.min(caja.height / 2, 5))?.closest(".tarjeta") : null;
    return {
      rotulo: boton?.textContent.trim() ?? "",
      abierto: boton?.getAttribute("aria-expanded"),
      alto: Math.round(pleg?.getBoundingClientRect().height ?? -1),
      inerte: pleg?.inert ?? null,
      seTocaLaPrimera: tocada === primera,
      enAnteriores,
      hablaste: trasHablaste,
    };
  });

  // 1. Plegado al entrar.
  r.al_entrar = await estado();
  debe(r.al_entrar.abierto === "false" && r.al_entrar.alto === 0, `al entrar, «Anteriores» va plegado (${JSON.stringify(r.al_entrar)})`);
  debe(r.al_entrar.inerte === true && !r.al_entrar.seTocaLaPrimera, `plegado, sus tarjetas no se pueden tocar (${JSON.stringify(r.al_entrar)})`);
  const n = r.al_entrar.enAnteriores.length;
  debe(n >= 3 && r.al_entrar.rotulo === `Anteriores (${n})`, `el rótulo dice cuántas hay («${r.al_entrar.rotulo}», ${n} dentro)`);

  // 2. Lo hablado: el de hace 10 minutos arriba, el de hace dos horas plegado.
  debe(r.al_entrar.hablaste.join() === "d0ab1ada0001", `en «Le escribiste después», solo lo hablado hace 10 minutos (${r.al_entrar.hablaste})`);
  debe(r.al_entrar.enAnteriores.includes("d0ab1ada0002") && !r.al_entrar.enAnteriores.includes("d0ab1ada0001"),
    `lo hablado hace dos horas ya está en «Anteriores» (${r.al_entrar.enAnteriores})`);
  r.nota = await page.evaluate(() => [...document.querySelectorAll("#decisiones .seccion-nota")].map((p) => p.textContent).join(" | "));
  debe(!/desc[aá]rtala/.test(r.nota), `ya no te pide que la descartes («${r.nota}»)`);

  // 3. Al tocarlo crece poco a poco, y luego sus tarjetas se tocan.
  await page.click("#ver-anteriores");
  await page.waitForTimeout(120);
  r.a_medias = await estado();
  await page.waitForTimeout(600);
  r.abierto = await estado();
  debe(r.abierto.abierto === "true" && r.abierto.alto > 100 && r.abierto.inerte === false, `al tocarlo se abre (${JSON.stringify(r.abierto)})`);
  debe(r.a_medias.alto > 0 && r.a_medias.alto < r.abierto.alto, `crece poco a poco: a los 120 ms mide ${r.a_medias.alto} de ${r.abierto.alto}`);
  debe(r.abierto.seTocaLaPrimera, "abierto, su primera tarjeta se puede tocar");

  // 4. Repintar (algo cambia en la lista) no lo vuelve a plegar.
  await sembrar("d0ab1ada0003", "Otra hablada de hace dos horas", 2 * 3600000);
  await page.waitForFunction(() => !!document.querySelector('#anteriores-dec .tarjeta[data-id="d0ab1ada0003"]'), null, { timeout: 9000 }).catch(() => {});
  r.tras_repintar = await estado();
  debe(r.tras_repintar.enAnteriores.includes("d0ab1ada0003"), `la lista se repintó con la nueva (${r.tras_repintar.enAnteriores})`);
  debe(r.tras_repintar.abierto === "true" && r.tras_repintar.alto > 100, `y sigue abierto (${JSON.stringify(r.tras_repintar)})`);
  debe(r.tras_repintar.rotulo === `Anteriores (${n + 1})`, `con la cuenta al día («${r.tras_repintar.rotulo}»)`);

  // 5. Se pliega otra vez al tocarlo.
  await page.click("#ver-anteriores");
  await page.waitForTimeout(700);
  r.plegado = await estado();
  debe(r.plegado.alto === 0 && r.plegado.inerte === true, `al tocarlo otra vez se pliega (${JSON.stringify(r.plegado)})`);

  // 6. Una de las anteriores se abre tocándola, con la lista abierta.
  await page.click("#ver-anteriores");
  await page.waitForTimeout(700);
  await page.click('#anteriores-dec .tarjeta[data-id="d0ab1ada0002"]');
  r.abre = await page.waitForSelector(".pregunta-d", { timeout: 5000 }).then(() => true, () => false);
  debe(r.abre, "una de las anteriores se abre tocándola");

  return { fallos, r };
}
