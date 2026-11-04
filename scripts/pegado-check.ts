// Pegar en una terminal: de los caminos pega uno solo, y si el portapapeles
// del navegador no da nada, pega el texto del evento; y si tampoco hay evento
// (el «Pegar» del botón derecho), el portapapeles del sistema (`lib/pegado.ts`).
// Con un portapapeles, un reloj y un sistema de mentira.
//
//   pnpm bancos pegado
//
// Lo que NO prueba: que WebKitGTK niegue de verdad el portapapeles ni que su
// evento `paste` traiga el texto. Eso hay que verlo en un Linux.

import { copiarPorOsc52, crearPegado, ESPERA_AL_PORTAPAPELES_MS, textoDeOsc52, TOPE_OSC52, type Reloj } from "../src/lib/pegado";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** Un reloj que solo avanza cuando se le dice. */
function relojDeMentira() {
  let t = 1000;
  let n = 0;
  const citas = new Map<number, { f: () => void; cuando: number }>();
  const reloj: Reloj = {
    ahora: () => t,
    programar: (f, ms) => {
      citas.set(++n, { f, cuando: t + ms });
      return n;
    },
    cancelar: (id) => void citas.delete(id as number),
  };
  const pasa = (ms: number) => {
    t += ms;
    for (const [id, c] of [...citas]) {
      if (c.cuando > t) continue;
      citas.delete(id);
      c.f();
    }
  };
  return { reloj, pasa };
}

/** Un portapapeles cuyas respuestas se sueltan a mano. */
function portapapelesDeMentira() {
  type Suelta<T> = { bien: (v: T) => void; mal: () => void };
  const lecturas: Suelta<Array<{ types: string[]; getType(t: string): Promise<Blob> }>>[] = [];
  const textos: Suelta<string>[] = [];
  const promesa = <T,>(cola: Suelta<T>[]) =>
    new Promise<T>((bien, mal) => {
      cola.push({ bien, mal: () => mal(new Error("NotAllowedError")) });
    });
  return { read: () => promesa(lecturas), readText: () => promesa(textos), lecturas, textos };
}

const deja = () => new Promise<void>((r) => setTimeout(r, 0));
const deTexto = [{ types: ["text/plain"], getType: async () => new Blob(["x"]) }];

async function escena(
  guion: (e: { p: ReturnType<typeof crearPegado>; porta: ReturnType<typeof portapapelesDeMentira>; pasa: (ms: number) => void }) => Promise<void>,
  sistema: string | null = null,
) {
  const pegados: string[] = [];
  let notas = 0;
  const porta = portapapelesDeMentira();
  const { reloj, pasa } = relojDeMentira();
  const pedidas = { sistema: 0 };
  const p = crearPegado({ pegar: (x) => pegados.push(x), guardarImagen: async () => "C:/tmp/pegada.png", alPegarImagen: () => notas++ }, porta, reloj, async () => {
    pedidas.sistema++;
    return sistema;
  });
  await guion({ p, porta, pasa });
  await deja();
  return { pegados, notas, sistema: pedidas.sistema };
}

// Los bancos se compilan a CommonJS, que no deja esperar fuera de una función.
void (async () => {
// --- el portapapeles funciona (Windows): pega él, una vez -----------------------------
let r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  p.desdeElEvento("hola");
  porta.lecturas[0].bien(deTexto);
  await deja();
  porta.textos[0].bien("hola");
});
ok("portapapeles y evento a la vez: se pega una sola vez", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  porta.lecturas[0].bien(deTexto);
  await deja();
  porta.textos[0].bien("hola");
  await deja();
  p.desdeElEvento("hola");
});
ok("el evento llega cuando el portapapeles ya pegó: no se repite", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  p.desdeElEvento("");
  porta.lecturas[0].bien([{ types: ["image/png"], getType: async () => new Blob([new Uint8Array([1, 2, 3])]) }]);
});
ok("una imagen: entra su ruta, con su nota, y el evento vacío no pinta nada", r.pegados.join("|") === '"C:/tmp/pegada.png" ' && r.notas === 1, JSON.stringify(r));

