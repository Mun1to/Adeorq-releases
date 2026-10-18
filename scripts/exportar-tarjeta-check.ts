// La cuenta de la tarjeta exportada (`lib/exportarTarjeta.ts`): qué instante
// del vídeo de fondo lleva cada fotograma, a qué tamaño se lee ese fondo y con
// qué nombre se propone guardar.
//
// Lo que no puede pasar: que un fondo más corto que la tarjeta se quede
// congelado en su último fotograma en vez de volver a empezar, que un vídeo de
// móvil en 4K se decodifique entero para una tarjeta de 1080, o que se agrande
// uno pequeño (eso lo hace el que pinta, sin perder nada).
//
// El vídeo de verdad (WebCodecs, el MP4 y su fondo) no se puede probar en
// Node: eso es `scripts/laboratorio/tarjeta-exportar.mjs`, con un navegador.
//
//   pnpm bancos exportar-tarjeta

import { anchoDelFondo, esVideo, fotogramas, FORMATOS, marcasDelFondo, nombreSugerido } from "../src/lib/exportarTarjeta";
import { LLEGADA, pasos, subida } from "../src/lib/sonidoTarjeta";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = JSON.stringify(sale) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale «${JSON.stringify(sale)}», se esperaba «${JSON.stringify(esperado)}»`}`);
}
const redondear = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);

es("diez segundos a treinta: trescientos fotogramas", fotogramas(30, 10), 300);
es("medio fotograma se redondea", fotogramas(30, 0.05), 2);
es("cero segundos: ninguno", fotogramas(30, 0), 0);

// Un fondo de un segundo para una tarjeta de dos, a cuatro fotogramas por segundo.
es(
  "un fondo más corto vuelve a empezar",
  redondear(marcasDelFondo(4, 2, 0, 1)),
  [0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75],
);
es("uno más largo se corta", redondear(marcasDelFondo(4, 1, 0, 10)), [0, 0.25, 0.5, 0.75]);
es("si el vídeo no empieza en cero, cuenta desde su primer fotograma", redondear(marcasDelFondo(2, 1, 1.5, 3)), [1.5, 2]);
es("un fondo sin duración se queda en su primer fotograma", redondear(marcasDelFondo(2, 1, 0.2, 0)), [0.2, 0.2]);
es(
  "cada marca cae un pelo DESPUÉS del borde, nunca antes (si no, saldría el fotograma anterior)",
  marcasDelFondo(30, 1, 0, 5).every((m, i) => m > i / 30 && m - i / 30 < 0.001),
  true,
);

const [vertical, horizontal] = [FORMATOS["9:16"], FORMATOS["16:9"]];
es("los dos formatos de Munir", [horizontal, vertical], [{ ancho: 1920, alto: 1080 }, { ancho: 1080, alto: 1920 }]);
es("lados pares, que H.264 no acepta impares", [horizontal, vertical].every((f) => f.ancho % 2 === 0 && f.alto % 2 === 0), true);
es("un 4K horizontal para la tarjeta de 1920 se lee a 1920", anchoDelFondo(3840, 2160, 1920, 1080), 1920);
// En vertical manda el alto: 2160 → 1920 es 0,889, y 3840 por eso son 3414.
es("el mismo 4K para la vertical se lee hasta CUBRIR sus 1920 de alto", anchoDelFondo(3840, 2160, 1080, 1920), 3414);
es("uno de móvil en vertical (2160×3840) para la vertical", anchoDelFondo(2160, 3840, 1080, 1920), 1080);
es("uno pequeño no se agranda", anchoDelFondo(1280, 720, 1920, 1080), undefined);
es("justo del tamaño: tal cual", anchoDelFondo(1920, 1080, 1920, 1080), undefined);
es("sin tamaño conocido: tal cual", anchoDelFondo(0, 0, 1920, 1080), undefined);

es("el nombre lleva la fecha de ese día", nombreSugerido("png", new Date(2026, 9, 7)), "adeorq-uso-2026-10-07.png");
es("y la extensión del vídeo", nombreSugerido("mp4", new Date(2026, 0, 31)), "adeorq-uso-2026-01-31.mp4");

es("una dirección .mp4 es vídeo, con o sin ?v=", [esVideo("http://asset.localhost/fondo.mp4"), esVideo("x/fondo.MOV?v=3")], [true, true]);
es("una .png no", esVideo("http://asset.localhost/fondo.png"), false);
const archivo = (type: string) => ({ type }) as Blob;
es("un archivo con tipo de vídeo", esVideo(archivo("video/quicktime")), true);
es("uno de imagen, o sin tipo, se abre como imagen primero", [esVideo(archivo("image/png")), esVideo(archivo(""))], [false, false]);

// La cifra que sube en el vídeo y los tics del «Contador», que tienen que ir juntos.
es("la cifra sube de 0 a la suya en 1,2 s", [LLEGADA, subida(0), subida(LLEGADA), subida(5)], [1.2, 0, 1, 1]);
es("fuera del vídeo (sin reloj) está quieta en la suya", subida(Infinity), 1);
es("sube frenando: a mitad de camino ya lleva 7/8", subida(LLEGADA / 2), 0.875);
const subiendo = Array.from({ length: 13 }, (_, i) => subida((i * LLEGADA) / 12));
es("y nunca baja", subiendo.every((x, i) => i === 0 || x >= subiendo[i - 1]), true);
const tics = pasos(18, LLEGADA);
es("el primer tic al empezar y todos antes de plantarse", [tics[0], tics.every((t) => t < LLEGADA)], [0, true]);
const huecos = tics.slice(1).map((t, i) => t - tics[i]);
es("los tics se espacian como frena la cifra", huecos.every((h, i) => i === 0 || h >= huecos[i - 1]), true);
// Cada tic es un salto igual de la cifra: en el tic k la cifra vale k/18.
es("cada tic cae donde la cifra da un salto igual", redondear(tics.map((t) => subida(t))), redondear(tics.map((_, k) => k / 18)));

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
