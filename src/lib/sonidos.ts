// Lo que suena en Adeorq, en un solo sitio.
//
// Hasta el 2026-11-20 solo sonaban tres cosas, todas en `lib/notify.ts`: las dos
// notas de «terminó» y «te pregunta» y los tres repiques del temporizador. Munir
// oyó cinco familias de sonido y se quedó con esas dos notas para los avisos que
// se repiten; para lo que pasa de vez en cuando quiso un sonido propio por
// ocasión, que cada usuario elija cuáles suenan y que pueda poner los suyos.
//
// Todo se sintetiza con Web Audio: ni un archivo que cargar ni una licencia que
// mirar. Los sonidos propios de cada usuario se guardan en IndexedDB (lo comparten
// todas las ventanas de la app) y se igualan de fuerza al cargarlos: ninguno
// puede entrar más fuerte que el aviso de siempre.
//
// La fuerza de cada sonido está medida, no a oído: sonoridad momentánea más alta
// con la curva K de la ITU (BS.1770). Las dos notas dan -31,8 LUFS a volumen 1, y
// los sonidos nuevos llevan la ganancia que los deja ahí (el clic de fijar, 3 dB
// por debajo porque lo provocas tú; el temporizador, 2,5 dB por encima, como ya
// sonaba). La medida la repite `scripts/sonidos-medir.html`.

export type Ocasion =
  | "termina"
  | "pregunta"
  | "temporizador"
  | "pin"
  | "adeo"
  | "actualizacion"
  | "falla"
  | "decision"
  | "relevo"
  | "fijar";

/** En el orden en que salen en Ajustes. */
export const OCASIONES: Ocasion[] = [
  "termina",
  "pregunta",
  "pin",
  "decision",
  "adeo",
  "falla",
  "actualizacion",
  "relevo",
  "temporizador",
  "fijar",
];

export const SONIDOS_KEY = "adeorq-sonidos";

export interface AjustesSonido {
  /** De 0 a 1. A 0,5 suena como sonaba antes de que hubiera volumen. */
  volumen: number;
  /** Las ocasiones que no suenan. */
  apagados: Ocasion[];
  /** Las que llevan un sonido del usuario, con la hora a la que lo puso (para
      saber si el que hay en memoria sigue siendo el bueno). */
  propios: Partial<Record<Ocasion, number>>;
}

/** Nace en el nivel de siempre, que ya es bajo: nadie se lleva un susto al actualizar. */
export const VOLUMEN_DE_FABRICA = 0.5;

const DE_FABRICA: AjustesSonido = { volumen: VOLUMEN_DE_FABRICA, apagados: [], propios: {} };

/** Los que nacieron el 2026-11-20. Antes solo sonaban las dos notas y el temporizador. */
const NUEVAS: Ocasion[] = ["pin", "decision", "adeo", "falla", "actualizacion", "relevo", "fijar"];

/** La clave de los avisos (`NOTIFY_KEY` en `lib/notify.ts`, que importa este archivo). */
const AVISOS_KEY = "adeorq-notify";

/**
 * Lee los ajustes tal como estén guardados, con lo que falte de fábrica.
 *
 * `avisos` es el modo de Avisos. Quien lo tenía en «Nunca» no oía nada salvo el
 * temporizador: hasta que toque esta tarjeta, los sonidos nuevos le nacen apagados
 * en vez de empezar a sonarle de golpe al actualizar.
 */
export function ajustesDe(crudo: string | null, avisos: string | null = null): AjustesSonido {
  const deFabrica = (): AjustesSonido => ({ ...DE_FABRICA, apagados: avisos === "nunca" ? [...NUEVAS] : [], propios: {} });
  if (!crudo) return deFabrica();
  try {
    const a = JSON.parse(crudo) as Partial<AjustesSonido>;
    const volumen = typeof a.volumen === "number" && Number.isFinite(a.volumen) ? Math.min(1, Math.max(0, a.volumen)) : VOLUMEN_DE_FABRICA;
    const apagados = Array.isArray(a.apagados) ? a.apagados.filter((o): o is Ocasion => OCASIONES.includes(o as Ocasion)) : [];
    const propios: AjustesSonido["propios"] = {};
    if (a.propios && typeof a.propios === "object") {
      for (const [o, cuando] of Object.entries(a.propios)) {
        if (OCASIONES.includes(o as Ocasion) && typeof cuando === "number") propios[o as Ocasion] = cuando;
      }
    }
    return { volumen, apagados, propios };
  } catch {
    return deFabrica();
  }
}

