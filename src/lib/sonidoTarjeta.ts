// El sonido del vídeo de la tarjeta (`PerfilTarjeta.tsx`), hecho en código con
// WebAudio: nada de audio de terceros, que trae su licencia. Se pinta entero en
// un `OfflineAudioContext` al tamaño del vídeo, así que sale igual cada vez
// (el ruido sale de una semilla) y lo que se oye en la vista previa es lo que
// va dentro del MP4.
//
// Va con la animación: `llegada` es el segundo en que la cifra se planta (sube
// de 0 en `LLEGADA` segundos) y el final se cierra en el último segundo.
//
// Son dos, los que eligió Munir el 2026-10-18 entre cuatro que oyó sobre la
// tarjeta de verdad: «Barrido y golpe» de fábrica y «Contador» como segunda
// opción, este sin la campana del final que llevaba. Se descartaron un latido
// todo el vídeo y unas notas de cristal con eco.

export type IdSonido = "golpe" | "contador";

/** Los sonidos, en el orden en que salen en el editor: el primero es el de fábrica. */
export const SONIDOS: { id: IdSonido; nombre: string }[] = [
  { id: "golpe", nombre: "Golpe" },
  { id: "contador", nombre: "Contador" },
];

/** Cuándo se planta la cifra si sube contando, en segundos. */
export const LLEGADA = 1.2;

/** Lo que tarda en apagarse al final, para que no corte de golpe. */
const CIERRE = 0.35;

/** El pico al que se deja cada sonido: unos −3 dB, igual de fuertes todos. */
const PICO = 0.7;

/** Un número de 0 a 1 que sale siempre igual de la misma semilla (mulberry32). */
function semilla(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido blanco de `segundos`, el mismo cada vez. */
function ruido(ctx: BaseAudioContext, segundos: number, n = 1): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, Math.ceil(segundos * ctx.sampleRate)), ctx.sampleRate);
  const azar = semilla(n);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = azar() * 2 - 1;
  return b;
}

/** Una sala hecha a mano: ruido estéreo que se apaga en `segundos`. */
function sala(ctx: BaseAudioContext, segundos: number): ConvolverNode {
  const n = Math.ceil(segundos * ctx.sampleRate);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const azar = semilla(7 + c);
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (azar() * 2 - 1) * Math.pow(1 - i / n, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = b;
  return conv;
}

type Destinos = { seco: AudioNode; eco: AudioNode };

/** Un tono con su envolvente: sube en `ataque` y se apaga en `dura`. */
function tono(
  ctx: BaseAudioContext,
  a: Destinos,
  o: { f: number; t: number; dura: number; fuerza: number; forma?: OscillatorType; ataque?: number; pan?: number; eco?: number; hasta?: number },
) {
  const osc = ctx.createOscillator();
  osc.type = o.forma ?? "sine";
  osc.frequency.setValueAtTime(o.f, o.t);
  if (o.hasta) osc.frequency.exponentialRampToValueAtTime(o.hasta, o.t + Math.min(o.dura, 0.4));
  const g = ctx.createGain();
  const ataque = o.ataque ?? 0.004;
  g.gain.setValueAtTime(0, o.t);
  g.gain.linearRampToValueAtTime(o.fuerza, o.t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + ataque + o.dura);
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan ?? 0;
  osc.connect(g).connect(pan);
  pan.connect(a.seco);
  if (o.eco) {
    const e = ctx.createGain();
    e.gain.value = o.eco;
    pan.connect(e).connect(a.eco);
  }
  osc.start(o.t);
  osc.stop(o.t + ataque + o.dura + 0.05);
}

/** Ruido filtrado con su envolvente. */
function soplo(
  ctx: BaseAudioContext,
  a: Destinos,
  o: { t: number; dura: number; fuerza: number; filtro: BiquadFilterType; desde: number; hasta?: number; q?: number; subir?: boolean; pan?: [number, number]; eco?: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = ruido(ctx, o.dura + 0.1, Math.round(o.t * 1000) + 3);
  const f = ctx.createBiquadFilter();
  f.type = o.filtro;
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.desde, o.t);
  if (o.hasta) f.frequency.exponentialRampToValueAtTime(o.hasta, o.t + o.dura);
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.subir ? 0.0001 : o.fuerza, o.t);
  if (o.subir) {
    g.gain.exponentialRampToValueAtTime(o.fuerza, o.t + o.dura * 0.96);
    g.gain.linearRampToValueAtTime(0, o.t + o.dura + 0.03);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dura);
  }
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(o.pan?.[0] ?? 0, o.t);
  if (o.pan) pan.pan.linearRampToValueAtTime(o.pan[1], o.t + o.dura);
  src.connect(f).connect(g).connect(pan);
  pan.connect(a.seco);
  if (o.eco) {
    const e = ctx.createGain();
    e.gain.value = o.eco;
    pan.connect(e).connect(a.eco);
  }
  src.start(o.t);
  src.stop(o.t + o.dura + 0.1);
}

