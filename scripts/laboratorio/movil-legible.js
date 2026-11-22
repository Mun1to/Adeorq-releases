// Lo que pidió Munir el 2026-11-21 desde el móvil, con cinco capturas: «Y sigue
// mejorando la UI en móvil y bugs que haya etc». Cada tramo es un fallo que se
// vio en su captura o al medirla, y lo que lo fija:
//
//   1. La letra sobre la foto. Con la foto del PC al 100 % el velo era 0 y el
//      chat se leía sobre ella tal cual. «Cuánto se ve» va ahora de 0 a lo más
//      que deja leer (`veloDeFoto`): nunca menos de 0,62 de velo.
//   2. Los adjuntos. Cada uno era una fila entera con su nombre (tres, 126 px
//      encima de la caja). Ahora, miniaturas dentro de la caja, en una fila.
//   3. «Auto», medio borrado. El carril de Parar, el modelo y el modo se
//      difuminaba por la derecha aunque todo cupiera, y a 360 px no cabía.
//   4. Lo último del chat, detrás de la caja. Al adjuntar una foto o escribir
//      otra línea la caja crece, y si estabas abajo lo último quedaba tapado y
//      salía «Ir al final» sin haber subido. Si habías subido, no se te baja.
//   5. Arriba y con poco alto. El aviso de la decisión iba suelto sobre la foto
//      y parecía tapar la primera línea: ahora va dentro de la cabecera. Y en
//      horizontal (844 × 390) la cabecera, los avisos, los adjuntos y la caja
//      no dejaban sitio: la Pantalla medía 0 px y la página entera se movía.
//   6. Sin chispitas de IA: Mejorar y emparejar llevan a Adeo, como el PC.
//   7. El idioma. La página habla el de la app del PC (decidido el 2026-10-14),
//      y la suya estaba en inglés con el móvil en español. No era un fallo:
//      ahora Ajustes > Idioma deja elegir otro para este aparato.
//
//   node scripts/laboratorio/bancos-movil.mjs legible
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const alDoble = (ruta, cuerpo) =>
    fetch(`${B}${ruta}`, { method: cuerpo ? "POST" : "GET", headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }).then((r) => r.json());
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));

  await page.setViewportSize({ width: 411, height: 890 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);

  // 1. La foto del PC al 100 %, como la tiene Munir.
  await alDoble("/api/sembrar-aspecto", { opacidad: 100, desenfoque: 0, foto: 1 });
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term");
  await page.waitForFunction(() => document.body.dataset.foto !== undefined, null, { timeout: 8000 }).catch(() => {});
  const velo = () => page.evaluate(() => ({
    foto: document.body.dataset.foto !== undefined,
    velo: Number(getComputedStyle(document.body, "::after").opacity),
  }));
  pasos.alCien = await velo();
  debe(pasos.alCien.foto && pasos.alCien.velo >= 0.62 - 1e-3, `con el PC al 100 %, la foto lleva al menos 0,62 de velo (${JSON.stringify(pasos.alCien)})`);
  // Y en una terminal, donde se lee el chat encima.
  await page.goto(`${B}/?v=2#terminal=1@111`);
  await page.waitForSelector("#turnos .turno");
  pasos.enLaTerminal = await velo();
  debe(pasos.enLaTerminal.velo >= 0.62 - 1e-3, `en el chat de una terminal, también (${JSON.stringify(pasos.enLaTerminal)})`);
  // Lo poco que se ve sigue siendo poco: el 5 % del PC no se aclara.
  await alDoble("/api/sembrar-aspecto", { opacidad: 5, desenfoque: 0, foto: 2 });
  await page.goto(`${B}/?v=3`);
  await page.waitForSelector("#portada-term");
  await page.waitForTimeout(800);
  await page.goto(`${B}/?v=4`);
  await page.waitForSelector("#portada-term");
  pasos.alCinco = await velo();
  debe(pasos.alCinco.velo > 0.97, `con el PC al 5 %, casi tapada (${JSON.stringify(pasos.alCinco)})`);
  await alDoble("/api/sembrar-aspecto", {});

  // 2. Tres capturas con los nombres largos de las suyas y un archivo que no es foto.
  await page.goto(`${B}/?v=5#terminal=1@111`);
  await page.waitForSelector("#turnos .turno");
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    for (const n of ["Screenshot_20261121_200600_Claude.jpg", "Screenshot_20261121_200547_Claude.jpg", "Screenshot_20261121_200537_Claude.jpg"]) {
      const c = document.createElement("canvas"); c.width = 300; c.height = 640;
      const g = c.getContext("2d"); g.fillStyle = "#222"; g.fillRect(0, 0, 300, 640);
      dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8))], n, { type: "image/jpeg" }));
    }
    dt.items.add(new File(["hola"], "notas de la reunión.pdf", { type: "application/pdf" }));
    const input = document.querySelector('#caja input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(() => { const a = [...document.querySelectorAll(".adjunto")]; return a.length === 4 && a.every((x) => x.dataset.estado === "listo"); }, null, { timeout: 20000 });
  pasos.adjuntos = await page.evaluate(() => {
    const bandeja = document.querySelector("#caja .adjuntos");
    const filas = new Set([...document.querySelectorAll(".adjunto")].map((a) => Math.round(a.getBoundingClientRect().top)));
    // El dedo de cada X, con toques de verdad: cuántos puntos de su recuadro de
    // 44 px le llegan a ella. Medir el estilo daba 44 aunque la fila recortara
    // la parte de arriba y la miniatura siguiente se quedara la de la derecha.
    // El ::after se coloca desde la caja de relleno de la X, por dentro de su borde.
    const dedos = [...document.querySelectorAll(".adjunto .quitar")].map((x) => {
      const r = x.getBoundingClientRect();
      const ex = getComputedStyle(x, "::after");
      const izq = r.left + x.clientLeft + parseFloat(ex.left), arriba = r.top + x.clientTop + parseFloat(ex.top);
      const ancho = x.clientWidth - parseFloat(ex.left) - parseFloat(ex.right), alto = x.clientHeight - parseFloat(ex.top) - parseFloat(ex.bottom);
      let dan = 0, total = 0;
      const quien = {};
      for (let dx = 1; dx < ancho; dx += 2) for (let dy = 1; dy < alto; dy += 2) {
        total++;
        const el = document.elementFromPoint(izq + dx, arriba + dy);
        if (el?.closest(".quitar") === x) dan++;
        else { const k = `${el ? el.className || el.tagName : "nada"}${dy < alto / 2 ? " arriba" : " abajo"}`; quien[k] = (quien[k] || 0) + 1; }
      }
      return { lado: Math.round(Math.min(ancho, alto)), dan: Math.round((100 * dan) / total), quien: Object.entries(quien).map(([k, n]) => `${k}: ${n}`).join("; ") };
    });
    // Una foto vertical pedía más alto que su miniatura y se salía por abajo.
    const seSale = [...document.querySelectorAll(".adjunto img")].map((i) => Math.round(i.getBoundingClientRect().bottom - i.closest(".adjunto").getBoundingClientRect().bottom));
    return {
      dentroDeLaCaja: !!bandeja.closest(".fila-caja"),
      alto: Math.round(bandeja.getBoundingClientRect().height),
      filas: filas.size,
      fotos: document.querySelectorAll(".adjunto img").length,
      tipo: document.querySelector(".adjunto .tipo b")?.textContent,
      nombres: [...document.querySelectorAll(".adjunto .que")].map((q) => q.textContent),
      dedos,
      seSale,
      enviar: !document.getElementById("enviar").disabled,
    };
  });
  const a = pasos.adjuntos;
  debe(a.dentroDeLaCaja, "los adjuntos van dentro de la caja de escribir");
  debe(a.filas === 1 && a.alto <= 80, `cuatro adjuntos en una sola fila de miniaturas, de 80 px como mucho (${a.filas} filas, ${a.alto} px)`);
  debe(a.fotos === 3 && a.tipo === "PDF", `las fotos con su miniatura y el resto con su tipo (${a.fotos}, ${a.tipo})`);
  debe(a.nombres[0] === "Screenshot_20261121_200600_Claude.jpg", `el nombre sigue ahí para quien no ve la foto (${a.nombres[0]})`);
  debe(a.dedos.every((d) => d.lado >= 44 && d.dan === 100), `cada X de quitar recoge los toques de sus 44 px de dedo (${a.dedos.map((d) => `${d.lado} px al ${d.dan} %${d.quien ? ` [se los quedan: ${d.quien}]` : ""}`).join(", ")})`);
  debe(a.seSale.every((s) => s <= 0), `cada foto cabe en su miniatura, sin salirse por abajo (${a.seSale.join(", ")} px)`);
  debe(a.enviar, "con los adjuntos subidos se puede mandar");
  await page.click(".adjunto .quitar");
  debe(await page.$$eval(".adjunto", (x) => x.length) === 3, "la X quita ese adjunto");

  // 3. Parar, «Opus 5.5 · extra» y «Auto» a su ancho (411) y en uno estrecho (360).
  const carril = () => page.evaluate(() => {
    const c = document.querySelector("#caja .mandos-term");
    const b = c.getBoundingClientRect();
    const pastillas = [...c.children].filter((p) => !p.hidden);
    const difumina = getComputedStyle(c).maskImage !== "none";
    return {
      textos: pastillas.map((p) => p.textContent.trim()),
      cabe: c.scrollWidth <= c.clientWidth + 1,
      difumina,
      // Lo que cae en los 28 px que se difuminan, o fuera.
      tapadas: pastillas.filter((p) => p.getBoundingClientRect().right > b.right - (difumina ? 28 : 0) + 0.5).map((p) => p.textContent.trim()),
    };
  });
  for (const ancho of [411, 360]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.waitForTimeout(400);
    const c = pasos[`carril${ancho}`] = await carril();
    debe(c.textos.length === 3, `${ancho}: trabajando salen Parar, el modelo y el modo (${c.textos})`);
    debe(c.cabe && !c.difumina && !c.tapadas.length, `${ancho}: caben las tres y ninguna sale difuminada (${JSON.stringify(c)})`);
  }
  // Con la letra más grande no caben: entonces sí se difumina, para que se vea que sigue.
  await page.evaluate(() => document.documentElement.style.setProperty("--z", "1.25"));
  await page.waitForTimeout(400);
  pasos.carrilGrande = await carril();
  debe(!pasos.carrilGrande.cabe && pasos.carrilGrande.difumina, `con la letra grande y sin sitio, se difumina (${JSON.stringify(pasos.carrilGrande)})`);
  await page.evaluate(() => document.documentElement.style.setProperty("--z", "1"));
  await page.setViewportSize({ width: 411, height: 890 });

  // 4. Abajo del todo, y la caja crece.
  await page.goto(`${B}/?v=6#terminal=1@111`);
  await page.waitForSelector("#turnos .turno");
  await page.waitForTimeout(1200);
  const abajo = () => page.evaluate(() => {
    const c = document.getElementById("conversa");
    return { falta: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), bajar: !document.getElementById("bajar").hidden, alto: c.clientHeight };
  });
  const adjuntar = () => page.evaluate(async () => {
    const dt = new DataTransfer();
    for (const n of ["a.jpg", "b.jpg"]) {
      const c = document.createElement("canvas"); c.width = 200; c.height = 300;
      dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8))], n, { type: "image/jpeg" }));
    }
    const input = document.querySelector('#caja input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
  });
  pasos.antesDeAdjuntar = await abajo();
  await adjuntar();
  await page.waitForFunction(() => [...document.querySelectorAll(".adjunto")].every((x) => x.dataset.estado === "listo"), null, { timeout: 20000 });
  await page.fill("#texto", "una\nlínea\nmás\ny otra");
  await page.waitForTimeout(500);
  pasos.trasAdjuntar = await abajo();
  debe(pasos.trasAdjuntar.alto < pasos.antesDeAdjuntar.alto, `la caja creció (${pasos.antesDeAdjuntar.alto} → ${pasos.trasAdjuntar.alto})`);
  debe(pasos.trasAdjuntar.falta < 4 && !pasos.trasAdjuntar.bajar, `estando abajo, sigues abajo y sin «Ir al final» (${JSON.stringify(pasos.trasAdjuntar)})`);
  // Subido a leer, no se te mueve.
  await page.evaluate(() => { document.getElementById("conversa").scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.click(".adjunto .quitar");
  await page.waitForTimeout(400);
  pasos.subido = await page.evaluate(() => document.getElementById("conversa").scrollTop);
  debe(pasos.subido === 0, `si habías subido, quitar un adjunto no te baja (${pasos.subido})`);

  // 5. La decisión, dentro de la cabecera; y con poco alto, sitio para leer.
  const huecos = () => page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const cuerpo = [...document.querySelectorAll(".cuerpo")].find((c) => !c.hidden);
    const cab = document.querySelector(".barra");
    const aviso = document.getElementById("aviso-dec");
    return {
      avisoEnLaCabecera: !aviso.hidden && aviso.parentElement === cab,
      cabArriba: Math.round(r(cab).top),
      cabAbajo: Math.round(r(cab).bottom),
      cuerpoArriba: Math.round(r(cuerpo).top),
      cuerpoAlto: Math.round(r(cuerpo).height),
      seMueveLaPagina: document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollTop > 0,
    };
  });
  const conTresFotos = async () => {
    await adjuntar();
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      const c = document.createElement("canvas"); c.width = 200; c.height = 300;
      dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8))], "c.jpg", { type: "image/jpeg" }));
      const input = document.querySelector('#caja input[type="file"]');
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => { const a = [...document.querySelectorAll(".adjunto")]; return a.length >= 3 && a.every((x) => x.dataset.estado === "listo"); }, null, { timeout: 20000 });
    await page.fill("#texto", "Y sigue mejorando la UI en móvil y bugs que haya etc");
    await page.waitForTimeout(400);
  };
  for (const [w, h, minimo] of [[411, 890, 300], [844, 390, 100], [411, 480, 150]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${B}/?v=7${w}${h}#terminal=1@111`);
    await page.waitForSelector("#turnos .turno");
    await page.waitForFunction(() => !document.getElementById("aviso-dec").hidden, null, { timeout: 15000 }).catch(() => {});
    await conTresFotos();
    for (const cara of ["conversa", "pantalla"]) {
      await page.click(`.pestanas .pastilla[data-cara="${cara}"]`);
      await page.waitForTimeout(700);
      const m = pasos[`${w}x${h}-${cara}`] = await huecos();
      debe(m.avisoEnLaCabecera, `${w}×${h} ${cara}: la decisión va dentro de la cabecera`);
      debe(m.cuerpoArriba >= m.cabAbajo - 1, `${w}×${h} ${cara}: lo que se lee empieza debajo de la cabecera (${JSON.stringify(m)})`);
      debe(m.cuerpoAlto >= minimo && !m.seMueveLaPagina && m.cabArriba >= 0, `${w}×${h} ${cara}: ${minimo} px o más para leer, sin mover la página (${JSON.stringify(m)})`);
    }
  }

  // 6. Adeo donde había una chispita: en Mejorar (la conversación con Adeo) y al emparejar.
  await page.setViewportSize({ width: 411, height: 890 });
  const chispas = () => page.evaluate(() => document.querySelectorAll('path[d^="M12 3l2.2"]').length);
  await page.goto(`${B}/?v=8`);
  await page.waitForSelector("#portada-term");
  await page.evaluate(() => ir({ vista: "hilo", id: "vieja1" }));
  await page.waitForSelector("#mejorar");
  await page.fill("#texto", "revisa el contraste");
  await page.waitForTimeout(300);
  pasos.mejorar = await page.evaluate(() => ({ adeo: !!document.querySelector("#mejorar svg.masc"), nombre: document.getElementById("mejorar").getAttribute("aria-label") }));
  pasos.chispasHilo = await chispas();
  debe(pasos.mejorar.adeo && pasos.mejorar.nombre === "Mejorar" && !pasos.chispasHilo, `Mejorar lleva a Adeo y se llama Mejorar (${JSON.stringify(pasos.mejorar)}, chispas ${pasos.chispasHilo})`);
  await page.evaluate(() => localStorage.removeItem("adeorq-movil-clave"));
  await page.goto(`${B}/?v=9`);
  await page.waitForSelector("#codigo");
  pasos.emparejar = await page.evaluate(() => ({ adeo: !!document.querySelector(".emparejar svg.masc"), avatar: !!document.querySelector(".emparejar .avatar") }));
  debe(pasos.emparejar.adeo && !pasos.emparejar.avatar && !(await chispas()), `al emparejar sale Adeo, suelto (${JSON.stringify(pasos.emparejar)})`);
  await page.evaluate((c) => localStorage.setItem("adeorq-movil-clave", c), CLAVE);

  // 7. Este doble sirve la app en español: se elige inglés en este aparato y se vuelve.
  const idioma = () => page.evaluate(() => ({ lang: document.documentElement.lang, titulo: document.querySelector(".barra h1")?.firstChild?.textContent?.trim(), elegido: document.querySelector('[data-ajuste="idioma"][aria-checked="true"]')?.dataset.valor }));
  await page.goto(`${B}/?v=10`);
  await page.waitForSelector("#portada-term");
  await page.evaluate(() => ir({ vista: "ajustes" }));
  await page.waitForSelector('[data-ajuste="idioma"]');
  pasos.idiomaAntes = await idioma();
  debe(pasos.idiomaAntes.lang === "es" && pasos.idiomaAntes.elegido === "pc", `de entrada, el idioma del PC (${JSON.stringify(pasos.idiomaAntes)})`);
  await Promise.all([page.waitForEvent("load"), page.click('[data-ajuste="idioma"][data-valor="en"]')]);
  await page.waitForSelector('[data-ajuste="idioma"]');
  pasos.idiomaIngles = await idioma();
  debe(pasos.idiomaIngles.lang === "en" && pasos.idiomaIngles.titulo === "Settings" && pasos.idiomaIngles.elegido === "en", `con English, la página en inglés y de vuelta en Ajustes (${JSON.stringify(pasos.idiomaIngles)})`);
  await Promise.all([page.waitForEvent("load"), page.click('[data-ajuste="idioma"][data-valor="pc"]')]);
  await page.waitForSelector('[data-ajuste="idioma"]');
  pasos.idiomaPc = await idioma();
  debe(pasos.idiomaPc.lang === "es" && pasos.idiomaPc.titulo === "Ajustes", `con «El de tu PC», otra vez en español (${JSON.stringify(pasos.idiomaPc)})`);

  debe(!errores.length, `sin errores en la página (${errores.join(" | ")})`);
  return { pasos, fallos };
}