export function leerAjustes(): AjustesSonido {
  try {
    return ajustesDe(localStorage.getItem(SONIDOS_KEY), localStorage.getItem(AVISOS_KEY));
  } catch {
    return ajustesDe(null);
  }
}

export function guardarAjustes(a: AjustesSonido): void {
  try {
    localStorage.setItem(SONIDOS_KEY, JSON.stringify(a));
  } catch {
    // Sin almacenamiento, el ajuste dura lo que dure la ventana.
  }
}

/**
 * La ganancia que corresponde a la posición del deslizador.
 *
 * Al cuadrado porque el oído oye en escala de decibelios: así la mitad baja del
 * recorrido sirve para algo. A 0,5 da 1 (lo de siempre) y arriba del todo, 4
 * (12 dB más). Lo que pase de ahí lo sujeta el limitador de la salida.
 */
export function gananciaDeVolumen(volumen: number): number {
  const v = Math.min(1, Math.max(0, volumen));
  return 4 * v * v;
}

/** Cuánto tiene que esperar una ocasión para volver a sonar: dos fallos a la vez
    son un solo susto, no una ráfaga. */
export const PAUSA_MS = 1500;

/** Lo que llega en los primeros segundos tras abrir es lo que ya había: no suena. */
export const ARRANQUE_MS = 5000;

/** Si entre dos fotos de una lista apareció algo nuevo. Sin foto anterior no hay
    nada nuevo: es la lista tal como estaba al abrir. */
export function hayNuevas(antes: ReadonlySet<string> | null, ahora: readonly string[]): boolean {
  if (antes === null) return false;
  return ahora.some((x) => !antes.has(x));
}

/** Si una ocasión suena ahora, sin contar el volumen. Suelta para el banco. */
export function suenaAhora(o: Ocasion, a: AjustesSonido, ultima: number | undefined, ahora: number): boolean {
  if (a.apagados.includes(o)) return false;
  if (a.volumen <= 0) return false;
  return ultima === undefined || ahora - ultima >= PAUSA_MS;
}

/* ============================== El motor ============================== */

/** La ganancia de cada sonido de la casa para quedar a la fuerza del aviso de siempre (medida). */
const NIVEL: Record<Ocasion, number> = {
  termina: 1,
  pregunta: 1,
  temporizador: 1,
  pin: 0.207,
  adeo: 0.457,
  actualizacion: 0.371,
  falla: 0.56,
  decision: 0.56,
  relevo: 0.549,
  fijar: 0.863,
};

/** La fuerza a la que se iguala un sonido del usuario: la del aviso de siempre. */
export const LUFS_DEL_AVISO = -31.8;

/** Un sonido del usuario se corta aquí, con su caída: es un aviso, no una canción. */
export const TOPE_PROPIO_S = 5;

export const TOPE_PROPIO_BYTES = 3 * 1024 * 1024;

type Pinta = (t: number) => void;

/** La sala: un eco corto de ruido que se apaga. Fabricarla son 1,2 s de ruido en
    estéreo, entre 16 y 25 ms de hilo medidos: se hace una vez, no en cada toque. */
export function nuevaSala(ctx: BaseAudioContext): ConvolverNode {
  const n = Math.floor(ctx.sampleRate * 1.2);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = 7;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 4);
    }
  }
  const sala = ctx.createConvolver();
  sala.buffer = ir;
  return sala;
}

/**
 * Los sonidos de la casa sobre un contexto y una salida dados. Va aparte del
 * contexto de verdad para poder medirlos sin altavoces en un OfflineAudioContext.
 *
 * `sala` da la entrada de una sala ya montada, con el nivel del sonido puesto; sin
 * ella, el motor monta la suya hacia `salida` (así se mide). Solo se pide si el
 * sonido lleva eco: las dos notas y el temporizador no lo tocan.
 */