// --- el portapapeles no da nada (lo que se le supone a WebKitGTK) ----------------------
r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  p.desdeElEvento("hola");
  porta.lecturas[0].mal();
  await deja();
  porta.textos[0].mal();
});
ok("el portapapeles falla después del evento: se pega el texto del evento", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  porta.lecturas[0].mal();
  await deja();
  porta.textos[0].mal();
  await deja();
  p.desdeElEvento("hola");
});
ok("el portapapeles falla antes del evento: lo mismo, y al momento", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta }) => {
  p.desdeElPortapapeles();
  p.desdeElEvento("hola");
  porta.lecturas[0].bien(deTexto);
  await deja();
  porta.textos[0].bien("");
});
ok("el portapapeles contesta vacío: vale el texto del evento", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta, pasa }) => {
  p.desdeElPortapapeles();
  p.desdeElEvento("hola");
  pasa(ESPERA_AL_PORTAPAPELES_MS - 1);
  ok("  (mientras se le espera no se pega nada)", true);
  pasa(2);
  await deja();
  // Y contesta tarde, cuando el evento ya pegó.
  porta.lecturas[0].bien(deTexto);
  await deja();
  porta.textos[0].bien("hola");
});
ok("el portapapeles no contesta: a los 250 ms pega el evento, y su respuesta tardía no repite", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, pasa }) => {
  // Mayús+Insert: hay evento y nadie ha leído el portapapeles.
  p.desdeElEvento("hola");
  pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
});
ok("un evento sin nadie leyendo el portapapeles también pega", r.pegados.join("|") === "hola", JSON.stringify(r.pegados));

r = await escena(async ({ p, porta, pasa }) => {
  // El botón derecho con el portapapeles negado: no hay evento del que tirar.
  p.desdeElPortapapeles();
  porta.lecturas[0].mal();
  await deja();
  porta.textos[0].mal();
  await deja();
  pasa(5000);
  // Un pegado de otro momento no se cuela por aquel fallo: espera como todos.
  p.desdeElEvento("otro");
  ok("  (un fallo viejo no hace pegar al momento)", true);
});
ok("sin evento, sin portapapeles y sin el del sistema (Windows) no se pega nada, y el fallo caduca", r.pegados.length === 0, JSON.stringify(r.pegados));

// --- el «Pegar» del botón derecho en Linux: el portapapeles del sistema (incidencia #3) ---
const menuSinPortapapeles = async ({ p, porta }: { p: ReturnType<typeof crearPegado>; porta: ReturnType<typeof portapapelesDeMentira> }) => {
  p.desdeElPortapapeles();
  porta.lecturas[0].mal();
  await deja();
  porta.textos[0].mal();
  await deja();
};
r = await escena(async (e) => {
  await menuSinPortapapeles(e);
  e.pasa(ESPERA_AL_PORTAPAPELES_MS - 1);
  ok("  (mientras se espera un evento, no se pide al sistema)", true);
  e.pasa(2);
  await deja();
}, "del sistema");
ok("el botón derecho sin portapapeles pega lo del sistema, una vez", r.pegados.join("|") === "del sistema" && r.sistema === 1, JSON.stringify(r));

r = await escena(async (e) => {
  await menuSinPortapapeles(e);
  e.pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
  await deja();
  // Un evento tardío del mismo pegado no lo repite.
  e.pasa(100);
  e.p.desdeElEvento("del sistema");
  e.pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
}, "del sistema");
ok("si llega un evento después de pegar lo del sistema, no se repite", r.pegados.join("|") === "del sistema", JSON.stringify(r));

r = await escena(async (e) => {
  // Ctrl+V en Linux: el portapapeles falla y el evento llega enseguida.
  await menuSinPortapapeles(e);
  e.pasa(40);
  e.p.desdeElEvento("hola");
  e.pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
  await deja();
}, "del sistema");
ok("Ctrl+V con su evento no le pide nada al sistema", r.pegados.join("|") === "hola" && r.sistema === 0, JSON.stringify(r));

r = await escena(async (e) => {
  // Dos «Pegar» seguidos: el primero no pega tarde encima del segundo.
  await menuSinPortapapeles(e);
  e.p.desdeElPortapapeles();
  e.porta.lecturas[1].bien(deTexto);
  await deja();
  e.porta.textos[1].bien("el segundo");
  await deja();
  e.pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
  await deja();
}, "del sistema");
ok("un pegado viejo no pega lo del sistema encima de uno nuevo", r.pegados.join("|") === "el segundo", JSON.stringify(r));

