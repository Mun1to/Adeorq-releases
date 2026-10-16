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
        { id: "A", titulo: "A · El botón de las teclas de la terminal", contexto: `Míralo en ${enlace}`, opciones: [{ texto: "Solo «Modo»" }, { texto: "Dejarlo" }] },
        { id: "B", titulo: "B) La pantalla de Uso", opciones: [{ texto: "Anillos" }, { texto: "Baterías" }] },
        { id: "C", titulo: "Cómo se ve la Pantalla", opciones: [{ texto: "Entera" }, { texto: "Limpia" }] },
      ],
    }),
  });
  await page.goto(`${B}/?v=1#decision=d19a2b3c4fa`);
  await page.waitForSelector('.pregunta-d[data-q="C"]');
  await page.waitForTimeout(600);
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
  return { pasos, fallos };
}
