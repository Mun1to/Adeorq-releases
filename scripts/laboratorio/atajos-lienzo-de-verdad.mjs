// Los atajos del lienzo contra los globales, medidos en la app de verdad.
//
//   node scripts/laboratorio/atajos-lienzo-de-verdad.mjs [exe] [carpeta para las fotos]
//
// Ctrl+Mayús+E (exportar el dibujo) y Ctrl+Mayús+↓ (enviar al fondo) son atajos
// del lienzo (`lib/atajos.ts`), y Ctrl+Mayús+E (modo emisión) y Ctrl+Mayús+↓
// (partir el panel hacia abajo) son globales (`lib/atajosGlobales.ts`). Los
// globales se enganchan a `window` en captura y ninguno corta la propagación,
// así que con el lienzo a la vista y el foco fuera de un texto se disparaban los
// dos con una sola pulsación. Aquí se pulsa cada tecla en cada situación y se
// apunta qué cambió: el modo emisión, los paneles, lo exportado y el orden de
// los trazos.
//
// Las teclas de verdad se mandan por el protocolo de depuración de la propia
// ventana (`Input.dispatchKeyEvent`: llegan con `isTrusted`, como las del teclado,
// y no tocan el del sistema), y la que reenvía la paleta de comandos se imita con
// un evento de la página (`isTrusted` falso). El diálogo de «Guardar como» se
// contesta desde la guarda: no llega a abrirse ninguna ventana de Windows.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
const FOTOS = process.argv[3] || tmpdir();
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const nombre = "atajos-lienzo";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
mkdirSync(casa, { recursive: true });

const guarda = `(() => {
  localStorage.setItem("adeorq-lang", "es");
  localStorage.setItem("adeorq-layout", JSON.stringify({ panes: [{ name: "lab · consola", cwd: ${JSON.stringify(casa)} }], cols: [{ w: 1, hs: [1], idx: [0] }] }));
  localStorage.removeItem("adeorq-stream");
  window.__guardar = 0;
  const antes = window.fetch;
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    // El «Guardar como» no se abre nunca: se cuenta y se contesta que no.
    if (/ipc\\.localhost\\/plugin:dialog\\|save$/.test(url)) {
      window.__guardar++;
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return antes(a, b);
  };
})()`;

