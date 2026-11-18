// Una decisión con un enlace largo y títulos que ya empiezan por su letra
// (Munir, 2026-10-16, captura desde el móvil: «el texto y cosas se siguen
// cortando, y no sé por qué se repite la letra»). La cabecera era una rejilla
// de columna `auto`, que crece hasta la palabra más larga que no parte (un
// enlace), y lo que iba dentro se salía por la derecha. Y el título «A · …»
// salía detrás de su letra: «A A · …».
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-decision-ancho.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  // Con la letra grande, como la de su móvil: con la de fábrica el enlace cabía justo.
  await page.evaluate((c) => {
    localStorage.clear();
    localStorage.setItem("adeorq-movil-clave", c);
    localStorage.setItem("adeorq-movil-ajustes", JSON.stringify({ letra: 1.25 }));
  }, CLAVE);
  const enlace = "https://claude.ai/artifact/V1iNFxpaekL22Q7jwdLrqp";
  await fetch(`${B}/api/sembrar-decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "d19a2b3c4fa", titulo: "Móvil: teclas, Uso y Pantalla", proyecto: "Adeorq", panel: 1,
      contexto: `Las maquetas están en ${enlace}. La raya azul ya está quitada.`,
      preguntas: [
        { id: "A", titulo: "A · El botón de las teclas de la terminal", contexto: `Míralo en ${enlace}`, opciones: [{ texto: "Solo «Modo»" }, { texto: "Dejarlo", recomendada: true }] },
        { id: "B", titulo: "B) La pantalla de Uso", opciones: [{ texto: "Anillos" }, { texto: "Baterías" }] },
        { id: "C", titulo: "Cómo se ve la Pantalla", opciones: [{ texto: "Entera" }, { texto: "Limpia" }] },
      ],
    }),
  });
  await page.goto(`${B}/?v=1#decision=d19a2b3c4fa`);
  // Una pregunta por pantalla (2026-11-18): se mide la primera, que es la que
  // lleva los dos enlaces, con lo que cuenta el agente abierto entero.
  await page.waitForSelector('.pregunta-d[data-q="A"]');
  await page.waitForTimeout(600);
  if (await page.$(".dec-mas")) await page.click(".dec-mas");
  const pasos = await page.evaluate(() => {
    const c = document.querySelector(".cuerpo");
    const borde = c.getBoundingClientRect().right;
    const salen = [...c.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > borde + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || ""} ${Math.round(el.getBoundingClientRect().right)}`);
    return {
      ancho: { lista: c.scrollWidth, visible: c.clientWidth },
      salen: salen.slice(0, 6),
      titulos: [...document.querySelectorAll(".pregunta-d legend")].map((l) => {
        const letra = l.querySelector(".letra")?.textContent ?? "";
        return `${letra}|${l.textContent.slice(letra.length).replace(/\s+/g, " ").trim()}`;
      }),
      enlaces: [...c.querySelectorAll("a[href]")].map((a) => `${a.getAttribute("href")} ${a.target}`),
    };
  });
  debe(pasos.ancho.lista <= pasos.ancho.visible + 1, `la decisión cabe a lo ancho (${pasos.ancho.lista} > ${pasos.ancho.visible})`);
  debe(!pasos.salen.length, `nada se sale por la derecha (${pasos.salen.join(" | ")})`);
  debe(JSON.stringify(pasos.titulos) === JSON.stringify(["A|El botón de las teclas de la terminal", "B|La pantalla de Uso", "C|Cómo se ve la Pantalla"]), `cada pregunta lleva su letra una vez (${pasos.titulos.join(" | ")})`);
  debe(pasos.enlaces.length === 2 && pasos.enlaces.every((x) => x === "https://claude.ai/artifact/V1iNFxpaekL22Q7jwdLrqp _blank"), `los enlaces se pueden tocar y abren aparte (${pasos.enlaces.join(" | ")})`);

  /* El repaso es otra pantalla y también se mide: cada pregunta en su fila,
     con lo elegido debajo, y el pie con sus dos botones. Una opción por
     pregunta y su pausa, que recién cambiada la pantalla no atiende toques. */
  for (const q of ["A", "B", "C"]) { await page.click(`.pregunta-d[data-q="${q}"] .opcion`); await page.waitForTimeout(1100); }
  pasos.repaso = await page.evaluate(() => {
    const c = document.querySelector(".cuerpo");
    const borde = c.getBoundingClientRect().right;
    return {
      aLaVista: Boolean(document.getElementById("dec-repaso")?.offsetParent),
      filas: c.querySelectorAll(".dec-fila").length,
      ancho: { lista: c.scrollWidth, visible: c.clientWidth },
      pagina: { ancho: document.documentElement.scrollWidth, visible: innerWidth },
      salen: [...document.querySelectorAll(".cuerpo *, #pie-dec *")]
        .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > borde + 1)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className || ""} ${Math.round(el.getBoundingClientRect().right)}`).slice(0, 6),
    };
  });
  debe(pasos.repaso.aLaVista && pasos.repaso.filas === 3, `contestadas las tres, sale el repaso con sus tres filas (${JSON.stringify(pasos.repaso)})`);
  debe(pasos.repaso.ancho.lista <= pasos.repaso.ancho.visible + 1 && pasos.repaso.pagina.ancho <= pasos.repaso.pagina.visible, `el repaso cabe a lo ancho (${JSON.stringify(pasos.repaso.ancho)}, página ${JSON.stringify(pasos.repaso.pagina)})`);
  debe(!pasos.repaso.salen.length, `en el repaso nada se sale por la derecha (${pasos.repaso.salen.join(" | ")})`);

  /* En claro y con el acento amarillo, lo que va en acento sobre una tarjeta
     tiene que leerse: lo elegido en el repaso y «Recomendada» daban 3,14:1
     (revisión del 2026-11-18). Contra el fondo de verdad: las capas de sus
     ancestros, una sobre otra, encima del color del tema. */
  const contraste = (sel) => page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.offsetParent);
    if (!el) return null;
    const rgba = (t) => { const n = t.match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number); const k = t.startsWith("color(") ? 255 : 1; return [n[0] * k, n[1] * k, n[2] * k, n[3] ?? 1]; };
    const capas = [];
    for (let x = el; x; x = x.parentElement) {
      const f = rgba(getComputedStyle(x).backgroundColor);
      if (f[3] > 0) capas.push(f);
      if (f[3] >= 1) break;
    }
    let fondo = [0xe8, 0xee, 0xf8];
    for (const [r, g, b, a] of capas.reverse()) fondo = [r, g, b].map((v, i) => fondo[i] * (1 - a) + v * a);
    const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [a, b] = [lum(rgba(getComputedStyle(el).color)), lum(fondo)];
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, sel);
  await page.evaluate(() => localStorage.setItem("adeorq-movil-ajustes", JSON.stringify({ letra: 1.25, tema: "claro", acento: "#f5c542" })));
  await page.goto(`${B}/?v=2#decision=d19a2b3c4fa`);
  // Con el borrador entero se entra por el repaso.
  await page.waitForSelector(".dec-fila");
  await page.waitForTimeout(800);
  const tema = await page.evaluate(() => `${document.documentElement.dataset.tema} ${document.documentElement.dataset.acento}`);
  const elegido = await contraste(".dec-fila b");
  // De vuelta a la primera pregunta: su recomendada es la que no está elegida.
  await page.click('.dec-fila[data-i="0"]');
  await page.waitForTimeout(1100);
  const recomendada = await contraste(".opcion:not(:has(input:checked)) .rec");
  pasos.contraste = { tema, elegido, recomendada };
  debe(tema === "claro #f5c542", `la página queda en claro y con el acento amarillo (${tema})`);
  debe(elegido !== null && elegido >= 4.5, `en claro y amarillo, lo elegido en el repaso se lee (contraste ${elegido})`);
  debe(recomendada !== null && recomendada >= 4.5, `en claro y amarillo, «Recomendada» se lee (contraste ${recomendada})`);
  return { pasos, fallos };
}
