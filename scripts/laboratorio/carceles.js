// ¿Hay alguna «cárcel» en lo que se ve ahora mismo en la página?
//
// Una cárcel es un borde o un fondo tintado con las esquinas redondeadas
// alrededor de un icono o de un texto corto: la píldora, el chip, la etiqueta,
// el botón que es solo un icono metido en su recuadro. Munir no las quiere en
// ningún sitio: «Estoy ya hasta los cojones de las cárceles y de los recuadros
// de los iconos y de los textos. Te lo digo ya por 500 veces» (2026-10-17,
// sobre el editor de la tarjeta de uso). Estaba escrito en la memoria común
// («nada de cárceles de texto», dicho tres veces antes) y aun así volvieron:
// por eso esto mira la pantalla en vez de esperar a que alguien se acuerde.
// En su lugar: el icono suelto, el texto suelto, y lo activo con color, peso o
// subrayado.
//
// Lo que NO es una cárcel: un contenedor con contenido de verdad (una tarjeta,
// un diálogo, una barra entera), un botón principal relleno de color sin borde
// (la acción que manda en la pantalla), un campo de texto, y lo que lleve
// `data-celda` (las casillas de un calendario de uso, que son datos y no
// marcos). Si algo de verdad tiene que ir enmarcado, que lo diga Munir: lo que
// él ya dijo que se queda está en `APROBADAS`, abajo, y es la ÚNICA lista (el
// barrido de `carceles-por-pantallas.mjs` usa esta).
//
// Se lanza sobre la página tal y como está (abre antes lo que quieras mirar):
//
//   node scripts/laboratorio/banco-sin-mcp.mjs <guion-que-abre-la-pantalla.js> scripts/laboratorio/carceles.js
//
// o desde el MCP de Playwright con el mismo `(0, eval)(src)(page)` que los
// demás guiones. Devuelve { fallos: [«qué» · «dónde»], aprobadas: [lo que se
// saltó y por qué] } y sale en rojo si hay algún fallo. Su prueba:
// `node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/carceles-prueba.js`.
async (page) => {
  const { fuera: carceles, aprobadas } = await page.evaluate(() => {
    // Lo que Munir decidió que se queda enmarcado, mirando en la página
    // «Cárceles por decidir» la foto de hoy y la suelta de cada pieza (las
    // letras son las de esa página). `conTexto`: solo con texto dentro, para
    // que un botón de solo icono hecho con la misma clase siga cazándose.
    // Para sumar una, que sea él quien lo diga, con su fecha.
    const APROBADAS = [
      { selector: ".mini:not(.icono)", conTexto: true, fecha: "2026-10-17", para: "A · un botón con texto, la tecla de la casa: en agosto se decidió que lleve superficie, porque sobre la foto no parecía un botón" },
      { selector: ".np-btn.ghost", conTexto: true, fecha: "2026-10-17", para: "A · el botón secundario con texto, al lado del principal" },
      { selector: ".cj-nueva, .chat-nueva", conTexto: true, fecha: "2026-10-17", para: "A · «Hablar con el conserje» y «Nueva conversación», en el chat" },
      { selector: ".atajos-tecla, kbd", fecha: "2026-10-17", para: "B · un atajo dibujado como tecla (Ajustes › Atajos, la paleta, «Deshacer Ctrl+Z»)" },
      { selector: ".ag-cal-celda", fecha: "2026-10-17", para: "C · un día del calendario de la Agenda" },
      { selector: ".canvas-map", fecha: "2026-10-17", para: "G · el minimapa del lienzo: suelto sigue siendo un rectángulo gris, la sombra del propio mapa" },
      { selector: ".canvas-flow .react-flow__controls", fecha: "2026-10-17", para: "H · los mandos del zoom del lienzo" },
    ];
    // El alfa de un color tal como lo devuelve el navegador. Un `color-mix()`
    // no sale como `rgba(…, a)` sino como `color(srgb r g b / a)`, y leyendo
    // solo lo primero un fondo tintado con `color-mix` contaba como opaco y se
    // escapaba (2026-10-17: la vista elegida de la barra lateral, al 14 %).
    const alfa = (c) => { const m = c.match(/rgba\([^)]*,\s*([\d.]+)\)$/) || c.match(/\/\s*([\d.]+)\s*\)$/); return m ? parseFloat(m[1]) : 1; };
    const transparente = (c) => !c || c === "transparent" || alfa(c) === 0;
    const fuera = [];
    const aprobadas = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("[data-celda]") || el.matches("input, textarea, select, canvas, video, img, svg, svg *")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
      if (!(parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomRightRadius) > 0)) continue;
      const borde = ["Top", "Right", "Bottom", "Left"].some((l) => parseFloat(cs[`border${l}Width`]) > 0 && cs[`border${l}Style`] !== "none" && !transparente(cs[`border${l}Color`]));
      const tinte = !transparente(cs.backgroundColor) && alfa(cs.backgroundColor) < 0.9;
      // Relleno opaco y sin borde es un botón principal, no una cárcel.
      if (!borde && !tinte) continue;
      // ¿Encierra poco? Un texto corto o un icono, sin nada más dentro.
      const texto = (el.innerText || "").trim();
      const piezas = el.querySelectorAll("*:not(svg *)").length;
      const icono = !texto && el.querySelector("svg, img") && piezas <= 3;
      const corto = texto && texto.length <= 40 && !texto.includes("\n") && piezas <= 4 && !el.querySelector("input, textarea, canvas, video");
      if (!icono && !corto) continue;
      // Solo la más de fuera: si un padre ya es cárcel (o aprobada), el hijo no se cuenta otra vez.
      if (fuera.some((f) => f.el.contains(el)) || aprobadas.some((a) => a.el.contains(el))) continue;
      const quien = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "");
      const dice = `${icono ? "un icono" : `«${texto.slice(0, 30)}»`} en ${quien} (${borde ? "borde" : "fondo tintado"})`;
      const aprobada = APROBADAS.find((a) => el.closest(a.selector) && (!a.conTexto || texto));
      if (aprobada) aprobadas.push({ el, dice: `${dice} · aprobada el ${aprobada.fecha}: ${aprobada.para}` });
      else fuera.push({ el, dice });
    }
    return { fuera: fuera.map((f) => f.dice), aprobadas: aprobadas.map((a) => a.dice) };
  });
  return { fallos: carceles.map((c) => `cárcel: ${c}`), aprobadas };
}