export function motor(ctx: BaseAudioContext, salida: AudioNode, sala?: () => AudioNode): Record<Ocasion, Pinta> {
  // Con semilla: cada sonido suena igual cada vez.
  let semilla = 1;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647;
  };

  let eco: GainNode | null = null;
  const alEco = (): GainNode => {
    if (eco) return eco;
    eco = ctx.createGain();
    eco.gain.value = 0.3;
    if (sala) eco.connect(sala());
    else {
      const propia = nuevaSala(ctx);
      eco.connect(propia);
      propia.connect(salida);
    }
    return eco;
  };

  // Una GainNode nace a 1, y su curva solo manda desde el instante en que empieza:
  // si la fuente arranca entre dos muestras, la primera sale a tope. Con ruido
  // eso fue una muestra a 0,81, un chasquido medido. Por eso nacen a cero.
  const ganancia = () => {
    const g = ctx.createGain();
    g.gain.value = 0;
    return g;
  };
  const aEco = (g: AudioNode, cuanto: number) => {
    if (!cuanto) return;
    const e = ctx.createGain();
    e.gain.value = cuanto;
    g.connect(e);
    e.connect(alEco());
  };
  const tono = (tipo: OscillatorType, f: number, t: number, ataque: number, cae: number, pico: number, alEco: number) => {
    const o = ctx.createOscillator();
    const g = ganancia();
    o.type = tipo;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + cae);
    o.connect(g);
    g.connect(salida);
    aEco(g, alEco);
    o.start(t);
    o.stop(t + ataque + cae + 0.05);
  };
  const ruido = (t: number, dura: number, tipo: BiquadFilterType, f: number, q: number, pico: number, alEco: number) => {
    const largo = Math.ceil(ctx.sampleRate * (dura + 0.02));
    const b = ctx.createBuffer(1, largo, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < largo; i++) d[i] = azar() * 2 - 1;
    const src = ctx.createBufferSource();
    const fl = ctx.createBiquadFilter();
    const g = ganancia();
    src.buffer = b;
    fl.type = tipo;
    fl.frequency.value = f;
    fl.Q.value = q;
    g.gain.setValueAtTime(pico, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    src.connect(fl);
    fl.connect(g);
    g.connect(salida);
    aEco(g, alEco);
    src.start(t);
    src.stop(t + dura + 0.02);
  };
  // Marimba: la fundamental, el parcial de ~3,9 que le da la madera, uno agudo muy corto y el mazo.
  const marimba = (f: number, t: number, F: number) => {
    tono("sine", f, t, 0.003, 0.75, F, 0.12);
    tono("sine", f * 3.93, t, 0.002, 0.12, F * 0.32, 0);
    tono("sine", f * 9.2, t, 0.001, 0.035, F * 0.07, 0);
    ruido(t, 0.018, "bandpass", f * 6, 1.2, F * 0.25, 0);
  };
  // Cuerda pulsada (Karplus-Strong): un soplo de ruido que se repite y se apaga.
  const cuerda = (f: number, t: number, F: number, dura: number, oscura = false) => {
    const sr = ctx.sampleRate;
    const N = Math.round(sr / f);
    const L = Math.ceil(sr * (dura + 0.05));
    const b = ctx.createBuffer(1, L, sr);
    const d = b.getChannelData(0);
    let pico = 0;
    for (let i = 0; i < N; i++) d[i] = azar() * 2 - 1;
    for (let j = 1; j < N; j++) d[j] = (d[j] + d[j - 1]) * 0.5;
    for (let k = N; k < L; k++) d[k] = (d[k - N] + d[k - N + 1]) * 0.497;
    for (let m = 0; m < L; m++) pico = Math.max(pico, Math.abs(d[m]));
    const src = ctx.createBufferSource();
    const g = ganancia();
    const fl = ctx.createBiquadFilter();
    const v = F / (pico || 1);
    src.buffer = b;
    fl.type = "lowpass";
    fl.frequency.value = f * (oscura ? 3.5 : 5);
    g.gain.setValueAtTime(v, t);
    g.gain.setValueAtTime(v, t + dura * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    src.connect(fl);
    fl.connect(g);
    g.connect(salida);
    aEco(g, 0.18);
    src.start(t);
    src.stop(t + dura + 0.05);
  };
  // Campanita de cristal (FM): el brillo sale de un modulador que se apaga antes que la nota.
  const cristal = (f: number, t: number, F: number) => {
    const c = ctx.createOscillator();
    const m = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ganancia();
    c.type = "sine";
    m.type = "sine";
    c.frequency.value = f * 2;
    m.frequency.value = f * 2 * 3.5;
    mg.gain.setValueAtTime(f * 5, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
    m.connect(mg);
    mg.connect(c.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(F, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    c.connect(g);
    g.connect(salida);
    aEco(g, 0.55);
    c.start(t);
    m.start(t);
    c.stop(t + 1.4);
    m.stop(t + 1.4);
  };
  // Una sílaba de Adeo: una voz pequeña que se desliza de tono, con un temblor rápido.
  const silaba = (t: number, dura: number, curva: number[], F: number) => {
    const o = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    const fl = ctx.createBiquadFilter();
    const g = ganancia();
    o.type = "triangle";
    o.frequency.setValueAtTime(curva[0], t);
    for (let i = 1; i < curva.length; i++) o.frequency.exponentialRampToValueAtTime(curva[i], t + (dura * i) / (curva.length - 1));
    vib.frequency.value = 22;
    vg.gain.value = 18;
    vib.connect(vg);
    vg.connect(o.frequency);
    fl.type = "lowpass";
    fl.frequency.value = 3200;
    fl.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(F, t + 0.018);
    g.gain.setValueAtTime(F, t + dura * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dura + 0.04);
    o.connect(fl);
    fl.connect(g);
    g.connect(salida);
    aEco(g, 0.15);
    o.start(t);
    vib.start(t);
    o.stop(t + dura + 0.06);
    vib.stop(t + dura + 0.06);
  };
  // Un clic de madera: dos modos muy cortos y un chasquido.
  const tic = (t: number, F: number) => {
    tono("sine", 1180, t, 0.001, 0.05, F, 0.08);
    tono("sine", 1180 * 2.71, t, 0.001, 0.02, F * 0.4, 0);
    ruido(t, 0.006, "bandpass", 3500, 1, F * 0.8, 0);
  };
  // Un soplido que pasa de un lado a otro: ruido por un filtro que sube.
  const soplido = (t: number, dura: number, desde: number, hasta: number, F: number) => {
    const largo = Math.ceil(ctx.sampleRate * (dura + 0.02));
    const b = ctx.createBuffer(1, largo, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < largo; i++) d[i] = azar() * 2 - 1;
    const src = ctx.createBufferSource();
    const fl = ctx.createBiquadFilter();
    const g = ganancia();
    src.buffer = b;
    fl.type = "bandpass";
    fl.Q.value = 1.5;
    fl.frequency.setValueAtTime(desde, t);
    fl.frequency.exponentialRampToValueAtTime(hasta, t + dura);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(F, t + dura * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    src.connect(fl);
    fl.connect(g);
    g.connect(salida);
    aEco(g, 0.2);
    src.start(t);
    src.stop(t + dura + 0.02);
  };

  // Las dos notas de siempre, deliberadamente opuestas: «terminó» baja, como un
  // punto final; «te pregunta» sube, como una pregunta. Con siete terminales se
  // aprende a distinguirlas sin mirar, que es para lo que sirve un sonido.
  const dosNotas = (notas: number[], t: number) => {
    notas.forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ganancia();
      o.type = "sine";
      o.frequency.value = hz;
      const at = t + i * 0.12;
      // Una envolvente y no un borde: el clic del principio de un pitido es lo
      // que hace que un aviso suene barato.
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.14, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g);
      g.connect(salida);
      o.start(at);
      o.stop(at + 0.18);
    });
  };

  const sonidos: Record<Ocasion, Pinta> = {
    termina: (t) => dosNotas([880, 587.33], t),
    pregunta: (t) => dosNotas([587.33, 880], t),
    // El final de un temporizador no es «el agente terminó»: aquel se oye de
    // refilón y el panel se queda encendido esperando; este tiene que sacarte de
    // otra pestaña. Por eso son tres repiques y no dos notas.
    temporizador: (t0) => {
      for (let rep = 0; rep < 3; rep++) {
        [1046.5, 784].forEach((hz, i) => {
          const o = ctx.createOscillator();
          const g = ganancia();
          o.type = "triangle";
          o.frequency.value = hz;
          const at = t0 + rep * 0.42 + i * 0.15;
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(0.2, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
          o.connect(g);
          g.connect(salida);
          o.start(at);
          o.stop(at + 0.22);
        });
      }
    },
    // El escudo te pide el PIN: tres golpes de marimba que suben, más insistente que «te pregunta».
    pin: (t) => {
      marimba(659.25, t, 0.3);
      marimba(830.61, t + 0.11, 0.3);
      marimba(987.77, t + 0.22, 0.32);
    },
    adeo: (t) => {
      silaba(t, 0.11, [700, 980, 860], 0.15);
      silaba(t + 0.15, 0.15, [820, 1150, 1020], 0.14);
    },
    actualizacion: (t) => {
      cristal(523.25, t, 0.1);
      cristal(659.25, t + 0.09, 0.1);
      cristal(783.99, t + 0.18, 0.1);
      cristal(1046.5, t + 0.27, 0.08);
    },
    falla: (t) => {
      cuerda(196, t, 0.35, 0.7, true);
      cuerda(155.56, t + 0.18, 0.38, 0.9, true);
    },
    decision: (t) => {
      cuerda(587.33, t, 0.3, 0.8);
      cuerda(783.99, t + 0.13, 0.3, 0.9);
    },
    relevo: (t) => {
      soplido(t, 0.34, 450, 2600, 0.5);
      marimba(783.99, t + 0.3, 0.18);
    },
    fijar: (t) => tic(t, 0.3),
  };
  // Cada sonido empieza con la misma semilla: suena igual cada vez.
  const conSemilla = {} as Record<Ocasion, Pinta>;
  for (const o of OCASIONES) {
    conSemilla[o] = (t) => {
      semilla = 1;
      sonidos[o](t);
    };
  }
  return conSemilla;
}

/** La ganancia que deja cada sonido de la casa a la fuerza del aviso. */
export function nivelDe(o: Ocasion): number {
  return NIVEL[o];
}

/* ====================== La sonoridad, para igualar ====================== */

/**
 * Sonoridad momentánea más alta (LUFS), con la curva K de BS.1770: ventanas de
 * 400 ms cada 100 ms. `k` es la señal ya pasada por la curva K.
 */
export function lufsMomentaneo(k: Float32Array, sr: number): number {
  const w = Math.max(1, Math.round(0.4 * sr));
  const hop = Math.max(1, Math.round(0.1 * sr));
  const S = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) S[i + 1] = S[i] + k[i] * k[i];
  let mejor = 0;
  if (k.length < w) mejor = S[k.length] / w;
  for (let j = 0; j + w <= k.length; j += hop) mejor = Math.max(mejor, (S[j + w] - S[j]) / w);
  return mejor > 0 ? -0.691 + 10 * Math.log10(mejor) : -Infinity;
}

/** La ganancia que lleva un sonido del usuario a la fuerza del aviso, con un tope
    para que un archivo casi mudo no se suba hasta oírse el ruido de fondo. */
export function gananciaParaIgualar(lufs: number): number {
  if (!Number.isFinite(lufs)) return 1;
  const g = Math.pow(10, (LUFS_DEL_AVISO - lufs) / 20);
  return Math.min(8, Math.max(0.01, g));
}

/** Pasa un buffer por la curva K en un contexto sin altavoces y mide su sonoridad. */
async function medirBuffer(buf: AudioBuffer): Promise<number> {
  const sr = buf.sampleRate;
  const largo = Math.min(buf.length, Math.ceil(sr * TOPE_PROPIO_S));
  const off = new OfflineAudioContext(1, Math.max(1, largo), sr);
  const src = off.createBufferSource();
  src.buffer = buf;
  const hs = off.createBiquadFilter();
  hs.type = "highshelf";
  hs.frequency.value = 1681.97;
  hs.gain.value = 4;
  const hp = off.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 38.13;
  hp.Q.value = 0.5003;
  src.connect(hs);
  hs.connect(hp);
  hp.connect(off.destination);
  src.start(0);
  const r = await off.startRendering();
  return lufsMomentaneo(r.getChannelData(0), sr);
}

/* ====================== Los sonidos del usuario ====================== */

interface Propio {
  nombre: string;
  bytes: ArrayBuffer;
}

const DB = "adeorq-sonidos";
const ALMACEN = "propios";

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(ALMACEN)) r.result.createObjectStore(ALMACEN);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

/** Una petición a la base. Vale cuando la TRANSACCIÓN se confirma, no cuando la
    petición sale bien: un disco lleno falla al confirmar, y antes eso se daba por
    guardado y la fila decía «un archivo tuyo» sin archivo. */
async function enDb<T>(modo: IDBTransactionMode, hacer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDb();
  try {
    return await new Promise<T>((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo);
      const r = hacer(tx.objectStore(ALMACEN));
      tx.oncomplete = () => ok(r.result);
      tx.onerror = () => mal(tx.error ?? r.error);
      tx.onabort = () => mal(tx.error ?? r.error);
    });
  } finally {
    db.close();
  }
}

