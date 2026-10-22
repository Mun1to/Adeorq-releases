// El contexto de cada terminal, arriba, y el aviso de compactar (Munir,
// 2026-10-16: «que muestre el contexto arriba de los chats, eso es muy
// importante, y lo de los avisos de compactar»). Un anillo con el porcentaje
// en la cabecera; desde la raya roja del PC el aviso con «Compactar», desde la de
// la terminal nueva con «Nueva con traspaso». Desde la D7 (2026-10-22) las rayas
// son de tokens y el nivel le llega hecho del PC (`nivelCtx`, de
// `nivelDeContexto`). Los botones se
// los piden al panel del PC (`/api/terminal/traspaso`).
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-contexto.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
  const mirar = () => page.evaluate(() => {
    const anillo = document.getElementById("ctx");
    const aviso = document.getElementById("aviso-ctx");
    const cab = document.querySelector(".barra").getBoundingClientRect();
    const caja = anillo.getBoundingClientRect();
    const titulo = document.getElementById("titulo").getBoundingClientRect();
    return {
      ve: !anillo.hidden, cifra: anillo.textContent, nivel: anillo.dataset.nivel, dice: anillo.getAttribute("aria-label"),
      arribaDerecha: caja.right <= cab.right && caja.left > cab.left + cab.width / 2 && caja.top < titulo.bottom,
      pisaTitulo: caja.left < titulo.right - 1,
      aviso: aviso.hidden ? null : { texto: aviso.querySelector("span")?.textContent, botones: [...aviso.querySelectorAll("button")].filter((b) => !b.closest("[hidden]")).map((b) => b.textContent) },
    };
  });
  const abrir = async (n) => {
    await page.goto(`${B}/?n=${n}#terminal=${n}@111`);
    await page.waitForFunction(() => !document.getElementById("ctx").hidden, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    return mirar();
  };

  pasos.bajo = await abrir(5);
  debe(pasos.bajo.ve && pasos.bajo.cifra === "30" && pasos.bajo.nivel === "0" && !pasos.bajo.aviso, `al 30 %, el anillo y nada más (${JSON.stringify(pasos.bajo)})`);
  debe(pasos.bajo.arribaDerecha && !pasos.bajo.pisaTitulo, `el anillo va arriba a la derecha sin pisar el título (${JSON.stringify(pasos.bajo)})`);
  debe(pasos.bajo.dice === "Contexto gastado: 30 %", `y se lee en voz alta (${pasos.bajo.dice})`);

  pasos.medio = await abrir(1);
  debe(pasos.medio.cifra === "45" && pasos.medio.nivel === "1", `al 45 % de un millón (450k), el anillo naranja: el nivel es del PC, no del 60 % de antes (${JSON.stringify(pasos.medio)})`);
  debe(/45 %: compáctala/.test(pasos.medio.aviso?.texto ?? "") && JSON.stringify(pasos.medio.aviso?.botones) === JSON.stringify(["Compactar", "Ahora no"]), `y el aviso de compactar (${JSON.stringify(pasos.medio.aviso)})`);
  await page.click('#aviso-ctx [data-traspaso="compactar"]');
  await page.waitForTimeout(500);
  pasos.compactado = await mirar();
  const pedidos = await page.evaluate(async (c) => (await fetch("/api/traspasos", { headers: { Authorization: `Bearer ${c}` } })).json(), CLAVE);
  debe(JSON.stringify(pedidos) === JSON.stringify(["1:compactar"]), `«Compactar» se lo pide al panel del PC (${JSON.stringify(pedidos)})`);
  debe(/se compacta sola/.test(pasos.compactado.aviso?.texto ?? "") && !pasos.compactado.aviso?.botones.length, `y dice qué va a pasar, sin botones (${JSON.stringify(pasos.compactado.aviso)})`);

  pasos.alto = await abrir(4);
  debe(pasos.alto.cifra === "83" && pasos.alto.nivel === "2", `al 83 %, el anillo rojo (${JSON.stringify(pasos.alto)})`);
  debe(/pesa demasiado \(83 %\)/.test(pasos.alto.aviso?.texto ?? "") && JSON.stringify(pasos.alto.aviso?.botones) === JSON.stringify(["Nueva con traspaso", "Compactar", "Ahora no"]), `y el aviso de seguir en una nueva (${JSON.stringify(pasos.alto.aviso)})`);
  await page.click("#aviso-ctx [data-callar]");
  await page.waitForTimeout(3500);
  pasos.callado = await mirar();
  debe(!pasos.callado.aviso && pasos.callado.ve, `«Ahora no» lo calla y el anillo sigue (${JSON.stringify(pasos.callado)})`);
  return { pasos, fallos };
}
