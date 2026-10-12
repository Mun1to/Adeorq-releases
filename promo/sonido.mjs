/**
 * La música y los efectos que no son de nadie: los escribe este archivo.
 *
 *   node sonido.mjs      (o `pnpm sonido`; `pnpm render` lo lanza antes)
 *
 * Adeorq se vende, así que cada sonido del vídeo tiene que poder usarse en algo
 * comercial y poder demostrarse. Con la música eso es caro de comprobar pista a
 * pista, y una pista ajena no sabe cuánto dura el vídeo. Esta sale de aquí:
 * unos osciladores, unos filtros y una reverberación escritos a mano. No hay
 * archivo de terceros, ni licencia que cumplir, ni atribución que olvidar, y si
 * el guion cambia de duración la música no se queda corta.
 *
 * Lo que SÍ es de terceros (los clics de `public/sonido/kenney/`) está anotado
 * en el README con su licencia.
 *
 * Todo va a 96 pulsos por minuto: un compás son 2,5 segundos, 75 fotogramas
 * justos a 30 por segundo. Por eso en `guion.ts` las escenas duran múltiplos
 * de 2,5: el corte cae en el primer tiempo del compás.
 *
 * Salen a `public/sonido/hecho/`, que no se versiona: son megas que se rehacen
 * en dos segundos y siempre iguales (el ruido lleva semilla).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const PULSO = 96;
const NEGRA = 60 / PULSO;
const COMPAS = NEGRA * 4;
/** Los dos bucles duran ocho compases: 20 segundos, 600 fotogramas. */
const COMPASES = 8;

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = join(aqui, "public", "sonido", "hecho");

/* ── piezas ───────────────────────────────────────────────────────────────── */

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pista = (seg) => {
  const n = Math.round(seg * SR);
  return { n, L: new Float32Array(n), R: new Float32Array(n) };
};
/** Reparto a los dos lados con potencia constante: -1 izquierda, 1 derecha. */
const lados = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

/** Ruido con semilla: dos renders dan el mismo archivo, byte a byte. */
function sembrado(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Los coeficientes de un filtro de segundo orden (las recetas de Bristow-Johnson). */
function receta(tipo, f, q) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  let b0, b1, b2;
  if (tipo === "bajo") [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (tipo === "alto") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [al, 0, -al];
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
}

function filtro() {
  let z1 = 0;
  let z2 = 0;
  let k = [1, 0, 0, 0, 0];
  return {
    pon(c) {
      k = c;
    },
    paso(x) {
      const y = k[0] * x + z1;
      z1 = k[1] * x - k[3] * y + z2;
      z2 = k[2] * x - k[4] * y;
      return y;
    },
  };
}

/** Un diente de sierra sin el siseo del escalón (PolyBLEP). */
function sierra(fase, inc) {
  let v = 2 * fase - 1;
  if (fase < inc) {
    const t = fase / inc;
    v -= t + t - t * t - 1;
  } else if (fase > 1 - inc) {
    const t = (fase - 1) / inc;
    v -= t * t + t + t + 1;
  }
  return v;
}

/** Suma un sonido en la pista. Si `vuelta`, lo que se sale por el final entra
    por el principio: es lo que hace que un bucle no tenga costura. */
function suma(p, seg, s, vuelta = false) {
  const i0 = Math.round(seg * SR);
  for (let i = 0; i < s.L.length; i++) {
    let j = i0 + i;
    if (j >= p.n) {
      if (!vuelta) break;
      j %= p.n;
    }
    p.L[j] += s.L[i];
    p.R[j] += s.R[i];
  }
}

/* ── instrumentos ─────────────────────────────────────────────────────────── */

/** El colchón: tres sierras desafinadas un pelo, filtradas hasta dejarlas
    redondas. `brillo` abre el filtro al atacar y lo va cerrando. */
function colchon(midi, dura, { ataque = 0.5, suelta = 1.0, corte = 850, brillo = 0, nivel = 0.1 } = {}) {
  const s = pista(dura + suelta);
  for (const [cents, pan] of [[-9, -0.7], [0, 0], [9, 0.7]]) {
    const inc = (mtof(midi) * 2 ** (cents / 1200)) / SR;
    let fase = (midi * 0.37 + cents * 0.011 + 1) % 1;
    const f = filtro();
    const [gl, gr] = lados(pan);
    for (let i = 0; i < s.n; i++) {
      const t = i / SR;
      if (i % 64 === 0) f.pon(receta("bajo", corte * (1 + 0.22 * Math.sin(2 * Math.PI * 0.13 * t + midi)) + brillo * Math.exp(-t / 0.9), 0.7));
      let e = t < ataque ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ataque) : 1;
      if (t > dura) e *= 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (t - dura) / suelta));
      const y = f.paso(sierra(fase, inc)) * e * nivel;
      fase += inc;
      if (fase >= 1) fase -= 1;
      s.L[i] += y * gl;
      s.R[i] += y * gr;
    }
  }
  return s;
}