type Listo = { buf: AudioBuffer; ganancia: number };

/** Los propios ya leídos y medidos, por ocasión y por la hora a la que se pusieron.
    Se guarda la promesa: pulsar ▶ tres veces seguidas es una sola lectura. */
const enMemoria = new Map<string, Promise<Listo | null>>();

/** Lo que tarda en apagarse un sonido propio que se corta. */
export const CAIDA_PROPIO_S = 0.4;

/**
 * Los primeros `TOPE_PROPIO_S` de un canal, apagándose en los últimos
 * `CAIDA_PROPIO_S`. Si el canal cabe entero, es el mismo, sin tocar. La caída va
 * en las muestras y no en una rampa al sonar: tras recortarlo, el buffer ya no
 * sabe que era más largo, y la rampa no se programaba (se cortaba en seco).
 */
export function recortarConCaida<T extends Float32Array>(d: T, sr: number): T {
  const largo = Math.min(d.length, Math.ceil(sr * TOPE_PROPIO_S));
  if (largo === d.length) return d;
  const corto = d.slice(0, largo) as T;
  const caida = Math.min(largo, Math.round(sr * CAIDA_PROPIO_S));
  for (let i = 0; i < caida; i++) corto[largo - caida + i] *= 1 - (i + 1) / caida;
  return corto;
}

