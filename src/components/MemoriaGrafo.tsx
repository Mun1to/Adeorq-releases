// El Cerebro: los documentos de la bóveda como luces sobre una bola, y sus
// enlaces cruzándola por dentro.
//
// Es un canvas y no React Flow (que ya está en el proyecto, para el Lienzo) por
// una razón de tamaño: el Lienzo maneja diez piezas con una terminal viva
// dentro y aquí hay quinientos puntos que no son nada más que un punto. Medio
// millar de nodos del DOM para dibujar círculos de cuatro píxeles va lento y no
// da nada a cambio.
//
// ── POR QUÉ ES UNA BOLA Y NO UN DISCO (2026-08-12) ──────────────────────────
//
// Hasta hoy era la Constelación: un disco plano, un arco de tarta por proyecto
// y los hilos curvados por dentro. Munir lo pidió en 3D («tipo Jarvis») y de ahí
// salió todo lo demás. El reparto vive en `lib/cerebro.ts` y trabaja SOBRE UNA
// ESFERA, en direcciones; la forma solo decide a qué distancia del centro cae
// cada dirección. Eso importa: la bola llegó a ser un cerebro anatómico entero
// —fisura, circunvoluciones, cerebelo, tronco— y volver atrás fue cambiar una
// función, porque el reparto nunca supo qué forma tenía debajo.
//
// ── LAS TRES COSAS QUE HACEN QUE ESTO SE LEA ────────────────────────────────
//
// 1. EL CONTORNO. Donde la superficie se va de canto, brilla. No hay ninguna
//    línea dibujando la silueta: sale de la normal de cada punto contra la
//    línea de visión, así que vale para cualquier ángulo.
// 2. LA MALLA DEL TEJIDO. Los nodos cosidos a sus vecinos: es lo que hace que
//    la superficie se lea como una piel y no como puntos flotando.
// 3. LA CÁMARA ES UNA CÁMARA. `dist` es a qué distancia está el ojo, no un
//    aumento, así que con la rueda se ENTRA en la bola. Escalar y acercarse
//    parecen lo mismo y no lo son: escalando, la corteza de delante te tapa el
//    interior para siempre porque nunca te mueves.
//
// ── LO QUE COSTÓ, PARA NO REPETIRLO ─────────────────────────────────────────
//
// · Medido antes de optimizar: 3.610 proyecciones por fotograma, o sea 217.000
//   OBJETOS nuevos por segundo. Eso no es que dibujar cueste, es el recolector
//   de basura parando el mundo, y por eso se sentía como enganchones y no como
//   lentitud. Ahora se escribe en objetos que ya existen (`proyIn`) y se crean
//   seis por fotograma.
// · Las claves de agrupación son NÚMEROS: eran mil cadenas nuevas por fotograma.
// · En reposo no se dibuja nada. Es la optimización con más riesgo de todas: si
//   se pasa de lista, la pantalla se queda congelada. Se ensucia con todo lo que
//   cambia lo que se ve, y ante la duda se ensucia.
// · La calidad se ajusta sola al equipo. El trabajo de JS es milímetro y medio
//   de los dieciséis que hay por fotograma; lo caro es la COMPOSICIÓN, y eso lo
//   decide la tarjeta gráfica que haya delante, no este código.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { familia, type Doc } from "../lib/memoria";
import {
  AJUSTES_FABRICA,
  TOPES,
  altoDe,
  coser,
  guardarAjustes,
  leerAjustes,
  nucleo,
  normalDe,
  rejilla,
  repartir,
  repartirGalaxia,
  tiroDelHilo,
  R,
  type AjustesCerebro,
  type Hilo,
  type Punto,
  type Region,
} from "../lib/cerebro";
import { modoRendimiento } from "../lib/rendimiento";
import { useT } from "../lib/i18n";

/** El ámbar del núcleo. Fijo, y NO de la paleta de proyectos a propósito: las
    skills no son un proyecto más, y con un tono de la rueda parecerían uno. */
const AMBAR = "#f0b464";
/** Medio ángulo de visión. Bajo a propósito: menos ángulo es más teleobjetivo,
    la bola llena más y los bordes no se deforman como con un ojo de pez. */
const FOV = 0.55;
/** Nada más cerca del ojo que esto se dibuja. Es lo que aparta la corteza que
    tienes entre el ojo y el interior cuando entras. */
const NEAR = 0.3;
/** Hasta dónde puede alejarse el pivote del centro al desplazarse con la rueda.
    La bola tiene radio 1: con este tope te la puedes echar entera a un lado de
    la pantalla, pero no perderla de vista y quedarte mirando el vacío. */
const TOPE_PAN = 2.2;

/** Una proyección: dónde cae un punto en pantalla y en qué estado está. */
interface Proy {
  ok: boolean;
  sx: number;
  sy: number;
  z: number;
  /** El factor de perspectiva: lo cerca que está, para el tamaño. */
  f: number;
  /** Cuánto se ve, de 0 a 1. Lo que se acerca al ojo se desvanece antes de
      desaparecer: con un corte seco, al entrar media bola se apagaría de golpe
      en un fotograma y parecería un fallo. */
  v: number;
  /** Distancia real al ojo. */
  prof: number;
  /** Está en el filo: 0 de cara, 1 de canto. De aquí sale la silueta. */
  rim: number;
  /** Lo cerca que está, de 0 (lo más lejos que hay) a 1 (pegado). Sale de la
      distancia al ojo y NO de la z: metido dentro de la bola, media superficie
      tiene z negativa aunque la tengas delante de las narices. */
  t: number;
}

function nuevaProy(): Proy {
  return { ok: false, sx: 0, sy: 0, z: 0, f: 0, v: 0, prof: 0, rim: 0, t: 0 };
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
  /**
   * Cómo se colocan las notas. Dos cielos con los mismos datos:
   *  · "esfera"  — todas sobre un cascarón, agrupadas por proyecto. Nada tapa a
   *    nada y por eso se lee tan bien; es la de siempre.
   *  · "galaxia" — un cúmulo por proyecto flotando en el espacio, con lo más
   *    enlazado en su corazón. Es la que Munir pidió como «una galaxia con sus
   *    planetas en 3D, estilo Obsidian» (2026-08-14).
   * En galaxia no hay bola, así que se apagan las dos cosas que la dibujan: la
   * rejilla del globo y la malla que cose los nodos vecinos.
   */
  forma?: "esfera" | "galaxia";
}