/** Una campanita: la nota y tres parciales que se apagan antes que ella. */
function campanita(midi, { nivel = 0.1, cae = 0.8, pan = 0 } = {}) {
  const s = pista(cae * 5);
  const w = 2 * Math.PI * mtof(midi);
  const [gl, gr] = lados(pan);
  for (let i = 0; i < s.n; i++) {
    const t = i / SR;
    const y =
      (Math.sin(w * t) +
        0.34 * Math.exp(-t / (cae * 0.5)) * Math.sin(2 * w * t) +
        0.12 * Math.exp(-t / (cae * 0.25)) * Math.sin(3.01 * w * t) +
        0.05 * Math.exp(-t / (cae * 0.12)) * Math.sin(4.2 * w * t)) *
      Math.exp(-t / cae) *
      Math.min(1, t / 0.004) *
      nivel;
    s.L[i] = y * gl;
    s.R[i] = y * gr;
  }
  return s;
}

function bombo({ nivel = 0.5 } = {}) {
  const s = pista(0.45);
  let fase = 0;
  for (let i = 0; i < s.n; i++) {
    const t = i / SR;
    fase += (2 * Math.PI * (46 + 74 * Math.exp(-t / 0.035))) / SR;
    const y = Math.tanh(1.6 * Math.sin(fase) * Math.exp(-t / 0.15)) * nivel * Math.min(1, t / 0.002);
    s.L[i] = y;
    s.R[i] = y;
  }
  return s;
}

/** La palmada: tres golpes de ruido muy juntos y una cola. */
function palmada(azar, { nivel = 0.15 } = {}) {
  const s = pista(0.32);
  const f = filtro();
  f.pon(receta("banda", 1700, 1.1));
  for (let i = 0; i < s.n; i++) {
    const t = i / SR;
    let e = 0.45 * Math.exp(-t / 0.085);
    for (const t0 of [0, 0.011, 0.023]) if (t >= t0) e += Math.exp(-(t - t0) / 0.011);
    const y = f.paso(azar() * 2 - 1) * e * nivel;
    s.L[i] = y;
    s.R[i] = y;
  }
  return s;
}

function plato(azar, { nivel = 0.05, cae = 0.03, pan = 0.2 } = {}) {
  const s = pista(cae * 6);
  const f = filtro();
  f.pon(receta("alto", 7200, 0.8));
  const [gl, gr] = lados(pan);
  for (let i = 0; i < s.n; i++) {
    const y = f.paso(azar() * 2 - 1) * Math.exp(-i / SR / cae) * nivel;
    s.L[i] = y * gl;
    s.R[i] = y * gr;
  }
  return s;
}

/** El bajo lleva dos armónicos encima: sin ellos, en los altavoces de un
    portátil no suena nada por debajo de 120 Hz y la música se queda sin suelo. */
function bajo(midi, dura, { nivel = 0.2 } = {}) {
  const s = pista(dura + 0.09);
  const w = (2 * Math.PI * mtof(midi)) / SR;
  for (let i = 0; i < s.n; i++) {
    const t = i / SR;
    let e = Math.min(1, t / 0.006) * (0.7 + 0.3 * Math.exp(-t / 0.18));
    if (t > dura) e *= Math.max(0, 1 - (t - dura) / 0.08);
    const y = Math.tanh(1.3 * (Math.sin(w * i) + 0.26 * Math.sin(2 * w * i) + 0.09 * Math.sin(3 * w * i))) * e * nivel;
    s.L[i] = y;
    s.R[i] = y;
  }
  return s;
}