/** Lo que suena de un buffer: los primeros `TOPE_PROPIO_S`. Un mp3 de 3 MB son
    unos tres minutos, 75 MB ya leído; en memoria se queda lo que suena. */
function recortado(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const largo = Math.min(buf.length, Math.ceil(buf.sampleRate * TOPE_PROPIO_S));
  if (largo === buf.length) return buf;
  const corto = ctx.createBuffer(buf.numberOfChannels, largo, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    corto.copyToChannel(recortarConCaida(buf.getChannelData(c), buf.sampleRate), c);
  }
  return corto;
}

function propioListo(ctx: BaseAudioContext, o: Ocasion, cuando: number): Promise<Listo | null> {
  const clave = `${o}:${cuando}`;
  const ya = enMemoria.get(clave);
  if (ya) return ya;
  olvidar(o);
  const listo = (async () => {
    const p = await enDb<Propio | undefined>("readonly", (s) => s.get(o) as IDBRequest<Propio | undefined>);
    if (!p) return null;
    const buf = recortado(ctx, await ctx.decodeAudioData(p.bytes.slice(0)));
    return { buf, ganancia: gananciaParaIgualar(await medirBuffer(buf)) };
  })();
  // Si falla, no se queda la promesa rota: la próxima vez se vuelve a intentar.
  listo.catch(() => enMemoria.delete(clave));
  enMemoria.set(clave, listo);
  return listo;
}

