// La vista neuronal: los documentos como puntos y sus enlaces como hilos.
//
// Es un canvas y no React Flow (que ya está en el proyecto, para el Lienzo) por
// una razón de tamaño: el Lienzo maneja diez piezas con una terminal viva
// dentro y aquí hay quinientos puntos que no son nada más que un punto. Medio
// millar de nodos del DOM para dibujar círculos de cuatro píxeles va lento y no
// da nada a cambio.
//
// El reparto NO es por fuerzas, y eso es una decisión (2026-08-10). Lo fue
// hasta hoy, endurecida contra sus dos fallos, y aun así el mapa no se leía.
// Con 599 documentos y el 64 % de los enlaces cruzando de un proyecto a otro,
// lo que tapaba el mapa eran las LÍNEAS, no los puntos: 554 trazos rectos
// atravesando el centro. Ahora cada proyecto ocupa un arco del círculo (el
// reparto vive en `lib/constelacion.ts`, medido aparte) y los hilos se dibujan
// curvados hacia dentro, con el color de quien sale, así que los viajes
// parecidos se recogen en haces en vez de cruzarse.
//
// Se perdió arrastrar un nodo: con un sitio calculado, moverlo sería mentir
// sobre dónde vive. Lo que se sigue haciendo con un punto es abrirlo.
//
// ── POR QUÉ EL DIBUJO VA AGRUPADO (2026-08-11) ──────────────────────────────
//
// Munir: «se nota muy, pero que muy saturado, y va muy lagueado». Medido con su
// bóveda antes de tocar nada (410 documentos, 1.071 hilos, 10 proyectos), el
// fotograma costaba **1.481 llamadas de dibujo, y 824 de ellas con
// `shadowBlur`**: el 77 % de los hilos, no «las pocas que de verdad mandan»
// como decía el comentario que había aquí. Un `shadowBlur` en canvas desenfoca
// todo el rectángulo que ocupa el trazo, y estas curvas cruzan el disco entero.
//
// Ahora los hilos se trazan UNA vez y se agrupan por color, por si cruzan de
// proyecto y por su peso en tres escalones; los puntos, por color. El mismo
// fotograma cuesta **35 llamadas y ni un desenfoque**. Y se ve mejor de paso:
// las líneas de un mismo trazo no suman opacidad donde se cruzan, así que la
// madeja del centro deja de ser una mancha blanca. Se vuelve a medir con
// `node scripts/medir-constelacion.mjs`, que cuenta el trabajo del fotograma
// sobre la bóveda de verdad sin abrir la app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { familia, type Doc } from "../lib/memoria";
import {
  anillar,
  colorDeArco,
  nucleo,
  radioTotal,
  tiroDelHilo,
  R_NUCLEO,
  type Arco,
  type Hilo,
  type Punto,
} from "../lib/constelacion";
import { modoRendimiento } from "../lib/rendimiento";
import { useT } from "../lib/i18n";

/** El ámbar del núcleo. Fijo, y NO de la paleta de proyectos a propósito: las
    skills no son un proyecto más, y con un tono de la rueda parecerían uno. */
const AMBAR = "#f0b464";

/**
 * El tamaño de un rótulo, en unidades del mapa, para que en PANTALLA se lea.
 *
 * Todo lo de aquí dentro se dibuja escalado por el zoom, así que un tamaño a
 * secas encoge al alejarte y se dispara al acercarte. Antes se dividía por el
 * zoom para dejarlo clavado en píxeles de pantalla, con un tope arriba, y de
 * ahí salían las dos quejas de Munir (2026-08-12) a la vez:
 *
 *  · el tope mordía justo en la vista general. Con el mapa entero delante el
 *    zoom es de 0,2, y `min(20, 12 / 0,2)` daba 20 unidades, que a esa escala
 *    son CUATRO PÍXELES de alto. De ahí los nombres ilegibles del primer
 *    vistazo, que es la pantalla que más se mira;
 *  · y clavado en pantalla, al ampliar los puntos crecen y la letra no, así que
 *    se lee como si menguara aunque mida exactamente lo mismo.
 *
 * Ahora crece con el zoom, pero despacio: entre el mapa entero y el máximo
 * acercamiento el zoom se multiplica por veinte y la letra solo por dos y
 * medio. Con su suelo y su techo puestos en píxeles de PANTALLA, que es la
 * única unidad en la que tiene sentido preguntarse si algo se lee.
 */
function letra(z: number, base: number, min: number, max: number) {
  const enPantalla = Math.max(min, Math.min(max, base * Math.pow(z, 0.35)));
  return enPantalla / z;
}

/** Un manojo de hilos que se pintan de una vez: mismo color, mismo grosor y
    mismo tono. Ver el porqué en `trazar`. */
interface Madeja {
  color: string;
  ancho: number;
  alfa: number;
  path: Path2D;
}