/** La nota corta del arpegio: una sierra con el filtro cerrándose deprisa. */
function punteo(midi, { nivel = 0.045, pan = 0 } = {}) {
  const s = pista(0.5);
  const inc = mtof(midi) / SR;
  let fase = 0;
  const f = filtro();
  const [gl, gr] = lados(pan);
  for (let i = 0; i < s.n; i++) {
    const t = i / SR;
    if (i % 32 === 0) f.pon(receta("bajo", 600 + 4200 * Math.exp(-t / 0.07), 1.2));
    const y = f.paso(sierra(fase, inc)) * Math.exp(-t / 0.11) * Math.min(1, t / 0.002) * nivel;
    fase += inc;
    if (fase >= 1) fase -= 1;
    s.L[i] = y * gl;
    s.R[i] = y * gr;
  }
  return s;
}

/* ── lo que pasa después de tocar ─────────────────────────────────────────── */

/** Eco de lado a lado. En un bucle se da dos vueltas y se queda con la
    segunda, que ya trae dentro la cola de la primera. */
function eco(p, { tiempo, vuelve = 0.32, moja = 0.25, bucle = false }) {
  const d = Math.round(tiempo * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const L = new Float32Array(p.n);
  const R = new Float32Array(p.n);
  let k = 0;
  for (let vez = bucle ? 0 : 1; vez < 2; vez++) {
    for (let i = 0; i < p.n; i++) {
      const ol = bl[k];
      const or = br[k];
      bl[k] = (p.L[i] + p.R[i]) * 0.5 + or * vuelve;
      br[k] = ol;
      k = (k + 1) % d;
      if (vez === 1) {
        L[i] = p.L[i] + ol * moja;
        R[i] = p.R[i] + or * moja;
      }
    }
  }
  p.L = L;
  p.R = R;
  return p;
}

/** La sala: ocho peines y cuatro pasatodo por lado (la de Schroeder y Moorer,
    con las medidas de Freeverb pasadas a 48 kHz). */
function sala(p, { tamano = 0.84, apaga = 0.3, moja = 0.25, bucle = false } = {}) {
  const esc = SR / 44100;
  const lado = (extra) => ({
    peines: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => ({ b: new Float32Array(Math.round((n + extra) * esc)), i: 0, f: 0 })),
    todos: [556, 441, 341, 225].map((n) => ({ b: new Float32Array(Math.round((n + extra) * esc)), i: 0 })),
  });
  const izq = lado(0);
  const der = lado(23);
  const pasa = (c, x) => {
    let y = 0;
    for (const q of c.peines) {
      const o = q.b[q.i];
      q.f = o * (1 - apaga) + q.f * apaga;
      q.b[q.i] = x + q.f * tamano;
      q.i = (q.i + 1) % q.b.length;
      y += o;
    }
    for (const q of c.todos) {
      const o = q.b[q.i];
      q.b[q.i] = y + o * 0.5;
      q.i = (q.i + 1) % q.b.length;
      y = o - y;
    }
    return y;
  };
  const L = new Float32Array(p.n);
  const R = new Float32Array(p.n);
  for (let vez = bucle ? 0 : 1; vez < 2; vez++) {
    for (let i = 0; i < p.n; i++) {
      const x = (p.L[i] + p.R[i]) * 0.015;
      const wl = pasa(izq, x);
      const wr = pasa(der, x);
      if (vez === 1) {
        L[i] = p.L[i] + wl * moja * 3;
        R[i] = p.R[i] + wr * moja * 3;
      }
    }
  }
  p.L = L;
  p.R = R;
  return p;
}

/** Quita lo de más abajo: el barro que se acumula cuando cinco notas de un
    colchón comparten los mismos graves. */
function sinBarro(p, f = 120) {
  for (const canal of [p.L, p.R]) {
    const q = filtro();
    q.pon(receta("alto", f, 0.7));
    // Dos vueltas, como el eco y la sala: en la primera el filtro arranca
    // vacío, y si se guardara esa el bucle haría un chasquido en la costura.
    const limpio = new Float32Array(p.n);
    for (let vez = 0; vez < 2; vez++) for (let i = 0; i < p.n; i++) limpio[i] = q.paso(canal[i]);
    canal.set(limpio);
  }
  return p;
}

