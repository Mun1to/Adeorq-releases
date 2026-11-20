// Las reglas de los sonidos (`src/lib/sonidos.ts`).  `pnpm bancos sonidos`
//
// Lo que suena no se puede oír desde aquí; lo que sí se sostiene es cuándo
// suena y a qué fuerza. Cinco cosas que, si se rompen, nadie lo nota hasta que
// pita lo que no debía: unos ajustes rotos en el disco, el volumen de fábrica
// (tiene que sonar como sonaba antes de haber volumen, también tras el
// limitador), la pausa entre dos iguales, que lo que ya había al abrir no cuente
// como nuevo, que cerrar una terminal tú no suene como una caída, y que un sonido
// del usuario quede a la fuerza del aviso de siempre.
//
// La fuerza de los sonidos de la casa la mide `scripts/sonidos-medir.html`, en un
// navegador de verdad (aquí no hay Web Audio).

import {
  ajustesDe,
  apuntarCierre,
  apuntarEscrito,
  CAIDA_PROPIO_S,
  compensacionDelLimitador,
  esCaida,
  GESTO_RECIENTE_MS,
  gananciaDeVolumen,
  gananciaParaIgualar,
  hayNuevas,
  LUFS_DEL_AVISO,
  lufsMomentaneo,
  OCASIONES,
  PAUSA_MS,
  recortarConCaida,
  suenaAhora,
  TOPE_PROPIO_S,
  VOLUMEN_DE_FABRICA,
} from "../src/lib/sonidos";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// Los ajustes.
const nada = ajustesDe(null);
ok("sin ajustes, volumen de fábrica y todo encendido", nada.volumen === VOLUMEN_DE_FABRICA && nada.apagados.length === 0);
ok("un JSON roto no rompe nada", ajustesDe("{no es json").volumen === VOLUMEN_DE_FABRICA);
const raros = ajustesDe(JSON.stringify({ volumen: 7, apagados: ["fijar", "inventada"], propios: { pin: 5, otra: 3, adeo: "x" } }));
ok("el volumen se queda entre 0 y 1", raros.volumen === 1);
ok("una ocasión que no existe se ignora", raros.apagados.length === 1 && raros.apagados[0] === "fijar");
ok("solo valen los propios de ocasiones reales y con hora", Object.keys(raros.propios).join() === "pin");
ok("cada ocasión sale una vez en Ajustes", new Set(OCASIONES).size === OCASIONES.length && OCASIONES.length === 10);
const callado = ajustesDe(null, "nunca");
ok(
  "con Avisos en «Nunca», los sonidos nuevos nacen apagados y el temporizador sigue",
  callado.apagados.length === 7 && !callado.apagados.includes("temporizador") && !callado.apagados.includes("termina"),
);
ok("con Avisos en otro modo, todo encendido", ajustesDe(null, "fondo").apagados.length === 0);
ok("lo que ya guardaste manda sobre «Nunca»", ajustesDe(JSON.stringify({ apagados: [] }), "nunca").apagados.length === 0);
ok("y unos ajustes rotos con «Nunca» también nacen apagados", ajustesDe("{roto", "nunca").apagados.length === 7);

// El limitador: su compensación automática (+3,42 dB con -6 dB y 20:1) se deshace.
const comp = compensacionDelLimitador(-6, 20);
ok("lo que deshace el limitador son -3,42 dB", Math.abs(20 * Math.log10(comp) - -3.42) < 0.005, (20 * Math.log10(comp)).toFixed(3));

// El volumen.
ok("a volumen de fábrica suena como antes (ganancia 1)", gananciaDeVolumen(VOLUMEN_DE_FABRICA) === 1);
ok("a cero no suena", gananciaDeVolumen(0) === 0);
ok("arriba del todo, 12 dB más (×4)", gananciaDeVolumen(1) === 4);

// Cuándo suena.
const a = ajustesDe(null);
ok("la primera vez suena", suenaAhora("falla", a, undefined, 1000));
ok("dos iguales seguidos son uno", !suenaAhora("falla", a, 1000, 1000 + PAUSA_MS - 1));
ok("pasada la pausa vuelve a sonar", suenaAhora("falla", a, 1000, 1000 + PAUSA_MS));
ok("una apagada no suena", !suenaAhora("fijar", { ...a, apagados: ["fijar"] }, undefined, 0));
ok("con el volumen a cero no suena nada", !suenaAhora("pin", { ...a, volumen: 0 }, undefined, 0));

