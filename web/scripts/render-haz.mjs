/* ============================================================================
   Adeorq · web/scripts/render-haz.mjs
   PINTA EL HAZ DE LA PORTADA Y LO GUARDA COMO IMAGEN.

   Por que una imagen y no un shader en tiempo real: porque es lo que hace la
   referencia. Se comprobo mirando su portada por dentro, y no tiene ni un
   <canvas>: su haz son dos SVG de 1574x1474 colocados en absoluto. Es arte
   prerrenderizado. Intentar igualarlo con GLSL a 60 fotogramas por segundo es
   pelear con una mano atada:

     · En tiempo real, el bloom se APROXIMA sumando exponenciales, porque un
       desenfoque de verdad cuesta varias pasadas por fotograma. Aqui se hace
       DE VERDAD, con `filter: blur()` a cuatro radios sumados en modo aditivo,
       y esa es justo la diferencia entre «una raya» y «una columna de luz».
     · El ruido puede tener las octavas que haga falta y deformarse el dominio
       dos veces, que es lo que da nubes con jirones en vez de television sin
       señal.
     · Se dibuja a 2400x1800 y se guarda a la mitad, asi que cada pixel es la
       media de cuatro: bordes limpios sin antialiasing de nadie.

   Y en el visitante cuesta CERO: una imagen, sin GPU, igual en todos los
   equipos, y sin un bucle de animacion comiendose la bateria de un portatil.

   Se lanza con:  node scripts/render-haz.mjs
   Necesita playwright-core (no es dependencia del repo: se lanza desde una
   carpeta que lo tenga instalado, como probar-maqueta.mjs).
   ========================================================================= */

import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
// Con argumento porque este script se lanza desde otra carpeta (la que tiene
// playwright-core instalado), y sin el guardaba la imagen alli en vez de en el
// repo.
const SALIDA = process.argv[2] || resolve(AQUI, '../portada/haz.webp');
const EXE = process.env.CHROMIUM
  || 'C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

/* El lienzo de trabajo. Se guarda a la mitad: 1200x900 es de sobra para una
   luz difusa, y el supermuestreo se nota en el filamento. */
const W = 2400, H = 1800;

/* Dos imagenes y no una: la columna se queda QUIETA (en la referencia el pilar
   tampoco se mueve) y el humo respira por su cuenta con un desplazamiento muy
   lento. Con todo en el mismo archivo habria que mover la columna tambien, y
   una columna de luz que se balancea parece un flexo, no un haz. */
const SOLO = process.argv[3] || 'todo';   // 'columna' | 'humo' | 'todo'

