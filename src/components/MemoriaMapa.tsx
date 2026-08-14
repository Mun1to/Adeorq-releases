// El mapa de cómo funciona un proyecto, en un lienzo que se maneja como el
// del Canvas: arrastras cada pieza donde quieras, la rueda acerca y aleja, y el
// tablero se mueve con el ratón.
//
// ── POR QUÉ REACT FLOW Y NO UN LIENZO A MANO ────────────────────────────────
//
// Munir lo pidió con esas palabras: «que se pueda mover a donde tú quieras» y
// «como un Excalidraw, como el canvas» (2026-08-14). El canvas de Adeorq ES
// React Flow, y ya está en el bundle: arrastrar nodos, zoom hacia el cursor,
// mover el tablero, el fondo de puntos, el encuadre automático y el minimapa
// son suyos. Escribir todo eso otra vez aquí sería mantener dos lienzos con dos
// comportamientos parecidos pero no iguales, que es peor que tener uno.
//
// Y los nodos son HTML de verdad, no dibujo: el texto sale nítido (sobre un
// canvas pintado a mano Windows no aplica ClearType y se ve gris) y ningún
// botón se queda muerto por un puntero capturado, que fue el fallo de la
// primera versión.
//
// ── LAS DOS VISTAS ──────────────────────────────────────────────────────────
//
//   · MAPA: bolas y enlaces, estilo constelación, en anillos por capa. «Estilo
//     Obsidian pero FIJO y bien ordenado», con sus palabras: la colocación se
//     calcula en vez de simularse, así que el mismo proyecto da siempre el
//     mismo dibujo y uno puede acordarse de dónde estaba cada cosa. Se arrastra
//     y se guarda dónde lo dejes; «Ordenar» lo devuelve a sus anillos.
//   · MAPA MENTAL: columnas por capa, quieto, con los rótulos de cada capa y
//     las flechas etiquetadas. Es el dibujo del primer prototipo.
//
// Mismos datos, dos preguntas: de qué está hecho, y cómo se recorre.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useT } from "../lib/i18n";
import {
  ANCHO_CAJA,
  CAPAS,
  NOMBRE_CAPA,
  colocar,
  posiciones,
  type Capa,
  type Mapa,
  type Pieza,
  type Sitio,
} from "../lib/mapa";
import { RefreshIcon } from "./Icons";

interface Props {
  mapa: Mapa | null;
  /** La carpeta que se está mirando. Es la clave con la que se recuerdan las
   *  posiciones: cada proyecto tiene su dibujo. */
  ruta: string;
  /** Mientras el Capataz lee. Trae la frase de en qué anda. */
  trabajando: string;
  /** Cuándo se leyó lo que se está viendo, en ISO. Vacío = nunca. */
  cuando: string;
  error: string;
  onLeer: () => void;
  onParar: () => void;
}

type DatosPieza = Pieza & { elegida: boolean };

const clavePos = (ruta: string, vista: string) =>
  `adeorq-mapa-pos:${vista}:${ruta.toLowerCase()}`;

function leerSitios(ruta: string, vista: string): Record<string, Sitio> {
  try {
    const v = JSON.parse(localStorage.getItem(clavePos(ruta, vista)) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, Sitio>) : {};
  } catch {
    return {};
  }
}

/** La caja de siempre: nombre, para qué está y dónde vive. Es la del tablero,
 *  la que ya funcionaba, y no se toca. */