/** Sube lo de arriba con una repisa de agudos. Sin esto la mezcla medía 15 dB
    menos entre 2 y 8 kHz que entre 250 y 2.000: sonaba como detrás de una
    puerta. (Sumarle a la pista sus propios agudos filtrados no vale: cerca del
    corte llegan con la fase girada y se restan en vez de sumarse.) */
function aire(p, db, f = 2000) {
  const A = 10 ** (db / 40);
  const w = (2 * Math.PI * f) / SR;
  const c = Math.cos(w);
  const k = 2 * Math.sqrt(A) * (Math.sin(w) / 2) * Math.SQRT2;
  const a0 = A + 1 - (A - 1) * c + k;
  const coef = [
    (A * (A + 1 + (A - 1) * c + k)) / a0,
    (-2 * A * (A - 1 + (A + 1) * c)) / a0,
    (A * (A + 1 + (A - 1) * c - k)) / a0,
    (2 * (A - 1 - (A + 1) * c)) / a0,
    (A + 1 - (A - 1) * c - k) / a0,
  ];
  for (const canal of [p.L, p.R]) {
    const q = filtro();
    q.pon(coef);
    const claro = new Float32Array(p.n);
    for (let vez = 0; vez < 2; vez++) for (let i = 0; i < p.n; i++) claro[i] = q.paso(canal[i]);
    canal.set(claro);
  }
  return p;
}

/** Deja el pico donde se le dice. Los niveles de la mezcla se ponen luego en
    `Sonido.tsx`: aquí solo se garantiza que nada recorta. */
function tope(p, pico) {
  let m = 0;
  for (let i = 0; i < p.n; i++) m = Math.max(m, Math.abs(p.L[i]), Math.abs(p.R[i]));
  const g = m > 0 ? pico / m : 1;
  for (let i = 0; i < p.n; i++) {
    p.L[i] *= g;
    p.R[i] *= g;
  }
  return p;
}

/** Los últimos milisegundos bajan a cero: un archivo que acaba con la onda a
    medias hace un chasquido. */
function cierra(p, seg = 0.03) {
  const n = Math.round(seg * SR);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    p.L[p.n - 1 - i] *= g;
    p.R[p.n - 1 - i] *= g;
  }
  return p;
}

function guarda(nombre, p) {
  const datos = Buffer.alloc(44 + p.n * 4);
  datos.write("RIFF", 0);
  datos.writeUInt32LE(36 + p.n * 4, 4);
  datos.write("WAVEfmt ", 8);
  datos.writeUInt32LE(16, 16);
  datos.writeUInt16LE(1, 20);
  datos.writeUInt16LE(2, 22);
  datos.writeUInt32LE(SR, 24);
  datos.writeUInt32LE(SR * 4, 28);
  datos.writeUInt16LE(4, 32);
  datos.writeUInt16LE(16, 34);
  datos.write("data", 36);
  datos.writeUInt32LE(p.n * 4, 40);
  let pico = 0;
  let cuadrados = 0;
  for (let i = 0; i < p.n; i++) {
    const l = Math.max(-1, Math.min(1, p.L[i]));
    const r = Math.max(-1, Math.min(1, p.R[i]));
    datos.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    datos.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
    pico = Math.max(pico, Math.abs(l), Math.abs(r));
    cuadrados += l * l + r * r;
  }
  writeFileSync(join(destino, nombre), datos);
  const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
  console.log(`  ${nombre.padEnd(13)} ${(p.n / SR).toFixed(2).padStart(6)} s   pico ${db(pico)} dB   medio ${db(Math.sqrt(cuadrados / (p.n * 2)))} dB`);
}

/* ── la partitura ─────────────────────────────────────────────────────────── */

/** La menor, fa, do, sol: la vuelta de siempre, con novenas para que no suene
    a tres acordes. Cada uno dura un compás. */
const ACORDES = [
  { bajo: 45, notas: [52, 55, 59, 60, 64] },
  { bajo: 41, notas: [53, 57, 60, 64, 67] },
  { bajo: 48, notas: [52, 55, 59, 62, 64] },
  { bajo: 43, notas: [50, 55, 57, 59, 62] },
];

/** Las campanitas: en qué negra del compás y qué nota. Ocho compases, y el
    segundo cuarteto sube para que la vuelta no sea idéntica. */
