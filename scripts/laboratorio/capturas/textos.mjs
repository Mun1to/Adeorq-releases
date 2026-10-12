// Los datos de demostración, en los dos idiomas. Son los de un taller inventado
// (Sam y sus seis proyectos): nada de aquí sale de la máquina de nadie.

const P = (proyecto) => `P:\\projects\\${proyecto}`;
const repetir = (grabacion, cli = "claude") => ["cmd.exe", "/k", `chcp 65001 >nul && node P:\\bin\\repetir.mjs P:\\rec\\${grabacion}.bin ${cli}`];

/** El lienzo: tres agentes, una nota, el tablero de tareas y una flecha que le
 *  pasa a uno lo que hizo otro. */
function lienzo(idioma, t) {
  return (guardado) => ({
    kind: "adeorq-lienzo",
    v: 1,
    guardado,
    proyecto: "storefront-api",
    // El tablero de tareas no vuelve a donde se guardó: al cargar cae centrado
    // en el origen (de -380,-200 a 380,200). Lo demás se coloca a su alrededor.
    // Y sin pasarse de ancho: por debajo de 0,55 de zoom las terminales dejan
    // de pintarse y sale su tarjeta con el nombre.
    nodos: [
      { tipo: "kanban", id: "k1", x: -380, y: -200, w: 760, h: 400, pendientes: t.pendientes.map(([texto, proyecto], i) => ({ id: `p${i + 1}`, texto, ...(proyecto ? { ruta: P(proyecto) } : {}) })) },
      { tipo: "term", id: "t3", x: 580, y: -260, w: 860, h: 520, kind: "shell", proyecto: "invoice-cli", ruta: P("invoice-cli"), cmd: repetir(`${idioma}-invoice-mid`, "codex") },
      { tipo: "term", id: "t1", x: -380, y: 320, w: 860, h: 520, kind: "claude", proyecto: "storefront-api", ruta: P("storefront-api"), cmd: repetir(`${idioma}-storefront`) },
      { tipo: "term", id: "t2", x: 580, y: 320, w: 860, h: 520, kind: "claude", proyecto: "landing-web", ruta: P("landing-web"), cmd: repetir(`${idioma}-landing-mid`) },
      { tipo: "nota", id: "n1", x: 1500, y: -260, w: 360, h: 330, nota: "lanzamiento", color: "#f2c14e" },
      { tipo: "nota", id: "n2", x: 1500, y: 110, w: 360, h: 330, nota: "ideas", color: "#7fb6f0" },
    ],
    flechas: [{ id: "e1", de: "t1", a: "t2", encargo: t.flecha, auto: false }],
    trazos: [],
  });
}