function olvidar(o: Ocasion): void {
  for (const k of [...enMemoria.keys()]) if (k.startsWith(`${o}:`)) enMemoria.delete(k);
}

/**
 * Guarda el sonido del usuario para una ocasión. Devuelve el motivo si no vale:
 * demasiado grande, no es un sonido que el navegador sepa leer, o no se pudo
 * guardar en este equipo. Nunca lanza: lo que falle se dice en la fila.
 */
export async function ponerPropio(o: Ocasion, archivo: File): Promise<string | null> {
  if (archivo.size > TOPE_PROPIO_BYTES) return "grande";
  let bytes: ArrayBuffer;
  try {
    bytes = await archivo.arrayBuffer();
    await contexto().decodeAudioData(bytes.slice(0));
  } catch {
    return "ilegible";
  }
  try {
    await enDb("readwrite", (s) => s.put({ nombre: archivo.name, bytes } satisfies Propio, o));
  } catch {
    return "guardar";
  }
  const a = leerAjustes();
  a.propios = { ...a.propios, [o]: Date.now() };
  guardarAjustes(a);
  return null;
}

export async function quitarPropio(o: Ocasion): Promise<void> {
  olvidar(o);
  try {
    await enDb("readwrite", (s) => s.delete(o));
  } catch {
    // Si la base no abre, basta con olvidarlo en los ajustes.
  }
  const a = leerAjustes();
  const propios = { ...a.propios };
  delete propios[o];
  guardarAjustes({ ...a, propios });
}

/** El nombre del archivo que puso el usuario, para enseñarlo en Ajustes. */
export async function nombreDelPropio(o: Ocasion): Promise<string | null> {
  try {
    const p = await enDb<Propio | undefined>("readonly", (s) => s.get(o) as IDBRequest<Propio | undefined>);
    return p?.nombre ?? null;
  } catch {
    return null;
  }
}

/* ============================== Sonar ============================== */

let audio: AudioContext | null = null;
let entrada: GainNode | null = null;

