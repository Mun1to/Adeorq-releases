// A quién le habla el editor web cuando la página va en un iframe.
//
//   pnpm bancos editor-marco
//
// `canalDeMarco.enviar` mandaba las órdenes del editor (estilos, modo, rutas)
// con `postMessage(..., "*")`: si el iframe había navegado a otra web, esa web
// recibía las órdenes. Con el origen de la URL del marco como destino, el
// navegador descarta el mensaje si el marco ya no es de ese origen.

declare const process: { exit(codigo: number): never };
declare const require: (m: string) => unknown;

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

// `editorWeb.ts` y `navegador.ts` importan Tauri y miran `navigator` al cargar.
const g = globalThis as unknown as Record<string, unknown>;
g.window = { __TAURI_INTERNALS__: {}, addEventListener: () => {}, removeEventListener: () => {} };
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Windows" }, configurable: true });
g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { canalDeMarco } = require("../src/lib/editorWeb") as typeof import("../src/lib/editorWeb");

function marcoCon(src: string) {
  const enviados: Array<{ mensaje: unknown; destino: unknown }> = [];
  const marco = {
    src,
    contentWindow: { postMessage: (mensaje: unknown, destino: unknown) => enviados.push({ mensaje, destino }) },
  } as unknown as HTMLIFrameElement;
  return { marco, enviados };
}

{
  const { marco, enviados } = marcoCon("http://localhost:5173/pagina?x=1#ancla");
  canalDeMarco(marco).enviar({ tipo: "modo", valor: "editar" });
  ok("manda una vez", enviados.length === 1);
  ok("al origen del marco y no a «*»", enviados[0]?.destino === "http://localhost:5173", String(enviados[0]?.destino));
  ok("con la marca de Adeorq", (enviados[0]?.mensaje as { de?: string })?.de === "adeorq");
}
{
  const { marco, enviados } = marcoCon("https://ejemplo.com/ruta");
  canalDeMarco(marco).enviar({ tipo: "modo" });
  ok("a una web de fuera, a su origen (el navegador filtra si ha cambiado)", enviados[0]?.destino === "https://ejemplo.com");
}
{
  const { marco, enviados } = marcoCon("about:blank");
  canalDeMarco(marco).enviar({ tipo: "modo" });
  ok("sin una web cargada no se manda a nadie", enviados.length === 0, JSON.stringify(enviados));
}
{
  const { marco, enviados } = marcoCon("");
  canalDeMarco(marco).enviar({ tipo: "modo" });
  ok("con el marco vacío tampoco", enviados.length === 0);
}
{
  const { enviados } = marcoCon("http://localhost:5173/");
  canalDeMarco(null).enviar({ tipo: "modo" });
  ok("sin marco no hay nada que enviar", enviados.length === 0);
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