const en = {
  skills: [
    ["review-pr", "Review the open pull request and list what must change before it merges."],
    ["write-tests", "Write the missing tests for the file you are looking at."],
    ["changelog", "Turn the commits since the last tag into a changelog entry."],
    ["fix-lint", "Fix what the linter reports without changing behaviour."],
    ["explain", "Explain this part of the codebase to someone new to it."],
    ["ship", "Run the checks, bump the version and tag the release."],
  ],
  bandeja: [
    "idea | storefront-api | Cache the cart total for carts that have not changed",
    "paso | landing-web | The FAQ page still has no meta description",
    "paso | mobile-app | The order list has no empty state",
    "idea | docs-site | A page that explains discount codes to shop owners",
  ],
  objetivos: [
    [0, [[true, "Fix the discount test"], [false, "Ship the dark mode toggle"], [false, "Review the currency flag"], [false, "Decide what an expired code does"]]],
    [1, [[true, "Rate limit on /cart/total"], [true, "Pricing copy pass"], [false, "Search for the docs site"]]],
    [2, [[true, "Totals in whole cents"], [true, "Export tokens as CSS variables"]]],
    [3, [[true, "Pull to refresh on orders"], [true, "Document discount codes"], [true, "Contrast check"]]],
    [5, [[true, "Health endpoint"], [false, "Order list tests"]]],
    [6, [[true, "Project skeleton"], [true, "First deploy"]]],
    [8, [[true, "Plans section"], [true, "Hero copy"]]],
  ],
  metas: {
    "storefront-api": "# Goals\n\n## META 1 — A checkout that never rounds wrong 🎯\n\n**Hecho cuando:** every total the API returns is a whole number of cents, with a test for each discount.\n\n## META 2 — Discount codes ✅ CERRADA\n\n## Aparcadero\n\n- **Gift cards**. Unlocks when: there are 100 orders a week.\n",
    "landing-web": "# Goals\n\n## META 1 — A landing page that sells the Office plan 🎯\n\n**Hecho cuando:** the Office plan is on the page, in dark and light, and the FAQ answers the three questions people ask.\n",
    "mobile-app": "# Goals\n\n## META 1 — Orders you can trust on a bad connection 🎯\n\n**Hecho cuando:** the order list shows loading, error and empty states, and refreshes on pull.\n\n## META 2 — Push notifications\n\n**Hecho cuando:** a shipped order reaches the phone within a minute.\n",
  },
  programados: [
    ["Weekly dependency check", "List the outdated dependencies and what each update would break.", "storefront-api", { tipo: "semanal", dias: [1], hora: "09:00" }, "hecho"],
    ["Link check", "Find the broken links in the docs and list them.", "docs-site", { tipo: "semanal", dias: [1, 2, 3, 4, 5], hora: "07:30" }, "hecho"],
    ["Changelog draft", "Draft the changelog from this week's commits.", "landing-web", { tipo: "semanal", dias: [5], hora: "17:00" }, "hecho"],
  ],
  detalle: { hecho: "finished", fallo: "failed", saltado: "skipped" },
  decisiones: [
    {
      titulo: "What should the cart do with an expired discount code?",
      contexto: "The rounding fix is in. This case is still open, and it changes what the customer sees at checkout.",
      proyecto: "storefront-api",
      preguntas: [
        {
          id: "A",
          titulo: "What happens at checkout",
          opciones: [
            { texto: "Reject the code and say why", detalle: "The total stays as it was and the customer reads the reason.", recomendada: true },
            { texto: "Apply it anyway until midnight", detalle: "Kinder, but the shop gives away a discount it had ended." },
            { texto: "Drop it without a word" },
          ],
        },
        {
          id: "B",
          titulo: "Where the message is written",
          opciones: [
            { texto: "In the API response", detalle: "One place, and every client shows the same text.", recomendada: true },
            { texto: "In each client" },
          ],
        },
      ],
    },
    {
      titulo: "Which test runner for the mobile app?",
      proyecto: "mobile-app",
      preguntas: [{ id: "A", titulo: "Runner", opciones: [{ texto: "Jest", detalle: "Already in package.json.", recomendada: true }, { texto: "Vitest" }] }],
      elegido: { A: { opcion: 1 } },
    },
    {
      titulo: "Dark mode: follow the system or remember the choice?",
      proyecto: "landing-web",
      preguntas: [{ id: "A", titulo: "Default", opciones: [{ texto: "Follow the system" }, { texto: "Remember the choice, and follow the system until there is one", recomendada: true }] }],
      elegido: { A: { opcion: 2 } },
    },
  ],
  notas: {
    lanzamiento: "# Before Friday\n\n- [x] Discount rounding fixed\n- [x] Tests green on the API\n- [ ] Dark mode on both pages\n- [ ] Currency flag reviewed\n- [ ] Changelog drafted\n",
    ideas: "# Later\n\n- Cache cart totals that did not change\n- An empty state for the order list\n- Gift cards, once there are orders\n",
  },
  pendientes: [
    ["An empty state for the order list", "mobile-app"],
    ["Meta description on the FAQ page", "landing-web"],
    ["Cache cart totals that did not change", "storefront-api"],
  ],
  flecha: "Check the pricing copy still matches the totals",
};

