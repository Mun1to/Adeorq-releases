// Pegar en una terminal: de los dos caminos pega uno solo, y si el
// portapapeles del navegador no da nada, pega el texto del evento
// (`lib/pegado.ts`). Con un portapapeles y un reloj de mentira.
//
//   pnpm bancos pegado
//
// Lo que NO prueba: que WebKitGTK niegue de verdad el portapapeles ni que su
// evento `paste` traiga el texto. Eso hay que verlo en un Linux.

import { crearPegado, ESPERA_AL_PORTAPAPELES_MS, type Reloj } from "../src/lib/pegado";

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

async function escena(guion: (e: { p: ReturnType<typeof crearPegado>; porta: ReturnType<typeof portapapelesDeMentira>; pasa: (ms: number) => void }) => Promise<void>) {
  const pegados: string[] = [];
  let notas = 0;
  const porta = portapapelesDeMentira();
  const { reloj, pasa } = relojDeMentira();
  const p = crearPegado({ pegar: (x) => pegados.push(x), guardarImagen: async () => "C:/tmp/pegada.png", alPegarImagen: () => notas++ }, porta, reloj);
  await guion({ p, porta, pasa });
  await deja();
  return { pegados, notas };
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
ok("sin evento y sin portapapeles no se pega nada, y el fallo caduca", r.pegados.length === 0, JSON.stringify(r.pegados));

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

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
})();
