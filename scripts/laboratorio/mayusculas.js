// ¿Hay alguna etiqueta en MAYÚSCULAS ESPACIADAS en lo que se ve ahora mismo?
//
// Es el «TOKENS», el «EL AÑO», el «NAVIGATION / SOCIALS» de las webs de
// diseñador: `text-transform: uppercase` con las letras separadas. Munir no lo
// quiere: «no me gusta nada esta tipografía» (2026-10-08, munito.dev) y
// «Tokens con la T mayúscula, nunca TOKENS» (2026-10-17, el Perfil). Estaba en
// la memoria común y aun así volvió al copiar el plano del Perfil: por eso,
// como `carceles.js`, esto mira la pantalla. En su lugar: caja normal, con peso
// o color.
//
// Lo que NO cuenta: una sola letra (las iniciales de la semana) y un texto que
// ya viene en mayúsculas escrito así (una sigla como «CPU» o «MCP»).
//
//   node scripts/laboratorio/banco-sin-mcp.mjs <guion-que-abre-la-pantalla.js> scripts/laboratorio/mayusculas.js
//
// Devuelve { fallos: [«qué» · «dónde»] } y sale en rojo si hay alguna.
async (page) => {
  const fuera = await page.evaluate(() => {
    const lista = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.textTransform !== "uppercase" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const tam = parseFloat(cs.fontSize) || 16;
      const espacio = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) / tam;
      if (espacio < 0.04) continue;
      // El texto tal y como está escrito, antes de pasarlo a mayúsculas.
      const escrito = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      if (escrito.length < 2 || escrito === escrito.toUpperCase()) continue;
      if (lista.some((x) => x.el.contains(el))) continue;
      const quien = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "");
      lista.push({ el, dice: `«${escrito.slice(0, 30)}» en ${quien} (${(espacio * 100).toFixed(0)} % de espacio)` });
    }
    return lista.map((x) => x.dice);
  });
  return { fallos: fuera.map((f) => `mayúsculas espaciadas: ${f}`) };
}