const MOTIVO = [
  [[0, 76], [1.5, 79], [3, 81]],
  [[0, 81], [1.5, 79], [3, 76]],
  [[0, 79], [1.5, 76], [2.5, 74]],
  [[0, 74], [1.5, 71], [3, 74]],
  [[0, 76], [1.5, 81], [3, 84]],
  [[0, 81], [1.5, 84], [3, 79]],
  [[0, 76], [1.5, 79], [2.5, 86]],
  [[0, 83], [1.5, 79], [3, 74]],
];

/** La cama: colchón y campanitas. Es lo que suena desde el primer fotograma. */
function cama() {
  const colch = pista(COMPASES * COMPAS);
  const camp = pista(COMPASES * COMPAS);
  for (let c = 0; c < COMPASES; c++) {
    for (const nota of ACORDES[c % 4].notas) suma(colch, c * COMPAS, colchon(nota, COMPAS, { nivel: 0.07, corte: 2000 }), true);
    MOTIVO[c].forEach(([negra, nota], i) => suma(camp, c * COMPAS + negra * NEGRA, campanita(nota, { nivel: 0.16, cae: 0.9, pan: i % 2 ? 0.35 : -0.35 }), true));
  }
  eco(camp, { tiempo: NEGRA * 0.75, bucle: true });
  suma(colch, 0, camp);
  return tope(aire(sinBarro(sala(colch, { moja: 0.3, bucle: true })), 7, 1300), 0.6);
}

/** El ritmo: bajo, bombo, palmada, platos y arpegio. Entra con la primera
    pantalla, encima de la cama y a su mismo compás. */
function ritmo() {
  const azar = sembrado(1996);
  const seco = pista(COMPASES * COMPAS);
  const arp = pista(COMPASES * COMPAS);
  const golpes = pista(COMPASES * COMPAS);
  const ORDEN = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 4, 1];
  for (let c = 0; c < COMPASES; c++) {
    const t0 = c * COMPAS;
    const ac = ACORDES[c % 4];
    for (const [negra, dura] of [[0, 1.2], [1.5, 0.4], [2.5, 0.9], [3.5, 0.4]]) suma(seco, t0 + negra * NEGRA, bajo(ac.bajo, dura * NEGRA), true);
    for (const negra of c % 2 ? [0, 2, 3.5] : [0, 2]) suma(seco, t0 + negra * NEGRA, bombo(), true);
    for (const negra of [1, 3]) suma(golpes, t0 + negra * NEGRA, palmada(azar, { nivel: 0.21 }), true);
    for (let k = 0; k < 8; k++) suma(seco, t0 + k * NEGRA * 0.5, plato(azar, { nivel: k % 2 ? 0.1 : 0.045 }), true);
    ORDEN.forEach((cual, k) => suma(arp, t0 + k * NEGRA * 0.25, punteo(ac.notas[cual] + 12, { nivel: k % 4 === 0 ? 0.085 : 0.06, pan: k % 2 ? 0.5 : -0.5 }), true));
  }
  eco(arp, { tiempo: NEGRA * 0.75, moja: 0.3, bucle: true });
  suma(golpes, 0, arp);
  sala(golpes, { moja: 0.16, tamano: 0.7, bucle: true });
  suma(seco, 0, golpes);
  return tope(aire(seco, 5), 0.7);
}

/** Cuánto dura la subida antes del golpe del final. `Sonido.tsx` necesita el
    mismo número para clavar el golpe en el corte: si cambia aquí, cambia allí. */
const SUBIDA = COMPAS;