function contexto(): AudioContext {
  audio ??= new AudioContext();
  // Nace suspendido hasta un gesto; reanudarlo no cuesta nada y tras el primer
  // clic se queda en marcha.
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

const UMBRAL_DB = -6;
const RATIO = 20;

/**
 * Lo que deshace la ganancia de compensación del limitador.
 *
 * Un DynamicsCompressorNode sube la señal ENTERA (1/curva(0 dBFS))^0,6, también
 * por debajo del umbral: lo dice la especificación y lo hace Chromium. Con -6 dB y
 * 20:1 son +3,42 dB, y las dos notas de siempre salían un 48 % más fuertes que
 * antes de haber limitador (medido en Chromium 157: -20,09 dB RMS sin él, -16,67
 * con él). Con esta ganancia detrás, lo que no llega al umbral sale como entró.
 */
export function compensacionDelLimitador(umbralDb: number, ratio: number): number {
  const enCero = umbralDb - umbralDb / ratio; // la curva a 0 dBFS, en dB (sin rodilla)
  return Math.pow(10, (0.6 * enCero) / 20);
}

/** La salida común: el volumen de Ajustes y, detrás, un limitador para que el
    volumen alto no sature. Por debajo de su umbral no cambia nada. Suelta del
    contexto de verdad para que `scripts/sonidos-medir.html` mida la cadena entera. */
export function montarSalida(ctx: BaseAudioContext, volumen: number, destino: AudioNode = ctx.destination): GainNode {
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = UMBRAL_DB;
  lim.knee.value = 0;
  lim.ratio.value = RATIO;
  lim.attack.value = 0.002;
  lim.release.value = 0.1;
  const deshacer = ctx.createGain();
  deshacer.gain.value = compensacionDelLimitador(UMBRAL_DB, RATIO);
  const e = ctx.createGain();
  e.gain.value = gananciaDeVolumen(volumen);
  e.connect(lim);
  lim.connect(deshacer);
  deshacer.connect(destino);
  return e;
}

function salida(ctx: AudioContext, volumen: number): GainNode {
  entrada ??= montarSalida(ctx, volumen);
  return entrada;
}

/** La sala de eco de cada salida, compartida por todos sus sonidos y montada
    la primera vez que alguno la pide. */
const salas = new WeakMap<AudioNode, ConvolverNode>();

const ultimas = new Map<Ocasion, number>();

function tocar(o: Ocasion, a: AjustesSonido): void {
  try {
    const ctx = contexto();
    const sal = salida(ctx, a.volumen);
    const t = ctx.currentTime + 0.03;
    // Hacia el volumen nuevo en unos milisegundos, no de golpe: si algo largo
    // sigue sonando (un sonido tuyo, la cola del cristal), un escalón es un chasquido.
    sal.gain.setTargetAtTime(gananciaDeVolumen(a.volumen), ctx.currentTime, 0.005);
    const cuando = a.propios[o];
    if (cuando !== undefined) {
      void propioListo(ctx, o, cuando)
        .then((p) => {
          if (!p) return tocarDeCasa(ctx, sal, o, ctx.currentTime + 0.03);
          const src = ctx.createBufferSource();
          const g = ctx.createGain();
          const t0 = ctx.currentTime + 0.03;
          src.buffer = p.buf;
          // Nace a cero y entra en 5 ms, como todo lo demás: el archivo puede
          // empezar en mitad de una onda.
          g.gain.value = 0;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(p.ganancia, t0 + 0.005);
          // Ya viene recortado y con su caída (`recortarConCaida`): suena entero.
          src.connect(g);
          g.connect(sal);
          src.start(t0);
        })
        .catch(() => tocarDeCasa(ctx, sal, o, ctx.currentTime + 0.03));
      return;
    }
    tocarDeCasa(ctx, sal, o, t);
  } catch {
    // Sin tarjeta de sonido, o el contexto denegado: lo que se ve sigue diciéndolo.
  }
}

/** Un sonido de la casa sobre la salida común (`montarSalida`) de su contexto. */
export function tocarDeCasa(ctx: BaseAudioContext, sal: AudioNode, o: Ocasion, t: number): void {
  // Cada sonido pasa por su propio nivel medido antes de la salida común.
  const g = ctx.createGain();
  g.gain.value = NIVEL[o];
  g.connect(sal);
  // Un motor por toque, que son unos nodos: así dos sonidos seguidos no comparten
  // el nodo de nivel. Lo caro, la sala, es una por salida; lo que va a ella
  // lleva el mismo nivel que el sonido, que es lo que hacía la sala propia.
  motor(ctx, g, () => {
    let sala = salas.get(sal);
    if (!sala) {
      sala = nuevaSala(ctx);
      sala.connect(sal);
      salas.set(sal, sala);
    }
    const aSala = ctx.createGain();
    aSala.gain.value = NIVEL[o];
    aSala.connect(sala);
    return aSala;
  })[o](t);
}

/** Suena una ocasión si está encendida, con el volumen de Ajustes. */
export function sonar(o: Ocasion): void {
  const a = leerAjustes();
  const ahora = Date.now();
  if (!suenaAhora(o, a, ultimas.get(o), ahora)) return;
  ultimas.set(o, ahora);
  tocar(o, a);
}

/**
 * Como `sonar`, pero solo cuenta como sonado si el audio pudo arrancar. Para lo
 * que suena una sola vez y se apunta (la versión nueva): donde el sistema no deja
 * sonar nada antes de un clic, se apuntaba como sonado sin haberse oído, para
 * siempre. Si no arranca en un segundo, devuelve `false` y quien llama lo
 * reintenta con tu primer gesto. Si esa ocasión no suena (apagada, o el volumen
 * a cero), da `true` sin crear el audio: no hay nada que esperar.
 */
export async function sonarUnaVez(o: Ocasion): Promise<boolean> {
  if (!suenaAhora(o, leerAjustes(), undefined, Date.now())) return true;
  try {
    const ctx = contexto();
    if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1000))]);
    if (ctx.state !== "running") return false;
  } catch {
    return false;
  }
  sonar(o);
  return true;
}