/** El tamaño dice cuántos hilos tiene. Subió el 2026-08-11 («que los circulitos
    sean más gruesos, más grandes, son muy pequeñitos»): de 2,5–9 a 4–12,5 de
    radio. Cabe porque el reparto ahora garantiza 26 px entre dos vecinos, que
    antes eran 7,9 en los proyectos de dos documentos (ver `SEP_MIN` en
    `lib/constelacion`). Y hay que mirarlo con el zoom puesto: al que enseña el
    mapa entero, un radio de 2,5 quedaba en un píxel y medio en pantalla. */
function radioDe(p: Punto): number {
  return 4 + Math.min(8.5, Math.sqrt(p.grado) * 1.8);
}

/** La curva de un hilo: recogida hacia dentro, pero RODEANDO el hueco del
    centro. El porqué y la geometría, en `tiroDelHilo`. */
function curva(path: Path2D, p: Punto, q: Punto) {
  const c = tiroDelHilo(
    { x: p.x, y: p.y, a: p.ang ?? Math.atan2(p.y, p.x), r: 0 },
    { x: q.x, y: q.y, a: q.ang ?? Math.atan2(q.y, q.x), r: 0 },
  );
  path.moveTo(p.x, p.y);
  path.quadraticCurveTo(c.x, c.y, q.x, q.y);
}

/**
 * Traza el dibujo entero UNA vez y lo deja agrupado.
 *
 * Antes cada hilo era su propio `beginPath` + `stroke`, y con la bóveda de
 * Munir eso son 1.071 trazos por fotograma, treinta veces por segundo. Peor
 * aún: 824 de ellos (el 77 %, medido) llevaban `shadowBlur`, que en canvas es
 * un desenfoque de todo el rectángulo que ocupa la curva, y esas curvas cruzan
 * el disco entero. De ahí venía el «va muy lag» del 2026-08-11.
 *
 * Aquí los hilos se reparten en manojos por color, por si cruzan de proyecto y
 * por su peso en tres escalones, y cada manojo se pinta con UN solo trazo. Con
 * diez proyectos eso son unas veinte llamadas de dibujo en vez de mil. El
 * camino se guarda en un `Path2D` y no se vuelve a calcular: los documentos no
 * se mueven.
 *
 * Y de regalo se ve mejor: dentro de un mismo trazo las líneas superpuestas no
 * suman opacidad, así que la madeja del centro deja de ser una mancha blanca.
 */
function trazar(ps: Punto[], hs: Hilo[]): { madejas: Madeja[]; bolas: Array<{ color: string; path: Path2D }> } {
  const grupos = new Map<string, Madeja>();
  for (const [i, j] of hs) {
    const p = ps[i];
    const q = ps[j];
    if (!p || !q) continue;
    const puente = p.fam !== q.fam;
    // Un enlace que sale de un documento con veinte hilos es una arteria de la
    // bóveda; uno entre dos notas sueltas es un detalle. En tres escalones y no
    // continuo, que es lo que permite agruparlos.
    const peso = Math.min(1, Math.max(p.grado, q.grado) / 14);
    const nivel = peso > 0.66 ? 2 : peso > 0.33 ? 1 : 0;
    const clave = `${p.color}|${puente ? 1 : 0}|${nivel}`;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        color: p.color,
        ancho: (puente ? 0.75 : 0.5) + nivel * 0.5,
        // Más bajo que antes a propósito: sin el halo que los encendía, mil
        // hilos al 40 % seguían tapando el mapa.
        alfa: (puente ? 0.15 : 0.07) + nivel * 0.08,
        path: new Path2D(),
      };
      grupos.set(clave, g);
    }
    curva(g.path, p, q);
  }
  // Los puntos, agrupados igual: un relleno por color en vez de uno por
  // documento. El radio dice cuántos hilos tiene, con techo bajo.
  const porColor = new Map<string, Path2D>();
  for (const p of ps) {
    let path = porColor.get(p.color);
    if (!path) porColor.set(p.color, (path = new Path2D()));
    // El `moveTo` antes de cada círculo es obligatorio: sin él, un `arc` se une
    // al anterior con una recta y los puntos saldrían cosidos entre sí.
    const r = radioDe(p);
    path.moveTo(p.x + r, p.y);
    path.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  return {
    // De los finos a los gruesos, para que las arterias queden encima.
    madejas: [...grupos.values()].sort((a, b) => a.ancho - b.ancho),
    bolas: [...porColor.entries()].map(([color, path]) => ({ color, path })),
  };
}

interface Props {
  docs: Doc[];
  /** El documento abierto, que se pinta encendido y con su nombre. */
  activo?: string;
  onAbrir: (id: string) => void;
  /** Los sueltos (sin un solo enlace) se pueden esconder: en una bóveda de
      notas de trabajo son mayoría y tapan la red que sí existe. */
  soloConectados: boolean;
  /** Las skills, que van en el centro. No son documentos de la bóveda: no
      pertenecen a ningún proyecto y valen para todos, que es justo lo que se
      pone en el centro de un mapa. */
  skills?: Array<{ name: string; description: string; folder: string }>;
  /** Abrir una skill. Va aparte de `onAbrir` porque no viven en la bóveda: su
      texto está en `~/.claude/skills`, y quien las lee es otro comando. */
  onAbrirSkill?: (folder: string) => void;
}