const es = {
  skills: [
    ["review-pr", "Revisa el pull request abierto y di qué tiene que cambiar antes de fusionarlo."],
    ["write-tests", "Escribe las pruebas que le faltan al archivo que tienes delante."],
    ["changelog", "Convierte los commits desde la última etiqueta en una entrada del registro de cambios."],
    ["fix-lint", "Arregla lo que dice el linter sin cambiar el comportamiento."],
    ["explain", "Explica esta parte del código a alguien que llega nuevo."],
    ["ship", "Pasa las comprobaciones, sube la versión y etiqueta la publicación."],
  ],
  bandeja: [
    "idea | storefront-api | Guardar el total del carrito mientras el carrito no cambie",
    "paso | landing-web | La página de preguntas sigue sin meta descripción",
    "paso | mobile-app | La lista de pedidos no tiene estado vacío",
    "idea | docs-site | Una página que explique los códigos de descuento a quien lleva la tienda",
  ],
  objetivos: [
    [0, [[true, "Arreglar la prueba del descuento"], [false, "Sacar el modo oscuro"], [false, "Revisar la opción de moneda"], [false, "Decidir qué hace un código caducado"]]],
    [1, [[true, "Límite de peticiones en /cart/total"], [true, "Repaso del texto de los planes"], [false, "Buscador de la documentación"]]],
    [2, [[true, "Totales en céntimos enteros"], [true, "Exportar los tokens a CSS"]]],
    [3, [[true, "Tirar para refrescar los pedidos"], [true, "Documentar los descuentos"], [true, "Revisar el contraste"]]],
    [5, [[true, "Ruta de salud"], [false, "Pruebas de la lista de pedidos"]]],
    [6, [[true, "Esqueleto del proyecto"], [true, "Primer despliegue"]]],
    [8, [[true, "Sección de planes"], [true, "Texto de la portada"]]],
  ],
  metas: {
    "storefront-api": "# Metas\n\n## META 1 — Un cobro que nunca redondea mal 🎯\n\n**Hecho cuando:** todos los totales que devuelve la API son céntimos enteros, con una prueba por cada descuento.\n\n## META 2 — Códigos de descuento ✅ CERRADA\n\n## Aparcadero\n\n- **Tarjetas regalo**. Desbloquea cuando: haya 100 pedidos a la semana.\n",
    "landing-web": "# Metas\n\n## META 1 — Una portada que venda el plan Oficina 🎯\n\n**Hecho cuando:** el plan Oficina está en la página, en oscuro y en claro, y las preguntas frecuentes contestan las tres que hace la gente.\n",
    "mobile-app": "# Metas\n\n## META 1 — Pedidos de fiar con mala cobertura 🎯\n\n**Hecho cuando:** la lista de pedidos enseña que carga, que falló o que está vacía, y refresca al tirar.\n\n## META 2 — Avisos en el móvil\n\n**Hecho cuando:** un pedido enviado llega al teléfono en menos de un minuto.\n",
  },
  programados: [
    ["Repaso semanal de dependencias", "Lista las dependencias atrasadas y qué rompería cada actualización.", "storefront-api", { tipo: "semanal", dias: [1], hora: "09:00" }, "hecho"],
    ["Enlaces rotos", "Busca los enlaces rotos de la documentación y haz la lista.", "docs-site", { tipo: "semanal", dias: [1, 2, 3, 4, 5], hora: "07:30" }, "hecho"],
    ["Borrador del registro de cambios", "Redacta el registro de cambios con los commits de la semana.", "landing-web", { tipo: "semanal", dias: [5], hora: "17:00" }, "hecho"],
  ],
  detalle: { hecho: "terminó", fallo: "falló", saltado: "saltado" },
  decisiones: [
    {
      titulo: "¿Qué hace el carrito con un código de descuento caducado?",
      contexto: "El arreglo del redondeo ya está. Este caso sigue abierto, y cambia lo que ve el cliente al pagar.",
      proyecto: "storefront-api",
      preguntas: [
        {
          id: "A",
          titulo: "Qué pasa al pagar",
          opciones: [
            { texto: "Rechazar el código y decir por qué", detalle: "El total se queda como estaba y el cliente lee el motivo.", recomendada: true },
            { texto: "Aplicarlo igual hasta medianoche", detalle: "Más amable, pero la tienda regala un descuento que había cerrado." },
            { texto: "Quitarlo sin decir nada" },
          ],
        },
        {
          id: "B",
          titulo: "Dónde se escribe el mensaje",
          opciones: [
            { texto: "En la respuesta de la API", detalle: "Un solo sitio, y todos los clientes enseñan el mismo texto.", recomendada: true },
            { texto: "En cada cliente" },
          ],
        },
      ],
    },
    {
      titulo: "¿Con qué se prueban las pantallas del móvil?",
      proyecto: "mobile-app",
      preguntas: [{ id: "A", titulo: "Herramienta", opciones: [{ texto: "Jest", detalle: "Ya está en package.json.", recomendada: true }, { texto: "Vitest" }] }],
      elegido: { A: { opcion: 1 } },
    },
    {
      titulo: "Modo oscuro: ¿seguir al sistema o recordar la elección?",
      proyecto: "landing-web",
      preguntas: [{ id: "A", titulo: "De fábrica", opciones: [{ texto: "Seguir al sistema" }, { texto: "Recordar la elección, y seguir al sistema mientras no haya una", recomendada: true }] }],
      elegido: { A: { opcion: 2 } },
    },
  ],
  notas: {
    lanzamiento: "# Antes del viernes\n\n- [x] Redondeo del descuento arreglado\n- [x] Pruebas de la API en verde\n- [ ] Modo oscuro en las dos páginas\n- [ ] Opción de moneda revisada\n- [ ] Registro de cambios redactado\n",
    ideas: "# Más adelante\n\n- Guardar los totales que no cambian\n- Un estado vacío para la lista de pedidos\n- Tarjetas regalo, cuando haya pedidos\n",
  },
  pendientes: [
    ["Un estado vacío para la lista de pedidos", "mobile-app"],
    ["Meta descripción en la página de preguntas", "landing-web"],
    ["Guardar los totales que no cambian", "storefront-api"],
  ],
  flecha: "Comprueba que el texto de los planes sigue cuadrando con los totales",
};

en.lienzo = lienzo("en", en);
es.lienzo = lienzo("es", es);

export const TEXTOS = { en, es };

/** Los cuatro paneles de la Cabina: [proyecto, grabación, CLI, título]. */
export const PANELES = {
  en: [
    ["storefront-api", "en-storefront", "claude", "Discount test failure in npm test"],
    ["mobile-app", "en-mobile", "claude", "Dependencies and test suite"],
    ["invoice-cli", "en-invoice-mid", "codex", "Currency flag for the total"],
    ["landing-web", "en-landing-mid", "claude", "Header dark mode toggle"],
  ],
  es: [
    ["storefront-api", "es-storefront", "claude", "Fallo en prueba del descuento"],
    ["mobile-app", "es-mobile", "claude", "Dependencias y pruebas"],
    ["invoice-cli", "es-invoice-mid", "codex", "Opción de moneda para el total"],
    ["landing-web", "es-landing-mid", "claude", "Botón de modo oscuro en cabecera"],
  ],
};
