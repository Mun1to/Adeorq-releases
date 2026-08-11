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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { familia, type Doc } from "../lib/memoria";
import {
  anillar,
  colorDeArco,
  radioTotal,
  type Arco,
  type Hilo,
  type Punto,
} from "../lib/constelacion";
import { modoRendimiento } from "../lib/rendimiento";
import { useT } from "../lib/i18n";

interface Props {
  docs: Doc[];
  /** El documento abierto, que se pinta encendido y con su nombre. */
  activo?: string;
  onAbrir: (id: string) => void;
  /** Los sueltos (sin un solo enlace) se pueden esconder: en una bóveda de
      notas de trabajo son mayoría y tapan la red que sí existe. */
  soloConectados: boolean;
}

export default function MemoriaGrafo({ docs, activo, onAbrir, soloConectados }: Props) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const puntos = useRef<Punto[]>([]);
  const hilos = useRef<Array<[number, number]>>([]);
  /** El trozo de círculo de cada proyecto. Ver `lib/constelacion`. */
  const arcos = useRef<Arco[]>([]);
  const raf = useRef(0);
  const vista = useRef({ x: 0, y: 0, z: 1 });
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
    // La cámara nace enseñándolo entero. Con 56 proyectos el círculo mide más
    // de mil quinientos píxeles de lado, y al zoom de fábrica solo se veía el
    // agujero del medio.
    const c = canvas.current;
    if (c && arcs.length) {
      const cabe = Math.min(c.clientWidth, c.clientHeight) / (radioTotal(arcs) * 2.35);
      vista.current = { x: 0, y: 0, z: Math.max(0.12, Math.min(1, cabe)) };
    }
  }, [docs, red, soloConectados]);

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
    ctx.translate(w / 2 + v.x, h / 2 + v.y);
    ctx.scale(v.z, v.z);
    // La rueda gira despacio, y se para en cuanto pones el ratón encima. Es
    // giro de CÁMARA y no de las posiciones: los documentos siguen donde su
    // proyecto los puso, así que buscar uno concreto no depende del momento en
    // el que mires. Ver `giro`.
    ctx.rotate(giro.current);

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
       Es el cambio que hace legible el mapa. Rectos, los 554 enlaces que cruzan
       de un proyecto a otro se reparten por todo el disco y tapan el centro;
       curvados hacia el medio, los viajes parecidos se recogen en haces y el ojo
       puede seguirlos. Y con el color de su proyecto de origen, como pidió
       Munir: una madeja de un color se lee como «esto sale de aquí», que es la
       pregunta que este mapa contesta mejor que una lista. */
    for (const [i, j] of hilos.current) {
      const p = ps[i];
      const q = ps[j];
      if (!p || !q) continue;
      const tocado = sobre && (p.id === sobre.id || q.id === sobre.id);
      const puente = p.fam !== q.fam;
      const apagado = !!sobre && !tocado;
      /* CUANTO MÁS CONECTADO, MÁS SE VE.
         Un enlace que sale de un documento con veinte hilos es una arteria de
         la bóveda; uno entre dos notas sueltas es un detalle. Con todos al
         mismo tono, las arterias se pierden entre los detalles. `peso` va de 0
         a 1 con el grado del más conectado de los dos extremos, y sube el
         cuerpo y la fuerza de la línea. */
      const peso = Math.min(1, Math.max(p.grado, q.grado) / 14);
      ctx.lineWidth = (tocado ? 2.2 : (puente ? 0.75 : 0.5) + peso * 1.5) / v.z;
      ctx.strokeStyle = tocado ? "#cfe6ff" : p.color;
      ctx.globalAlpha = apagado
        ? 0.045
        : tocado
          ? 0.95
          : (puente ? 0.2 : 0.08) + peso * 0.34;
      // Las más gordas, además, con halo: el `shadowBlur` del canvas cuesta, así
      // que solo lo llevan las pocas que de verdad mandan y nunca con el ratón
      // encima de otro punto, que es cuando hay que ver el dibujo limpio.
      const brilla = !sobre && peso > 0.55;
      if (brilla) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = (4 + peso * 9) / v.z;
      }
      // Bézier con el tirón hacia el centro. Cuanto más lejos van los dos
      // extremos, más se recoge: dos vecinos del mismo arco casi no se curvan,
      // y un salto de punta a punta pasa por el medio en vez de por la cuerda.
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo((p.x + q.x) * 0.04, (p.y + q.y) * 0.04, q.x, q.y);
      ctx.stroke();
      if (brilla) ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    /* Y el nombre de cada proyecto, fuera de su arco y girado con él.
       Va después de los hilos y antes de los puntos: los hilos no pueden tapar
       un rótulo, y un punto sí puede pisarlo sin que estorbe. */
    for (const arco of arcos.current) {
      // Un proyecto de un solo documento abre un arco de nada: su nombre se
      // montaría con el del vecino. Se rotula solo si hay sitio.
      if (arco.abre < 0.035 && v.z < 0.5) continue;
      const tenue = !!sobre && sobre.fam !== arco.fam;
      const color = ps.find((p) => p.fam === arco.fam)?.color ?? "#8aa";
      ctx.save();
      ctx.rotate(arco.a);
      ctx.translate(arco.rMax + 16 / v.z, 0);
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
      ctx.font = `600 ${Math.min(20, 12 / v.z)}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(arco.fam, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";

    /** El sitio que ya ocupa una etiqueta, para no pintar otra encima. */
    const etiquetas: Array<{ x: number; y: number; w: number }> = [];

    for (const p of ps) {
      // El tamaño dice cuántos hilos tiene, pero con techo bajo: a doce
      // píxeles de radio, media bóveda se toca aunque esté bien colocada.
      const r = 2.5 + Math.min(6.5, Math.sqrt(p.grado) * 1.5);
      const esActivo = p.id === activo;
      const apagado = !!sobre && !esActivo && p.id !== sobre.id && !vecinos.has(p.id);
      ctx.globalAlpha = apagado ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      if (esActivo) {
        ctx.lineWidth = 2 / v.z;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }
      // El nombre solo de los importantes, del que se mira y del abierto: medio
      // millar de etiquetas es una mancha de tinta, no un mapa.
      //
      // Y aunque sean pocos, dos nombres encima uno de otro no se leen ninguno
      // de los dos. Se reserva el sitio que ocupa cada etiqueta y la siguiente
      // que caiga ahí simplemente no se pinta: mejor cinco leídos que quince
      // pisados (Munir, 2026-08-02).
      const forzado = esActivo || p.id === sobre?.id;
      if (forzado || (p.grado >= 8 && v.z > 0.5)) {
        const alto = 14 / v.z;
        const ancho = Math.min(p.title.length, 26) * (5.4 / v.z);
        const ex = p.x;
        const ey = p.y - r - 5 / v.z;
        const libre =
          forzado ||
          !etiquetas.some(
            (e) => Math.abs(e.x - ex) < (e.w + ancho) / 2 && Math.abs(e.y - ey) < alto,
          );
        if (libre) {
          etiquetas.push({ x: ex, y: ey, w: ancho });
          ctx.globalAlpha = 1;
          ctx.font = `${11 / v.z}px system-ui, sans-serif`;
          ctx.fillStyle = forzado ? "#fff" : "rgba(220,225,235,0.72)";
          ctx.textAlign = "center";
          ctx.fillText(p.title.slice(0, 26), ex, ey);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [activo]);

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
    const tick = (ts: number) => {
      raf.current = requestAnimationFrame(tick);
      if (ts - ultimo < 33) return;
      // Por tiempo real y no por fotograma: así gira igual de despacio tanto si
      // el equipo va a 120 como si va a 30.
      const dt = ultimo ? Math.min(0.2, (ts - ultimo) / 1000) : 0;
      ultimo = ts;
      if (!sinMovimiento && !quieto.current) giro.current += dt * 0.03;
      pintar();
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [pintar]);

  /** De la pantalla al tablero. */
  const enTablero = (e: React.PointerEvent | React.MouseEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const v = vista.current;
    const px = (e.clientX - r.left - r.width / 2 - v.x) / v.z;
    const py = (e.clientY - r.top - r.height / 2 - v.y) / v.z;
    // Y se DESHACE el giro de la cámara. Sin esto, el puntero apunta a donde el
    // mapa estaba cuando empezó a girar: señalas un documento y se enciende
    // otro, cada vez más lejos según pasa el rato.
    const g = -giro.current;
    const cos = Math.cos(g);
    const sen = Math.sin(g);
    return { x: px * cos - py * sen, y: px * sen + py * cos };
  };

  const buscarPunto = (x: number, y: number): Punto | null => {
    let mejor: Punto | null = null;
    let dist = 14 / vista.current.z;
    for (const p of puntos.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dist) {
        dist = d;
        mejor = p;
      }
    }
    return mejor;
  };

  return (
    <div className="mem-grafo">
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
          arrastre.current = { x: e.clientX, y: e.clientY, movido: false };
        }}
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
            vista.current.x += dx;
            vista.current.y += dy;
            return;
          }
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (p?.id !== encimaRef.current?.id) {
            encimaRef.current = p;
            setEncima(p);
          }
        }}
        onPointerUp={(e) => {
          const a = arrastre.current;
          arrastre.current = null;
          if (a?.movido) return;
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (p) onAbrir(p.id);
        }}
        onPointerLeave={() => {
          // Y vuelve a girar al salir.
          quieto.current = false;
          arrastre.current = null;
          encimaRef.current = null;
          setEncima(null);
        }}
        onWheel={(e) => {
          const v = vista.current;
          const antes = v.z;
          v.z = Math.min(3, Math.max(0.15, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
          // El zoom va hacia donde apunta el ratón y no hacia el centro: si no,
          // acercarse a un racimo del borde lo saca de la pantalla.
          const c = canvas.current!;
          const r = c.getBoundingClientRect();
          const mx = e.clientX - r.left - r.width / 2;
          const my = e.clientY - r.top - r.height / 2;
          v.x = mx - ((mx - v.x) / antes) * v.z;
          v.y = my - ((my - v.y) / antes) * v.z;
        }}
      />
      {encima && (
        <div className="mem-grafo-eti">
          <b>{encima.title}</b>
          <span>
            {encima.grado} {encima.grado === 1 ? t("enlace") : t("enlaces")}
          </span>
        </div>
      )}
      <div className="mem-grafo-ayuda">
        {t("Rueda para acercar · arrastra un punto para colocarlo · clic para abrirlo")}
      </div>
    </div>
  );
}
