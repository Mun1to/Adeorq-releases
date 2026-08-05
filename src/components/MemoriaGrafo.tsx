// La vista neuronal: los documentos como puntos y sus enlaces como hilos.
//
// Es un canvas y no React Flow (que ya está en el proyecto, para el Lienzo) por
// una razón de tamaño: el Lienzo maneja diez piezas con una terminal viva
// dentro y aquí hay quinientos puntos que no son nada más que un punto. Medio
// millar de nodos del DOM para dibujar círculos de cuatro píxeles va lento y no
// da nada a cambio.
//
// La colocación es la de siempre para un grafo: los que se enlazan se atraen,
// todos se repelen y el conjunto se recoge hacia el centro. Se ENFRÍA y se
// para, como en Obsidian: un tablero que nunca deja de temblar cansa la vista y
// gasta batería para siempre.
//
// La repulsión se calcula por casillas y no contra todos: quinientos puntos son
// ciento treinta mil parejas en cada paso, y con eso se notaba. Cada punto solo
// mira a los que tiene en su casilla y en las ocho de alrededor, que son los
// únicos que pueden empujarle de verdad.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hueOf } from "../lib/colors";
import { familia, type Doc } from "../lib/memoria";
import {
  colocar,
  paso as pasoDeFuerzas,
  PARA_EN,
  type Hilo,
  type Punto,
} from "../lib/constelacion";
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
  const alpha = useRef(1);
  const raf = useRef(0);
  const vista = useRef({ x: 0, y: 0, z: 1 });
  const arrastre = useRef<{
    x: number;
    y: number;
    movido: boolean;
    /** El punto que llevas agarrado, si empezaste encima de uno. */
    punto: Punto | null;
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

  // Colocación inicial: cada carpeta en su sector, y dentro de él en espiral.
  //
  // Antes era un círculo por orden de lectura, o sea con las carpetas
  // mezcladas: la simulación empezaba teniendo que deshacer ese desorden, y
  // deshacerlo es justo lo que se ve como un tirón y lo que deja nodos lejos.
  // Naciendo cada familia junta, las fuerzas solo tienen que afinar.
  useEffect(() => {
    const visibles = soloConectados ? docs.filter((d) => (red.grado.get(d.id) ?? 0) > 0) : docs;
    const sitios = colocar(visibles, familia);
    const idx = new Map<string, number>();
    const ps: Punto[] = visibles.map((d, i) => {
      idx.set(d.id, i);
      return {
        id: d.id,
        x: sitios[i].x,
        y: sitios[i].y,
        vx: 0,
        vy: 0,
        grado: red.grado.get(d.id) ?? 0,
        // `hueOf` devuelve el color entero (`hsl(210 82% 66%)`), no el número
        // del tono: se usa tal cual, como en las píldoras de proyecto.
        color: hueOf(familia(d)),
        title: d.title,
      };
    });
    puntos.current = ps;
    hilos.current = red.pares
      .map(([a, b]) => [idx.get(a) ?? -1, idx.get(b) ?? -1] as Hilo)
      .filter(([a, b]) => a >= 0 && b >= 0);
    alpha.current = 1;
  }, [docs, red, soloConectados]);

  /**
   * Un paso de la colocación.
   *
   * La física vive en `lib/constelacion.ts` y no aquí, para poder medirla fuera
   * del navegador: mirar el tablero y opinar no demuestra que ningún punto se
   * escape, y eso es exactamente lo que estaba pasando. Lo comprueba
   * `scripts/constelacion-check.ts` con cuatrocientos puntos.
   */
  const paso = useCallback(() => {
    alpha.current = pasoDeFuerzas(puntos.current, hilos.current, alpha.current);
  }, []);

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

    const ps = puntos.current;
    const sobre = encimaRef.current;
    const vecinos = new Set<string>();
    if (sobre) {
      for (const [i, j] of hilos.current) {
        if (ps[i]?.id === sobre.id) vecinos.add(ps[j]?.id);
        if (ps[j]?.id === sobre.id) vecinos.add(ps[i]?.id);
      }
    }

    // Los hilos primero, para que los puntos queden encima.
    ctx.lineWidth = 1 / v.z;
    for (const [i, j] of hilos.current) {
      const p = ps[i];
      const q = ps[j];
      if (!p || !q) continue;
      const tocado = sobre && (p.id === sobre.id || q.id === sobre.id);
      ctx.strokeStyle = tocado ? "rgba(120,180,255,0.75)" : "rgba(150,160,180,0.16)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

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

  // El bucle: mueve mientras está caliente y siempre pinta, porque el ratón y
  // el zoom cambian lo que se ve aunque los puntos ya no se muevan.
  useEffect(() => {
    let ultimo = 0;
    const tick = (ts: number) => {
      raf.current = requestAnimationFrame(tick);
      if (alpha.current > PARA_EN) paso();
      // Quieto, con repintar treinta veces por segundo va sobrado, y así el
      // ventilador no se entera de que hay un grafo abierto.
      if (alpha.current > PARA_EN || ts - ultimo > 33) {
        ultimo = ts;
        pintar();
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [paso, pintar]);

  /** De la pantalla al tablero. */
  const enTablero = (e: React.PointerEvent | React.MouseEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const v = vista.current;
    return {
      x: (e.clientX - r.left - r.width / 2 - v.x) / v.z,
      y: (e.clientY - r.top - r.height / 2 - v.y) / v.z,
    };
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
          // Empezar SOBRE un punto lo agarra a él; empezar en el hueco mueve el
          // tablero. Es lo que se espera de un mapa: arrastras lo que tocas.
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (p) p.agarrado = true;
          arrastre.current = { x: e.clientX, y: e.clientY, movido: false, punto: p };
        }}
        onPointerMove={(e) => {
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
            if (a.punto) {
              // El punto sigue al ratón a escala del tablero, no de la
              // pantalla: con el zoom al 30 % moverlo un centímetro tiene que
              // moverlo un centímetro, no tres.
              a.punto.x += dx / vista.current.z;
              a.punto.y += dy / vista.current.z;
              // Y se despierta la colocación: los vecinos tienen que
              // acomodarse a donde acabas de ponerlo.
              alpha.current = Math.max(alpha.current, 0.25);
            } else {
              vista.current.x += dx;
              vista.current.y += dy;
            }
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
          if (a?.punto) a.punto.agarrado = false;
          if (a?.movido) return;
          const { x, y } = enTablero(e);
          const p = buscarPunto(x, y);
          if (p) onAbrir(p.id);
        }}
        onPointerLeave={() => {
          if (arrastre.current?.punto) arrastre.current.punto.agarrado = false;
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