function CajaNodo({ data }: NodeProps) {
  const p = data as unknown as DatosPieza;
  return (
    <div className="mapa-pieza" data-capa={p.capa} data-yo={p.elegida || undefined}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="mapa-nombre">{p.nombre}</span>
      {p.que && <span className="mapa-que">{p.que}</span>}
      {p.donde && <span className="mapa-donde">{p.donde}</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const TIPOS = { pieza: CajaNodo };

/** Un hilo ya medido en pantalla, listo para pintar. */
interface Hilo {
  de: string;
  a: string;
  que: string;
  d: string;
  /** Dónde va la etiqueta: en mitad de la curva de verdad. */
  tx: number;
  ty: number;
  capa: string;
}

/**
 * El mapa ORDENADO: columnas por capa, con su rótulo, y las flechas etiquetadas.
 *
 * Es la otra mitad de lo que Munir pidió, y no sobra al lado del tablero libre:
 * contestan cosas distintas. Aquí nada se mueve y todo está donde le toca («¿de
 * qué está hecho esto y por dónde va?»); en el tablero mandas tú («déjame
 * ponerlo como yo lo entiendo»). Por eso aquí SÍ se ven todas las etiquetas de
 * una vez, y allí solo las de la pieza que pulsas.
 *
 * Se miden las cajas ya pintadas en vez de calcular posiciones a mano: el alto
 * de una caja depende de cuánto texto trajo el Capataz, y adivinarlo sería
 * tener dos versiones de la misma verdad, una de ellas equivocada en cuanto una
 * frase ocupe dos líneas.
 */
function MapaPorCapas({
  mapa,
  elegida,
  onElegir,
}: {
  mapa: Mapa;
  elegida: string | null;
  onElegir: (id: string | null) => void;
}) {
  const { t } = useT();
  const lienzo = useRef<HTMLDivElement>(null);
  const cajas = useRef(new Map<string, HTMLElement>());
  const [hilos, setHilos] = useState<Hilo[]>([]);
  const columnas = useMemo(() => colocar(mapa), [mapa]);

  const medir = useCallback(() => {
    const base = lienzo.current;
    if (!base) return;
    const b = base.getBoundingClientRect();
    const rect = (id: string) => cajas.current.get(id)?.getBoundingClientRect();

    // Primera vuelta: cuántas flechas salen y entran por cada lado de cada caja.
    // Si todas salieran del centro, veinte hilos serían un nudo en un punto.
    const cuantas = new Map<string, number>();
    const lados = mapa.flechas.map((f) => {
      const ra = rect(f.de);
      const rb = rect(f.a);
      if (!ra || !rb) return null;
      const adelante = rb.left >= ra.right - 4;
      const ka = `${f.de}|${adelante ? "der" : "izq"}`;
      const kb = `${f.a}|${adelante ? "izq" : "der"}`;
      cuantas.set(ka, (cuantas.get(ka) ?? 0) + 1);
      cuantas.set(kb, (cuantas.get(kb) ?? 0) + 1);
      return { f, ra, rb, adelante, ka, kb };
    });

    const usadas = new Map<string, number>();
    const out: Hilo[] = [];
    for (const l of lados) {
      if (!l) continue;
      const { f, ra, rb, adelante, ka, kb } = l;
      const ia = (usadas.get(ka) ?? 0) + 1;
      usadas.set(ka, ia);
      const ib = (usadas.get(kb) ?? 0) + 1;
      usadas.set(kb, ib);
      const altura = (r: DOMRect, i: number, n: number) =>
        r.top - b.top + (r.height * i) / (n + 1);
      const x1 = (adelante ? ra.right : ra.left) - b.left;
      const x2 = (adelante ? rb.left : rb.right) - b.left;
      const y1 = altura(ra, ia, cuantas.get(ka) ?? 1);
      const y2 = altura(rb, ib, cuantas.get(kb) ?? 1);
      // Curva suave: sale y entra en horizontal. Las de vuelta se abren más,
      // para no pegarse a la de ida entre esas dos mismas cajas.
      const tira = Math.max(46, Math.abs(x2 - x1) * (adelante ? 0.45 : 0.8));
      const c1 = x1 + (adelante ? tira : -tira);
      const c2 = x2 - (adelante ? tira : -tira);
      // El punto medio de una bezier cúbica en t=0,5, sin pedírselo al DOM.
      const medio = (p0: number, p1: number, p2: number, p3: number) =>
        (p0 + 3 * p1 + 3 * p2 + p3) / 8;
      out.push({
        de: f.de,
        a: f.a,
        que: f.que,
        d: `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`,
        tx: medio(x1, c1, c2, x2),
        ty: medio(y1, y1, y2, y2) - 6,
        capa: mapa.piezas.find((p) => p.id === f.de)?.capa ?? "otros",
      });
    }
    setHilos(out);
  }, [mapa]);

  useLayoutEffect(() => {
    medir();
    const base = lienzo.current;
    if (!base) return;
    // Se remide al cambiar de tamaño: las columnas se reparten el ancho, así
    // que al estrechar la ventana crecen a lo alto y los hilos quedarían
    // colgando donde ya no hay nada.
    const ro = new ResizeObserver(() => medir());
    ro.observe(base);
    return () => ro.disconnect();
  }, [medir]);

  return (
    <div className="mapa-capas" data-elegida={elegida ?? undefined}>
      <div className="mapa-tablero" ref={lienzo}>
        {/* Las flechas van por DETRÁS y sin recibir un solo evento: un lienzo
            que captura el puntero se come los clics de las cajas de encima, y
            eso ya costó una versión entera. */}
        <svg className="mapa-hilos" aria-hidden="true">
          <defs>
            <marker
              id="mapa-punta"
              viewBox="0 0 10 8"
              refX="9"
              refY="4"
              markerWidth="8"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          {hilos.map((h, i) => {
            const viva = elegida === h.de || elegida === h.a;
            return (
              <g
                key={`${h.de}-${h.a}-${i}`}
                className="mapa-hilo"
                data-capa={h.capa}
                data-viva={viva || undefined}
              >
                <path d={h.d} markerEnd="url(#mapa-punta)" />
                {/* La etiqueta, SOLO de lo elegido. Pintadas todas a la vez se
                    amontonan unas encima de otras en el pasillo entre columnas,
                    porque de una misma pieza salen seis o siete hilos y sus
                    puntos medios caen casi en el mismo sitio. Los hilos son la
                    estructura y se ven siempre; lo que se piden es el detalle,
                    y el detalle se pide. */}
                {viva && h.que && (
                  <text className="mapa-etiqueta" x={h.tx} y={h.ty} textAnchor="middle">
                    {h.que}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="mapa-columnas">
          {columnas.map((col) => (
            <div key={col.capa} className="mapa-columna" data-capa={col.capa}>
              <p className="mapa-capa">{t(NOMBRE_CAPA[col.capa].titulo)}</p>
              <p className="mapa-capa-sub">{t(NOMBRE_CAPA[col.capa].sub)}</p>
              {col.piezas.map((p) => (
                <button
                  key={p.id}
                  ref={(el) => {
                    if (el) cajas.current.set(p.id, el);
                    else cajas.current.delete(p.id);
                  }}
                  className="mapa-pieza"
                  data-capa={p.capa}
                  data-yo={elegida === p.id || undefined}
                  onClick={() => onElegir(elegida === p.id ? null : p.id)}
                >
                  <span className="mapa-nombre">{p.nombre}</span>
                  {p.que && <span className="mapa-que">{p.que}</span>}
                  {p.donde && <span className="mapa-donde">{p.donde}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/**
 * El ÁRBOL, que es lo que más veces ha pedido: raíz arriba, ramas por capa,
 * piezas como hojas, y de cada pieza cuelga con quién habla.
 *
 * Todo se abre y se cierra. Un mapa dibujado lo enseña todo a la vez y por eso
 * hay que buscar; un árbol enseña lo que has abierto, y eso convierte doce
 * piezas con veinte relaciones en algo que se recorre sin perderse. Aquí el
 * grafo entero está dentro: las flechas no se pintan, se cuentan y se leen.
 */
function MapaArbol({
  mapa,
  raiz,
  abiertas,
  onAlternar,
}: {
  mapa: Mapa;
  /** Cómo se llama el tronco: el proyecto, o «Mi taller» si son todos. */
  raiz: string;
  abiertas: Set<string>;
  onAlternar: (clave: string) => void;
}) {
  const { t } = useT();
  const porId = useMemo(() => new Map(mapa.piezas.map((p) => [p.id, p])), [mapa]);

  const rama = (
    clave: string,
    capa: Capa | "raiz",
    cuerpo: React.ReactNode,
    hijos: React.ReactNode[],
  ) => {
    const abierta = abiertas.has(clave);
    const tiene = hijos.length > 0;
    return (
      <div className="arb-rama" data-capa={capa} key={clave}>
        <div className="arb-nodo">
          <button
            className="arb-fuelle"
            data-abierta={abierta || undefined}
            data-hoja={!tiene || undefined}
            aria-label={abierta ? t("Cerrar") : t("Abrir")}
            onClick={() => tiene && onAlternar(clave)}
          >
            ▶
          </button>
          {cuerpo}
        </div>
        {abierta && tiene && <div className="arb-hijos">{hijos}</div>}
      </div>
    );
  };

  const ficha = (nombre: string, que: string, donde: string, cuenta: number, alPulsar?: () => void) => (
    <button className="arb-ficha" onClick={alPulsar} disabled={!alPulsar}>
      <span className="arb-tit">
        <span className="arb-nombre">{nombre}</span>
        {cuenta > 0 && <span className="arb-cuenta">{cuenta}</span>}
      </span>
      {que && <span className="arb-que">{que}</span>}
      {donde && <span className="arb-donde">{donde}</span>}
    </button>
  );

  const ramasCapa = CAPAS.map((capa) => {
    const dentro = mapa.piezas.filter((p) => p.capa === capa);
    if (!dentro.length) return null;
    const hojas = dentro.map((p) => {
      // Las dos direcciones, y dichas en cristiano: a quién le pide algo y
      // quién le pide a él. Es el grafo entero, contado en vez de dibujado.
      const lazos: React.ReactNode[] = [
        ...mapa.flechas
          .filter((f) => f.de === p.id)
          .map((f, i) => {
            const o = porId.get(f.a);
            return (
              <div className="arb-lazo" data-capa={o?.capa ?? "otros"} key={`d${i}`}>
                <span className="arb-punto" />
                <i>{f.que || t("usa")}</i> → <em>{o?.nombre ?? f.a}</em>
              </div>
            );
          }),
        ...mapa.flechas
          .filter((f) => f.a === p.id)
          .map((f, i) => {
            const o = porId.get(f.de);
            return (
              <div className="arb-lazo" data-capa={o?.capa ?? "otros"} key={`a${i}`}>
                <span className="arb-punto" />
                <em>{o?.nombre ?? f.de}</em> ← <i>{f.que || t("usa")}</i>
              </div>
            );
          }),
      ];
      return rama(
        `p:${p.id}`,
        capa,
        ficha(p.nombre, p.que, p.donde, lazos.length, lazos.length ? () => onAlternar(`p:${p.id}`) : undefined),
        lazos,
      );
    });
    return rama(
      capa,
      capa,
      ficha(t(NOMBRE_CAPA[capa].titulo), t(NOMBRE_CAPA[capa].sub), "", dentro.length, () => onAlternar(capa)),
      hojas,
    );
  }).filter(Boolean) as React.ReactNode[];

  return (
    <div className="arb">
      {rama(
        "raiz",
        "raiz",
        ficha(raiz, mapa.resumen, "", mapa.piezas.length, () => onAlternar("raiz")),
        ramasCapa,
      )}
    </div>
  );
}

function Lienzo({ mapa, ruta, trabajando, cuando, error, onLeer, onParar }: Props) {
  const { t } = useT();
  const flow = useReactFlow();
  const listos = useNodesInitialized();
  /** Cuál de las TRES se está mirando. Las tres salen de la MISMA lectura y
   *  ninguna sustituye a otra: se AÑADEN. Se intentó cambiar una por otra y
   *  estuvo mal (Munir, 2026-08-14: «te digo que pongas una sección nueva y tú
   *  vas y cambias una»).
   *    · tablero      — cajas con su explicación, arrastrables.
   *    · capas        — columnas por capa, quieto y rotulado.
   *    · constelacion — bolas y enlaces, estilo Obsidian, en anillos. */
  const [vista, setVista] = useState<"arbol" | "tablero" | "capas">("arbol");
  /** Qué ramas del árbol están abiertas. Empieza con la raíz y las capas, que
   *  es lo que enseña de qué está hecho sin tener que abrir nada. */
  const [abiertas, setAbiertas] = useState<Set<string>>(
    () => new Set(["raiz", ...CAPAS]),
  );
  const alternar = useCallback((clave: string) => {
    setAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }, []);
  const [elegida, setElegida] = useState<string | null>(null);
  const [sitios, setSitios] = useState<Record<string, Sitio>>({});
  /** Si ya se recolocó con los altos de verdad. Se hace UNA vez por mapa: si no,
   *  cada medida movería las cajas otra vez y el lienzo temblaría. */
  const medido = useRef("");

  /** La clave con la que se recuerda el dibujo del tablero. Lleva nombre
   *  propio porque un día hubo dos tableros y las bolas heredaban la
   *  colocación de las cajas; si vuelve a haberlos, esto ya está preparado. */
  const cual = "cajas";

  // Al cambiar de proyecto o de tablero, lo suyo y nada de lo de antes.
  useEffect(() => {
    setElegida(null);
    setSitios(ruta ? leerSitios(ruta, cual) : {});
    medido.current = "";
  }, [ruta, mapa, cual]);

  const columnas = useMemo(() => (mapa ? colocar(mapa) : []), [mapa]);
  /** Dónde nace cada cosa. El tablero de cajas, en columnas por capa (`colocar`
   *  deja las flechas sin cruzarse); la constelación, en anillos con la capa más
   *  conectada dentro. Las dos CALCULADAS y no simuladas, que es lo que pidió:
   *  «fijo y bien ordenado». Dos lecturas del mismo proyecto, el mismo dibujo. */
  const deFabrica = useMemo(() => (mapa ? posiciones(columnas) : {}), [mapa, columnas]);

  const nodos: Node[] = useMemo(() => {
    if (!mapa) return [];
    return mapa.piezas.map((p) => ({
      id: p.id,
      type: "pieza",
      position: sitios[p.id] ?? deFabrica[p.id] ?? { x: 0, y: 0 },
      data: { ...p, elegida: elegida === p.id },
      // El ancho manda desde aquí: en la caja, para que todas midan igual; en la
      // bola, para que un nombre largo no ensanche su nodo y empuje al vecino.
      style: { width: ANCHO_CAJA },
    }));
  }, [mapa, sitios, deFabrica, elegida]);

  const aristas: Edge[] = useMemo(() => {
    if (!mapa) return [];
    return mapa.flechas.map((f, i) => {
      const viva = elegida === f.de || elegida === f.a;
      const capa = mapa.piezas.find((p) => p.id === f.de)?.capa ?? "otros";
      return {
        id: `${f.de}-${f.a}-${i}`,
        source: f.de,
        target: f.a,
        // La etiqueta SOLO de lo elegido. Catorce etiquetas a la vez encima de
        // catorce hilos es justo lo que Munir llamó confuso: los hilos son la
        // estructura y se ven siempre, lo que se piden es el detalle.
        label: viva ? f.que : undefined,
        // En la constelación, curva suave y sin codos: un enlace de un grafo de
        // notas es un hilo, no una tubería. En el tablero de cajas los codos sí
        // valen, porque ahí las piezas están en columnas.
        type: "smoothstep",
        className: `mapa-hilo${viva ? " es-viva" : ""}`,
        data: { capa },
        style: {
          stroke: `var(--mapa-${capa})`,
          strokeWidth: viva ? 2 : 1.5,
          opacity: elegida ? (viva ? 1 : 0.12) : 0.55,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        labelBgStyle: { fill: "var(--panel-solid)", fillOpacity: 0.92 },
        labelStyle: { fill: "var(--text)", fontSize: 11 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: `var(--mapa-${capa})` },
      };
    });
  }, [mapa, elegida]);

  /* Encuadrar en cuanto los nodos están pintados. Las posiciones ya vienen
     calculadas, así que no hay que recolocar nada: solo mirar el conjunto. */
  useEffect(() => {
    if (!listos || !mapa || medido.current === ruta) return;
    medido.current = ruta;
    window.setTimeout(() => void flow.fitView({ padding: 0.2, duration: 300 }), 60);
  }, [listos, mapa, ruta, flow]);

  /** Dónde las dejó él. Se guarda al soltar y no en cada píxel del arrastre:
   *  escribir en `localStorage` sesenta veces por segundo se nota. */
  const alSoltar = useCallback(() => {
    if (!ruta) return;
    const out: Record<string, Sitio> = {};
    for (const n of flow.getNodes()) out[n.id] = { x: n.position.x, y: n.position.y };
    setSitios(out);
    try {
      localStorage.setItem(clavePos(ruta, cual), JSON.stringify(out));
    } catch {
      // Sin recordar el dibujo se trabaja igual: vuelve a nacer ordenado.
    }
  }, [flow, ruta, cual]);

  const ordenar = useCallback(() => {
    setSitios(deFabrica);
    try {
      localStorage.removeItem(clavePos(ruta, cual));
    } catch {
      // da igual
    }
    window.setTimeout(() => void flow.fitView({ padding: 0.18, duration: 320 }), 60);
  }, [deFabrica, flow, ruta, cual]);

  return (
    <div className="mapa-todo" data-elegida={elegida ?? undefined}>
      <div className="mapa-barra">
        {mapa && !trabajando && (
          <div className="mapa-vistas">
            <button data-on={vista === "arbol"} onClick={() => setVista("arbol")}>
              {t("Árbol")}
            </button>
            <button data-on={vista === "tablero"} onClick={() => setVista("tablero")}>
              {t("Mapa")}
            </button>
            <button data-on={vista === "capas"} onClick={() => setVista("capas")}>
              {t("Mapa mental")}
            </button>
          </div>
        )}
        <span className="mapa-cuando">
          {trabajando ? "" : cuando ? t("Leído {c}", { c: nombreFecha(cuando) }) : ""}
        </span>
        {mapa && !trabajando && vista === "tablero" && (
          <button
            className="mini"
            data-tip={t("Devuelve cada pieza a su sitio de fábrica y encuadra el mapa")}
            onClick={ordenar}
          >
            {t("Ordenar")}
          </button>
        )}
        {trabajando ? (
          <button className="mini mapa-parar" onClick={onParar}>
            {t("Parar")}
          </button>
        ) : (
          <button
            className="mini mapa-releer"
            data-tip={t("Vuelve a leer el código del proyecto. Tarda unos minutos.")}
            onClick={onLeer}
          >
            <RefreshIcon size={13} />
            {mapa ? t("Leer otra vez") : t("Leer el proyecto")}
          </button>
        )}
      </div>

      {error && <p className="mapa-error">{error}</p>}

      {/* Mientras lee. Ocupa la pantalla entera a propósito: son dos minutos, y
          una frase suelta arriba con todo lo demás en negro se lee como que la
          aplicación se ha colgado (Munir, 2026-08-14). El renglón cambia con
          cada archivo que el Capataz abre, así que se ve que avanza. */}
      {trabajando && (
        <div className="mapa-vacio mapa-leyendo">
          <span className="mapa-latido" />
          <p>{trabajando}</p>
          <p className="mapa-vacio-sub">
            {t("Está abriendo el código y viendo quién llama a quién. Un par de minutos.")}
          </p>
        </div>
      )}

      {!mapa && !trabajando && !error && (
        <div className="mapa-vacio">
          <p>{t("De este proyecto todavía no hay mapa.")}</p>
          <p className="mapa-vacio-sub">
            {t("El Capataz lee su código y dibuja de qué está hecho y qué pasa cuando haces algo. Tarda unos minutos, y luego se queda guardado.")}
          </p>
        </div>
      )}

      {mapa && !trabajando && mapa.resumen && <p className="mapa-resumen">{mapa.resumen}</p>}

      {/* ── El mapa mental: columnas por capa, quieto y todo rotulado ──────
          Es el dibujo del primer prototipo, el que le gustó. No es lo mismo que
          el tablero de al lado aunque los datos sean los mismos: aquí nada se
          mueve, cada pieza está en la capa que le toca y todas las flechas
          dicen qué se piden. Allí mandas tú. */}
      {mapa && !trabajando && vista === "arbol" && (
        <MapaArbol
          mapa={mapa}
          raiz={nombreDeLaRaiz(ruta)}
          abiertas={abiertas}
          onAlternar={alternar}
        />
      )}

      {mapa && !trabajando && vista === "capas" && (
        <>
          <MapaPorCapas mapa={mapa} elegida={elegida} onElegir={setElegida} />
          <p className="mapa-pista">
            {elegida
              ? t("Pulsa otra vez para verlo todo.")
              : t("Pulsa una pieza para ver con quién habla y qué se piden.")}
          </p>
        </>
      )}

      {mapa && !trabajando && vista === "tablero" && (
        <>
          <div className="mapa-lienzo">
            <ReactFlow
              nodes={nodos}
              edges={aristas}
              nodeTypes={TIPOS}
              onNodeDragStop={alSoltar}
              onNodeClick={(_, n) => setElegida((p) => (p === n.id ? null : n.id))}
              onPaneClick={() => setElegida(null)}
              // Nada de conectar ni de borrar a mano: esto es un mapa de lo que
              // el código hace, no un diagrama que se edita. Mover sí, porque
              // dónde cae cada cosa es cosa suya.
              nodesConnectable={false}
              nodesDraggable
              elementsSelectable={false}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={{ padding: 0.18 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={26} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {/* La leyenda va FUERA del lienzo, en píxeles de pantalla: es la
                clave de colores, no una cosa puesta en el tablero, así que no
                tiene por qué encoger al alejar el zoom. */}
            <div className="mapa-leyenda">
              {columnas.map((c) => (
                <span key={c.capa} data-capa={c.capa}>
                  <i />
                  {t(NOMBRE_CAPA[c.capa].titulo)}
                </span>
              ))}
            </div>
          </div>
          <p className="mapa-pista">
            {elegida
              ? t("Pulsa el fondo para verlo todo otra vez.")
              : t("Arrastra las piezas donde quieras. Pulsa una para ver con quién habla y qué se piden.")}
          </p>
        </>
      )}
    </div>
  );
}

export default function MemoriaMapa(props: Props) {
  if (!props.ruta) {
    return (
      <div className="mapa-vacio">
        <p>Elige arriba un proyecto o una carpeta y te digo cómo funciona por dentro.</p>
      </div>
    );
  }
  // El proveedor tiene que estar POR ENCIMA del lienzo para que `useReactFlow`
  // funcione, igual que en el Canvas.
  return (
    <ReactFlowProvider>
      <Lienzo {...props} />
    </ReactFlowProvider>
  );
}

/** «hoy», «ayer» o la fecha. Un mapa sin fecha se lee como si fuera de ahora,
 *  y aquí lo que se enseña puede ser de hace una semana. */
function nombreFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return `hoy a las ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return d.toLocaleDateString();
}

/** El nombre del tronco del árbol: la última carpeta de la ruta. */
function nombreDeLaRaiz(ruta: string): string {
  return ruta.replace(/[\/]+$/, "").split(/[\/]/).pop() || ruta;
}