// Cuándo la salida de una terminal es «algo falla».
const lejos = 100_000;
ok("un `exit` normal no es una caída", !esCaida(1, 0, lejos));
ok("un proceso que muere solo con error, sí, también nada más abrir", esCaida(2, 1, 50));
apuntarCierre(3);
ok("la que se cerró a propósito (la X, la papelera, close_pane), no", !esCaida(3, 1, lejos));
ok("y la marca se gasta: si ese número vuelve a caerse, ya suena", esCaida(3, 1, lejos));
apuntarEscrito(4, "exit\r", lejos - 1000);
ok("tras tu `exit` y su Intro de hace un momento, no", !esCaida(4, 1, lejos));
apuntarEscrito(5, "\x03", lejos - 500);
ok("tras tu Ctrl+C de hace un momento, no", !esCaida(5, 130, lejos));
apuntarEscrito(6, "\x1b[<64;10;5M", lejos - 100);
ok("la rueda del ratón no es un gesto que haga salir: si se cae, suena", esCaida(6, 1, lejos));
apuntarEscrito(7, "\r", lejos - GESTO_RECIENTE_MS - 1);
ok("pasado el margen, vuelve a contar", esCaida(7, 1, lejos));

// Un sonido propio largo se corta a 5 s y se apaga en sus últimos 0,4 s.
const srP = 48000;
const largoP = new Float32Array(srP * 8).fill(0.5);
const cortoP = recortarConCaida(largoP, srP);
ok("se queda en cinco segundos", cortoP.length === srP * TOPE_PROPIO_S);
ok("y acaba en silencio, no en seco", cortoP[cortoP.length - 1] === 0 && Math.abs(cortoP[cortoP.length - Math.round(srP * CAIDA_PROPIO_S) - 1] - 0.5) < 1e-6);
ok("la caída baja sin subir", cortoP.slice(-srP).every((x, i, arr) => i === 0 || x <= arr[i - 1] + 1e-9));
// Un escalón (bajar a cero de golpe en la última muestra) también «baja sin
// subir»: lo que lo distingue es el salto entre dos muestras seguidas, que en una
// rampa de 0,4 s sobre 0,5 es 0,5 / caída (un 1 % de margen por el redondeo de
// Float32; un escalón sería 0,5, diez mil veces más).
const caidaP = Math.round(srP * CAIDA_PROPIO_S);
const saltoP = cortoP.slice(-caidaP - 1).reduce((m, x, i, arr) => (i === 0 ? m : Math.max(m, Math.abs(x - arr[i - 1]))), 0);
ok("y sin escalón: ningún salto entre muestras pasa de la rampa", saltoP <= (0.5 / caidaP) * 1.01, String(saltoP));
const breve = new Float32Array(srP).fill(0.5);
ok("uno que cabe entero no se toca", recortarConCaida(breve, srP) === breve && breve[breve.length - 1] === 0.5);

// Lo nuevo de una lista.
ok("sin foto anterior no hay nada nuevo (lo que había al abrir)", !hayNuevas(null, ["a", "b"]));
ok("una que no estaba es nueva", hayNuevas(new Set(["a"]), ["a", "b"]));
ok("una que se fue no es nueva", !hayNuevas(new Set(["a", "b"]), ["a"]));

// Igualar un sonido del usuario: un seno de amplitud conocida.
// Un seno de 1 kHz a pico 1 da -3,01 dB RMS; la curva K le suma ~0,7 dB y
// BS.1770 resta 0,691: unos -3 LUFS. Aquí se mide la señal sin la curva, así
// que debe salir -3,01 - 0,691 = -3,70.
const sr = 48000;
const seno = new Float32Array(sr);
for (let i = 0; i < sr; i++) seno[i] = Math.sin((2 * Math.PI * 1000 * i) / sr);
const l = lufsMomentaneo(seno, sr);
ok("la sonoridad de un seno sale donde dice la cuenta", Math.abs(l - -3.7) < 0.05, l.toFixed(2));
const g = gananciaParaIgualar(l);
ok("un sonido fuerte se baja hasta el aviso", Math.abs(l + 20 * Math.log10(g) - LUFS_DEL_AVISO) < 0.01);
ok("uno casi mudo no se sube sin tope", gananciaParaIgualar(-90) === 8);
ok("uno mudo del todo se deja como está", gananciaParaIgualar(-Infinity) === 1);
const corto = new Float32Array(sr / 10).fill(0.5);
ok("uno más corto que la ventana también se mide", Number.isFinite(lufsMomentaneo(corto, sr)));

if (fallos) {
  console.log(`\n${fallos} FALLA(N)`);
  process.exit(1);
}
console.log("\nTodo en verde.");