const PINTAR = ({ W, H, SOLO }) => {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  /* --------------------------------------------------------------------
     1. EL NUCLEO Y LA BOCA, en un lienzo aparte
     Se pintan solos porque de aqui sale el bloom: hay que poder desenfocar
     ESTO sin arrastrar el humo.
     -------------------------------------------------------------------- */
  const duro = document.createElement('canvas');
  duro.width = W; duro.height = H;
  const d = duro.getContext('2d');
  const eje = W * 0.5;

  // El filamento. Se dibuja por franjas horizontales porque su anchura y su
  // brillo cambian con la altura, y un solo degradado no sabe hacer eso.
  const PASOS = 900;
  for (let i = 0; i < PASOS; i++) {
    const y = (i / PASOS) * H;
    const bajo = i / PASOS;                 // 0 arriba, 1 abajo
    const alto = H / PASOS + 1;

    // Fino casi todo el recorrido y abriendose solo al final, que es la medida
    // que sacamos de la referencia: 1,5 % arriba, 2,8 % abajo.
    const ancho = W * (0.0016 + Math.pow(bajo, 5.5) * 0.030);
    const g = d.createLinearGradient(eje - ancho * 3, 0, eje + ancho * 3, 0);
    const fuerza = 0.55 + bajo * 0.45;
    g.addColorStop(0.00, 'rgba(255,255,255,0)');
    g.addColorStop(0.38, `rgba(235,245,255,${(0.28 * fuerza).toFixed(3)})`);
    g.addColorStop(0.50, `rgba(255,255,255,${fuerza.toFixed(3)})`);
    g.addColorStop(0.62, `rgba(235,245,255,${(0.28 * fuerza).toFixed(3)})`);
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    d.fillStyle = g;
    d.fillRect(eje - ancho * 3, y, ancho * 6, alto);
  }

  // La boca: la trompeta del final. Dos elipses tumbadas, una dentro de otra,
  // que es lo que hace que la luz se acueste al llegar abajo en vez de acabar
  // en punta.
  for (const [rx, ry, a] of [[W * 0.46, H * 0.16, 0.34], [W * 0.24, H * 0.10, 0.55], [W * 0.10, H * 0.05, 0.85]]) {
    const g = d.createRadialGradient(eje, H, 0, eje, H, Math.max(rx, ry));
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.45, `rgba(220,238,255,${(a * 0.45).toFixed(3)})`);
    g.addColorStop(1, 'rgba(190,220,255,0)');
    d.save();
    d.translate(eje, H);
    d.scale(1, ry / rx);
    d.translate(-eje, -H);
    d.fillStyle = g;
    d.beginPath();
    d.arc(eje, H, rx, 0, Math.PI * 2);
    d.fill();
    d.restore();
  }

  /* --------------------------------------------------------------------
     2. EL BLOOM, de verdad
     Cuatro copias del nucleo con desenfoques muy distintos, sumadas en modo
     aditivo. Con un solo radio sale un tubo de neon; con cuatro, luz.
     -------------------------------------------------------------------- */
  ctx.globalCompositeOperation = 'lighter';
  if (SOLO !== 'humo')
  for (const [radio, alfa] of [[0, 1], [6, 0.55], [26, 0.42], [90, 0.30], [240, 0.22]]) {
    ctx.globalAlpha = alfa;
    ctx.filter = radio ? `blur(${radio}px)` : 'none';
    ctx.drawImage(duro, 0, 0);
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  /* --------------------------------------------------------------------
     3. EL HUMO
     Ruido con el dominio deformado DOS veces: se calcula un ruido y con ese
     resultado se desplaza la entrada del siguiente. Salen nubes con nucleos y
     jirones; sin esto es una textura plana.
     -------------------------------------------------------------------- */
  const NW = 420, NH = 315;
  const n = document.createElement('canvas');
  n.width = NW; n.height = NH;
  const nc = n.getContext('2d');
  const img = nc.createImageData(NW, NH);

  const az = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const suave = t => t * t * (3 - 2 * t);
  const ruido = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = suave(x - xi), yf = suave(y - yi);
    return (az(xi, yi) * (1 - xf) + az(xi + 1, yi) * xf) * (1 - yf)
         + (az(xi, yi + 1) * (1 - xf) + az(xi + 1, yi + 1) * xf) * yf;
  };
  const fbm = (x, y) => {
    let v = 0, a = 0.5, fx = x, fy = y;
    for (let i = 0; i < 6; i++) { v += a * ruido(fx, fy); fx *= 2.03; fy *= 2.03; a *= 0.5; }
    return v;
  };

  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const px = (x / NW) * 5.2, py = (y / NH) * 4.0;
      const q1 = fbm(px, py), q2 = fbm(px + 5.2, py + 1.3);
      const r1 = fbm(px + 3.2 * q1 + 1.7, py + 3.2 * q2 + 9.2);
      const r2 = fbm(px + 3.2 * q1 + 8.3, py + 3.2 * q2 + 2.8);
      let v = fbm(px + 2.8 * r1, py + 2.8 * r2);
      v = Math.max(0, Math.min(1, (v - 0.34) / 0.5));

      // El humo solo se enciende donde llega la columna: asi se lee como humo
      // ATRAVESADO por la luz y no como una mancha pegada encima.
      const dx = Math.abs(x / NW - 0.5);
      const bajo = y / NH;
      // Estrecho a proposito: con 0.055/0.20 el humo llegaba a los dos bordes y
      // se comia el titular. La niebla acompaña a la columna, no cubre la web.
      const alcance = Math.exp(-dx / (0.028 + bajo * 0.115)) * (0.14 + bajo * 0.86);

      const a = v * alcance;
      const i = (y * NW + x) * 4;
      img.data[i] = 150; img.data[i + 1] = 200; img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, a * 1.25) * 255);
    }
  }
  nc.putImageData(img, 0, 0);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = SOLO === 'humo' ? 1 : 0.42;
  ctx.filter = 'blur(3px)';
  ctx.imageSmoothingQuality = 'high';
  if (SOLO !== 'columna') ctx.drawImage(n, 0, 0, W, H);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  /* --------------------------------------------------------------------
     4. A LA MITAD, que es como se sirve
     -------------------------------------------------------------------- */
  const fin = document.createElement('canvas');
  fin.width = W / 2; fin.height = H / 2;
  const fc = fin.getContext('2d');
  fc.imageSmoothingQuality = 'high';
  fc.drawImage(c, 0, 0, W / 2, H / 2);
  // 0.80: el humo es ruido y el ruido es lo que hincha un WebP. De 0.93 a
  // 0.80 se va la mitad del peso y en pantalla no se distingue.
  return fin.toDataURL('image/webp', 0.80);
};

const nav = await chromium.launch({ executablePath: EXE, headless: true });
const pag = await nav.newPage();
const dato = await pag.evaluate(PINTAR, { W, H, SOLO });
await nav.close();

const bytes = Buffer.from(dato.split(',')[1], 'base64');
mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, bytes);
console.log(`${SALIDA.split(/[\/]/).pop()} -> ${W / 2}x${H / 2}, ${(bytes.length / 1024).toFixed(1)} kB  (${SOLO})`);
