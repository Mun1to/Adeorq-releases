// «Adeo es una IA» y «Informar de un problema» (política 11.16 de la Microsoft
// Store), y la lista de CLI de la Tienda sin instaladores, en la app de verdad.
//
//   node scripts/laboratorio/informar-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Cuatro pasadas con la Adeorq de desarrollo aislada: la instalación de siempre y
// la de la Tienda (`ADEORQ_FINGIR_EMPAQUETADA=1`), cada una en español y en inglés.
//
//  · Instalación de siempre:
//      - el Chat recién abierto y VACÍO ya enseña la línea «Adeo es una IA y puede
//        equivocarse» y el botón (a la vista, con tamaño, dentro de la ventana);
//      - con una conversación, cada respuesta de Adeo lleva el suyo y las tuyas no;
//      - el botón abre la dirección del formulario, y NADA de la conversación va
//        dentro (la sembrada lleva una marca que no puede aparecer);
//      - la ventana de la bola y el chat de un enjambre lo llevan también;
//      - la lista «No instalados» sigue con su orden y su botón «Descargar».
//  · La Tienda:
//      - la lista «No instalados» no enseña ninguna orden (`pnpm add`, `irm … | iex`)
//        ni «Descargar»: cada programa, un botón que abre su web oficial.
//
// La dirección que abre el botón se recoge en la página (`plugin:opener|open_url`
// se contesta desde aquí): no se abre ningún navegador, y la incidencia no se crea.
// No gasta nada: no se escribe a ningún modelo.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, carceles, conRatonEncima, dormir, hasta, mayusculas } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

/** Una marca que solo está en la conversación sembrada: si sale en la dirección, la conversación se ha ido. */
const MARCA = "SECRETO-DE-PRUEBA-7";
const ahora = Math.floor(Date.now() / 1000);

function sembrar(datos) {
  const dir = join(datos, "conserje");
  mkdirSync(dir, { recursive: true });
  const turno = (n, rol, texto) => ({ n, rol, texto, resumen: texto.slice(0, 40), cuando: ahora - 700 + n * 10 });
  writeFileSync(
    join(dir, "inf1.json"),
    JSON.stringify({
      id: "inf1",
      titulo: "Revisar la portada",
      turnos: [
        turno(1, "tu", `Revisa la portada de C:\\proyectos\\${MARCA}`),
        turno(2, "conserje", `Hecho. He mirado **la portada** de ${MARCA} y te propongo tres cambios: el titular, el botón y el pie.`),
        turno(3, "tu", "¿y el pie?"),
        turno(4, "conserje", "El pie está bien como está."),
      ],
      trabajos: [],
      router: true,
      creada: ahora - 800,
    }),
  );
  // Un enjambre sin sesiones, con una respuesta de Adeo en su hilo.
  writeFileSync(
    join(dir, "enj1.json"),
    JSON.stringify({
      id: "enj1",
      titulo: "",
      turnos: [turno(1, "tu", "Mirad el contraste"), turno(2, "conserje", "Se lo paso a la primera sesión.")],
      trabajos: [],
      router: true,
      creada: ahora - 800,
      enjambre: true,
    }),
  );
  // Dos chats con un modelo (`CanvasChat.tsx`): uno vacío y otro con una respuesta.
  // Ahí no habla Adeo sino el modelo, y la frase y el informe tienen que decirlo.
  mkdirSync(join(datos, "chats"), { recursive: true });
  writeFileSync(
    join(datos, "chats", "modelo2.json"),
    JSON.stringify([
      { role: "user", content: `¿Qué hace este error en ${MARCA}?` },
      { role: "assistant", content: `Es un error de permisos. Prueba a abrir la carpeta ${MARCA} como administrador.` },
    ]),
  );
  writeFileSync(
    join(datos, "lienzo.json"),
    JSON.stringify({
      kind: "adeorq-lienzo",
      v: 1,
      guardado: new Date().toISOString(),
      proyecto: "demo",
      nodos: [
        { tipo: "enjambre", id: "j1", x: 0, y: 0, w: 460, h: 600, conv: "enj1", nombre: "Los de la prueba", color: "verde", miembros: [], plegadas: false },
        { tipo: "chat", id: "m1", x: 520, y: 0, w: 380, h: 420, chat: "modelo1", modelo: "anthropic/claude-haiku-4.5" },
        { tipo: "chat", id: "m2", x: 520, y: 480, w: 380, h: 420, chat: "modelo2", modelo: "anthropic/claude-haiku-4.5" },
      ],
      flechas: [],
      trazos: [],
    }),
  );
}