export default function MemoriaGrafo({
  docs,
  activo,
  onAbrir,
  soloConectados,
  skills,
  onAbrirSkill,
  forma = "esfera",
}: Props) {
  const { t } = useT();
  const caja = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLCanvasElement>(null);
  const nitido = useRef<HTMLCanvasElement>(null);
  const rotulos = useRef<HTMLCanvasElement>(null);

  const puntos = useRef<Punto[]>([]);
  const hilos = useRef<Hilo[]>([]);
  const tejido = useRef<Hilo[]>([]);
  const regiones = useRef<Region[]>([]);
  const skillsPt = useRef<Punto[]>([]);
  /** El punto de control de cada hilo. No depende de la cámara: sus dos
      extremos no se mueven y el punto por el que pasa tampoco. Se calculaba
      entero en cada fotograma para sacar siempre el mismo número. */
  const ctrl = useRef<Array<{ x: number; y: number; z: number }>>([]);
  /** Los objetos donde se proyectan los nodos, reutilizados. */
  const pr = useRef<Proy[]>([]);
  const pt = useRef<Proy[]>([]);
  const q1 = useRef(nuevaProy());
  const q2 = useRef(nuevaProy());
  // Sin bola no hay rejilla: en galaxia se queda vacía y los bucles que la
  // pintan no tienen nada que hacer. Apagarla así, con los datos, evita tocar
  // doscientas líneas de pintado que ya funcionan.
  const malla = useMemo(() => (forma === "galaxia" ? [] : rejilla()), [forma]);
  /** El mismo dato que `forma`, pero en un ref: el bucle de pintado corre
   *  dentro de un efecto que no se rehace en cada render, así que leer la prop
   *  directamente le daría el valor de cuando se montó. */
  const galaxiaRef = useRef(forma === "galaxia");
  galaxiaRef.current = forma === "galaxia";

  /** La cámara: dos ángulos, la distancia del ojo, y el PIVOTE, que es el punto
      alrededor del que orbita. El pivote se mueve a un nodo con el botón de la
      rueda y se queda ahí, o a mano arrastrando con ese mismo botón. */
  const cam = useRef({ yaw: 0, pitch: -0.18, dist: 2.85, tx: 0, ty: 0, tz: 0 });
  const destino = useRef({ x: 0, y: 0, z: 0 });
  const raf = useRef(0);
  /** El arrastre en curso. `nodo` es el que llevas cogido (o -1); `pan` es que
      vas con el botón de la rueda, desplazando la vista en vez de girándola. */
  const arrastre = useRef<{
    x: number;
    y: number;
    movido: boolean;
    nodo: number;
    pan: boolean;
    clavar: Punto | null;
  } | null>(null);
  const raton = useRef({ x: 0, y: 0 });
  const ratonEncima = useRef(false);
  const sucio = useRef(true);
  const ensuciar = useCallback(() => {
    sucio.current = true;
  }, []);
  /** El escalón de calidad, de 1 a 0,3. Lo mueve el propio dibujo según lo que
      TARDE de verdad: un número fijo estaría mal para la mitad de los equipos. */
  const calidad = useRef(1);
  const msSuave = useRef(16);

  const [encima, setEncima] = useState<Punto | null>(null);
  const encimaRef = useRef<Punto | null>(null);
  /** El proyecto aislado: fijado con un clic, o el de lo que señalas. */
  const [focoFijo, setFocoFijo] = useState<string | null>(null);
  /** El nodo CLAVADO con el botón de la rueda: se queda solo él y sus vecinos
      encendidos, y la cámara orbita a su alrededor hasta que lo sueltes. A
      diferencia del que señalas con el ratón, este no se va al apartar la mano,
      que es justo lo que hace falta para poder dar la vuelta y mirarlo. */
  const nodoFijo = useRef<string | null>(null);
  const [hayNodoFijo, setHayNodoFijo] = useState(false);
  const focoFijoRef = useRef<string | null>(null);
  const focoRaton = useRef<string | null>(null);
  focoFijoRef.current = focoFijo;
  const [lista, setLista] = useState<Region[]>([]);
  /** Qué pestaña del tablero está delante. Con veinticinco proyectos la lista ya
      llena el panel, así que los mandos NO pueden ir debajo: se cambia. */
  const [pestana, setPestana] = useState<"proyectos" | "ajustes">("proyectos");
  /* Los ajustes van en estado (los pinta el tablero) Y en un ref (los lee el
     bucle de dibujo). El ref no es una duplicación por comodidad: el bucle se
     monta una vez y su closure se quedaría con los ajustes del primer render
     para siempre, así que sin él mover un deslizador no cambiaría nada. */
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes());
  const aj = useRef(ajustes);
  aj.current = ajustes;
  const tocar = useCallback((cambio: Partial<AjustesCerebro>) => {
    setAjustes((v) => {
      const n = { ...v, ...cambio };
      guardarAjustes(n);
      return n;
    });
  }, []);
  /* Y repintar DESPUÉS de que el ajuste nuevo esté puesto, no al pedirlo.
     Marcándolo dentro de `tocar`, un fotograma que cayera entre el cambio y el
     render pintaría con el valor viejo y dejaría el dibujo por limpio: el
     deslizador se movería y no pasaría nada hasta tocar otra cosa. Aquí ya está
     `aj.current` al día. */
  useEffect(() => {
    sucio.current = true;
  }, [ajustes]);

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

  // El reparto: una región por proyecto sobre la bola. Se calcula UNA vez,
  // cuando cambian los documentos o el filtro, y ya no se vuelve a tocar.
  useEffect(() => {
    const visibles = soloConectados ? docs.filter((d) => (red.grado.get(d.id) ?? 0) > 0) : docs;
    const gradoDe = (d: Doc) => red.grado.get(d.id) ?? 0;
    const galaxia = forma === "galaxia";
    const { pos, regiones: regs } = (galaxia ? repartirGalaxia : repartir)(
      visibles,
      familia,
      gradoDe,
    );
    const idx = new Map<string, number>();
    const orden = new Map(regs.map((r, i) => [r.fam, i]));
    const ps: Punto[] = visibles.map((d, i) => {
      idx.set(d.id, i);
      const fam = familia(d);
      const ci = orden.get(fam) ?? 0;
      const grado = gradoDe(d);
      return {
        id: d.id,
        ...pos[i],
        grado,
        color: regs[ci]?.color ?? "#8aa",
        title: d.title,
        fam,
        ci,
        n: normalDe(pos[i]),
        alto: galaxia ? 0 : altoDe(grado),
      };
    });
    puntos.current = ps;
    regiones.current = regs;
    tejido.current = galaxia ? [] : coser(ps, 3);
    hilos.current = red.pares
      .map(([a, b]) => [idx.get(a) ?? -1, idx.get(b) ?? -1] as Hilo)
      .filter(([a, b]) => a >= 0 && b >= 0);
    // El hilo se comba hacia fuera en las dos formas. En la galaxia se probó
    // recto —no hay bola que esquivar— y quedó peor: dos notas de cúmulos
    // opuestos daban una raya blanca cruzando la pantalla entera por delante de
    // todo. Combado, ese mismo hilo se lee como lo que es, un puente.
    ctrl.current = hilos.current.map(([i, j]) => tiroDelHilo(ps[i], ps[j]));
    pr.current = ps.map(nuevaProy);
    pt.current = ps.map(nuevaProy);
    setLista([...regs].sort((a, b) => b.n - a.n));
    setFocoFijo((f) => (f && regs.some((r) => r.fam === f) ? f : null));
    // El nodo clavado puede haber desaparecido (otra bóveda, o el filtro de
    // sueltos). Se suelta aquí: si no, la cámara se quedaría orbitando un punto
    // que ya no está y la ayuda diría que hay uno clavado.
    if (nodoFijo.current && !ps.some((p) => p.id === nodoFijo.current)) {
      nodoFijo.current = null;
      setHayNodoFijo(false);
      destino.current = { x: 0, y: 0, z: 0 };
    }
    sucio.current = true;
  }, [docs, red, soloConectados, forma]);

  // Las skills, en el núcleo. Sus sitios salen del MISMO `nucleo` que las
  // dibuja, así que no hay dos versiones de dónde están.
  useEffect(() => {
    const sk = skills ?? [];
    const sitios = nucleo(sk.length);
    skillsPt.current = sk.map((s, i) => ({
      id: `skill:${s.folder}`,
      ...sitios[i],
      grado: 0,
      color: AMBAR,
      title: s.name,
      ci: -1,
      n: normalDe(sitios[i]),
      alto: 0,
    }));
    sucio.current = true;
  }, [skills]);

  /* ─────────────────────────────────────────────────────── EL BUCLE ────── */
  useEffect(() => {
    // Ni gira ni se anima con el modo rendimiento puesto ni con la preferencia
    // del sistema de reducir animaciones: una bola girando es adorno.
    const sinMovimiento =
      modoRendimiento() || matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ultimo = 0;
    let cy = 1, sy = 0, cp = 1, sp = 0, escala = 1, cx = 0, cyy = 0;
    let dCerca = 0.2, dLejos = 4.4;

    /** Rotar y proyectar ESCRIBIENDO en un objeto que ya existe. */
    const proyIn = (o: Proy, p: { x: number; y: number; z: number }, n?: { x: number; y: number; z: number }) => {
      const c = cam.current;
      // Todo se mide desde el PIVOTE: moverlo a un nodo es lo que convierte el
      // giro en «orbitar alrededor de ese nodo» sin tocar nada más.
      const px = p.x - c.tx, py = p.y - c.ty, pz = p.z - c.tz;
      const x1 = px * cy + pz * sy;
      const z1 = -px * sy + pz * cy;
      const y2 = py * cp - z1 * sp;
      const z2 = py * sp + z1 * cp;
      const prof = c.dist - z2;
      const corte = NEAR * aj.current.corte;
      if (prof <= corte * 0.55) {
        o.ok = false;
        return null;
      }
      let rim = 0;
      if (n) {
        const nx1 = n.x * cy + n.z * sy;
        const nz1 = -n.x * sy + n.z * cy;
        const ny2 = n.y * cp - nz1 * sp;
        const nz2 = n.y * sp + nz1 * cp;
        // `Math.hypot` es correcto pero lento (se guarda de un desbordamiento
        // que aquí no puede pasar), y esto son miles de llamadas por fotograma.
        const el = Math.sqrt(x1 * x1 + y2 * y2 + prof * prof) || 1;
        const dot = (nx1 * -x1 + ny2 * -y2 + nz2 * prof) / el;
        rim = Math.max(0, 1 - Math.abs(dot));
      }
      const f = 1 / prof;
      o.ok = true;
      o.sx = cx + x1 * f * escala;
      o.sy = cyy - y2 * f * escala;
      o.z = z2;
      o.f = f;
      o.v = Math.min(1, (prof - corte * 0.55) / (corte * 0.9));
      o.prof = prof;
      o.rim = rim;
      o.t = Math.max(0, Math.min(1, 1 - (prof - dCerca) / (dLejos - dCerca)));
      return o;
    };

    /** Deshacer la rotación: de coordenadas de cámara a las del mundo. */
    const deRotar = (x1: number, y2: number, z2: number) => {
      const py = y2 * cp + z2 * sp;
      const z1 = -y2 * sp + z2 * cp;
      return { x: x1 * cy - z1 * sy, y: py, z: x1 * sy + z1 * cy };
    };

    /**
     * A qué punto DE LA BOLA apunta el ratón.
     *
     * Es lo que permite arrastrar un nodo sin que se salga: no se mueve «hacia
     * donde va el dedo» una cantidad —eso es justo lo que lo sacaría—, se
     * pregunta dónde corta la superficie el rayo que sale del ojo y pasa por el
     * cursor. Así el nodo va exactamente debajo del puntero y sigue en la bola
     * por construcción, no por corregirlo después.
     */
    const ratonEnEsfera = (mx: number, my: number) => {
      const c = cam.current;
      const u = (mx - cx) / escala;
      const v = -(my - cyy) / escala;
      const d0 = deRotar(u, v, -1);
      const dl = Math.hypot(d0.x, d0.y, d0.z) || 1;
      const dx = d0.x / dl, dy = d0.y / dl, dz = d0.z / dl;
      const e0 = deRotar(0, 0, c.dist);
      const ex = c.tx + e0.x, ey = c.ty + e0.y, ez = c.tz + e0.z;
      const b = 2 * (ex * dx + ey * dy + ez * dz);
      const cc = ex * ex + ey * ey + ez * ez - R * R;
      const disc = b * b - 4 * cc;
      let px: number, py: number, pz: number;
      if (disc >= 0) {
        // La raíz menor es la cara de delante; estando DENTRO es negativa y la
        // buena es la otra.
        const s = Math.sqrt(disc);
        let tt = (-b - s) / 2;
        if (tt < 0.001) tt = (-b + s) / 2;
        px = ex + dx * tt; py = ey + dy * tt; pz = ez + dz * tt;
      } else {
        // De largo: el punto del rayo más cercano al centro, llevado a la bola.
        // Sin esto, sacar el ratón un píxel del borde soltaría el nodo.
        const tt = -b / 2;
        px = ex + dx * tt; py = ey + dy * tt; pz = ez + dz * tt;
      }
      const l = Math.hypot(px, py, pz) || 1;
      return { x: (px / l) * R, y: (py / l) * R, z: (pz / l) * R };
    };

    const pintar = (ts: number) => {
      raf.current = requestAnimationFrame(pintar);
      const dt = ultimo ? Math.min(0.1, (ts - ultimo) / 1000) : 0;
      // Cuánto tarda el fotograma DE VERDAD, suavizado: uno suelto puede irse
      // por una notificación del sistema y no vale recortar por eso. Se recorta
      // rápido cuando va mal y se recupera despacio, para no quedarse oscilando
      // justo en el punto de corte, que se nota más que ir un escalón por debajo.
      if (dt > 0) {
        msSuave.current += (dt * 1000 - msSuave.current) * 0.12;
        if (msSuave.current > 20.5) calidad.current = Math.max(0.3, calidad.current - 0.03);
        else if (msSuave.current < 13.5) calidad.current = Math.min(1, calidad.current + 0.008);
      }
      ultimo = ts;
      const c = cam.current;
      const K = calidad.current;
      const A = aj.current;

      const quieto = (ratonEncima.current && sobreLaBola.current) || arrastre.current !== null;
      const girando = !sinMovimiento && A.gira && !quieto;
      if (girando) {
        c.yaw += dt * 0.115 * Math.min(1, c.dist / 2.4);
        sucio.current = true;
      }
      // El pivote se desliza a su destino, no salta. Por tiempo real, para que
      // se mueva igual a 30 que a 144.
      const k = 1 - Math.pow(0.0025, dt);
      if (Math.abs(destino.current.x - c.tx) > 1e-4 || Math.abs(destino.current.y - c.ty) > 1e-4 ||
          Math.abs(destino.current.z - c.tz) > 1e-4) {
        c.tx += (destino.current.x - c.tx) * k;
        c.ty += (destino.current.y - c.ty) * k;
        c.tz += (destino.current.z - c.tz) * k;
        sucio.current = true;
      }
      // Nada se mueve y nada ha cambiado: no hay un solo píxel que rehacer.
      if (!sucio.current) return;
      sucio.current = false;

      const box = caja.current;
      const cn = nitido.current, ch = halo.current, cr = rotulos.current;
      if (!box || !cn || !ch || !cr) return;
      const nctx = cn.getContext("2d");
      const hctx = ch.getContext("2d");
      const rctx = cr.getContext("2d");
      if (!nctx || !hctx || !rctx) return;

      const W = box.clientWidth, Hh = box.clientHeight;
      if (W < 8 || Hh < 8) return;
      cx = W / 2; cyy = Hh / 2;
      cy = Math.cos(c.yaw); sy = Math.sin(c.yaw);
      cp = Math.cos(c.pitch); sp = Math.sin(c.pitch);
      escala = (Math.min(W, Hh) * 0.5) / Math.tan(FOV);
      // El rango de distancias de este fotograma, de donde sale «esto está
      // lejos». Un nodo llega a 1,16 del centro con su púa, y el pivote puede
      // estar desplazado hasta ahí.
      const desvio = Math.hypot(c.tx, c.ty, c.tz);
      dLejos = c.dist + 1.16 + desvio;
      dCerca = Math.max(NEAR * A.corte * 0.6, c.dist - 1.16 - desvio);
      if (dLejos - dCerca < 0.05) dLejos = dCerca + 0.05;

      /* La resolución. El lienzo nítido va a 1,5 como mucho y no a 2: en una
         pantalla densa el 2 multiplica POR CUATRO todo lo que hay que rellenar,
         y esto son luces redondas y líneas finas. El texto va en su propio
         lienzo y ese sí a resolución completa. El del resplandor baja además con
         la calidad, porque es sobre él sobre el que se aplica el desenfoque y
         eso se paga por píxel de origen. */
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const dprTexto = Math.min(2, window.devicePixelRatio || 1);
      const kh = dpr / (K > 0.75 ? 3 : K > 0.5 ? 4 : 5);
      if (cn.width !== Math.round(W * dpr) || ch.width !== Math.round(W * kh)) {
        cn.width = Math.round(W * dpr); cn.height = Math.round(Hh * dpr);
        cr.width = Math.round(W * dprTexto); cr.height = Math.round(Hh * dprTexto);
        ch.width = Math.round(W * kh); ch.height = Math.round(Hh * kh);
      }
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0); nctx.clearRect(0, 0, W, Hh);
      rctx.setTransform(dprTexto, 0, 0, dprTexto, 0, 0); rctx.clearRect(0, 0, W, Hh);
      hctx.setTransform(kh, 0, 0, kh, 0, 0); hctx.clearRect(0, 0, W, Hh);
      rctx.textAlign = "center"; rctx.textBaseline = "middle";

      const P = puntos.current, H = hilos.current, C = ctrl.current;
      const RG = regiones.current, SK = skillsPt.current;
      const prA = pr.current, ptA = pt.current;
      const _q1 = q1.current, _q2 = q2.current;
      if (prA.length !== P.length) return;

      /* Estar fuera o dentro es respecto al CENTRO DE LA BOLA, no al pivote:
         orbitando un nodo a medio metro seguirías «rozando la corteza» aunque
         estuvieras a dos bolas de distancia. */
      const centroQ = proyIn(_q2, { x: 0, y: 0, z: 0 });
      const alCentro = centroQ ? centroQ.prof : c.dist;
      const fuera = Math.max(0, Math.min(1, (alCentro - 1.05) / 0.75));
      // Dentro entra menos luz por punto, así que se sube un pelo el conjunto.
      const brillo = 1 + (1 - fuera) * 0.45;

      /* ¿Está el ratón sobre la bola? La rueda solo se para si la tocas, no por
         pasar por una esquina vacía del panel. El radio de la silueta sale de
         que el rayo que roza una esfera la toca siempre en z = R²/dist. */
      if (centroQ && alCentro > R * 1.02) {
        const rSil = R * Math.sqrt(Math.max(0, 1 - (R * R) / (alCentro * alCentro))) *
          (1 / (alCentro - (R * R) / alCentro)) * escala;
        const r = box.getBoundingClientRect();
        const ddx = raton.current.x - r.left - centroQ.sx;
        const ddy = raton.current.y - r.top - centroQ.sy;
        // Un poco de margen: los nodos sobresalen con su púa y señalar uno del
        // borde no puede contar como «estoy fuera».
        sobreLaBola.current = ddx * ddx + ddy * ddy < (rSil * 1.1) ** 2;
      } else {
        sobreLaBola.current = true;   // metido dentro, te rodea entera
      }

      const cenX = centroQ ? centroQ.sx : cx;
      const cenY = centroQ ? centroQ.sy : cyy;
      const cenProf = alCentro;

      /* LA ATMÓSFERA: el aro de luz del filo. Va donde caiga el centro del mundo
         y con la distancia real a él, no en mitad de la pantalla: orbitando un
         nodo la bola ya no está centrada y un aro clavado en el medio se
         despegaría de su propia esfera. */
      if (fuera > 0.01 && cenProf > R * 1.02) {
        const zF = (R * R) / cenProf;
        const rF = R * Math.sqrt(Math.max(0, 1 - (R * R) / (cenProf * cenProf))) *
          (1 / (cenProf - zF)) * escala;
        const atm = hctx.createRadialGradient(cenX, cenY, rF * 0.74, cenX, cenY, rF * 1.12);
        atm.addColorStop(0, "rgba(70,130,220,0)");
        atm.addColorStop(0.74, `rgba(92,158,240,${(0.34 * fuera).toFixed(3)})`);
        atm.addColorStop(1, "rgba(60,110,200,0)");
        hctx.fillStyle = atm;
        hctx.beginPath(); hctx.arc(cenX, cenY, rF * 1.12, 0, 6.2832); hctx.fill();
      }

      // Proyectar los nodos sobre objetos que ya existen. La punta se calcula
      // en variables sueltas, sin crear el punto intermedio.
      const punta = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        proyIn(prA[i], p, p.n);
        const kk = 1 + p.alto * A.alto;
        punta.x = p.x * kk; punta.y = p.y * kk; punta.z = p.z * kk;
        proyIn(ptA[i], punta, p.n);
      }
      const skQ = SK.map((s) => proyIn(nuevaProy(), s, s.n));

      // Qué hay bajo el ratón, sobre lo YA proyectado: acertar no depende de
      // deshacer ninguna rotación.
      const fFijo = focoFijoRef.current;
      /* El más cercano al ratón de una lista, DEVUELTO y no guardado en una
         variable de fuera: escrito con una captura, TypeScript no ve que se le
         asigna dentro del bucle, la da por `null` para siempre y todo lo que
         venga detrás pasa a ser un error de tipo imposible. */
      const buscar = (
        ls: Punto[],
        qs: Array<Proy | null>,
        mx: number,
        my: number,
        tope: number,
      ): { p: Punto | null; d: number } => {
        let p: Punto | null = null;
        let d = tope;
        for (let i = 0; i < ls.length; i++) {
          const q = qs[i];
          if (!q || !q.ok || q.v < 0.25) continue;
          // Con un proyecto FIJADO los demás no se pueden ni señalar. Mira
          // `focoFijo` y no el foco efectivo a propósito: si mirase el del
          // ratón, pasar de una bolita a otra de distinto color necesitaría un
          // fotograma en blanco para soltarse.
          if (fFijo && ls[i].fam !== undefined && ls[i].fam !== fFijo) continue;
          const dd = Math.hypot(q.sx - mx, q.sy - my);
          if (dd < d) { d = dd; p = ls[i]; }
        }
        return { p, d };
      };
      let bajo: Punto | null = null;
      if (!arrastre.current && ratonEncima.current) {
        const r = box.getBoundingClientRect();
        const mx = raton.current.x - r.left, my = raton.current.y - r.top;
        const a = buscar(P, ptA, mx, my, 15);
        const b = buscar(SK, skQ, mx, my, a.d);
        bajo = b.p ?? a.p;
      }
      /* Con un nodo clavado manda ÉL, y el ratón solo sirve para leer nombres:
         si el señalado siguiera decidiendo, bastaría rozar otro punto al dar la
         vuelta para perder lo que acabas de clavar. */
      const fijo = nodoFijo.current ? (P.find((p) => p.id === nodoFijo.current) ?? null) : null;
      const sel = fijo ?? bajo;
      // Y aislar por PROYECTO se calla mientras hay un nodo clavado: son dos
      // formas de mirar lo mismo y a la vez no dicen nada.
      focoRaton.current = fijo ? null : (bajo?.fam ?? null);
      if (bajo?.id !== encimaRef.current?.id) {
        encimaRef.current = bajo;
        setEncima(bajo);
      }
      const F = fFijo ?? focoRaton.current;
      const vecinos = new Set<string>();
      if (sel) {
        for (const [i, j] of H) {
          if (P[i]?.id === sel.id) vecinos.add(P[j]?.id);
          if (P[j]?.id === sel.id) vecinos.add(P[i]?.id);
        }
      }
      /* CON QUIÉN HABLA EL PROYECTO AISLADO, aunque sea de otra familia.
         Al aislar uno salían sus hilos hacia fuera y el otro extremo se quedaba
         apagado y sin nombre: el hilo prometía una conexión y no enseñaba con
         quién (Munir, 2026-08-14: «¿no deberían verse también los nodos a los
         que está conectado?»). Ahora la vecindad del proyecto se enciende igual
         que la de un nodo clavado, y con su nombre puesto. */
      const fronteraF = new Set<string>();
      if (F) {
        for (const [i, j] of H) {
          const a = P[i], b = P[j];
          if (!a || !b) continue;
          if (a.fam === F && b.fam !== F) fronteraF.add(b.id);
          if (b.fam === F && a.fam !== F) fronteraF.add(a.id);
        }
      }
      /** Cuánto se ve lo que NO es del proyecto aislado. Muy poco, pero no
          cero: a oscuras del todo se pierde de dónde a dónde va lo que miras. */
      const APAGADO = 0.07;
      /** Lo que queda de lo que no es del nodo clavado. Señalando se atenúa un
          poco (es una ojeada); clavado se apaga casi del todo, que es lo que se
          ha pedido al clavarlo. Nunca a cero: sin nada de fondo se pierde en qué
          parte de la bola estás mirando. */
      const restoNodo = fijo ? APAGADO : 0.25;

      /* LA REJILLA. Tres caminos y no dos: detrás, delante y EL FILO, que es el
         que dibuja la silueta. No se apaga al aislar: es la bola en sí, y sin
         ella un proyecto solo flotaría en el vacío. */
      const det = new Path2D(), del = new Path2D(), filo = new Path2D();
      const salto = K > 0.8 ? 1 : K > 0.55 ? 2 : 3;
      for (const linea of malla) {
        let anterior: Path2D | null = null;
        for (let li = 0; li < linea.length; li += salto) {
          const q = proyIn(_q1, linea[li], linea[li].n);
          if (!q || q.v < 0.3) { anterior = null; continue; }
          const camino = q.rim > 0.74 ? filo : q.z >= 0 ? del : det;
          if (anterior !== camino) camino.moveTo(q.sx, q.sy);
          else camino.lineTo(q.sx, q.sy);
          anterior = camino;
        }
      }
      nctx.lineWidth = 0.5; nctx.strokeStyle = "#4f6b8c";
      nctx.globalAlpha = 0.05 * brillo * A.rejilla; nctx.stroke(det);
      nctx.lineWidth = 0.7; nctx.strokeStyle = "#86a4c6";
      nctx.globalAlpha = 0.11 * brillo * A.rejilla; nctx.stroke(del);
      nctx.lineWidth = 1.5; nctx.strokeStyle = "#dcecff";
      nctx.globalAlpha = 0.62 * brillo * Math.min(1, A.rejilla * 1.4); nctx.stroke(filo);
      hctx.lineWidth = 3; hctx.strokeStyle = "#a8d0ff";
      hctx.globalAlpha = 0.3 * Math.min(1, A.rejilla * 1.4); hctx.stroke(filo);
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      /* LA MALLA DEL TEJIDO, en tres capas por CONTORNO: en el filo brilla y por
         el centro se apaga, que es lo que dibuja la silueta sin trazarla. */
      const capas = [new Path2D(), new Path2D(), new Path2D()];
      for (const [i, j] of tejido.current) {
        const a = prA[i], b = prA[j];
        if (!a?.ok || !b?.ok || a.v < 0.2 || b.v < 0.2) continue;
        if (F && P[i].fam !== F && P[j].fam !== F) continue;
        // Una arista larguísima en pantalla es la que cruza por detrás del
        // volumen: cosería un lado con el otro y se ve como un rayajo.
        const ux = a.sx - b.sx, uy = a.sy - b.sy;
        if (ux * ux + uy * uy > (Math.min(W, Hh) * 0.3) ** 2) continue;
        const rim = (a.rim + b.rim) / 2;
        const cual = capas[rim > 0.72 ? 2 : rim > 0.4 ? 1 : 0];
        cual.moveTo(a.sx, a.sy); cual.lineTo(b.sx, b.sy);
      }
      const tonos: Array<[string, number, number]> = [
        ["#4d7fb8", 0.5, 0.1],
        ["#7bb0e8", 0.65, 0.26],
        ["#cfe6ff", 0.9, 0.6],
      ];
      capas.forEach((path, ci) => {
        const [col, anc, alf] = tonos[ci];
        nctx.lineWidth = anc; nctx.strokeStyle = col;
        nctx.globalAlpha = alf * brillo * A.tejido * (fijo ? 0.22 : bajo || F ? 0.55 : 1);
        nctx.stroke(path);
        if (ci === 2) {
          hctx.lineWidth = anc * 2; hctx.strokeStyle = col;
          hctx.globalAlpha = alf * 0.5 * A.tejido; hctx.stroke(path);
        }
      });
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      /* LOS ENLACES DE LA BÓVEDA, agrupados en manojos. Mil trazos sueltos es lo
         que cuesta; veinte manojos no. Con un proyecto aislado se quedan los
         suyos y los que SALEN de él, que es la pregunta interesante. */
      const manojos = new Map<number, { color: string; nivel: number; mio: boolean; ve: number; puente: boolean; path: Path2D }>();
      for (let h = 0; h < H.length; h++) {
        const i = H[h][0], j = H[h][1];
        const a = P[i], b = P[j];
        if (!prA[i].ok || !prA[j].ok) continue;
        const mio = !F || a.fam === F || b.fam === F;
        const pc = proyIn(_q1, C[h]);
        if (!pc) continue;
        const ve = Math.min(prA[i].v, prA[j].v, pc.v);
        if (ve < 0.05) continue;
        const cerca = prA[i].t > prA[j].t ? prA[i].t : prA[j].t;
        const nivel = Math.max(0, Math.min(4, Math.floor(cerca * 5)));
        const ve5 = Math.min(4, Math.floor(ve * 5));
        const puente = a.fam !== b.fam;
        const ci = mio ? (F ? (a.fam === F ? a.ci : b.ci) : a.ci) : -1;
        // La clave es un NÚMERO: era una cadena montada con plantilla, y eso son
        // mil cadenas nuevas por fotograma que luego hay que recoger.
        const clave = (ci + 1) * 250 + nivel * 50 + ve5 * 10 + (puente ? 1 : 0);
        let m = manojos.get(clave);
        if (!m) {
          m = {
            color: ci < 0 ? "#5f7ea8" : RG[ci]?.color ?? "#5f7ea8",
            nivel, mio, ve: ve5 / 4, puente, path: new Path2D(),
          };
          manojos.set(clave, m);
        }
        m.path.moveTo(prA[i].sx, prA[i].sy);
        m.path.quadraticCurveTo(pc.sx, pc.sy, prA[j].sx, prA[j].sy);
      }
      const orden = [...manojos.values()].sort((a, b) =>
        a.mio === b.mio ? a.nivel - b.nivel : a.mio ? -1 : 1);
      for (const m of orden) {
        const tt = m.nivel / 4;
        /* DENTRO, los hilos son el paisaje: es a lo que se entra. Hasta hoy se
           apagaban a menos de la mitad para que la madeja no se hiciera sopa, y
           el resultado era entrar a una bola vacía (Munir, 2026-08-13).
           Se suben, pero no a lo bruto: el que sube de verdad es el que tienes
           AL LADO, y el del otro extremo de la bola se queda casi como estaba.
           Eso es lo que da profundidad en vez de una nube lechosa, que es el
           riesgo real aquí (estos trazos SUMAN luz unos sobre otros).
           Fuera vale exactamente 1, así que la vista de siempre no se toca. */
        const dentro = fuera + (1 - fuera) * (0.9 + tt * 1.3);
        let alfa = (m.puente ? 0.2 : 0.11) * (0.25 + tt * 0.75) * m.ve * dentro * A.enlaces * brillo;
        if (!m.mio) alfa *= APAGADO * 1.6;
        else if (F) alfa *= 2.1;
        else if (fijo) alfa *= APAGADO * 1.4;
        else if (bajo) alfa *= 0.3;
        if (alfa < 0.004) continue;
        const pasadas: Array<[CanvasRenderingContext2D, number, number]> =
          K > 0.62 ? [[nctx, 1, 1], [hctx, 2.2, 0.7]] : [[nctx, 1, 1]];
        for (const [ctx, gordo, mult] of pasadas) {
          ctx.lineWidth = (0.45 + tt * 0.8) * gordo;
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = Math.min(1, alfa * mult);
          ctx.stroke(m.path);
        }
      }
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      // Los del punto que miras, encima y en claro.
      if (sel && sel.fam !== undefined) {
        const suyos = new Path2D();
        for (let h = 0; h < H.length; h++) {
          const i = H[h][0], j = H[h][1];
          if (P[i].id !== sel.id && P[j].id !== sel.id) continue;
          if (!prA[i].ok || !prA[j].ok) continue;
          const pc = proyIn(_q1, C[h]);
          if (!pc) continue;
          suyos.moveTo(prA[i].sx, prA[i].sy);
          suyos.quadraticCurveTo(pc.sx, pc.sy, prA[j].sx, prA[j].sy);
        }
        nctx.lineWidth = 1.4; nctx.strokeStyle = "#dceaff"; nctx.globalAlpha = 0.95;
        nctx.stroke(suyos);
        hctx.lineWidth = 2.6; hctx.strokeStyle = "#8ec0ff"; hctx.globalAlpha = 0.75;
        hctx.stroke(suyos);
        nctx.globalAlpha = 1; hctx.globalAlpha = 1;
      }

      // El resplandor de cada región. Sin degradado: este lienzo se desenfoca
      // entero después, así que un degradado aquí es calcularlo para que un blur
      // lo vuelva a suavizar encima.
      for (const rg of RG) {
        const q = proyIn(_q1, rg);
        if (!q || q.z < -0.1 || q.v < 0.2) continue;
        const rr = Math.max(14, rg.radio * q.f * escala * 0.85);
        if (rr > Math.max(W, Hh) * 1.4) continue;
        hctx.globalAlpha = (0.018 + q.t * 0.035) * q.v * (!F || rg.fam === F ? 1 : APAGADO) *
          brillo * (F === rg.fam ? 2.6 : 1);
        hctx.fillStyle = rg.color;
        hctx.beginPath(); hctx.arc(q.sx, q.sy, rr, 0, 6.2832); hctx.fill();
      }
      hctx.globalAlpha = 1;

      /* LAS PÚAS: de la corteza a la punta, ordenadas por distancia REAL al ojo. */
      const vivos: number[] = [];
      for (let i = 0; i < P.length; i++) if (prA[i].ok && ptA[i].ok && ptA[i].v > 0.02) vivos.push(i);
      vivos.sort((a, b) => ptA[b].prof - ptA[a].prof);
      const torres = new Map<number, { color: string; t: number; ve: number; off: boolean; path: Path2D }>();
      for (const i of vivos) {
        const p = P[i];
        const off =
          (!!sel && p.id !== sel.id && !vecinos.has(p.id) && !F) ||
          (!!F && p.fam !== F && !fronteraF.has(p.id));
        const tt = prA[i].t;
        const t5 = Math.min(4, Math.floor(tt * 5));
        const ve5 = Math.min(4, Math.floor(ptA[i].v * 5));
        const clave = p.ci * 250 + t5 * 50 + ve5 * 10 + (off ? 1 : 0);
        let g = torres.get(clave);
        if (!g) {
          g = { color: p.color, t: tt, ve: ve5 / 4, off, path: new Path2D() };
          torres.set(clave, g);
        }
        g.path.moveTo(prA[i].sx, prA[i].sy);
        g.path.lineTo(ptA[i].sx, ptA[i].sy);
      }
      for (const g of [...torres.values()].sort((a, b) => a.t - b.t)) {
        const a = (0.25 + g.t * 0.75) * g.ve * (g.off ? (F ? APAGADO : restoNodo * 0.9) : 1) * 0.75 * brillo;
        const pasadas: Array<[CanvasRenderingContext2D, number, number]> =
          K > 0.45 ? [[nctx, 1, 1], [hctx, 2, 0.8]] : [[nctx, 1, 1]];
        for (const [ctx, gordo, mult] of pasadas) {
          ctx.lineWidth = (0.7 + g.t * 0.7) * gordo;
          ctx.strokeStyle = g.color;
          ctx.globalAlpha = Math.min(1, a * mult);
          ctx.stroke(g.path);
        }
      }
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      /* LAS LUCES, agrupadas por color y escalón de brillo. Iban una a una: unas
         ochocientas llamadas de dibujo por fotograma solo en esto. Se puede
         agrupar sin mentir porque SUMAN (`plus-lighter`): dos que se solapan dan
         lo mismo se pinte antes una u otra.
         El `moveTo` antes de cada `arc` no es opcional: sin él, un arco se une al
         anterior con una recta y las luces saldrían cosidas entre sí. */
      const luces = new Map<number, { color: string; a: number; halo: Path2D; cuerpo: Path2D; nucleo: Path2D; tiene: boolean }>();
      for (const i of vivos) {
        const p = P[i], q = ptA[i];
        const off =
          (!!sel && p.id !== sel.id && !vecinos.has(p.id) && !F) ||
          (!!F && p.fam !== F && !fronteraF.has(p.id));
        const r = Math.min(26, (1.5 + Math.min(3.8, Math.sqrt(p.grado) * 1.15)) * q.f * 3.2);
        const a = (0.28 + q.t * 0.72) * q.v * (off ? (F ? APAGADO : restoNodo) : 1) * brillo;
        const a8 = Math.max(0, Math.min(7, Math.round(a * 7)));
        const clave = p.ci * 20 + a8 * 2 + (off ? 1 : 0);
        let g = luces.get(clave);
        if (!g) {
          g = { color: p.color, a: a8 / 7, halo: new Path2D(), cuerpo: new Path2D(), nucleo: new Path2D(), tiene: false };
          luces.set(clave, g);
        }
        g.halo.moveTo(q.sx + r * 1.15, q.sy);
        g.halo.arc(q.sx, q.sy, r * 1.15, 0, 6.2832);
        g.cuerpo.moveTo(q.sx + r, q.sy);
        g.cuerpo.arc(q.sx, q.sy, r, 0, 6.2832);
        if (q.t > 0.5 && p.grado >= 5 && !off) {
          g.nucleo.moveTo(q.sx + r * 0.4, q.sy);
          g.nucleo.arc(q.sx, q.sy, r * 0.4, 0, 6.2832);
          g.tiene = true;
        }
      }
      for (const g of luces.values()) {
        hctx.globalAlpha = g.a; hctx.fillStyle = g.color; hctx.fill(g.halo);
        nctx.globalAlpha = g.a; nctx.fillStyle = g.color; nctx.fill(g.cuerpo);
        if (g.tiene) {
          nctx.globalAlpha = g.a * 0.9; nctx.fillStyle = "#f2f7ff"; nctx.fill(g.nucleo);
        }
      }
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      // El que tienes abierto, con su aro blanco.
      if (activo) {
        const i = P.findIndex((p) => p.id === activo);
        if (i >= 0 && ptA[i].ok) {
          const q = ptA[i];
          const r = Math.min(26, (1.5 + Math.min(3.8, Math.sqrt(P[i].grado) * 1.15)) * q.f * 3.2);
          nctx.beginPath(); nctx.arc(q.sx, q.sy, r + 3.5, 0, 6.2832);
          nctx.lineWidth = 1.6; nctx.strokeStyle = "#fff"; nctx.globalAlpha = 0.9;
          nctx.stroke(); nctx.globalAlpha = 1;
        }
      }

      /* EL NÚCLEO: las skills, con su nombre. Van en ámbar y no en el color de
         ningún proyecto porque no son de ninguno: se usan en todos, que es lo
         que las pone en el centro. */
      /* Un nombre se pone SIEMPRE con dos contornos y no con uno. El fino le da
         el borde limpio, y el ancho y translúcido es el que lo despega de lo que
         haya detrás: aquí detrás hay hilos claros, luces encendidas y una foto de
         fondo que no controlamos, y con un solo contorno el texto se leía a la
         segunda mirada en vez de a la primera (Munir, 2026-08-13). Dos trazos
         cuestan menos que una sombra desenfocada, que es lo otro que valdría. */
      const rotular = (txt: string, x: number, y: number, color: string, alfa: number, cuerpo: number, peso = "") => {
        rctx.font = `${peso} ${cuerpo}px system-ui, sans-serif`.trim();
        rctx.globalAlpha = Math.min(1, alfa);
        rctx.lineJoin = "round";
        rctx.strokeStyle = "rgba(2,5,11,0.5)";
        rctx.lineWidth = Math.max(5.2, cuerpo * 0.46);
        rctx.strokeText(txt, x, y);
        rctx.strokeStyle = "rgba(2,5,11,0.95)";
        rctx.lineWidth = Math.max(2.6, cuerpo * 0.24);
        rctx.strokeText(txt, x, y);
        rctx.fillStyle = color;
        rctx.fillText(txt, x, y);
      };
      if (SK.length > 1 && skQ.every(Boolean)) {
        const aro = new Path2D();
        skQ.forEach((q, i) => (i === 0 ? aro.moveTo(q!.sx, q!.sy) : aro.lineTo(q!.sx, q!.sy)));
        aro.closePath();
        hctx.lineWidth = 2.4; hctx.strokeStyle = AMBAR;
        hctx.globalAlpha = 0.5 * (F ? 0.3 : 1) * brillo; hctx.stroke(aro);
        nctx.lineWidth = 1; nctx.strokeStyle = AMBAR;
        nctx.globalAlpha = 0.38 * (F ? 0.3 : 1) * brillo; nctx.stroke(aro);
      }
      SK.forEach((s, i) => {
        const q = skQ[i];
        if (!q || q.v < 0.02) return;
        const a = (0.5 + q.t * 0.5) * q.v * (F ? 0.28 : sel && sel.id !== s.id ? (fijo ? 0.2 : 0.4) : 1) * brillo;
        const r = Math.min(30, 5 * q.f * 3.2);
        hctx.globalAlpha = Math.min(1, a); hctx.fillStyle = AMBAR;
        hctx.beginPath(); hctx.arc(q.sx, q.sy, r, 0, 6.2832); hctx.fill();
        nctx.globalAlpha = Math.min(1, a); nctx.fillStyle = "#ffdca8";
        nctx.beginPath(); nctx.arc(q.sx, q.sy, r * 0.6, 0, 6.2832); nctx.fill();
        const cuerpo = Math.max(11, Math.min(22, 13 * q.f * 3.2));
        rotular(s.title, q.sx, q.sy - r - cuerpo * 0.75, "#ffcf8e", a * 0.95, cuerpo, "600");
      });
      if (SK.length > 1 && centroQ && centroQ.v > 0.35) {
        const cuerpo = Math.max(12, Math.min(30, 15 * centroQ.f * 3.2));
        rctx.letterSpacing = "0.14em";
        rotular("SKILLS", cenX, cenY, AMBAR, 0.78 * centroQ.v * (F ? 0.3 : 1), cuerpo, "700");
        rctx.letterSpacing = "0px";
      }
      nctx.globalAlpha = 1; hctx.globalAlpha = 1;

      /* LOS NOMBRES. Los de proyecto solo desde fuera (dentro te rodean y no
         dicen dónde estás); los de documento, los que tengas más cerca. Y sin
         pisarse: mejor cinco leídos que quince encima unos de otros. */
      const puestos: Array<{ x: number; y: number; w: number }> = [];
      if (!A.nombres) { rctx.globalAlpha = 1; return; }
      const hueco = (x: number, y: number, w: number) =>
        !puestos.some((e) => Math.abs(e.x - x) < (e.w + w) / 2 && Math.abs(e.y - y) < 15);
      for (const rg of RG) {
        const q = proyIn(_q1, rg);
        if (!q || q.v < 0.5) continue;
        const propio = F === rg.fam;
        if (!propio && (fuera < 0.05 || q.z < 0.2)) continue;
        const cuerpo = propio ? 17 : 14.5;
        rctx.font = `600 ${cuerpo}px system-ui, sans-serif`;
        const w = rctx.measureText(rg.fam).width;
        if (!propio && !hueco(q.sx, q.sy, w)) continue;
        puestos.push({ x: q.sx, y: q.sy, w });
        const a = propio ? 1 : Math.min(1, (q.z - 0.2) * 2.6) * fuera * 0.95 *
          (!F || rg.fam === F ? 1 : APAGADO);
        rotular(rg.fam, q.sx, q.sy, rg.color, a, cuerpo, "600");
      }
      const cand: Array<[Punto, Proy]> = [];
      for (let i = 0; i < P.length; i++) {
        const q = ptA[i], p = P[i];
        if (!q.ok || q.v < 0.55) continue;
        if (F && p.fam !== F && !fronteraF.has(p.id)) continue;
        const suyo = p.id === bajo?.id || p.id === activo || p.id === fijo?.id;
        // La frontera del proyecto aislado se rotula SIEMPRE, aunque esté lejos
        // o enlace poco: es exactamente el dato que has ido a buscar al aislar.
        const suyoVecino = (!!fijo && vecinos.has(p.id)) || fronteraF.has(p.id);
        /* Quién se lleva nombre. En la GALAXIA el listón sube: los cúmulos
           están más juntos en pantalla que las regiones de la bola, así que con
           el mismo criterio salían sesenta nombres encima unos de otros y no se
           leía ninguno (Munir, 2026-08-14). Aquí el nombre del cúmulo ya está
           puesto; lo que se rotula dentro es lo que de verdad manda. */
        const listón = galaxiaRef.current ? 6 : 2;
        if (
          !suyo &&
          !suyoVecino &&
          !(F
            ? q.t > 0.25 && p.grado >= (galaxiaRef.current ? 3 : 0)
            : fuera > 0.5
              ? q.z > 0.42 && p.grado >= 9
              : q.t > 0.55 && p.grado >= listón)
        )
          continue;
        // Con un nodo clavado, lo que NO es suyo ni vecino no se rotula: has ido
        // a leer esa vecindad, y treinta nombres de fondo la tapan.
        if (fijo && !suyo && !suyoVecino) continue;
        cand.push([p, q]);
      }
      cand.sort((a, b) => a[1].prof - b[1].prof);
      for (const [p, q] of cand.slice(0, F ? 110 : galaxiaRef.current ? 34 : 70)) {
        const txt = p.title.slice(0, 26);
        const w = txt.length * 6.4;
        const y = q.sy - 12;
        const mirado = p.id === bajo?.id || p.id === activo || p.id === fijo?.id;
        if (!mirado && !hueco(q.sx, y, w)) continue;
        puestos.push({ x: q.sx, y, w });
        /* El suelo del alfa no baja de 0,78: un nombre solo se dibuja si ya has
           decidido que ese nodo merece nombre, y entonces o se lee o sobra. Lo
           que sigue haciendo la distancia es matizar, no desvanecer. */
        rotular(txt, q.sx, y, mirado ? "#fff" : "#eaf1fb", mirado ? 1 : Math.min(1, 0.55 + q.v * 0.45), 12.5);
      }
      rctx.globalAlpha = 1;
    };

    // ── El ratón ────────────────────────────────────────────────────────────
    const box = caja.current;
    if (!box) return;
    const rectCaja = () => box.getBoundingClientRect();

    /**
     * Si este evento viene del tablero y no de la bola.
     *
     * Hace falta porque el tablero vive DENTRO de la caja que maneja el ratón, y
     * los eventos de un botón BURBUJEAN hasta ella. Sin esto, pulsar cualquier
     * botón disparaba el `setPointerCapture` de aquí abajo: con el puntero
     * capturado, el `pointerup` deja de llegar al botón y el clic no llega a
     * completarse nunca. Los deslizadores, lo mismo, y encima arrastrarlos
     * giraba la bola de fondo (Munir, 2026-08-12: «no funcionan los botones»).
     *
     * ⚑ Vale para CUALQUIER cosa que se ponga encima de este canvas: si lleva
     * algo con lo que se pueda interactuar, tiene que salir por aquí.
     */
    const delTablero = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(".mem-cerebro-panel");

    const onDown = (e: PointerEvent) => {
      if (delTablero(e)) return;
      // Que un arrastre no empiece a marcar texto de lo que hay encima del
      // dibujo. Va aquí ADEMÁS del `user-select` del CSS porque el navegador
      // también arrastra imágenes y enlaces con este mismo gesto.
      e.preventDefault();
      ensuciar();
      box.setPointerCapture(e.pointerId);
      const s = encimaRef.current;
      // Botón izquierdo SOBRE UN NODO: se coge el nodo, no la bola.
      const nodo = e.button === 0 && s && s.fam !== undefined
        ? puntos.current.findIndex((p) => p.id === s.id)
        : -1;
      /* El botón de la rueda hace las dos cosas que se le piden a una rueda, y
         las separa el movimiento, igual que el izquierdo separa abrir de girar:
         arrastrando DESPLAZA la vista, y sin moverlo clava el nodo que tengas
         debajo. Por eso lo de clavar se decide al soltar y no aquí: al pulsar
         todavía no se sabe cuál de las dos era (Munir, 2026-08-13). */
      arrastre.current = {
        x: e.clientX,
        y: e.clientY,
        movido: false,
        nodo,
        pan: e.button === 1,
        clavar: e.button === 1 && s && s.fam !== undefined ? s : null,
      };
    };

    const onMove = (e: PointerEvent) => {
      if (!arrastre.current && delTablero(e)) {
        // Estás en el tablero, no en la bola: ni cuenta como tocarla ni hay que
        // repintar por cada píxel que recorres encima de una lista.
        if (ratonEncima.current) {
          ratonEncima.current = false;
          focoRaton.current = null;
          ensuciar();
        }
        return;
      }
      raton.current = { x: e.clientX, y: e.clientY };
      ratonEncima.current = true;
      ensuciar();
      const a = arrastre.current;
      if (!a) return;
      const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (!a.movido && Math.hypot(dx, dy) < 5) return;
      a.movido = true;
      a.x = e.clientX; a.y = e.clientY;
      if (a.nodo >= 0) {
        const r = rectCaja();
        const dest = ratonEnEsfera(e.clientX - r.left, e.clientY - r.top);
        const p = puntos.current[a.nodo];
        if (!p) return;
        p.x = dest.x; p.y = dest.y; p.z = dest.z;
        p.n = normalDe(p);
        // Se rehace la curva de SUS enlaces, que dependían de dónde estaba. La
        // malla del tejido no: coserla mira cada nodo contra todos los demás, y
        // hacer eso en cada movimiento del ratón sería el tirón que se quitó.
        // Se recose al soltar; mientras, sus hilos se estiran con él.
        for (let h = 0; h < hilos.current.length; h++) {
          const [i, j] = hilos.current[h];
          if (i === a.nodo || j === a.nodo) {
            ctrl.current[h] = tiroDelHilo(puntos.current[i], puntos.current[j]);
          }
        }
        return;
      }
      if (a.pan) {
        /* DESPLAZAR: el pivote se mueve por el plano de la cámara, así que lo
           que había bajo el cursor sigue debajo. La conversión de píxeles a
           mundo es la de la perspectiva a la altura del pivote (`dist/escala`)
           y no un número a ojo: sin ella, de lejos el arrastre se quedaría
           corto y de cerca se dispararía. */
        const c = cam.current;
        const s = c.dist / escala;
        const w = deRotar(-dx * s, dy * s, 0);
        let nx = c.tx + w.x, ny = c.ty + w.y, nz = c.tz + w.z;
        const l = Math.hypot(nx, ny, nz);
        if (l > TOPE_PAN) {
          nx = (nx / l) * TOPE_PAN; ny = (ny / l) * TOPE_PAN; nz = (nz / l) * TOPE_PAN;
        }
        c.tx = nx; c.ty = ny; c.tz = nz;
        // Y el destino con él: el pivote se desliza SIEMPRE hacia el destino, así
        // que sin esto la vista volvería sola al sitio en cuanto sueltes.
        destino.current = { x: nx, y: ny, z: nz };
        return;
      }
      // Girar más despacio cuanto más cerca: dentro, el mismo arrastre barre
      // muchísimo más mundo y marearía.
      const k = 0.0068 * Math.min(1, cam.current.dist / 2.4);
      cam.current.yaw += dx * k;
      cam.current.pitch = Math.max(-1.35, Math.min(1.35, cam.current.pitch + dy * k));
    };

    const onUp = (e: PointerEvent) => {
      if (!arrastre.current && delTablero(e)) return;
      ensuciar();
      const era = arrastre.current;
      arrastre.current = null;
      if (era?.movido && era.nodo >= 0) {
        // Recoser solo tiene sentido con cascarón: en la galaxia no hay malla
        // que rehacer y volver a tejerla la haría aparecer de la nada.
        if (forma !== "galaxia") tejido.current = coser(puntos.current, 3);
        return;
      }
      /* La rueda soltada donde se pulsó: no querías desplazarte, querías clavar.
         Sobre un nodo se CLAVA y pasa a ser el centro del giro, para poder darle
         la vuelta; en el vacío se suelta y la cámara vuelve al centro, que es
         además la forma de deshacer un desplazamiento que te dejó perdido. */
      if (era?.pan) {
        if (era.movido) return;
        const suyo = era.clavar;
        nodoFijo.current = suyo ? suyo.id : null;
        setHayNodoFijo(!!suyo);
        if (suyo) setFocoFijo(null);
        destino.current = suyo ? { x: suyo.x, y: suyo.y, z: suyo.z } : { x: 0, y: 0, z: 0 };
        if (suyo && cam.current.dist > 1.3) cam.current.dist = 1.15;
        return;
      }
      if (era?.movido) return;
      const s = encimaRef.current;
      if (s) {
        const sk = (skills ?? []).find((x) => `skill:${x.folder}` === s.id);
        if (sk) onAbrirSkill?.(sk.folder);
        else onAbrir(s.id);
        return;
      }
      // En el vacío se suelta lo aislado: es la salida evidente, y vale tanto
      // para el proyecto como para el nodo clavado.
      setFocoFijo(null);
      if (nodoFijo.current) {
        nodoFijo.current = null;
        setHayNodoFijo(false);
        destino.current = { x: 0, y: 0, z: 0 };
      }
    };

    const onLeave = () => {
      ensuciar();
      arrastre.current = null;
      ratonEncima.current = false;
      focoRaton.current = null;
      encimaRef.current = null;
      setEncima(null);
    };

    const onWheel = (e: WheelEvent) => {
      // Sobre el tablero, la rueda hace scroll de su lista. Meterse en la bola
      // mientras intentas bajar por veinticinco proyectos es lo contrario de lo
      // que has pedido.
      if (delTablero(e)) return;
      e.preventDefault();
      ensuciar();
      // La rueda MUEVE EL OJO. El paso es proporcional a lo lejos que estás:
      // con un paso fijo, la última muesca antes de entrar te metería de golpe
      // hasta el centro.
      cam.current.dist = Math.max(0.45, Math.min(5.5, cam.current.dist * (e.deltaY < 0 ? 1 / 1.11 : 1.11)));
    };

    const noMenu = (e: Event) => e.preventDefault();
    // El botón de la rueda hace autoscroll en Windows: hay que quitárselo de en
    // medio antes de que el navegador lo coja, y `pointerdown` llega tarde.
    const noAuto = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };

    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointerleave", onLeave);
    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("contextmenu", noMenu);
    box.addEventListener("mousedown", noAuto);
    box.addEventListener("auxclick", noAuto);

    const obs = new ResizeObserver(ensuciar);
    obs.observe(box);
    raf.current = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(raf.current);
      obs.disconnect();
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("contextmenu", noMenu);
      box.removeEventListener("mousedown", noAuto);
      box.removeEventListener("auxclick", noAuto);
    };
    // `activo` y `skills` van aquí y NO es un detalle: se leen dentro del
    // pintado, y sin ellas el dibujo se queda con la foto de antes y no vuelve
    // a mirarla nunca. Cualquier prop que se lea ahí dentro tiene que estar.
  }, [activo, skills, onAbrir, onAbrirSkill, ensuciar, malla, forma]);

  const sobreLaBola = useRef(false);

  const skillDe = (p: Punto | null) =>
    p?.id.startsWith("skill:") ? (skills ?? []).find((s) => `skill:${s.folder}` === p.id) : undefined;

  return (
    <div className="mem-cerebro" ref={caja}>
      {/* Tres lienzos encima uno de otro. El de abajo es el resplandor, que lo
          desenfoca la tarjeta gráfica con una línea de CSS; encima el dibujo
          nítido, que SUMA luz; y arriba los rótulos, en modo normal.
          Los rótulos van aparte porque `plus-lighter` suma lo que pintas a lo
          que hay debajo: sobre una región encendida el blanco ya estaba al
          máximo y el texto no añadía nada, así que el resplandor se comía los
          nombres (Munir, 2026-08-12). */}
      {/* El desenfoque va en el `style` y no en el CSS porque es un ajuste suyo.
          Lo aplica el compositor sobre un lienzo que ya está a un tercio de
          resolución, así que cuesta una novena parte de dibujarlo desenfocado. */}
      <canvas
        className="mem-cerebro-halo"
        ref={halo}
        style={{
          filter: `blur(${ajustes.brillo}px) saturate(1.1)`,
          opacity: ajustes.brillo > 0 ? 0.4 : 0,
        }}
      />
      <canvas className="mem-cerebro-nitido" ref={nitido} />
      <canvas className="mem-cerebro-rotulos" ref={rotulos} />

      {/* El tablero: los proyectos con su color, y un clic aísla el suyo. Es la
          forma de decir «quiero ver solo el azul» sin tener que encontrar a ojo
          una bolita azul entre trescientas (Munir, 2026-08-12). */}
      {lista.length > 1 && (
        <div className="mem-cerebro-panel">
          {/* Dos pestañas y no dos secciones apiladas: con veinticinco proyectos
              la lista ya llena el panel de alto, así que unos mandos debajo
              obligarían a hacer scroll para llegar a ellos. */}
          <div className="mem-cerebro-tabs">
            <button data-on={pestana === "proyectos"} onClick={() => setPestana("proyectos")}>
              {t("Proyectos")}
            </button>
            <button data-on={pestana === "ajustes"} onClick={() => setPestana("ajustes")}>
              {t("Aspecto")}
            </button>
          </div>

          {pestana === "ajustes" && (
            <div className="mem-cerebro-mandos">
              {(
                [
                  ["brillo", t("Resplandor")],
                  ["alto", t("Alto de los nodos")],
                  ["enlaces", t("Enlaces de la bóveda")],
                  ["tejido", t("Malla del tejido")],
                  ["rejilla", t("Rejilla de la esfera")],
                  ["corte", t("Cuánto se aparta lo de delante")],
                ] as Array<[keyof typeof TOPES, string]>
              ).map(([clave, nombre]) => {
                const [min, max] = TOPES[clave];
                // El paso sale del rango, no a ojo: cien muescas en cualquiera de
                // ellos, que es fino sin llegar a ser imposible de clavar.
                const paso = (max - min) / 100;
                return (
                  <label key={clave}>
                    <span>{nombre}</span>
                    <b>{clave === "brillo" ? Math.round(ajustes[clave]) : Math.round(ajustes[clave] * 100)}</b>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={paso}
                      value={ajustes[clave]}
                      onChange={(e) => tocar({ [clave]: Number(e.target.value) })}
                    />
                  </label>
                );
              })}
              <div className="mem-cerebro-fila">
                <button data-on={ajustes.gira} onClick={() => tocar({ gira: !ajustes.gira })}>
                  {t("Gira sola")}
                </button>
                <button data-on={ajustes.nombres} onClick={() => tocar({ nombres: !ajustes.nombres })}>
                  {t("Nombres")}
                </button>
              </div>
              <button
                className="mem-cerebro-salir"
                onClick={() => {
                  setAjustes({ ...AJUSTES_FABRICA });
                  guardarAjustes({ ...AJUSTES_FABRICA });
                  ensuciar();
                }}
              >
                {t("Volver a lo de fábrica")}
              </button>
            </div>
          )}

          {pestana === "proyectos" && (
          <div className="mem-cerebro-leyenda">
            {lista.map((rg) => (
              <button
                key={rg.fam}
                data-on={focoFijo === rg.fam}
                data-tip={t("Ver solo este proyecto")}
                onClick={() => {
                  ensuciar();
                  setFocoFijo((f) => (f === rg.fam ? null : rg.fam));
                }}
                onPointerEnter={() => {
                  ensuciar();
                  focoRaton.current = rg.fam;
                }}
                onPointerLeave={() => {
                  ensuciar();
                  focoRaton.current = null;
                }}
              >
                <span className="mem-cerebro-pun" style={{ ["--c" as string]: rg.color }} />
                <span className="mem-cerebro-nom">{rg.fam}</span>
                <span className="mem-cerebro-n">{rg.n}</span>
              </button>
            ))}
          </div>
          )}
          <button
            className="mem-cerebro-salir"
            onClick={() => {
              ensuciar();
              cam.current.yaw = 0;
              cam.current.pitch = -0.18;
              cam.current.dist = 2.85;
              destino.current = { x: 0, y: 0, z: 0 };
              setFocoFijo(null);
              nodoFijo.current = null;
              setHayNodoFijo(false);
            }}
          >
            {t("Ver la bola entera")}
          </button>
        </div>
      )}

      {encima && (
        <div className="mem-cerebro-eti">
          <b>{encima.title}</b>
          {/* Una skill no tiene enlaces que contar: lo que dice de ella misma
              es para qué sirve, que es lo que trae en su frontmatter. */}
          <span>
            {skillDe(encima)?.description ||
              `${encima.grado} ${encima.grado === 1 ? t("enlace") : t("enlaces")}`}
          </span>
        </div>
      )}
      <div className="mem-cerebro-ayuda">
        {hayNodoFijo
          ? t("Un nodo clavado: gira alrededor para verlo · clic en el vacío para soltarlo")
          : t("Rueda para entrar · arrastra con la rueda para moverte · clic con la rueda en un nodo para clavarlo · clic para abrirlo")}
      </div>
    </div>
  );
}