export default function MemoriaGrafo({
  docs,
  activo,
  onAbrir,
  soloConectados,
  skills,
  onAbrirSkill,
}: Props) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  /** La caja que lo contiene. Se mide ELLA y no el lienzo, porque el lienzo
      está girado y su rectángulo envolvente cambia con el ángulo. */
  const caja = useRef<HTMLDivElement>(null);
  const puntos = useRef<Punto[]>([]);
  const hilos = useRef<Array<[number, number]>>([]);
  /** El trozo de círculo de cada proyecto. Ver `lib/constelacion`. */
  const arcos = useRef<Arco[]>([]);
  /** El dibujo ya trazado, agrupado por color y grosor. Ver `Madeja`. */
  const madejas = useRef<Madeja[]>([]);
  const bolas = useRef<Array<{ color: string; path: Path2D }>>([]);
  /** El color de cada proyecto y quiénes merecen etiqueta. Los dos se sacaban
      recorriendo los 335 puntos DENTRO del bucle de pintado, treinta veces por
      segundo, para un dato que no cambia nunca. */
  const colorFam = useRef<Map<string, string>>(new Map());
  const rotulables = useRef<Punto[]>([]);
  /** Las skills del centro, como puntos, PARA BUSCARLAS con el ratón. No entran
      en `puntos` porque no se dibujan con los demás (van en ámbar y con su
      anillo), pero sin esto el puntero no las encuentra y el clic no abría
      nada: era lo único del mapa que no respondía (Munir, 2026-08-11). */
  const nucleoPuntos = useRef<Punto[]>([]);
  /** Si no ha cambiado nada y el mapa no gira, no hay nada que repintar. */
  const sucio = useRef(true);
  const raf = useRef(0);
  /** La cámara: QUÉ PUNTO del mapa está en el centro de la pantalla, y cuánto
      se acerca. No es «cuánto he movido la vista», y esa diferencia es la que
      hace que girar no cueste nada (el porqué entero, en `pintar`). */
  const vista = useRef({ cx: 0, cy: 0, z: 1 });
  /** Cuánto lleva girada la rueda. Una vuelta cada tres minutos y pico: lo
      bastante para que el mapa esté vivo y lo bastante poco para no marear ni
      para que un rótulo se te escape mientras lo lees. Se para sola en cuanto
      el ratón entra, porque mirar de cerca algo que se mueve es imposible. */
  const giro = useRef(0);
  const quieto = useRef(false);
  const arrastre = useRef<{
    x: number;
    y: number;
    movido: boolean;
    /** Arrastrando con Shift o con el botón derecho no se mueve el mapa: se
        GIRA, cogiéndolo como se coge un dial. Guarda el ángulo del puntero
        respecto al centro para saber cuánto ha rodado desde el último aviso. */
    girando: boolean;
    ang: number;
  } | null>(null);
  const [encima, setEncima] = useState<Punto | null>(null);
  const encimaRef = useRef<Punto | null>(null);

  /** Los enlaces son de ida: para saber si un documento está conectado cuenta
      igual que le enlacen a él, así que el grado se suma por los dos lados. */
  const red = useMemo(() => {
    const grado = new Map<string, number>();
    const existe = new Set(docs.map((d) => d.id));
    const pares: Array<[string, string]> = [];
    for (const d of docs) {
      for (const l of d.links) {
        if (!existe.has(l)) continue;
        pares.push([d.id, l]);
        grado.set(d.id, (grado.get(d.id) ?? 0) + 1);
        grado.set(l, (grado.get(l) ?? 0) + 1);
      }
    }
    return { grado, pares };
  }, [docs]);

  // El reparto: cada proyecto un arco, y sus documentos en filas dentro de él.
  // Se calcula UNA vez, cuando cambian los documentos o el filtro, y ya no se
  // vuelve a tocar: no hay colocación que se enfríe ni tablero que tiemble los
  // primeros segundos.
  useEffect(() => {
    const visibles = soloConectados ? docs.filter((d) => (red.grado.get(d.id) ?? 0) > 0) : docs;
    const { pos, arcos: arcs } = anillar(visibles, familia);
    // El color sale de la POSICIÓN en la rueda, no del nombre: `hueOf` solo
    // usa ochenta grados de tono para que la app se lea azul, y con 56
    // proyectos eso los deja indistinguibles. Ver `colorDeArco`.
    const tono = new Map(arcs.map((a, i) => [a.fam, colorDeArco(i, arcs.length)]));
    const idx = new Map<string, number>();
    const ps: Punto[] = visibles.map((d, i) => {
      idx.set(d.id, i);
      const fam = familia(d);
      return {
        id: d.id,
        x: pos[i].x,
        y: pos[i].y,
        ang: pos[i].a,
        grado: red.grado.get(d.id) ?? 0,
        color: tono.get(fam) ?? "#8aa",
        title: d.title,
        fam,
      };
    });
    puntos.current = ps;
    arcos.current = arcs;
    hilos.current = red.pares
      .map(([a, b]) => [idx.get(a) ?? -1, idx.get(b) ?? -1] as Hilo)
      .filter(([a, b]) => a >= 0 && b >= 0);
    // El dibujo se traza aquí, no en cada fotograma: nadie se mueve.
    const trazado = trazar(ps, hilos.current);
    madejas.current = trazado.madejas;
    bolas.current = trazado.bolas;
    colorFam.current = tono;
    // Los que pueden llevar su nombre escrito. Son los conectados de verdad, y
    // saber quiénes son no depende de dónde esté la cámara.
    rotulables.current = ps.filter((p) => p.grado >= 8);
    sucio.current = true;
    // La cámara nace enseñándolo entero. Con 56 proyectos el círculo mide más
    // de mil quinientos píxeles de lado, y al zoom de fábrica solo se veía el
    // agujero del medio.
    // La medida buena es la de la CAJA: el lienzo es mayor que ella a
    // propósito (ver `medir`), y con su tamaño el mapa nacería demasiado lejos.
    const c = caja.current;
    if (c && arcs.length) {
      const cabe = Math.min(c.clientWidth, c.clientHeight) / (radioTotal(arcs) * 2.35);
      vista.current = { cx: 0, cy: 0, z: Math.max(0.12, Math.min(1, cabe)) };
    }
  }, [docs, red, soloConectados]);

  // Las skills, como puntos buscables. Sus sitios salen del MISMO `nucleo` que
  // los dibuja, así que no hay dos versiones de dónde están.
  useEffect(() => {
    const sk = skills ?? [];
    const sitios = nucleo(sk.length);
    nucleoPuntos.current = sk.map((s, i) => ({
      id: `skill:${s.folder}`,
      x: sitios[i].x,
      y: sitios[i].y,
      ang: sitios[i].a,
      grado: 0,
      color: AMBAR,
      title: s.name,
    }));
    sucio.current = true;
  }, [skills]);

  const pintar = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const v = vista.current;
    ctx.save();
    /* EL GIRO no entra aquí, y es el cambio que quitó el lag: girar es una
       transformación rígida de todo el dibujo, así que la hace la tarjeta
       gráfica moviendo el lienzo ya pintado (`style.transform` en el bucle) en
       vez de rehacer mil trazos para enseñar lo mismo un grado más allá.

       EL ARRASTRE tampoco, y por eso la cámara es «qué punto del mapa estás
       mirando» (`cx`, `cy`) y no «cuánto he movido la pantalla».

       Ha tenido tres formas en dos días, y las dos primeras se rompieron por
       sitios distintos: moviendo el LIENZO con `style.transform`, se cortaba
       (mide la diagonal de su caja, lo justo para girar, así que desplazarlo lo
       saca de la caja y aparece un borde recto); y moviendo el DIBUJO por un
       desplazamiento de pantalla, había que contra-rotarlo, o sea que dependía
       del ángulo, así que girar obligaba a repintar y hubo que frenar la vuelta
       automática en cuanto tocabas el mapa (Munir, 2026-08-12: «que no se pare
       lo de girar aunque lo amplíes»).

       Mirando a un punto no pasa ninguna de las dos cosas: el lienzo no se
       mueve nunca, y esta transformación NO tiene dentro el ángulo, así que
       girar sigue costando cero y la rueda puede girar siempre. De regalo, el
       punto que centras se queda quieto en el centro mientras el resto gira a
       su alrededor, que estando ampliado es justo lo que quieres mirar. */
    ctx.translate(w / 2, h / 2);
    ctx.scale(v.z, v.z);
    ctx.translate(-v.cx, -v.cy);

    const ps = puntos.current;
    const sobre = encimaRef.current;
    const vecinos = new Set<string>();
    if (sobre) {
      for (const [i, j] of hilos.current) {
        if (ps[i]?.id === sobre.id) vecinos.add(ps[j]?.id);
        if (ps[j]?.id === sobre.id) vecinos.add(ps[i]?.id);
      }
    }

    /* LOS HILOS, CURVADOS POR DENTRO Y DEL COLOR DE QUIEN SALE.
       Es el cambio que hace legible el mapa. Rectos, los enlaces que cruzan de
       un proyecto a otro se reparten por todo el disco y tapan el centro;
       curvados hacia el medio, los viajes parecidos se recogen en haces y el
       ojo puede seguirlos. Y con el color de su proyecto de origen, como pidió
       Munir: una madeja de un color se lee como «esto sale de aquí», que es la
       pregunta que este mapa contesta mejor que una lista.

       Ya vienen trazados y agrupados de `trazar`, así que aquí solo se pintan:
       una veintena de trazos en vez de mil, y ni un `shadowBlur`. */
    for (const m of madejas.current) {
      ctx.lineWidth = m.ancho / v.z;
      ctx.strokeStyle = m.color;
      // Con el ratón sobre un punto, el resto del mapa se apaga para que se
      // vean sus hilos. Se hace bajando el tono del manojo entero, no
      // recorriéndolos de uno en uno.
      ctx.globalAlpha = sobre ? m.alfa * 0.3 : m.alfa;
      ctx.stroke(m.path);
    }
    // Y los del punto que estás mirando, encima y en claro. Son un puñado, así
    // que estos sí se trazan al vuelo.
    if (sobre) {
      const suyos = new Path2D();
      for (const [i, j] of hilos.current) {
        const p = ps[i];
        const q = ps[j];
        if (!p || !q) continue;
        if (p.id === sobre.id || q.id === sobre.id) curva(suyos, p, q);
      }
      ctx.lineWidth = 2.2 / v.z;
      ctx.strokeStyle = "#cfe6ff";
      ctx.globalAlpha = 0.95;
      ctx.stroke(suyos);
    }
    ctx.globalAlpha = 1;

    /* Y el nombre de cada proyecto, fuera de su arco y girado con él.
       Va después de los hilos y antes de los puntos: los hilos no pueden tapar
       un rótulo, y un punto sí puede pisarlo sin que estorbe. */
    ctx.font = `600 ${letra(v.z, 18, 14, 34)}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    for (const arco of arcos.current) {
      // Un proyecto de un solo documento abre un arco de nada: su nombre se
      // montaría con el del vecino. Se rotula solo si hay sitio.
      if (arco.abre < 0.035 && v.z < 0.5) continue;
      const tenue = !!sobre && sobre.fam !== arco.fam;
      const color = colorFam.current.get(arco.fam) ?? "#8aa";
      ctx.save();
      ctx.rotate(arco.a);
      // El aire entre el borde del arco y su nombre, en proporción a la letra:
      // con un hueco fijo, al agrandarla el nombre se pegaba a los puntos.
      ctx.translate(arco.rMax + 10 + letra(v.z, 18, 14, 34) * 0.6, 0);
      // Al otro lado del círculo el texto saldría del revés: se da la vuelta y
      // se alinea por el otro extremo, que es como se rotula una rueda.
      if (Math.cos(arco.a) < 0) {
        ctx.rotate(Math.PI);
        ctx.textAlign = "right";
      } else {
        ctx.textAlign = "left";
      }
      ctx.globalAlpha = tenue ? 0.3 : 0.95;
      ctx.fillStyle = color;
      ctx.fillText(arco.fam, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";

    /* EL NÚCLEO: las skills, en el agujero del medio.
       Van en ámbar y no en el color de ningún proyecto porque no son de
       ninguno: se usan en todos, que es lo que las pone en el centro. Y con
       nombre siempre, que son seis y caben. */
    const sk = skills ?? [];
    if (sk.length) {
      const sitios = nucleo(sk.length);
      // El aro que las une, para que se lean como un anillo y no como seis
      // puntos sueltos que se han caído dentro. Ahora se ve, porque desde hoy
      // ningún hilo entra en este hueco (ver `R_LIBRE`); antes estaba tapado
      // por la madeja y por eso Munir pidió un anillo que ya existía.
      if (sk.length > 1) {
        ctx.beginPath();
        ctx.arc(0, 0, R_NUCLEO, 0, Math.PI * 2);
        ctx.strokeStyle = AMBAR;
        ctx.globalAlpha = sobre ? 0.14 : 0.4;
        ctx.lineWidth = 1.6 / v.z;
        ctx.stroke();
      }
      ctx.globalAlpha = sobre ? 0.3 : 1;
      sk.forEach((s, i) => {
        const p = sitios[i];
        // Del tamaño de un documento bien conectado: son el centro de todo, no
        // pueden ser los puntos más pequeños del mapa.
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = AMBAR;
        ctx.fill();
        ctx.font = `600 ${letra(v.z, 16, 13, 30)}px system-ui, sans-serif`;
        ctx.fillStyle = AMBAR;
        ctx.textAlign = "center";
        // El hueco sobre el punto crece con la letra, o al agrandarla se le
        // montaría encima.
        ctx.fillText(s.name, p.x, p.y - 11 - letra(v.z, 16, 13, 30) * 0.55);
      });
      // Y el rótulo del conjunto, en el centro exacto. Solo con más de una: con
      // una sola, el punto ya está ahí y se pisarían.
      if (sk.length > 1) {
        ctx.font = `700 ${letra(v.z, 19, 15, 36)}px system-ui, sans-serif`;
        ctx.fillStyle = AMBAR;
        ctx.globalAlpha = sobre ? 0.2 : 0.75;
        ctx.textAlign = "center";
        ctx.fillText("SKILLS", 0, letra(v.z, 19, 15, 36) * 0.35);
      }
      ctx.globalAlpha = 1;
    }

    /** El sitio que ya ocupa una etiqueta, para no pintar otra encima. */
    const etiquetas: Array<{ x: number; y: number; w: number }> = [];

    /* LOS PUNTOS. Sin nadie bajo el ratón van de golpe, un relleno por color
       (los caminos ya vienen hechos de `trazar`): diez llamadas en vez de
       cuatrocientas. Con el ratón encima hay que apagar unos sí y otros no, y
       ahí sí se recorren de uno en uno, que es cuando el mapa está parado. */
    if (!sobre) {
      for (const b of bolas.current) {
        ctx.fillStyle = b.color;
        ctx.fill(b.path);
      }
    } else {
      for (const p of ps) {
        const apagado = p.id !== activo && p.id !== sobre.id && !vecinos.has(p.id);
        ctx.globalAlpha = apagado ? 0.25 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radioDe(p), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // El que tienes abierto, con su aro blanco.
    const abierto = activo ? ps.find((p) => p.id === activo) : undefined;
    if (abierto) {
      ctx.beginPath();
      ctx.arc(abierto.x, abierto.y, radioDe(abierto), 0, Math.PI * 2);
      ctx.lineWidth = 2 / v.z;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }

    /* El nombre solo de los importantes, del que se mira y del abierto: medio
       millar de etiquetas es una mancha de tinta, no un mapa.

       Y aunque sean pocos, dos nombres encima uno de otro no se leen ninguno de
       los dos. Se reserva el sitio que ocupa cada etiqueta y la siguiente que
       caiga ahí simplemente no se pinta: mejor cinco leídos que quince pisados
       (Munir, 2026-08-02). */
    ctx.textAlign = "center";
    // La fuente se pone UNA vez: cambiarla obliga al motor a rehacer su
    // medición de texto, y aquí eran cuarenta cambios por fotograma para
    // escribir siempre del mismo tamaño.
    const cuerpo = letra(v.z, 15, 12.5, 28);
    ctx.font = `${cuerpo}px system-ui, sans-serif`;
    // Y los candidatos vienen filtrados de antes; solo se añaden el abierto y
    // el que estés mirando, que sí cambian.
    const conNombre = v.z > 0.5 ? rotulables.current : [];
    const extra = ps.filter(
      (p) => (p.id === activo || p.id === sobre?.id) && !conNombre.includes(p),
    );
    for (const p of [...extra, ...conNombre]) {
      const forzado = p.id === activo || p.id === sobre?.id;
      // El hueco que ocupa cada nombre sale de su propio cuerpo de letra: con
      // medidas fijas, al agrandarla dejaban de reservar lo suficiente y los
      // nombres se pisaban justo cuando por fin se leían.
      const alto = cuerpo * 1.25;
      const ancho = Math.min(p.title.length, 26) * cuerpo * 0.5;
      const ex = p.x;
      const ey = p.y - radioDe(p) - cuerpo * 0.45;
      const libre =
        forzado ||
        !etiquetas.some(
          (e) => Math.abs(e.x - ex) < (e.w + ancho) / 2 && Math.abs(e.y - ey) < alto,
        );
      if (!libre) continue;
      etiquetas.push({ x: ex, y: ey, w: ancho });
      ctx.fillStyle = forzado ? "#fff" : "rgba(220,225,235,0.72)";
      ctx.fillText(p.title.slice(0, 26), ex, ey);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // `skills` va en las dependencias y NO es un detalle: las skills llegan de
    // disco un momento después de montarse esto, y con `[activo]` a secas el
    // dibujo se quedaba con la foto de antes —o sea, con la lista vacía— y no
    // volvía a mirarla nunca. Por eso el centro salía vacío desde el día que se
    // añadió el núcleo, y por eso Munir pidió el 2026-08-11 un anillo de skills
    // que llevaba horas escrito. Cualquier prop que se lea aquí dentro tiene
    // que estar en esta lista.
  }, [activo, skills]);

  /* El bucle: ya no hay nada que mover, solo que repintar.
     Con el reparto en arcos, cada documento nace en su sitio y se queda: no hay
     colocación que se enfríe ni tablero que tiemble los primeros segundos. Se
     repinta treinta veces por segundo porque el ratón y el zoom sí cambian lo
     que se ve, y a esa cadencia el ventilador no se entera de que hay un mapa
     abierto. */
  useEffect(() => {
    // Ni gira ni se anima con el modo rendimiento puesto ni con la preferencia
    // del sistema de reducir animaciones: un mapa girando es lo más caro que
    // hay aquí, y es adorno.
    const sinMovimiento =
      modoRendimiento() || matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ultimo = 0;
    let ultimoPintado = 0;
    sucio.current = true;
    const tick = (ts: number) => {
      raf.current = requestAnimationFrame(tick);
      // Por tiempo real y no por fotograma: así gira igual de despacio tanto si
      // el equipo va a 120 como si va a 30.
      const dt = ultimo ? Math.min(0.2, (ts - ultimo) / 1000) : 0;
      ultimo = ts;
      /* La rueda gira SIEMPRE, esté el mapa donde esté y con el zoom que sea.
         Llegó a pararse en cuanto lo movías, y no era un capricho de diseño:
         con la cámara de entonces el desplazamiento iba dibujado dentro del
         lienzo y contra-rotado, así que cada grado obligaba a repintar. Con la
         cámara mirando a un punto (ver `pintar`) el ángulo ya no entra en el
         dibujo, así que girar vuelve a costar cero y no hay nada que frenar
         (Munir, 2026-08-12). Lo único que la para sigue siendo el ratón
         encima, que es cuando estás leyendo. */
      if (!sinMovimiento && !quieto.current) giro.current += dt * 0.03;
      /* Girar el lienzo cuesta una línea de CSS y lo hace la tarjeta gráfica:
         ni se limpia nada, ni se vuelve a trazar nada. Esto es lo que corre en
         cada fotograma ahora. */
      const el = canvas.current;
      if (el) el.style.transform = `rotate(${giro.current}rad)`;
      // Y REPINTAR solo cuando de verdad cambia lo dibujado: el zoom, el punto
      // que miras, otra bóveda. Con el mapa girando solo, eso es nunca.
      if (!sucio.current || ts - ultimoPintado < 33) return;
      ultimoPintado = ts;
      sucio.current = false;
      pintar();
    };
    raf.current = requestAnimationFrame(tick);
    /* El lienzo es CUADRADO y del tamaño de la diagonal de su caja, no del
       tamaño de la caja: como gira, uno del tamaño justo dejaría sus esquinas
       vacías barriendo por dentro del panel. Se recalcula al cambiar de tamaño,
       y de paso hay que repintar o se queda con el dibujo del ancho de antes. */
    const medir = () => {
      const b = caja.current;
      const el = canvas.current;
      if (!b || !el) return;
      const lado = Math.ceil(Math.hypot(b.clientWidth, b.clientHeight));
      el.style.width = `${lado}px`;
      el.style.height = `${lado}px`;
      el.style.marginLeft = `${-lado / 2}px`;
      el.style.marginTop = `${-lado / 2}px`;
      sucio.current = true;
    };
    medir();
    const obs = new ResizeObserver(medir);
    if (caja.current) obs.observe(caja.current);
    return () => {
      cancelAnimationFrame(raf.current);
      obs.disconnect();
    };
  }, [pintar]);

  /** De la pantalla al tablero. Se mide la CAJA y no el lienzo: el lienzo está
      girado, y el rectángulo envolvente de algo girado crece y encoge con el
      ángulo. La caja no se mueve nunca. */
  const enTablero = (e: React.PointerEvent | React.MouseEvent) => {
    const r = caja.current!.getBoundingClientRect();
    const v = vista.current;
    const sx = e.clientX - r.left - r.width / 2;
    const sy = e.clientY - r.top - r.height / 2;
    // Se DESHACE el giro de la cámara. Sin esto, el puntero apunta a donde el
    // mapa estaba cuando empezó a girar: señalas un documento y se enciende
    // otro, cada vez más lejos según pasa el rato.
    const g = -giro.current;
    const cos = Math.cos(g);
    const sen = Math.sin(g);
    // Y se suma el punto que estás mirando, que es el origen de la cámara.
    return {
      x: v.cx + (sx * cos - sy * sen) / v.z,
      y: v.cy + (sx * sen + sy * cos) / v.z,
    };
  };

  /** El delta del ratón, en unidades del mapa. Arrastrar la pantalla hacia un
      lado mueve la cámara hacia el CONTRARIO, y girado hay que deshacer el
      ángulo o el mapa se iría en diagonal cuando arrastras en horizontal. */
  const enMapa = (dx: number, dy: number) => {
    const v = vista.current;
    const g = -giro.current;
    const cos = Math.cos(g);
    const sen = Math.sin(g);
    return { dx: (dx * cos - dy * sen) / v.z, dy: (dx * sen + dy * cos) / v.z };
  };

  /** El ángulo del puntero visto desde el centro del mapa. Es lo que convierte
      un arrastre en un giro: la mano coge el disco por donde lo toca. */
  const anguloPuntero = (e: React.PointerEvent) => {
    const r = caja.current!.getBoundingClientRect();
    const v = vista.current;
    // Desde el centro del MAPA (su punto 0,0), que con la cámara mirando a un
    // sitio ya no coincide con el centro de la pantalla: está donde caiga el
    // origen, o sea a `-c` escalado y girado. Cogerlo por el centro de la
    // ventana haría que el disco girase raro justo cuando estás ampliado.
    const g = giro.current;
    const cos = Math.cos(g);
    const sen = Math.sin(g);
    const ox = (-v.cx * cos - -v.cy * sen) * v.z;
    const oy = (-v.cx * sen + -v.cy * cos) * v.z;
    return Math.atan2(
      e.clientY - r.top - r.height / 2 - oy,
      e.clientX - r.left - r.width / 2 - ox,
    );
  };

  const buscarPunto = (x: number, y: number): Punto | null => {
    let mejor: Punto | null = null;
    let dist = 14 / vista.current.z;
    // Las del centro entran en la misma búsqueda: para el ratón son puntos como
    // los demás, y lo que cambia es lo que pasa al soltar.
    for (const p of [...nucleoPuntos.current, ...puntos.current]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dist) {
        dist = d;
        mejor = p;
      }
    }
    return mejor;
  };

  /** Qué skill es un punto del centro, si es que lo es. */
  const skillDe = (p: Punto | null) =>
    p?.id.startsWith("skill:") ? (skills ?? []).find((s) => `skill:${s.folder}` === p.id) : undefined;

  return (
    <div className="mem-grafo" ref={caja}>
      <canvas
        ref={canvas}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          /* Arrastrar mueve el MAPA, siempre.
             Antes, empezar sobre un punto lo agarraba a él, porque el tablero
             era una colocación por fuerzas y moverlo tenía sentido. Con el
             reparto en arcos el sitio de cada documento lo decide su proyecto:
             sacarlo de ahí sería mentir sobre dónde vive. Lo que se sigue
             haciendo con un punto es lo que importaba, que es abrirlo. */
          arrastre.current = {
            x: e.clientX,
            y: e.clientY,
            movido: false,
            // Con Shift o con el botón derecho se gira. La rueda ya giraba
            // sola; esto es poder cogerla (Munir, 2026-08-11).
            girando: e.shiftKey || e.button === 2,
            ang: anguloPuntero(e),
          };
        }}
        // Sin esto, el botón derecho abriría el menú del sistema encima del
        // mapa justo cuando lo estás girando.
        onContextMenu={(e) => e.preventDefault()}
        onPointerEnter={() => {
          // La rueda se para mientras miras. Girando no se puede leer un rotulo
          // ni apuntar a un punto, que es justo lo que vienes a hacer.
          quieto.current = true;
        }}
        onPointerMove={(e) => {
          quieto.current = true;
          const a = arrastre.current;
          if (a) {
            const dx = e.clientX - a.x;
            const dy = e.clientY - a.y;
            // Seis píxeles de umbral, como en el resto de la app: sin esto, un
            // clic con la mano poco firme mueve el tablero y no abre nada.
            if (!a.movido && Math.hypot(dx, dy) < 6) return;
            a.movido = true;
            a.x = e.clientX;
            a.y = e.clientY;
            if (a.girando) {
              // Lo que ha rodado el puntero alrededor del centro, por el camino
              // corto: sin esto, al cruzar el sur el mapa pegaría una vuelta
              // entera de golpe.
              const ang = anguloPuntero(e);
              let d = ang - a.ang;
              if (d > Math.PI) d -= Math.PI * 2;
              else if (d < -Math.PI) d += Math.PI * 2;
              giro.current += d;
              a.ang = ang;
              return;
            }
            // La cámara va hacia donde NO empuja el dedo: arrastrar el mapa a
            // la derecha es mirar más a la izquierda.
            const m = enMapa(dx, dy);
            vista.current.cx -= m.dx;
            vista.current.cy -= m.dy;
            // Arrastrar SÍ repinta, porque cambia qué trozo del mapa se ve. Es
            // lo contrario de girar, que enseña lo mismo desde otro ángulo y
            // por eso lo hace la tarjeta gráfica sin dibujar nada.
            sucio.current = true;
            return;
          }
          // Solo el punto bajo el ratón obliga a repintar: ni arrastrar ni
          // girar lo hacen ya, que los mueve la tarjeta gráfica.
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (p?.id !== encimaRef.current?.id) {
            encimaRef.current = p;
            setEncima(p);
            sucio.current = true;
          }
        }}
        onPointerUp={(e) => {
          const a = arrastre.current;
          arrastre.current = null;
          if (a?.movido) return;
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (!p) return;
          const sk = skillDe(p);
          if (sk) onAbrirSkill?.(sk.folder);
          else onAbrir(p.id);
        }}
        onPointerLeave={() => {
          // Y vuelve a girar al salir.
          quieto.current = false;
          arrastre.current = null;
          encimaRef.current = null;
          setEncima(null);
          sucio.current = true;
        }}
        onWheel={(e) => {
          sucio.current = true;
          const v = vista.current;
          const antes = v.z;
          v.z = Math.min(3, Math.max(0.15, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
          /* El zoom va hacia donde apunta el ratón y no hacia el centro: si no,
             acercarse a un racimo del borde lo saca de la pantalla.
             La cuenta es «que el punto del mapa que hay bajo el ratón siga bajo
             el ratón»: como la pantalla se mide desde el centro, ese punto se
             aleja del centro justo lo que crece el zoom, y la cámara compensa
             la diferencia entre los dos inversos. */
          const r = caja.current!.getBoundingClientRect();
          const mx = e.clientX - r.left - r.width / 2;
          const my = e.clientY - r.top - r.height / 2;
          const g = -giro.current;
          const cos = Math.cos(g);
          const sen = Math.sin(g);
          const k = 1 / antes - 1 / v.z;
          v.cx += (mx * cos - my * sen) * k;
          v.cy += (mx * sen + my * cos) * k;
        }}
      />
      {encima && (
        <div className="mem-grafo-eti">
          <b>{encima.title}</b>
          {/* Una skill no tiene enlaces que contar: lo que dice de ella misma
              es para qué sirve, que es lo que trae en su frontmatter. */}
          <span>
            {skillDe(encima)?.description ||
              `${encima.grado} ${encima.grado === 1 ? t("enlace") : t("enlaces")}`}
          </span>
        </div>
      )}
      {/* Decía «arrastra un punto para colocarlo», y eso dejó de poder hacerse
          el 10 de agosto, cuando el sitio de cada documento pasó a decidirlo su
          proyecto. Una ayuda que miente es peor que no tenerla. */}
      <div className="mem-grafo-ayuda">
        {t("Rueda para acercar · arrastra para mover · con Shift, gira · clic en un punto para abrirlo")}
      </div>
    </div>
  );
}