/** Lo que `plugin:opener|open_url` recibe se recoge en `window.__abiertos` y no se abre nada. */
const guardaDe = (idioma) => `(() => {
  const real = window.fetch.bind(window);
  window.__abiertos = [];
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    if (/\\/plugin:opener\\|open_url$/.test(url)) {
      let cuerpo = "";
      try { cuerpo = typeof b?.body === "string" ? b.body : new TextDecoder().decode(b?.body); } catch {}
      window.__abiertos.push(cuerpo);
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return real(a, b);
  };
  localStorage.setItem("adeorq-lang", ${JSON.stringify(idioma)});
  localStorage.setItem("adeorq-cuentas-seccion", "faltan");
})()`;

/** Lo que mide de un elemento para decir que se ve de verdad. */
const MEDIR = (sel) => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const c = getComputedStyle(e);
  return { texto: e.textContent.replace(/\\s+/g, " ").trim(), x: r.left, y: r.top, w: r.width, h: r.height, px: parseFloat(c.fontSize), visible: c.visibility === "visible" && c.display !== "none" && Number(c.opacity) > 0.9,
    dentro: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
})()`;

const ESPERADO = {
  es: { linea: "Adeo es una IA y puede equivocarse.", modelo: "Este modelo es una IA y puede equivocarse.", tituloModelo: "un modelo del lienzo", boton: "Informar de un problema", correo: "o por correo", asunto: /^Informe de un problema con /, abre: "Abrir su web", baja: "Descargar" },
  en: { linea: "Adeo is an AI and can make mistakes.", modelo: "This model is an AI and can make mistakes.", tituloModelo: "a canvas model", boton: "Report an issue", correo: "or by email", asunto: /^Report an issue with /, abre: "Open its site", baja: "Download" },
};
const CORREO = "munitodev@gmail.com";

/** La dirección que el último clic mandó abrir. */
async function ultimaDireccion(v, antes) {
  const l = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`));
  if (l.length <= antes) return null;
  try {
    return JSON.parse(l.at(-1)).url ?? null;
  } catch {
    return String(l.at(-1));
  }
}

