// Cliente mínimo del protocolo de depuración, sin dependencias (Node 24 trae
// WebSocket y fetch). Habla con la ventana de la Adeorq de pruebas por dentro:
// nada de ratón ni de teclado del escritorio.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// `ADEORQ_URL`: la dirección de la que carga un binario hecho para otro puerto.
export async function conectar({ puerto = 9333, url = process.env.ADEORQ_URL || "localhost:1420" } = {}) {
  const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
  const destino = lista.find((t) => t.type === "page" && t.url.includes(url));
  if (!destino) throw new Error("no hay página: " + JSON.stringify(lista.map((t) => [t.type, t.url])));
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error("no conecta"));
  });
  let n = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message));
    else p.ok(m.result);
  };
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = ++n;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** Evalúa una expresión en la página y devuelve su valor (espera promesas). */
  const js = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  /** Llama a una función con argumentos, sin pelearse con las comillas. */
  const llamar = (fn, ...args) => js(`(${fn.toString()})(...${JSON.stringify(args)})`);

  const tamano = (ancho, alto, escala = 2) =>
    enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: escala, mobile: false });

  const foto = async (ruta) => {
    const r = await enviar("Page.captureScreenshot", { format: "png", fromSurface: true });
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, Buffer.from(r.data, "base64"));
    return ruta;
  };

  const raton = async (x, y, tipo = "click") => {
    if (tipo === "mover") return enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await enviar("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await enviar("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };

  /** Clic de verdad (con su posición) sobre el primer elemento que case. */
  const clic = async (selector, texto) => {
    const p = await llamar(
      (sel, txt) => {
        const els = [...document.querySelectorAll(sel)].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (!txt || (e.textContent ?? "").trim().includes(txt));
        });
        // El más pequeño que case: el botón, no el contenedor que lo envuelve.
        els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
        const e = els[0];
        if (!e) return null;
        e.scrollIntoView({ block: "nearest" });
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      },
      selector,
      texto ?? "",
    );
    if (!p) throw new Error(`no encuentro ${selector} ${texto ?? ""}`);
    await raton(p.x, p.y);
    return p;
  };

  const tecla = async (key, code = key, vk = 0, text) => {
    await enviar("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, text });
    await enviar("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  };

  const escribir = (text) => enviar("Input.insertText", { text });

  const esperar = async (expr, ms = 15000, cada = 250) => {
    const fin = Date.now() + ms;
    for (;;) {
      const v = await js(expr).catch(() => null);
      if (v) return v;
      if (Date.now() > fin) throw new Error("no llegó: " + expr);
      await dormir(cada);
    }
  };

  return { enviar, js, llamar, tamano, foto, raton, clic, tecla, escribir, esperar, cerrar: () => ws.close(), destino };
}
