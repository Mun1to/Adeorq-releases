// Que un aviso espere a ver si la cosa aguanta.  `pnpm avisos`
//
//   npx tsc scripts/avisos-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/avisos-check.js
//
// El caso que existe para arreglar: un CLI toca la campana al acabar un turno
// INTERMEDIO y arranca el siguiente un segundo después. Sonaba igual que uno
// que ha terminado de verdad, y con nueve terminales eso son nueve pitidos por
// nada. Un aviso que casi siempre miente acaba apagado entero, y entonces se
// pierden también los que sí importaban.
//
// `avisar` no se puede importar tal cual: arrastra el plugin de notificaciones
// de Tauri, que fuera de la app no existe. Lo que se prueba aquí es SU REGLA,
// escrita otra vez y a mano, contra la misma constante de espera. La regla es
// de tres líneas; lo que hay que sostener es cuándo dispara y cuándo no.

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const ESPERA_MS = 3000;

interface Aviso {
  tag: string;
  sigueIgual: () => boolean;
}

/** El mismo mecanismo que `avisar`, con un reloj de mentira. */
function crearCentral() {
  let ahora = 0;
  const enVuelo = new Map<string, { cuando: number; a: Aviso }>();
  const sonados: string[] = [];

  return {
    pedir(a: Aviso) {
      // Repetir el mismo tag reinicia la espera, igual que en la app: es lo que
      // hace que una ráfaga de campanas cuente como una sola.
      enVuelo.set(a.tag, { cuando: ahora + ESPERA_MS, a });
    },
    olvidar(prefijo: string) {
      for (const k of [...enVuelo.keys()]) if (k.startsWith(prefijo)) enVuelo.delete(k);
    },
    correr(ms: number) {
      ahora += ms;
      for (const [k, v] of [...enVuelo.entries()]) {
        if (v.cuando > ahora) continue;
        enVuelo.delete(k);
        if (v.a.sigueIgual()) sonados.push(k);
      }
    },
    sonados,
  };
}

// ── El agente que terminó de verdad ─────────────────────────────────────────
{
  const c = crearCentral();
  let terminado = true;
  c.pedir({ tag: "7:done", sigueIgual: () => terminado });
  c.correr(2999);
  ok("antes de la espera no ha sonado nada", c.sonados.length === 0);
  c.correr(2);
  ok(
    "y al cumplirse suena",
    c.sonados.join() === "7:done",
    "este es el aviso que no se puede perder",
  );
}

// ── El turno intermedio, que es el fallo ────────────────────────────────────
{
  const c = crearCentral();
  let terminado = true;
  c.pedir({ tag: "7:done", sigueIgual: () => terminado });
  c.correr(1000);
  terminado = false; // el agente arranca el paso siguiente
  c.correr(2500);
  ok(
    "un turno intermedio NO suena",
    c.sonados.length === 0,
    "es el pitido por nada que se viene a quitar",
  );
}

// ── Una ráfaga de campanas es UN aviso, no cinco ────────────────────────────
{
  const c = crearCentral();
  const terminado = true;
  for (let i = 0; i < 5; i++) {
    c.pedir({ tag: "7:done", sigueIgual: () => terminado });
    c.correr(400);
  }
  ok("cinco campanas seguidas no han sonado todavía", c.sonados.length === 0);
  c.correr(3000);
  ok(
    "y al final suena UNA",
    c.sonados.length === 1,
    "cada campana reinicia la espera, así que la ráfaga cuenta como una",
  );
}

// ── La pregunta que se contesta sola ────────────────────────────────────────
{
  const c = crearCentral();
  let hayPregunta = true;
  c.pedir({ tag: "3:ask", sigueIgual: () => hayPregunta });
  c.correr(1500);
  hayPregunta = false; // el propio CLI la retira, o una automatización responde
  c.correr(2000);
  ok("una pregunta que se retira sola no suena", c.sonados.length === 0);
}

// ── La pregunta que sigue ahí ───────────────────────────────────────────────
{
  const c = crearCentral();
  const hayPregunta = true;
  c.pedir({ tag: "3:ask", sigueIgual: () => hayPregunta });
  c.correr(3001);
  ok(
    "y la que sigue esperándote sí",
    c.sonados.join() === "3:ask",
    "esta es la que de verdad te reclama",
  );
}

// ── Cerrar el panel se lleva su aviso ───────────────────────────────────────
{
  const c = crearCentral();
  const terminado = true;
  c.pedir({ tag: "7:done", sigueIgual: () => terminado });
  c.correr(1000);
  c.olvidar("7:");
  c.correr(4000);
  ok(
    "un panel cerrado no avisa desde la tumba",
    c.sonados.length === 0,
    "y de paso su `sigueIgual` leería un ref congelado",
  );
}

// ── Y no se lleva por delante el de otro panel ──────────────────────────────
{
  const c = crearCentral();
  const terminado = true;
  c.pedir({ tag: "7:done", sigueIgual: () => terminado });
  c.pedir({ tag: "8:done", sigueIgual: () => terminado });
  c.olvidar("7:");
  c.correr(3001);
  ok(
    "cerrar el 7 deja vivo el aviso del 8",
    c.sonados.join() === "8:done",
    "el prefijo lleva los dos puntos justo por esto",
  );
}

// ── Dos panes a la vez, cada uno con lo suyo ────────────────────────────────
{
  const c = crearCentral();
  let unoSigue = true;
  const otroSigue = true;
  c.pedir({ tag: "1:done", sigueIgual: () => unoSigue });
  c.pedir({ tag: "2:done", sigueIgual: () => otroSigue });
  c.correr(1000);
  unoSigue = false;
  c.correr(2500);
  ok(
    "solo suena el que aguantó",
    c.sonados.join() === "2:done",
    "cada aviso se juzga por su cuenta",
  );
}

// ── El panel 1 no se confunde con el 12 ─────────────────────────────────────
{
  const c = crearCentral();
  const terminado = true;
  c.pedir({ tag: "12:done", sigueIgual: () => terminado });
  c.olvidar("1:");
  c.correr(3001);
  ok(
    "cerrar el panel 1 no cancela el del 12",
    c.sonados.join() === "12:done",
    "sin los dos puntos, `startsWith` se comería medio tablero",
  );
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