async function pasada({ idioma, tienda, n }) {
  const esp = ESPERADO[idioma];
  console.log(`\n── ${tienda ? "La Tienda" : "La instalación de siempre"}, ${idioma === "es" ? "español" : "inglés"} ──`);
  const a = await abrirAislada({
    nombre: `informar-${tienda ? "tienda" : "normal"}-${idioma}`,
    puertoMcp: 47_500 + (process.pid % 300) + n,
    depurar: 9800 + (process.pid % 90) + n,
    exe,
    fotos: FOTOS,
    sembrar,
    guarda: guardaDe(idioma),
    entorno: tienda ? { ADEORQ_FINGIR_EMPAQUETADA: "1" } : {},
  });
  try {
    const { v } = a;
    await v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await dormir(1500);
    const pulsar = (sel, i = 0) => v.js(`(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!b) return false; b.click(); return true; })()`);
    const version = await v.js(`window.__TAURI_INTERNALS__.invoke("plugin:app|version")`);
    /** Pulsa el botón del correo de una línea y mira la dirección que manda abrir: un
     *  mailto: al correo público, con el asunto escrito y la versión, y SIN la conversación. */
    const correoDe = async (sel, que, { modelo = false } = {}) => {
      const n = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
      await pulsar(sel);
      await dormir(400);
      const u = await ultimaDireccion(v, n);
      const m = u ? /^mailto:([^?]+)\?(.*)$/.exec(u) : null;
      const p = new URLSearchParams(m?.[2] ?? "");
      const asunto = p.get("subject") ?? "";
      const cuerpo = p.get("body") ?? "";
      dice(!!m && m[1] === CORREO && [...p.keys()].sort().join(",") === "body,subject", `${que}: «${esp.correo}» manda abrir un mailto: a ${CORREO}, solo con asunto y mensaje`, u?.slice(0, 90));
      dice(esp.asunto.test(asunto) && cuerpo.includes(version), `${que}: el asunto viene escrito y el mensaje lleva la versión (${version})`, asunto);
      dice(!!u && !u.includes(MARCA) && !/labels=|issues\/new/.test(u), `${que}: y no lleva nada de la conversación`);
      if (modelo) dice(!/\badeo\b/i.test(asunto + cuerpo), `${que}: ni el asunto ni el mensaje dicen Adeo (habla el modelo)`, `${asunto} | ${cuerpo.split("\r\n")[1]}`);
      return { asunto, cuerpo };
    };
    dice(await v.js(`window.__TAURI_INTERNALS__.invoke("esta_empaquetada")`) === tienda, tienda ? "esta_empaquetada dice que sí (la Tienda fingida)" : "esta_empaquetada dice que no");

    if (!tienda) {
      // ── La primera pantalla: la caja de Adeo del Panel (lo primero que ve quien abre la app) ──
      await pulsar('[data-tab="panel"]');
      await dormir(1200);
      const inicio = await v.js(MEDIR(".inicio-caja + .inf-aviso"));
      dice(!!inicio && inicio.visible && inicio.dentro && inicio.texto === `${esp.linea} ${esp.boton} ${esp.correo}` && inicio.px >= 12, "la caja de Adeo de la primera pantalla lleva la línea de IA, el botón y el correo, sin haber escrito nada", JSON.stringify(inicio));
      await a.foto(null, `informar-${idioma}-inicio.png`);
      const nI = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
      await pulsar(".inicio-caja + .inf-aviso .inf-boton");
      await dormir(400);
      dice(!!(await ultimaDireccion(v, nI)), "y su botón abre el formulario");
      await correoDe(".inicio-caja + .inf-aviso .inf-correo", "Primera pantalla");

      // ── El Chat recién abierto y vacío ───────────────────────────────────
      await pulsar('[data-tab="chat"]');
      await dormir(900);
      await hasta(async () => {
        await pulsar(".cj-nueva");
        await dormir(400);
        return v.js(`!!document.querySelector(".chat-caja.cj-caja")`);
      }, 8000);
      await dormir(600);
      const vacioTurnos = await v.js(`document.querySelectorAll(".chat-turno").length`);
      const linea = await v.js(MEDIR(".chat-caja-zona .inf-aviso"));
      const boton = await v.js(MEDIR(".chat-caja-zona .inf-aviso .inf-boton"));
      dice(vacioTurnos === 0, "el Chat nuevo está vacío (ninguna respuesta de Adeo)");
      dice(!!linea && linea.texto === `${esp.linea} ${esp.boton} ${esp.correo}`, "con el Chat vacío sale la línea de IA y el botón", linea?.texto);
      dice(!!boton && boton.visible && boton.dentro && boton.h >= 18, "el botón se ve de verdad: con alto, dentro de la ventana y sin transparencia", JSON.stringify(boton));
      dice(!!linea && linea.px >= 12 && linea.dentro, "la línea no baja de 12 px y cabe en una sola línea", `${linea?.px} px, alto ${linea?.h}`);
      await a.foto(null, `informar-${idioma}-chat-vacio.png`);
      const n0 = 0;
      await pulsar(".chat-caja-zona .inf-aviso .inf-boton");
      await dormir(500);
      const u0 = await ultimaDireccion(v, n0);
      dice(!!u0 && u0.startsWith("https://github.com/Mun1to/Adeorq-releases/issues/new?title="), "el botón manda abrir el formulario de una incidencia nueva del repo público", u0?.slice(0, 120));
      dice(!!u0 && !/labels=/.test(u0), "y la dirección no lleva `labels=`");
      const cuerpo0 = u0 ? new URL(u0).searchParams.get("body") ?? "" : "";
      dice(cuerpo0.includes(version), `la plantilla lleva la versión (${version})`, cuerpo0.split("\n")[0]);
      dice(idioma === "es" ? /Versión de Adeorq/.test(cuerpo0) : /Adeorq version/.test(cuerpo0), "y está en el idioma de la app");
      dice(!!u0 && !u0.includes(MARCA), "y no lleva nada de ninguna conversación");
      // El correo, para quien no tiene cuenta de GitHub: en la línea, con el Chat vacío.
      const bCorreo = await v.js(MEDIR(".chat-caja-zona .inf-aviso .inf-correo"));
      dice(!!bCorreo && bCorreo.visible && bCorreo.dentro && bCorreo.h >= 18 && bCorreo.texto === esp.correo, `«${esp.correo}» se ve de verdad junto al botón, con el Chat vacío`, JSON.stringify(bCorreo));
      const ayuda = await v.js(`document.querySelector(".chat-caja-zona .inf-correo")?.getAttribute("data-tip") ?? ""`);
      dice(ayuda.includes(CORREO), "y su ayuda dice la dirección (sin programa de correo, el clic no abre nada)", ayuda);
      await correoDe(".chat-caja-zona .inf-aviso .inf-correo", "Chat vacío");

      // ── Con una conversación: un botón por respuesta de Adeo ─────────────
      await pulsar(".chat-fila");
      await hasta(() => v.js(`document.querySelectorAll(".chat-turno").length >= 4`), 8000);
      await dormir(600);
      const turnos = JSON.parse(await v.js(`JSON.stringify([...document.querySelectorAll(".chat-turno")].map((t) => ({ rol: t.getAttribute("data-rol"), boton: !!t.querySelector(".inf-boton") })))`));
      dice(turnos.length === 4, "la conversación sembrada tiene sus cuatro turnos", JSON.stringify(turnos));
      dice(turnos.filter((t) => t.rol === "agente" && t.boton).length === 2 && turnos.filter((t) => t.rol === "tu" && t.boton).length === 0, "cada respuesta de Adeo lleva su botón y lo tuyo no");
      const aviso2 = await v.js(MEDIR(".chat-caja-zona .inf-aviso"));
      dice(!!aviso2 && aviso2.dentro, "y la línea de debajo de la caja sigue ahí");
      dice((await v.js(`document.querySelectorAll(".chat-turno .inf-correo").length`)) === 0 && (await v.js(`document.querySelectorAll(".chat-caja-zona .inf-correo").length`)) === 1, "el correo va solo en la línea de debajo de la caja: ninguno junto a las respuestas");
      await a.foto(null, `informar-${idioma}-chat-con-respuestas.png`);
      // Los detectores de la casa (GUSTOS, «nada de cárceles» y «nada de mayúsculas espaciadas»)
      // sobre lo nuevo: la línea y los botones son texto suelto en reposo.
      const caja = await carceles(v, ".chat-turno[data-rol='agente']");
      const zona = await carceles(v, ".chat-caja-zona > .inf-aviso");
      dice(caja.fallos.length === 0 && zona.fallos.length === 0, "el detector de cárceles no ve ninguna en los botones ni en la línea", JSON.stringify([...caja.fallos, ...zona.fallos]).slice(0, 300));
      dice((await mayusculas(v, ".inf-aviso, .chat-turnos")).fallos.length === 0, "y el de mayúsculas espaciadas tampoco");
      // Al pasar el ratón sale el cristal; en reposo, solo texto (el botón es una pieza nueva: se mide).
      const hover = await conRatonEncima(v, ".chat-turno[data-rol='agente'] .inf-boton");
      dice(!!hover && /^rgba\(0, 0, 0, 0\) none$/.test(hover.antes.fondo) && hover.antes.borde === "none", "en reposo el botón no tiene fondo ni borde", JSON.stringify(hover?.antes));
      dice(!!hover && hover.encima.fondo !== hover.antes.fondo, "y al pasar el ratón por encima se enciende", JSON.stringify(hover?.encima));
      const n1 = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
      await pulsar(".chat-turno[data-rol='agente'] .inf-boton");
      await dormir(500);
      const u1 = await ultimaDireccion(v, n1);
      dice(!!u1 && u1 === u0, "el botón de una respuesta abre la misma dirección, sin su texto", u1 && u1 !== u0 ? u1.slice(0, 160) : "");

      // ── La ventana de la bola ────────────────────────────────────────────
      await pulsar('[data-tab="cabina"]');
      await dormir(500);
      await hasta(() => pulsar(".foreman-call"), 10_000);
      await hasta(() => v.js(`!!document.querySelector(".foreman-overlay .foreman-box")`), 8000);
      await dormir(500);
      const bola = await v.js(MEDIR(".foreman-box > .inf-aviso"));
      dice(!!bola && bola.visible && bola.dentro && bola.texto === `${esp.linea} ${esp.boton} ${esp.correo}`, "la ventana de la bola, recién abierta, enseña la línea y el botón", bola?.texto);
      await a.foto(null, `informar-${idioma}-bola.png`);
      const n2 = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
      await pulsar(".foreman-box > .inf-aviso .inf-boton");
      await dormir(400);
      dice(!!(await ultimaDireccion(v, n2)), "y su botón abre el formulario");
      await correoDe(".foreman-box > .inf-aviso .inf-correo", "La bola");
      await v.js(`document.querySelector(".foreman-overlay")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), "ok"`);
      await dormir(500);

      // ── El chat de un enjambre ───────────────────────────────────────────
      await pulsar('[data-tab="lienzo"]');
      const hay = await hasta(() => v.js(`!!document.querySelector(".rf-enjambre")`), 20_000);
      dice(!!hay, "el enjambre del lienzo se pinta");
      if (hay) {
        await dormir(800);
        const l = await v.js(MEDIR(".rf-enjambre > .inf-aviso"));
        dice(!!l && l.visible && l.dentro && l.texto === `${esp.linea} ${esp.boton} ${esp.correo}`, "el chat del enjambre lleva la línea y el botón", l?.texto);
        const t = JSON.parse(await v.js(`JSON.stringify([...document.querySelectorAll(".enj-turno")].map((t) => ({ rol: t.getAttribute("data-rol"), boton: !!t.querySelector(".inf-boton") })))`));
        dice(t.filter((x) => x.rol === "conserje" && x.boton).length === 1 && t.filter((x) => x.rol !== "conserje" && x.boton).length === 0, "y la respuesta de Adeo lleva su botón (lo tuyo no)", JSON.stringify(t));
        await a.foto(null, `informar-${idioma}-enjambre.png`);
        const n3 = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
        await pulsar(".rf-enjambre .enj-turno[data-rol='conserje'] .inf-boton");
        await dormir(400);
        dice(!!(await ultimaDireccion(v, n3)), "y abre el formulario");
        await correoDe(".rf-enjambre > .inf-aviso .inf-correo", "Enjambre");
        dice((await v.js(`document.querySelectorAll(".enj-turno .inf-correo").length`)) === 0, "y ninguna respuesta del enjambre lleva el correo");
      }

      // ── El chat con un modelo del lienzo: ahí NO habla Adeo ──────────────
      const hayModelo = await hasta(() => v.js(`document.querySelectorAll(".rf-chat").length >= 2`), 20_000);
      dice(!!hayModelo, "los dos chats con un modelo del lienzo se pintan");
      if (hayModelo) {
        await dormir(900);
        const chats = JSON.parse(await v.js(`JSON.stringify([...document.querySelectorAll(".rf-chat")].map((c) => {
          const av = c.querySelector(":scope > .inf-aviso");
          const b = av?.querySelector(".inf-boton");
          const r = b ? b.getBoundingClientRect() : null;
          const msgs = [...c.querySelectorAll(".ch-charla > .ch-msg")];
          const e = av ? getComputedStyle(av) : null;
          return {
            aviso: av ? av.textContent.replace(/\\s+/g, " ").trim() : null,
            px: e ? parseFloat(e.fontSize) : 0,
            botonVisible: !!r && r.width > 0 && r.height >= 18 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            avisoLinea: av ? av.getBoundingClientRect().height : 0,
            turnos: msgs.map((m) => ({ de: m.getAttribute("data-de"), boton: !!m.nextElementSibling?.classList.contains("inf-boton") })),
            botonesEnCharla: c.querySelectorAll(".ch-charla .inf-boton").length,
          };
        }))`));
        const vacio = chats.find((c) => c.turnos.length === 0);
        const lleno = chats.find((c) => c.turnos.length === 2);
        const unico = `${esp.modelo} ${esp.boton} ${esp.correo}`;
        dice(!!vacio && vacio.aviso === unico, "el chat con un modelo, VACÍO, enseña la línea del modelo y el botón", vacio?.aviso);
        dice(!!vacio && vacio.botonVisible && vacio.px >= 12, "y se ven de verdad (alto, dentro de la ventana, 12 px o más)", JSON.stringify(vacio));
        dice(!!vacio && !/\badeo\b/i.test(vacio.aviso ?? "") && !!lleno && !/\badeo\b/i.test(lleno.aviso ?? ""), "y la frase NO dice Adeo (ahí habla el modelo)", `${vacio?.aviso} | ${lleno?.aviso}`);
        dice(!!lleno && lleno.aviso === unico, "con una conversación, la línea sigue ahí", lleno?.aviso);
        dice(!!lleno && lleno.turnos[0]?.de === "user" && !lleno.turnos[0].boton && lleno.turnos[1]?.de === "assistant" && lleno.turnos[1].boton && lleno.botonesEnCharla === 1, "y solo la respuesta del modelo lleva su botón, no lo tuyo", JSON.stringify(lleno?.turnos));
        await a.foto(null, `informar-${idioma}-chat-modelo.png`);
        const zonaM = await carceles(v, ".rf-chat > .inf-aviso");
        const botonM = await carceles(v, ".rf-chat .ch-charla > .inf-boton");
        dice(zonaM.fallos.length === 0 && botonM.fallos.length === 0, "el detector de cárceles no ve ninguna en la línea ni en el botón del chat con un modelo", JSON.stringify([...zonaM.fallos, ...botonM.fallos]).slice(0, 300));
        const n4 = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
        await pulsar(".rf-chat .ch-charla > .inf-boton");
        await dormir(400);
        const um = await ultimaDireccion(v, n4);
        const titulo = um ? new URL(um).searchParams.get("title") ?? "" : "";
        const cuerpoM = um ? new URL(um).searchParams.get("body") ?? "" : "";
        dice(!!um && um.startsWith("https://github.com/Mun1to/Adeorq-releases/issues/new?title="), "el botón del modelo abre el formulario de una incidencia nueva", um?.slice(0, 100));
        dice(titulo.includes(esp.tituloModelo) && !/\badeo\b/i.test(titulo + cuerpoM), `y habla de ${esp.tituloModelo}, no de Adeo`, `${titulo} | ${cuerpoM.split("\n")[1]}`);
        dice(!!um && !um.includes(MARCA) && !/labels=/.test(um), "y no lleva nada de la conversación ni `labels=`");
        const n5 = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
        await pulsar(".rf-chat > .inf-aviso .inf-boton");
        await dormir(400);
        dice(!!(await ultimaDireccion(v, n5)), "el botón de la línea (con el chat vacío) también abre el formulario");
        await correoDe(".rf-chat > .inf-aviso .inf-correo", "Modelo del lienzo", { modelo: true });
        dice((await v.js(`document.querySelectorAll(".rf-chat .ch-charla .inf-correo").length`)) === 0, "y ninguna respuesta del modelo lleva el correo");
      }
    }

    // ── La lista «No instalados» ───────────────────────────────────────────
    // Cuentas vive dentro del Perfil.
    await pulsar('[data-tab="perfil"]');
    await hasta(() => pulsar('[data-seccion="cuentas"]'), 8000);
    await dormir(900);
    await hasta(() => v.js(`document.querySelectorAll(".account-missing").length > 0`), 8000);
    // La sección se recuerda por la memoria sembrada; si no, se pulsa por su nombre.
    const faltan = await v.js(`document.querySelectorAll(".account-missing").length`);
    dice(faltan > 0, `la lista de «No instalados» tiene programas (${faltan})`);
    const tarjetas = JSON.parse(await v.js(`JSON.stringify([...document.querySelectorAll(".account-missing")].map((c) => ({
      nombre: c.querySelector(".account-name")?.textContent.trim(),
      codigo: [...c.querySelectorAll("code")].map((x) => x.textContent.trim()),
      botones: [...c.querySelectorAll("button")].map((b) => b.textContent.trim()),
    })))`));
    const conOrden = tarjetas.filter((c) => c.codigo.length);
    const conDescargar = tarjetas.filter((c) => c.botones.includes(esp.baja));
    if (tienda) {
      dice(conOrden.length === 0, "en la Tienda ninguna tarjeta enseña una orden de instalación", conOrden.map((c) => `${c.nombre}: ${c.codigo}`).join(" | "));
      dice(conDescargar.length === 0, "en la Tienda ninguna tarjeta tiene el botón «Descargar»", conDescargar.map((c) => c.nombre).join(", "));
      dice(tarjetas.every((c) => c.botones.length === 1 && c.botones[0] === esp.abre), `y cada una tiene un solo botón, «${esp.abre}»`, JSON.stringify(tarjetas.filter((c) => !(c.botones.length === 1 && c.botones[0] === esp.abre))));
      const todo = await v.js(`document.querySelector(".accounts-faltan")?.textContent ?? ""`);
      dice(!/pnpm add|irm |\\| iex|uv tool install/.test(todo), "ni el texto de la sección nombra `pnpm add`, `irm … | iex` ni `uv tool install`");
      await a.foto(null, `informar-${idioma}-tienda-no-instalados.png`);
      // Cada botón abre una dirección https de verdad (se pulsan todos).
      const vistas = [];
      for (let i = 0; i < tarjetas.length; i++) {
        const antes = JSON.parse(await v.js(`JSON.stringify(window.__abiertos)`)).length;
        await pulsar(".account-missing .np-btn", i);
        await dormir(150);
        vistas.push([tarjetas[i].nombre, await ultimaDireccion(v, antes)]);
      }
      dice(vistas.every(([, u]) => u && /^https:\/\//.test(u)), "todos los botones abren una dirección https", vistas.map(([n, u]) => `${n} → ${u}`).join("\n      "));
    } else {
      dice(conOrden.length > 0 && conOrden.length === tarjetas.filter((c) => c.codigo.length).length, `la instalación de siempre sigue enseñando la orden de cada uno (${conOrden.length} de ${tarjetas.length})`);
      dice(conDescargar.length > 0, `y su botón «${esp.baja}» (${conDescargar.length})`);
      await a.foto(null, `informar-${idioma}-normal-no-instalados.png`);
    }
  } finally {
    await a.cerrar();
  }
}

let n = 0;
for (const tienda of [false, true]) for (const idioma of ["es", "en"]) await pasada({ idioma, tienda, n: n++ });

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