/** Una campanita: parciales que no son armónicos y se apagan cada uno a su ritmo. */
function campana(ctx: BaseAudioContext, a: Destinos, f: number, t: number, fuerza: number, pan = 0) {
  const parciales: [number, number, number][] = [
    [1, 1, 2.6],
    [2.76, 0.4, 1.3],
    [5.4, 0.18, 0.7],
    [8.93, 0.09, 0.35],
  ];
  for (const [r, g, d] of parciales) tono(ctx, a, { f: f * r, t, dura: d, fuerza: fuerza * g, pan, eco: 0.5, ataque: 0.002 });
  tono(ctx, a, { f: f / 2, t, dura: 1.5, fuerza: fuerza * 0.25, pan, eco: 0.3, ataque: 0.01 });
}

/** Un golpe grave que baja de tono, como un bombo blando. */
function bombo(ctx: BaseAudioContext, a: Destinos, t: number, fuerza: number, desde = 110, hasta = 42, dura = 1.2) {
  tono(ctx, a, { f: desde, hasta, t, dura, fuerza, ataque: 0.003 });
}

/** Dónde cae cada uno de `n` pasos de una cifra que sube frenando (sale
    rápida y se planta despacio), del 0 a `llegada`: densos al principio. */
export function pasos(n: number, llegada: number): number[] {
  const r: number[] = [];
  for (let k = 0; k < n; k++) r.push(llegada * (1 - Math.cbrt(1 - k / n)));
  return r;
}

/** Lo que vale la cifra en el segundo `t` mientras sube: de 0 a 1, frenando. */
export function subida(t: number, llegada = LLEGADA): number {
  if (llegada <= 0 || t >= llegada) return 1;
  const x = Math.max(0, t / llegada);
  return 1 - Math.pow(1 - x, 3);
}

type Pieza = (ctx: BaseAudioContext, a: Destinos, segundos: number, llegada: number) => void;

const NOTA = (n: number) => 440 * Math.pow(2, n / 12);
const A5 = NOTA(12);

const PIEZAS: Record<IdSonido, Pieza> = {
  // Un tic por cada salto de la cifra, más seguidos al principio, y una campana
  // al plantarse. Sin campana al final (Munir: «el 1 sin campana al final»).
  contador(ctx, a, _segundos, llegada) {
    if (llegada >= 0.3) {
      const ts = pasos(18, llegada);
      ts.forEach((t, k) => tono(ctx, a, { f: 2200 + (900 * k) / ts.length, t, dura: 0.035, fuerza: 0.3, forma: "triangle", pan: k % 2 ? 0.18 : -0.18, ataque: 0.001 }));
    }
    campana(ctx, a, A5 * 2, llegada, 0.55);
  },

  // Un barrido de aire que sube hasta la cifra y un golpe grave al plantarse,
  // con un brillo encima. Al final, un golpe más flojo.
  golpe(ctx, a, segundos, llegada) {
    if (llegada >= 0.3) soplo(ctx, a, { t: 0, dura: llegada, fuerza: 0.5, filtro: "bandpass", desde: 240, hasta: 5200, q: 1.1, subir: true, pan: [-0.4, 0.3], eco: 0.4 });
    bombo(ctx, a, llegada, 0.95);
    soplo(ctx, a, { t: llegada, dura: 0.22, fuerza: 0.45, filtro: "lowpass", desde: 1400, hasta: 300 });
    tono(ctx, a, { f: NOTA(39), t: llegada, dura: 1.6, fuerza: 0.05, eco: 0.8, pan: -0.25 });
    tono(ctx, a, { f: NOTA(46), t: llegada + 0.02, dura: 1.4, fuerza: 0.04, eco: 0.8, pan: 0.25 });
    if (segundos - llegada > 2) bombo(ctx, a, segundos - 0.9, 0.4, 85, 38, 0.8);
  },
};

/** Sube o baja el sonido para que su pico quede en `PICO`. */
function nivelar(b: AudioBuffer) {
  let pico = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const x of b.getChannelData(c)) pico = Math.max(pico, Math.abs(x));
  if (pico < 1e-6) return;
  const k = PICO / pico;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/**
 * El sonido `id` para un vídeo de `segundos`, en estéreo. `llegada` es cuándo
 * se planta la cifra (0 si no se mueve).
 */
export async function sonidoDe(id: IdSonido, segundos: number, llegada = LLEGADA, frecuencia = 48000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(segundos * frecuencia)), frecuencia);
  // Todo pasa por aquí: se abre en 5 ms y se apaga al final, sin chasquidos.
  const general = ctx.createGain();
  general.gain.setValueAtTime(0, 0);
  general.gain.linearRampToValueAtTime(1, 0.005);
  general.gain.setValueAtTime(1, Math.max(0.005, segundos - CIERRE));
  general.gain.linearRampToValueAtTime(0, segundos);
  general.connect(ctx.destination);
  const eco = sala(ctx, 1.8);
  eco.connect(general);
  PIEZAS[id](ctx, { seco: general, eco }, segundos, Math.min(llegada, Math.max(0, segundos - 0.5)));
  const hecho = await ctx.startRendering();
  nivelar(hecho);
  return hecho;
}