/** El final: un compás de subida, el acorde de do que resuelve, y su cola. */
function final() {
  const azar = sembrado(2026);
  const p = pista(SUBIDA + 8.5);
  const sube = pista(SUBIDA);
  const f = filtro();
  let fase = 0;
  for (let i = 0; i < sube.n; i++) {
    const t = i / SR;
    const x = t / SUBIDA;
    if (i % 32 === 0) f.pon(receta("banda", 300 * 20 ** x, 2));
    // El sol que sube una octava: es la dominante, y por eso el do que llega
    // después suena a llegada y no a otro acorde más.
    fase += (2 * Math.PI * mtof(55 + 12 * x)) / SR;
    const y = (f.paso(azar() * 2 - 1) * 0.5 + Math.sin(fase) * 0.07) * x ** 2.2 * Math.min(1, (SUBIDA - t) / 0.02);
    sube.L[i] = y * (0.7 + 0.3 * x);
    sube.R[i] = y * (1 - 0.3 * x);
  }
  suma(p, 0, sube);
  for (const nota of [36, 48, 55, 60, 62, 64, 67, 72]) suma(p, SUBIDA, colchon(nota, 3.2, { ataque: 0.03, suelta: 3.6, corte: 700, brillo: 2400, nivel: nota < 48 ? 0.14 : 0.085 }));
  const trueno = pista(1.6);
  let ft = 0;
  for (let i = 0; i < trueno.n; i++) {
    const t = i / SR;
    ft += (2 * Math.PI * (44 + 46 * Math.exp(-t / 0.08))) / SR;
    trueno.L[i] = trueno.R[i] = Math.sin(ft) * Math.exp(-t / 0.4) * 0.4;
  }
  suma(p, SUBIDA, trueno);
  const aire = plato(azar, { nivel: 0.07, cae: 0.5, pan: 0 });
  suma(p, SUBIDA, aire);
  const camp = pista(SUBIDA + 8.5);
  [72, 76, 79, 86].forEach((nota, i) => suma(camp, SUBIDA + i * NEGRA * 0.25, campanita(nota, { nivel: 0.11, cae: 1.1, pan: i % 2 ? 0.4 : -0.4 })));
  [79, 84].forEach((nota, i) => suma(camp, SUBIDA + COMPAS + i * NEGRA * 0.5, campanita(nota, { nivel: 0.07, cae: 1.2, pan: i ? 0.4 : -0.4 })));
  eco(camp, { tiempo: NEGRA * 0.75, moja: 0.3 });
  suma(p, 0, camp);
  return cierra(tope(sala(p, { moja: 0.34, tamano: 0.88 }), 0.8), 0.6);
}

/** El paso entre dos escenas: ruido por un filtro que sube y vuelve a bajar,
    cruzando de un lado al otro. El pico está a 0,42 s del principio. */
function whoosh() {
  const azar = sembrado(7);
  const p = pista(0.85);
  const f = filtro();
  const grave = filtro();
  grave.pon(receta("bajo", 220, 0.7));
  for (let i = 0; i < p.n; i++) {
    const t = i / SR;
    const e = t < 0.42 ? (t / 0.42) ** 2.2 : Math.exp(-(t - 0.42) / 0.1);
    if (i % 32 === 0) f.pon(receta("banda", t < 0.42 ? 450 + 3300 * (t / 0.42) ** 1.5 : 1300 + 2450 * Math.exp(-(t - 0.42) / 0.12), 1.3));
    const r = azar() * 2 - 1;
    const y = (f.paso(r) + grave.paso(r) * 0.5) * e;
    const [gl, gr] = lados(0.7 - 1.4 * (t / 0.85));
    p.L[i] = y * gl;
    p.R[i] = y * gr;
  }
  return cierra(tope(sala(p, { moja: 0.12, tamano: 0.6 }), 0.8));
}

/** La campana del logotipo: mi y si, que caben en el la menor del arranque. */
function campana() {
  const p = pista(3.2);
  [[76, 0], [83, 0.11], [88, 0.22]].forEach(([nota, t], i) => suma(p, t, campanita(nota, { nivel: i === 2 ? 0.06 : 0.12, cae: 0.7, pan: [-0.3, 0.3, 0][i] })));
  return cierra(tope(sala(p, { moja: 0.4 }), 0.8), 0.3);
}

/** Tres chispas agudas: Adeo celebrando. */
function chispa() {
  const p = pista(1.2);
  [91, 96, 98].forEach((nota, i) => suma(p, i * 0.06, campanita(nota, { nivel: 0.1, cae: 0.16, pan: [-0.4, 0.4, 0][i] })));
  return cierra(tope(sala(p, { moja: 0.25, tamano: 0.6 }), 0.8), 0.2);
}

mkdirSync(destino, { recursive: true });
console.log(`Sonido a ${PULSO} pulsos (un compás, ${COMPAS} s) en public/sonido/hecho:`);
guarda("cama.wav", cama());
guarda("ritmo.wav", ritmo());
guarda("final.wav", final());
guarda("whoosh.wav", whoosh());
guarda("campana.wav", campana());
guarda("chispa.wav", chispa());