/** Despierta el audio, si ya existe, desde dentro de un gesto. Para quien espera a
    `sonarUnaVez`: en WebKit el permiso solo vale DENTRO del gesto que lo da, y con el
    dedo ese es el `pointerup`, que llega cuando el intento del `pointerdown` aún
    espera. Sin esto, ese intento acababa en nada y el toque no contaba. */
export function despertarSonido(): void {
  try {
    if (audio && audio.state !== "running") void audio.resume().catch(() => {});
  } catch {
    /* sin audio no hay nada que despertar */
  }
}

/** Los PTY que se mataron a propósito (la X, la papelera, quitar un panel, un
    `close_pane`, un relevo): su salida con código 1 (taskkill) no es una caída.
    `lib/pty.ts` lo apunta en todas las ventanas, también en una suelta. */
const matados = new Set<number>();

export function apuntarCierre(id: number): void {
  matados.add(id);
}

/** Cuándo se mandó a cada terminal un Intro, un Ctrl+C o un Ctrl+D: lo que
    hace salir a un programa. La rueda o un clic no cuentan. */
const finales = new Map<number, number>();

/** Si lo escrito puede hacer salir al programa (`exit` y su Intro, Ctrl+C, Ctrl+D). */
export const haceSalir = (data: string): boolean => /[\r\x03\x04]/.test(data);

export function apuntarEscrito(id: number, data: string, ahora = Date.now()): void {
  if (haceSalir(data)) finales.set(id, ahora);
}

/** Lo que tarda en salir un programa tras tu `exit`, tu Ctrl+C o tu Ctrl+D. */
export const GESTO_RECIENTE_MS = 3000;

/**
 * Si la salida de una terminal es «algo falla». No lo es la normal (código 0), la
 * que se cerró a propósito, ni la que llega justo después de mandarle un Intro,
 * un Ctrl+C o un Ctrl+D: un `exit` en bash sale con el estado del último
 * comando, y un Ctrl+C a `pnpm dev`, con 1.
 */
export function esCaida(id: number, code: number | null, ahora: number): boolean {
  const aPosta = matados.delete(id);
  const escrito = finales.get(id);
  finales.delete(id);
  if (code === 0 || aPosta) return false;
  return escrito === undefined || ahora - escrito > GESTO_RECIENTE_MS;
}

/** Lo que llama la terminal al salir su proceso. */
export function sonarSiSeCayo(id: number, code: number | null): void {
  if (esCaida(id, code, Date.now())) sonar("falla");
}

/** Para el ▶ de Ajustes: suena aunque esté apagada, con el volumen de ahora. */
export function probar(o: Ocasion, volumen?: number): void {
  const a = leerAjustes();
  tocar(o, volumen === undefined ? a : { ...a, volumen });
}
