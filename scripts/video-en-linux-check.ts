// Bajar un vídeo a un `blob:` para el `<video>` de WebKitGTK (`lib/videoEnLinux.ts`): el
// archivo sale entero por trozos, y uno que no cabe se rechaza sin bajarlo.
//
//   pnpm bancos video-en-linux
//
// Lo que NO prueba: que WebKitGTK lo pinte. Eso se mira con la foto de
// `scripts/laboratorio/linux-de-verdad.mjs`, y con un fondo de vídeo sembrado.

import { bajarVideo } from "../src/lib/videoEnLinux";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** Un `asset:` de mentira: da como mucho `maximo` bytes por rango, como el de Tauri. */
function asset(archivo: Uint8Array, maximo = 1000 * 1024) {
  const pedidos: string[] = [];
  const pedir = async (_url: string, o: { headers: Record<string, string> }) => {
    const rango = o.headers.Range;
    pedidos.push(rango);
    const m = /bytes=(\d+)-(\d+)/.exec(rango)!;
    const a = Number(m[1]);
    const b = Math.min(Number(m[2]), a + maximo - 1, archivo.length - 1);
    const cabeceras = new Headers({ "content-range": `bytes ${a}-${b}/${archivo.length}`, "content-type": "video/mp4" });
    return { ok: true, status: 206, headers: cabeceras, blob: async () => new Blob([archivo.slice(a, b + 1)]) };
  };
  return { pedir, pedidos };
}

void (async () => {
  const MB = 1000 * 1024;
  const archivo = Uint8Array.from({ length: 2 * MB + 123 }, (_, i) => i % 251);
  let a = asset(archivo);
  let b = await bajarVideo("asset://x", a.pedir);
  const leido = new Uint8Array(await b.arrayBuffer());
  ok("sale entero, byte a byte", leido.length === archivo.length && leido.every((v, i) => v === archivo[i]), `${leido.length} bytes`);
  ok("en los trozos justos", a.pedidos.length === 3, a.pedidos.join(" "));
  ok("con su tipo, que el <video> lo mira", b.type === "video/mp4", b.type);

  a = asset(new Uint8Array(100));
  b = await bajarVideo("asset://x", a.pedir);
  ok("uno pequeño cabe en un trozo", b.size === 100 && a.pedidos.length === 1);

  a = asset(archivo, 1000);
  a.pedidos.length = 0;
  const conTope = await bajarVideo("asset://x", a.pedir, 100).then(
    () => "bajado",
    (e: Error) => e.message,
  );
  ok("por encima del tope se rechaza, y al primer pedido", conTope.includes("demasiado") && a.pedidos.length === 1, conTope);

  const roto = await bajarVideo("asset://x", async () => ({ ok: false, status: 403, headers: new Headers(), blob: async () => new Blob() })).then(
    () => "bajado",
    (e: Error) => e.message,
  );
  ok("un 403 de fuera del alcance es un fallo, no un vídeo vacío", roto.includes("403"), roto);

  const sinRango = await bajarVideo("asset://x", async () => ({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob([new Uint8Array(7)]) }));
  ok("si contesta sin rango, vale lo que dé", sinRango.size === 7);

  const cortado = await bajarVideo("asset://x", async () => ({
    ok: true,
    status: 206,
    headers: new Headers({ "content-range": "bytes 0-9/10" }),
    blob: async () => new Blob(),
  })).then(
    () => "bajado",
    (e: Error) => e.message,
  );
  ok("un trozo vacío no da vueltas para siempre", cortado.includes("cortado"), cortado);

  if (fallos) {
    console.error(`\n${fallos} fallo(s)`);
    process.exit(1);
  }
  console.log("\nTodo bien.");
})();