const a = await abrirAislada({ nombre, puertoMcp: 47_000 + (process.pid % 900), depurar: 9650 + (process.pid % 100), exe, guarda, fotos: FOTOS });
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  const { v } = a;
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector('[data-tab="cabina"]')`), 20_000);
  await dormir(1500);

  const vista = (clave) => v.js(`(() => { const b = document.querySelector('[data-tab="${clave}"]'); if (!b) return false; b.click(); return true; })()`);
  const CODIGOS = { e: ["KeyE", 69], ArrowDown: ["ArrowDown", 40], ArrowUp: ["ArrowUp", 38] };
  /** Ctrl+Mayús+tecla de verdad (llega con `isTrusted`), a lo que tenga el foco. */
  const teclaCS = async (key) => {
    const [code, vk] = CODIGOS[key];
    const t = { modifiers: 10, key: key.length === 1 ? key.toUpperCase() : key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await v.enviar("Input.dispatchKeyEvent", { type: "rawKeyDown", ...t });
    await v.enviar("Input.dispatchKeyEvent", { type: "keyUp", ...t });
  };
  /** La misma tecla como la reenvía la paleta de comandos: un evento de la página en `window`. */
  const teclaReenviada = (key) => v.js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, ctrlKey: true, shiftKey: true })), true`);
  const tecla = (key) =>
    v.js(`(() => { const el = document.activeElement || document.body; el.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true })); return true; })()`);
  const foto = () =>
    v.js(`JSON.stringify({
      emision: localStorage.getItem("adeorq-stream") === "1",
      paneles: document.querySelectorAll("[data-pane-id]").length,
      guardar: window.__guardar,
      aviso: document.body.innerText.includes("No hay nada dibujado que exportar"),
      orden: [...document.querySelectorAll("g.canvas-draw-shape[data-id]")].map((g) => g.dataset.id).join(","),
      cogidos: [...document.querySelectorAll('g.canvas-draw-shape[data-sel="true"]')].map((g) => g.dataset.id).join(","),
    })`).then((s) => JSON.parse(s));
  const ratón = (type, x, y) => v.enviar("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const clic = async (x, y) => {
    await ratón("mouseMoved", x, y);
    await ratón("mousePressed", x, y);
    await ratón("mouseReleased", x, y);
    await dormir(300);
    // Fuera de todo texto, como cuando clicas en el fondo.
    await v.js(`document.activeElement?.blur?.(), true`);
  };
  /** Un recuadro arrastrado con la herramienta «caja» (R), de (x,y) a (x+w,y+h). */
  const caja = async (x, y, w, h) => {
    await tecla("r");
    await dormir(200);
    await ratón("mouseMoved", x, y);
    await ratón("mousePressed", x, y);
    for (let i = 1; i <= 8; i++) await ratón("mouseMoved", x + (w * i) / 8, y + (h * i) / 8);
    await ratón("mouseReleased", x + w, y + h);
    await dormir(300);
  };

  // ── 0. Los dos globales, en la Cabina: lo de siempre ──────────────────────
  dice(!!(await hasta(() => v.js(`document.querySelectorAll("[data-pane-id]").length >= 1`), 20_000)), "la Cabina tiene su terminal");
  await dormir(1500);
  // El foco, en el panel (un clic de verdad sobre él: `onMouseDownCapture` lo marca
  // como el enfocado) y luego fuera de todo texto.
  const centro = await v.js(`(() => { const r = document.querySelector("[data-pane-id]")?.getBoundingClientRect(); return r ? JSON.stringify([r.x + r.width / 2, r.y + r.height / 2]) : null; })()`).then((s) => JSON.parse(s));
  await clic(centro[0], centro[1]);
  await dormir(300);
  let f0 = await foto();
  console.log(`      salgo de: ${JSON.stringify(f0)}`);
  await teclaCS("e");
  await dormir(300);
  let f1 = await foto();
  dice(f1.emision && !f0.emision, "en la Cabina, Ctrl+Mayús+E enciende el modo emisión", JSON.stringify(f1));
  await teclaCS("e");
  await dormir(300);
  f1 = await foto();
  dice(!f1.emision, "y otra vez lo apaga", JSON.stringify(f1));
  await teclaCS("ArrowDown");
  await dormir(1200);
  f1 = await foto();
  dice(f1.paneles === f0.paneles + 1, "en la Cabina, Ctrl+Mayús+↓ parte el panel hacia abajo", `paneles ${f0.paneles} -> ${f1.paneles}`);

  // ── 1. El lienzo, con dos recuadros que se solapan, y NADA dibujado antes ──
  dice(!!(await vista("lienzo")), "se abre el Lienzo");
  await dormir(2500);
  const zona = await v.js(`(() => { const r = document.querySelector(".canvas-draw")?.getBoundingClientRect(); return r ? JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }) : null; })()`).then((s) => (s ? JSON.parse(s) : null));
  dice(!!zona, "el lienzo tiene su capa de dibujo", JSON.stringify(zona));
  const vacio = [zona.x + zona.w * 0.12, zona.y + zona.h * 0.85];
  await clic(vacio[0], vacio[1]);

  // Sin nada dibujado: el lienzo no tiene qué exportar, así que la tecla es del global.
  let f = await foto();
  const sinDibujo = f;
  await teclaCS("e");
  await dormir(800);
  f = await foto();
  console.log(`      E sin dibujo -> ${JSON.stringify(f)}`);
  dice(f.emision !== sinDibujo.emision, "Ctrl+Mayús+E sin nada dibujado cambia el modo emisión (el global)", `emisión ${sinDibujo.emision} -> ${f.emision}`);
  dice(f.guardar === sinDibujo.guardar && !f.aviso, "y el lienzo no pide guardar nada ni se queja de que no hay dibujo", JSON.stringify(f));
  await teclaCS("e");
  await dormir(300);

  const X = zona.x + zona.w * 0.55;
  const Y = zona.y + zona.h * 0.55;
  await caja(X, Y, 220, 150);
  await tecla("v");
  await caja(X + 70, Y + 50, 220, 150);
  await tecla("v");
  await dormir(300);
  f = await foto();
  const ids = f.orden.split(",").filter(Boolean);
  dice(ids.length === 2, "hay dos trazos dibujados", JSON.stringify(f));

  // Coger el primero (el de debajo): se pincha una parte suya que no tape el segundo.
  const punto = await v.js(`(() => {
    const g = document.querySelector('g.canvas-draw-shape[data-id="${ids[0]}"]');
    const b = g.getBoundingClientRect();
    for (let fy = 0.05; fy < 1; fy += 0.05)
      for (let fx = 0.02; fx < 0.4; fx += 0.02) {
        const el = document.elementFromPoint(b.x + b.width * fx, b.y + b.height * fy);
        if (el?.closest("g.canvas-draw-shape")?.dataset.id === "${ids[0]}") return JSON.stringify([b.x + b.width * fx, b.y + b.height * fy]);
      }
    return null;
  })()`).then((s) => (s ? JSON.parse(s) : null));
  dice(!!punto, "hay un punto del primer trazo que se puede pinchar", JSON.stringify(punto));
  // «Soltar» de la barra del lienzo: un clic en el vacío no suelta un trazo cogido solo.
  const soltar = async () => {
    await v.js(`document.querySelector(".cp-btn.cp-done")?.click(), true`);
    await dormir(300);
    await v.js(`document.activeElement?.blur?.(), true`);
  };
  const coger = async () => {
    await soltar();
    await clic(punto[0], punto[1]);
  };

  // ── 2. Con un trazo cogido: el lienzo tiene qué mandar al frente y al fondo ──
  await coger();
  f = await foto();
  dice(f.cogidos === ids[0], "el primer trazo está cogido", JSON.stringify(f));
  const antes1 = f;
  await teclaCS("ArrowUp");
  await dormir(400);
  f = await foto();
  console.log(`      ↑ con un trazo cogido -> ${JSON.stringify(f)}`);
  dice(f.orden.split(",").pop() === ids[0], "Ctrl+Mayús+↑ trae el trazo cogido al frente (el lienzo)", JSON.stringify(f));
  dice(f.paneles === antes1.paneles, "y no parte ningún panel", `paneles ${antes1.paneles} -> ${f.paneles}`);
  const antes2 = f;
  await teclaCS("ArrowDown");
  await dormir(1200);
  f = await foto();
  console.log(`      ↓ con un trazo cogido -> ${JSON.stringify(f)}`);
  dice(f.orden.split(",")[0] === ids[0], "Ctrl+Mayús+↓ manda al fondo el trazo cogido (el lienzo)", JSON.stringify(f));
  dice(f.paneles === antes2.paneles, "y NO parte además un panel por debajo", `paneles ${antes2.paneles} -> ${f.paneles}`);

  // ── 3. Ctrl+Mayús+↓ sin nada cogido: no hay qué mandar al fondo, es del global ──
  await soltar();
  f = await foto();
  dice(f.cogidos === "", "no hay nada cogido", JSON.stringify(f));
  const antes3 = f;
  await teclaCS("ArrowDown");
  await dormir(1200);
  f = await foto();
  console.log(`      ↓ sin nada cogido -> ${JSON.stringify(f)}`);
  dice(f.paneles === antes3.paneles + 1 && f.orden === antes3.orden, "Ctrl+Mayús+↓ sin nada cogido parte el panel (el global), como siempre, y no toca el orden", `paneles ${antes3.paneles} -> ${f.paneles}; orden ${antes3.orden} -> ${f.orden}`);

  // ── 3b. Con el foco dentro de una terminal, las teclas son del programa y de los globales ──
  // El panel que acaba de nacer del «↓» se queda con el foco: el lienzo no toca nada
  // que se escriba dentro de una terminal, y el modo emisión sigue siendo del global.
  const enTexto = () => v.js(`(() => { const e = document.activeElement; return !!e && (e.tagName === "TEXTAREA" || e.tagName === "INPUT"); })()`);
  const huboFoco = await hasta(async () => {
    await v.js(`document.querySelectorAll(".xterm-helper-textarea").forEach((t) => t.focus()), true`);
    return enTexto();
  }, 5000, 200);
  dice(!!huboFoco, "el foco está dentro de una terminal (un cuadro de texto)");
  const antes3b = await foto();
  await teclaCS("e");
  await dormir(800);
  f = await foto();
  dice(f.emision !== antes3b.emision && f.guardar === antes3b.guardar, "con el foco en una terminal, Ctrl+Mayús+E es el global (modo emisión), como siempre", `emisión ${antes3b.emision} -> ${f.emision}; guardar ${antes3b.guardar} -> ${f.guardar}`);
  await teclaCS("e");
  await dormir(300);

  // ── 4. Ctrl+Mayús+E con un dibujo hecho: exportar, y solo exportar ────────
  // Dar foco a una terminal te lleva a la Cabina: se vuelve al Lienzo (con el dibujo intacto).
  dice(!!(await vista("lienzo")), "se vuelve al Lienzo");
  await dormir(1500);
  await soltar();
  await v.js(`(() => { document.activeElement?.blur?.(); return true; })()`);
  dice(!(await enTexto()), "el foco está fuera de todo texto");
  console.log(`      foco en: ${await v.js(`(() => { const e = document.activeElement; return e ? e.tagName + "." + String(e.className).slice(0, 40) : "nada"; })()`)}`);
  const antes4 = await foto();
  await teclaCS("e");
  await dormir(1200);
  f = await foto();
  console.log(`      E con dibujo -> ${JSON.stringify(f)}`);
  dice(f.guardar === antes4.guardar + 1, "Ctrl+Mayús+E con un dibujo hecho exporta (pide dónde guardar)", `guardar ${antes4.guardar} -> ${f.guardar}`);
  dice(f.emision === antes4.emision, "y NO cambia además el modo emisión", `emisión ${antes4.emision} -> ${f.emision}`);

  // ── 5. La misma tecla reenviada (la paleta de comandos, el navegador de un panel) ──
  // Va al global que la pidió, aunque el lienzo tenga dibujo o algo cogido: quien
  // elige «Modo emisión» en la paleta quiere el modo emisión.
  await coger();
  const antes5 = await foto();
  await teclaReenviada("E");
  await dormir(800);
  f = await foto();
  console.log(`      E reenviada -> ${JSON.stringify(f)}`);
  dice(f.emision !== antes5.emision && f.guardar === antes5.guardar, "Ctrl+Mayús+E reenviada cambia el modo emisión y no exporta", `emisión ${antes5.emision} -> ${f.emision}; guardar ${antes5.guardar} -> ${f.guardar}`);
  await teclaReenviada("ArrowDown");
  await dormir(1200);
  const f5 = await foto();
  console.log(`      ↓ reenviada con un trazo cogido -> ${JSON.stringify(f5)}`);
  dice(f5.paneles === f.paneles + 1 && f5.orden === f.orden, "Ctrl+Mayús+↓ reenviada parte el panel y no manda nada al fondo", `paneles ${f.paneles} -> ${f5.paneles}; orden ${f.orden} -> ${f5.orden}`);

  await a.foto(null, "atajos-lienzo.png");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