r = await escena(async ({ p, porta }) => {
  // Dos Ctrl+V seguidos con el portapapeles sano.
  for (let i = 0; i < 2; i++) {
    p.desdeElPortapapeles();
    p.desdeElEvento("hola");
    porta.lecturas[i].bien(deTexto);
    await deja();
    porta.textos[i].bien("hola");
    await deja();
  }
});
ok("dos pegados seguidos son dos, no tres ni cuatro", r.pegados.join("|") === "hola|hola", JSON.stringify(r.pegados));

// --- el botón central: lo seleccionado, una vez, venga o no el evento del navegador ---
{
  const pegados: string[] = [];
  const { reloj, pasa } = relojDeMentira();
  const porta = portapapelesDeMentira();
  const p = crearPegado(
    { pegar: (x) => pegados.push(x), guardarImagen: async () => "", alPegarImagen: () => {} },
    porta,
    reloj,
    async () => "del portapapeles",
    async () => "lo seleccionado",
  );
  p.desdeLaSeleccion();
  await deja();
  ok("el botón central pega lo seleccionado, no el portapapeles", pegados.join("|") === "lo seleccionado", JSON.stringify(pegados));
  // Si el navegador también dispara su `paste` (otro WebKit), no sale doble.
  pasa(10);
  p.desdeElEvento("lo seleccionado");
  pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
  await deja();
  ok("y si además llega el evento del navegador, no sale doble", pegados.join("|") === "lo seleccionado", JSON.stringify(pegados));

  pegados.length = 0;
  pasa(5000);
  p.desdeElEvento("lo seleccionado");
  p.desdeLaSeleccion();
  await deja();
  pasa(ESPERA_AL_PORTAPAPELES_MS + 1);
  await deja();
  ok("con el evento por delante, tampoco", pegados.join("|") === "lo seleccionado", JSON.stringify(pegados));
}
{
  const pegados: string[] = [];
  const { reloj } = relojDeMentira();
  const p = crearPegado(
    { pegar: (x) => pegados.push(x), guardarImagen: async () => "", alPegarImagen: () => {} },
    portapapelesDeMentira(),
    reloj,
    async () => null,
    async () => null,
  );
  p.desdeLaSeleccion();
  await deja();
  ok("sin nada seleccionado (Windows, macOS) no pega nada", pegados.length === 0, JSON.stringify(pegados));
}

// Copiar desde el programa (OSC 52). Claude Code en pantalla completa tiene el
// ratón: el arrastre es suyo y lo seleccionado lo manda así,
// `ESC ] 52 ; c ; <base64> BEL`. Sin atenderlo, arrastrar y Ctrl+C no copiaba
// nada (`scripts/laboratorio/copiar-pegar-claude.mjs`, 2026-11-01).
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
ok("OSC 52 con texto: se copia, tildes y emojis incluidos", textoDeOsc52(`c;${b64("añadir ✓ 🚀 línea\n2")}`) === "añadir ✓ 🚀 línea\n2");
ok("OSC 52 sin destino (`;base64`): se copia igual", textoDeOsc52(`;${b64("hola")}`) === "hola");
ok("OSC 52 «?» (el programa quiere LEER tu portapapeles): nunca", textoDeOsc52("c;?") === null);
ok("OSC 52 vacío (borrar): no se toca el portapapeles", textoDeOsc52("c;") === null);
ok("OSC 52 que no es base64: nada", textoDeOsc52("c;no es base64!!") === null);
ok("OSC 52 de más de un mega: nada", textoDeOsc52(`c;${"A".repeat(TOPE_OSC52 + 4)}`) === null);

// Solo la terminal en la que estás puede escribir tu portapapeles: un agente en
// segundo plano, o un `cat` de un archivo con la secuencia dentro, en otro
// panel, no puede pisarlo mientras trabajas en otro sitio.
{
  let manejador: ((datos: string) => boolean) | null = null;
  const term = { parser: { registerOscHandler: (_id: number, f: (datos: string) => boolean) => ((manejador = f), {}) } };
  const escrito: string[] = [];
  let conFoco = false;
  copiarPorOsc52(term, (t) => void escrito.push(t), () => conFoco);
  manejador?.(`c;${b64("desde un panel sin foco")}`);
  ok("OSC 52 de una terminal SIN foco: no toca el portapapeles", escrito.length === 0, JSON.stringify(escrito));
  conFoco = true;
  manejador?.(`c;${b64("desde la terminal en la que estás")}`);
  ok("OSC 52 de la terminal CON foco: se copia", escrito.join("|") === "desde la terminal en la que estás", JSON.stringify(escrito));
}

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
})();
