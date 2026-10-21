// El agente trabajando en el panel de Archivos, sobre la interfaz de verdad.
//
// Munir, 2026-10-12, con el vídeo de otro producto delante: quiere VER qué lee
// y qué edita el agente, y el paso a verde cuando hace el commit. La cuenta
// (qué marca lleva cada archivo) está en `scripts/tocados-check.ts` y el lector
// del transcript en `cargo test --lib tocados::`; esto mira lo que ninguno de
// los dos puede mirar sin un navegador: que cada paso se pinta, que cabe en los
// 270 px de la barra y que se mueve.
//
// El recorrido es el del vídeo: abre un test, edita dos archivos, lanza el
// commit y el commit entra. Detrás van los que no dejan escrito lo mismo (un
// CLI que solo apunta lo que edita, uno que no apunta nada y una consola
// pelada), una sesión que tocó cuarenta archivos de nombre largo, y lo mismo en
// inglés y en un tema claro. Y con el agente trabajando pasa por la barra los
// dos detectores de la casa (`carceles.js`, `mayusculas.js`): el barrido de
// pantallas no tiene agente, y así llegó a Munir un «WORKING» en mayúsculas
// espaciadas y un «Edited» en pastilla (2026-10-18).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y en una página
// recién abierta:
//
//   const src = await page.evaluate(async () => (await import("/scripts/laboratorio/archivos-agente.js?raw")).default);
//   return await (0, eval)(src)(page);
//
// Devuelve { mal, casos, fotos }. `mal` es cuántos casos fallan; las fotos
// (`agente-*.png`) caen en `.playwright-mcp/`.
async (page) => {
  const DIR = "C:/proyectos/Adeorq/.playwright-mcp/";
  const R = "C:\\proyectos\\weather-app";
  const ID = "11111111-2222-4333-8444-555555555555";
  const PANELES = {
    claude: ["cmd.exe", "/k", `chcp 65001 >nul && claude --permission-mode acceptEdits --session-id ${ID}`],
    codex: ["cmd.exe", "/k", `codex resume ${ID}`],
    gemini: ["cmd.exe", "/k", "gemini"],
    consola: undefined,
  };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1920, height: 1080 });

  // DESPUÉS del guion del doble, que vacía el almacenamiento en cada carga: el
  // caso viaja en `sessionStorage`, que sí aguanta la recarga.
  await page.addInitScript(([raiz, paneles]) => {
    try {
      const caso = JSON.parse(sessionStorage.getItem("__caso") || "{}");
      localStorage.setItem("adeorq-lateral", "archivos");
      if (caso.idioma) localStorage.setItem("adeorq-lang", caso.idioma);
      if (caso.tema) localStorage.setItem("adeorq-theme", caso.tema);
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "weather-app · cliente", cwd: raiz, command: paneles[caso.panel || "claude"] }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
      const hace = Date.now() - 3_600_000;
      const f = (nombre) => ({ nombre, cuando: hace });
      window.__carpetas = {
        [raiz]: [{ nombre: "docs", carpeta: true }, { nombre: "src", carpeta: true }, { nombre: "tests", carpeta: true }, f(".gitignore"), f("package.json"), f("README.md")],
        [`${raiz}\\docs`]: [f("guia.md")],
        [`${raiz}\\src`]: [{ nombre: "api", carpeta: true }, { nombre: "components", carpeta: true }, f("index.js")],
        [`${raiz}\\src\\api`]: [f("client.js"), f("stations.js")],
        [`${raiz}\\src\\components`]: [f("un-componente-de-nombre-larguisimo-para-ver-si-cabe.tsx")],
        [`${raiz}\\tests`]: [f("client.test.js"), f("utils.test.js")],
      };
      window.__git = { git: true, cambios: [], rama: "main", delante: 0, commits: [] };
    } catch { /* sin almacenamiento no hay nada que sembrar */ }
  }, [R, PANELES]);

  const fotos = [];
  // Con las animaciones paradas: con el lápiz escribiendo (un `transform` en
  // marcha dentro del cristal) la captura recortada salía con la barra en
  // blanco, aunque el DOM midiera bien (2026-10-18).
  const foto = async (nombre) => {
    await page.screenshot({ path: DIR + nombre, clip: { x: 1920 - 620, y: 0, width: 620, height: 1080 }, animations: "disabled" });
    fotos.push(DIR + nombre);
  };
  const casos = [];
  const caso = (nombre, ok, detalle = "") => casos.push({ nombre, ok: !!ok, detalle: ok ? "" : String(detalle) });

  /** Carga la app con ese caso, abre la Cabina, enfoca la terminal y despliega el árbol. */
  const abrir = async (c = {}) => {
    await page.evaluate((x) => sessionStorage.setItem("__caso", JSON.stringify(x)), c);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-tab="cabina"]')?.click());
    await page.waitForTimeout(700);
    await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
    await page.locator(".arch-raiz").waitFor({ timeout: 10000 });
    for (const carpeta of ["src", "api", "tests"]) {
      await page.locator(".arch-fila", { hasText: new RegExp(`^${carpeta}`) }).first().click();
      await page.waitForTimeout(350);
    }
  };

  /** Lo que la sesión y git dicen desde ahora. Espera a que el panel lo relea. */
  const poner = async (sesion, git, espera = 3000) => {
    await page.evaluate(([s, g, raiz]) => {
      const entera = (p) => (/^[A-Za-z]:\\/.test(p) ? p : `${raiz}\\${p}`);
      const iso = (seg) => new Date(Date.now() - seg * 1000).toISOString();
      window.__sesionArchivos = s && {
        turno: 1, enMarcha: false, commitEnCurso: false, lee: true, ...s,
        tocados: (s.tocados ?? []).map((t) => ({
          ruta: entera(t.ruta), enCurso: t.enCurso ?? "",
          leido: t.leido == null ? "" : iso(t.leido), editado: t.editado == null ? "" : iso(t.editado),
          turnoLeido: t.leido == null ? 0 : (t.turno ?? 1), turnoEditado: t.editado == null ? 0 : (t.turno ?? 1),
        })),
      };
      if (g) {
        window.__git = {
          git: true, rama: "main", delante: 0, ...g,
          cambios: (g.cambios ?? []).map((c) => ({ estado: "M", cuando: Date.now() - 60_000, mas: 0, menos: 0, ...c, ruta: entera(c.ruta) })),
          commits: (g.commits ?? []).map((c) => ({ ...c, cuando: Date.now() - (c.hace ?? 0) * 1000, archivos: c.archivos.map(entera) })),
        };
      }
    }, [sesion, git, R]);
    await page.waitForTimeout(espera);
  };

  const medir = () => page.evaluate(() => {
    const limpio = (e) => e?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const txt = (s) => limpio(document.querySelector(s));
    const panel = document.querySelector(".lateral")?.getBoundingClientRect();
    // Lo que se sale por la derecha del panel, o una fila más ancha que su caja.
    const fuera = [...document.querySelectorAll(".arch-tarjeta, .arch-tocados, .arch-toc, .arch-fila, .arch-pie, .arch-etq, .arch-lineas, .arch-letra, .arch-dentro")]
      .filter((e) => (panel && e.getBoundingClientRect().right > panel.right + 0.5) || e.scrollWidth > e.clientWidth + 1)
      .map((e) => `${e.className}:${limpio(e).slice(0, 30)}`);
    const fila = (nombre) => [...document.querySelectorAll(".arch-fila")].find((b) => b.querySelector(".arch-nom")?.textContent === nombre);
    const de = (nombre) => {
      const b = fila(nombre);
      if (!b) return null;
      const cs = getComputedStyle(b);
      return {
        estado: b.getAttribute("data-estado"), agente: b.getAttribute("data-agente"),
        etq: limpio(b.querySelector(".arch-etq")), lineas: limpio(b.querySelector(".arch-lineas")),
        dentro: limpio(b.querySelector(".arch-dentro")), letra: limpio(b.querySelector(".arch-letra")),
        punto: !!b.querySelector(".arch-punto"),
        fondo: cs.backgroundColor, color: getComputedStyle(b.querySelector(".arch-nom")).color,
        mueve: cs.animationName, etqMueve: b.querySelector(".arch-etq") ? getComputedStyle(b.querySelector(".arch-etq")).animationName : null,
        // El nombre: si brilla (el halo de letras que pidió Munir) y con qué animación entra.
        nomBrilla: getComputedStyle(b.querySelector(".arch-nom")).textShadow !== "none",
        nomMueve: getComputedStyle(b.querySelector(".arch-nom")).animationName,
      };
    };
    return {
      que: document.querySelector(".arch-tarjeta")?.getAttribute("data-que") ?? null,
      estado: txt(".arch-tj-estado"), titulo: txt(".arch-tj-tit"), sub: txt(".arch-tj-sub"), git: txt(".arch-tj-git"),
      leyenda: [...document.querySelectorAll(".arch-leyenda span")].map(limpio).join(" · "),
      nota: txt(".arch-tj-nota"),
      // La lista vive DENTRO de la tarjeta y sin rótulo encima (Munir, 2026-10-18: «fusionar esas dos cosas»).
      listaDentro: !!document.querySelector(".arch-tarjeta .arch-tocados"),
      cab: [...document.querySelectorAll(".arch-toc-cab span")].map(limpio).join(" · "),
      lista: [...document.querySelectorAll(".arch-toc")].map((b) => [limpio(b.querySelector(".arch-nom")), limpio(b.querySelector(".arch-toc-dir")), limpio(b.querySelector(".arch-lineas")) ?? "", limpio(b.querySelector(".arch-etq")), b.getAttribute("data-agente")].join("|")),
      // El marco de la tarjeta, de la familia del glow de la barra (88b771d): el halo de las cajas.
      tarjetaHalo: /0px 10px 28px/.test(document.querySelector(".arch-tarjeta") ? getComputedStyle(document.querySelector(".arch-tarjeta")).boxShadow : ""),
      mas: txt(".arch-toc-mas"), fueraDeCarpeta: txt(".arch-toc-fuera"),
      pie: txt(".arch-pie"), pieQue: document.querySelector(".arch-pie")?.getAttribute("data-que") ?? null,
      cuentas: [...document.querySelectorAll(".arch-cuenta")].map(limpio).join(" · "),
      fuera,
      test: de("client.test.js"), cliente: de("client.js"), estaciones: de("stations.js"), src: de("src"), api: de("api"), tests: de("tests"),
      altoArbol: Math.round(document.querySelector(".arch-arbol")?.getBoundingClientRect().height ?? 0),
      altoVentana: window.innerHeight,
      // La lista desplegada corre por dentro en vez de empujar al árbol fuera.
      listaCorre: (() => { const l = document.querySelector(".arch-tocados"); return !!l && l.scrollHeight > l.clientHeight + 1; })(),
    };
  });

  const TEST = "tests\\client.test.js";
  const CLIENTE = "src\\api\\client.js";
  const ESTACIONES = "src\\api\\stations.js";
  const COMMIT = { hash: "a1c9e42", asunto: "fix: the client retries once before giving up", archivos: [CLIENTE, ESTACIONES], hace: 1 };

  // ── El recorrido del vídeo ───────────────────────────────────────────────
  await abrir();
  await page.waitForTimeout(2800);
  let m = await medir();
  caso("sin conversación en el disco: solo la línea de git y la leyenda", m.que === "nada" && m.titulo === null && /main/.test(m.git ?? "") && /limpio, nada cambiado/.test(m.git ?? "") && m.lista.length === 0 && m.pie === null, JSON.stringify(m));
  caso("la leyenda dice los tres colores con el nombre del agente", m.leyenda === "Leído por Claude · Editado por Claude · En el commit", m.leyenda);
  await foto("agente-0-quieto.png");

  await poner({ enMarcha: true, tocados: [{ ruta: TEST, enCurso: "leer" }] }, null);
  m = await medir();
  caso("abre el test: la tarjeta lo dice (el archivo va en la lista, no repetido debajo) y la fila se enciende con su etiqueta", m.que === "leyendo" && m.estado === "Trabajando" && m.titulo === "Claude está leyendo" && m.sub === null && m.test?.agente === "leyendo" && m.test?.etq === "Leyendo", JSON.stringify([m.que, m.estado, m.titulo, m.sub, m.test]));
  caso("la carpeta lleva la marca de lo de dentro", m.tests?.agente === "leyendo" && m.src?.agente === null, JSON.stringify([m.tests, m.src]));
  caso("la lista nace dentro de la tarjeta, con una fila y sin rótulo encima", m.listaDentro && m.cab === "" && m.lista.join() === "client.test.js|tests||Leyendo|leyendo", `${m.listaDentro} «${m.cab}» / ${m.lista}`);
  caso("la etiqueta entra con su animación, la fila no lleva fondo y el nombre brilla mientras lo lee (solo el texto, Munir 2026-10-19)", /arch-etq-entra/.test(m.test?.etqMueve ?? "") && m.test?.fondo === "rgba(0, 0, 0, 0)" && m.test?.nomBrilla, JSON.stringify(m.test));
  caso("la tarjeta lleva el halo de la familia de la barra", m.tarjetaHalo, "sin «0px 10px 28px» en la sombra de .arch-tarjeta");
  await foto("agente-1-leyendo.png");

  await poner({ enMarcha: true, tocados: [{ ruta: TEST, leido: 20 }, { ruta: CLIENTE, enCurso: "editar" }] }, null);
  m = await medir();
  const colorLeido = m.test?.color;
  const colorEditando = m.cliente?.color;
  caso("edita el cliente: «editando» en el árbol y en la tarjeta; el test se queda en «abierto»", m.que === "editando" && m.titulo === "Claude está editando" && m.sub === null && m.cliente?.agente === "editando" && m.cliente?.etq === "Editando" && m.test?.agente === "leido" && m.test?.etq === null, JSON.stringify([m.que, m.titulo, m.sub, m.cliente, m.test]));
  caso("lo que se mueve va primero en la lista", m.lista.join(" ") === "client.js|src/api||Editando|editando client.test.js|tests||Abierto|leido", m.lista.join(" "));
  caso("leído y editando no llevan el mismo color", colorLeido && colorEditando && colorLeido !== colorEditando, `${colorLeido} / ${colorEditando}`);
  await foto("agente-2-editando.png");
  // Con el agente trabajando, la barra entera por los detectores de la casa.
  for (const detector of ["carceles.js", "mayusculas.js"]) {
    const src = (await page.evaluate(async (n) => (await import(`/scripts/laboratorio/${n}?raw&t=${Date.now()}`)).default, detector))
      .replace('document.querySelectorAll("body *")', 'document.querySelectorAll(".lateral, .lateral *")');
    const r = await (0, eval)(src)(page);
    caso(`${detector}: la barra con el agente trabajando, limpia`, r.fallos.length === 0, r.fallos.join(" | "));
  }

  const editados = [{ ruta: TEST, leido: 60 }, { ruta: CLIENTE, editado: 40 }, { ruta: ESTACIONES, editado: 30 }];
  const sucio = { cambios: [{ ruta: CLIENTE, mas: 12, menos: 3 }, { ruta: ESTACIONES, mas: 1, menos: 1 }] };
  await poner({ tocados: editados }, sucio);
  m = await medir();
  caso("ya editó: la tarjeta cuenta los archivos y suma sus líneas", m.que === "edito" && m.estado === "Hecho" && m.titulo === "Claude editó 2 archivos" && /\+13/.test(m.sub ?? "") && /−4/.test(m.sub ?? ""), JSON.stringify([m.que, m.estado, m.titulo, m.sub]));
  caso("la línea de git: la rama, las líneas y cuántos cambiados", /^main/.test(m.git ?? "") && /\+13/.test(m.git ?? "") && /2 cambiados/.test(m.git ?? ""), m.git);
  caso("en el árbol: sus líneas, la letra de git y el nombre del color del agente", m.cliente?.agente === "editado" && m.cliente?.lineas === "+12−3" && m.cliente?.letra === "M" && m.cliente?.etq === null && m.cliente?.estado === "cambiado", JSON.stringify(m.cliente));
  caso("las carpetas arrastran «N cambiados» hacia arriba", m.src?.dentro === "2 cambiados" && m.api?.dentro === "2 cambiados" && m.tests?.dentro === null, JSON.stringify([m.src, m.api, m.tests]));
  caso("la lista: lo último editado primero, con sus líneas", m.lista.join(" ") === "stations.js|src/api|+1−1|Editado|editado client.js|src/api|+12−3|Editado|editado client.test.js|tests||Abierto|leido", m.lista.join(" "));
  caso("la cuenta de siempre sigue en su sitio", m.cuentas === "2 cambiados", m.cuentas);
  const colorEditado = m.cliente?.color;
  await foto("agente-3-editado.png");

  await poner({ enMarcha: true, commitEnCurso: true, turno: 2, tocados: editados }, null, 2200);
  m = await medir();
  caso("lanza el commit: la tarjeta y el pie lo dicen, y las filas siguen como estaban", m.que === "commitEnCurso" && m.titulo === "Claude está haciendo el commit" && m.pie === "haciendo commit…" && m.pieQue === "haciendo" && m.cliente?.agente === "editado", JSON.stringify([m.que, m.titulo, m.pie, m.cliente]));
  await foto("agente-4-haciendo-commit.png");

  await poner({ turno: 2, tocados: editados }, { delante: 1, cambios: [], commits: [COMMIT] });
  m = await medir();
  caso("el commit entra: las dos filas pasan a verde con su etiqueta", m.cliente?.agente === "commit" && m.estaciones?.agente === "commit" && m.cliente?.etq === "En el commit" && m.cliente?.letra === null && m.cliente?.lineas === null, JSON.stringify([m.cliente, m.estaciones]));
  caso("el verde no es el naranja de antes, la fila sigue sin fondo y el nombre entra brillando", m.cliente?.color !== colorEditado && m.cliente?.fondo === "rgba(0, 0, 0, 0)" && /arch-brilla/.test(m.cliente?.nomMueve ?? ""), JSON.stringify([colorEditado, m.cliente]));
  caso("la tarjeta: cuántos entraron, el hash y el asunto", m.que === "commit" && m.estado === "Hecho" && m.titulo === "Claude hizo commit de 2 archivos" && (m.sub ?? "").startsWith("a1c9e42 · fix: the client"), JSON.stringify([m.que, m.titulo, m.sub]));
  caso("la línea de git: lo que falta por subir y el árbol limpio", /main\s*↑1/.test(m.git ?? "") && /limpio, nada cambiado/.test(m.git ?? ""), m.git);
  caso("la lista entera: los dos en el commit, y lo que solo abrió sigue abierto", m.lista.join(" ") === "stations.js|src/api||En el commit|commit client.js|src/api||En el commit|commit client.test.js|tests||Abierto|leido", m.lista.join(" "));
  caso("el pie deja el hash", m.pie === "commit a1c9e42" && m.pieQue === "hecho", `${m.pie} ${m.pieQue}`);
  caso("las carpetas ya no cuentan cambiados y llevan el verde de dentro", m.src?.dentro === null && m.api?.agente === "commit", JSON.stringify([m.src, m.api]));
  await foto("agente-5-commit.png");
  const recorrido = casos.length;
  caso("nada se sale de la barra en todo el recorrido", m.fuera.length === 0, m.fuera.join(" ; "));

  // ── Una sesión que tocó mucho, y nombres que no caben ────────────────────
  const muchos = [];
  for (let i = 0; i < 34; i++) muchos.push({ ruta: `src\\lib\\modulo-de-nombre-bastante-largo-${i}.ts`, leido: 100 + i });
  for (let i = 0; i < 6; i++) muchos.push({ ruta: `src\\components\\un-componente-de-nombre-larguisimo-para-ver-si-cabe${i || ""}.tsx`, editado: 50 + i });
  await page.locator(".arch-fila", { hasText: /^components/ }).first().click();
  await poner(
    { tocados: [...muchos, { ruta: "C:\\proyectos\\otro-proyecto\\a.ts", editado: 40 }] },
    { cambios: muchos.filter((t) => t.editado).map((t, i) => ({ ruta: t.ruta, mas: 1200 + i, menos: 345 })), commits: [] },
  );
  m = await medir();
  caso("cuarenta archivos: se ven cinco y el resto espera detrás de «y N más»", m.lista.length === 5 && m.mas === "y 35 más", `${m.lista.length} ${m.mas}`);
  caso("lo de fuera de la carpeta se dice aparte", m.fueraDeCarpeta === "y 1 fuera de esta carpeta", m.fueraDeCarpeta);
  caso("con nombres largos y +1200 −345 nada se sale de la barra", m.fuera.length === 0, m.fuera.join(" ; "));
  caso("y al árbol le queda sitio", m.altoArbol > m.altoVentana / 4, `${m.altoArbol} de ${m.altoVentana}`);
  await foto("agente-6-muchos.png");
  await page.locator(".arch-toc-mas").click();
  await page.waitForTimeout(400);
  m = await medir();
  caso("«y N más» los enseña todos, y se puede volver", m.lista.length === 40 && m.mas === "Ver menos", `${m.lista.length} ${m.mas}`);
  caso("desplegada corre por dentro y el árbol no se queda sin sitio", m.listaCorre && m.altoArbol > 100, `corre=${m.listaCorre} árbol=${m.altoArbol} de ${m.altoVentana}`);

  // ── Los que no dejan escrito lo mismo ────────────────────────────────────
  await abrir({ panel: "codex" });
  await poner({ lee: false, tocados: [{ ruta: CLIENTE, editado: 40 }] }, sucio);
  m = await medir();
  const pedidoCodex = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "session_files").map(([, a]) => a).pop());
  caso("un CLI que solo apunta lo que edita: se pide como rollout y se dice lo que falta", pedidoCodex?.rollout === true && m.titulo === "Codex editó 1 archivo" && m.nota === "Codex no deja escrito qué archivos lee: aquí salen solo los que edita." && m.leyenda.startsWith("Leído por Codex"), JSON.stringify([pedidoCodex, m.titulo, m.nota, m.leyenda]));
  await foto("agente-7-solo-ediciones.png");

  await abrir({ panel: "gemini" });
  await poner({ tocados: [{ ruta: CLIENTE, editado: 40 }] }, sucio);
  m = await medir();
  const pedidos = await page.evaluate(() => window.__llamadas.filter(([c]) => c === "session_files").length);
  caso("un CLI que no apunta nada: ni se le pregunta ni se inventa, y se dice", pedidos === 0 && m.que === "nada" && m.lista.length === 0 && m.leyenda === "" && /^Gemini.* no deja escrito qué archivos toca: aquí solo sale lo que dice git.$/.test(m.nota ?? "") && m.cliente?.agente === null && m.cliente?.lineas === "+12−3", JSON.stringify([pedidos, m.que, m.lista, m.leyenda, m.nota, m.cliente]));
  await foto("agente-8-sin-transcript.png");

  await abrir({ panel: "consola" });
  await poner({ tocados: [{ ruta: CLIENTE, editado: 40 }] }, sucio);
  m = await medir();
  caso("una consola pelada: git y nada más, sin nota", m.que === "nada" && m.nota === null && m.leyenda === "" && /2 cambiados/.test(m.git ?? ""), JSON.stringify([m.que, m.nota, m.leyenda, m.git]));

  // ── En inglés, y en un tema claro ────────────────────────────────────────
  await abrir({ idioma: "en" });
  await poner({ turno: 2, tocados: editados }, { delante: 1, cambios: [], commits: [COMMIT] });
  m = await medir();
  caso("en inglés: la tarjeta, la leyenda, la lista y el pie", m.estado === "Done" && m.titulo === "Claude committed 2 files" && m.leyenda === "Read by Claude · Edited by Claude · Committed" && m.lista[0] === "stations.js|src/api||Committed|commit" && m.lista[2].endsWith("|Opened|leido") && m.pie === "committed a1c9e42" && /clean, nothing changed/.test(m.git ?? ""), JSON.stringify([m.estado, m.titulo, m.leyenda, m.lista, m.pie, m.git]));
  caso("en inglés tampoco se sale nada", m.fuera.length === 0, m.fuera.join(" ; "));
  await foto("agente-9-ingles.png");
  await poner({ enMarcha: true, tocados: [{ ruta: TEST, leido: 30 }, { ruta: CLIENTE, enCurso: "editar" }, { ruta: ESTACIONES, editado: 40 }] }, { cambios: [{ ruta: ESTACIONES, mas: 1, menos: 1 }], commits: [] });
  m = await medir();
  caso("en inglés, trabajando: «Working», «Editing», «Edited» y «Opened»", m.estado === "Working" && m.titulo === "Claude is editing" && m.lista.map((l) => l.split("|")[3]).join() === "Editing,Edited,Opened" && m.cuentas === "1 changed", JSON.stringify([m.estado, m.titulo, m.lista, m.cuentas]));

  await abrir({ tema: "claro" });
  await poner({ enMarcha: true, tocados: [{ ruta: TEST, leido: 30 }, { ruta: CLIENTE, enCurso: "editar" }, { ruta: ESTACIONES, editado: 40 }] }, { cambios: [{ ruta: ESTACIONES, mas: 1, menos: 1 }], commits: [] });
  await foto("agente-10-claro-trabajando.png");
  await poner({ turno: 2, tocados: editados }, { delante: 1, cambios: [], commits: [COMMIT] });
  m = await medir();
  caso("en un tema claro el recorrido acaba igual", m.que === "commit" && m.cliente?.agente === "commit" && m.fuera.length === 0, JSON.stringify([m.que, m.cliente, m.fuera]));
  await foto("agente-11-claro-commit.png");

  return { mal: casos.filter((c) => !c.ok).length, de: casos.length, recorrido, casos: casos.map((c) => `${c.ok ? "ok " : "MAL"} ${c.nombre}${c.detalle ? `  (${c.detalle})` : ""}`), fotos };
}
