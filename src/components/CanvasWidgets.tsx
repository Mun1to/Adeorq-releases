import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Handle,
  NodeResizeControl,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import { alarm, notify } from "../lib/notify";
import { noteList, noteRead, noteWrite } from "../lib/pty";
import { TOOLS, TOOL_BODIES } from "./CanvasTools";
import type { WidgetKind } from "../lib/piezas";
import {
  CloseIcon,
  FlagIcon,
  ResetIcon,
} from "./Icons";

// Widgets del lienzo. No son terminales ni dibujo: son cacharros que viven al
// lado del trabajo, donde ya estás mirando, para no cambiar de ventana por un
// pomodoro o una cuenta rápida.
//
// Todos los relojes de aquí se calculan contra `Date.now()` y NUNCA sumando al
// contador en cada tick. Un `setInterval(1000)` no dispara cada 1000 ms
// exactos, y en una pestaña en segundo plano Windows lo estrangula a uno por
// segundo largo o menos: un pomodoro que suma de uno en uno se queda corto
// media hora después, justo cuando ya confiabas en él. Guardamos el instante
// de fin (o de arranque) y de ahí se deriva lo que queda.

// Los cacharros de siempre y las utilidades: para el lienzo son lo mismo, un
// nodo con cabecera y cuerpo, así que comparten tipo y no hay dos sistemas
// paralelos que mantener. La lista de nombres vive en `lib/piezas.ts`.
export type { WidgetKind };

export interface WidgetData extends Record<string, unknown> {
  kind: WidgetKind;
  onClose: (id: string) => void;
  nodeId: string;
}

/** Dibujados, no emoji. 🍅 y 🗓 los pinta cada sistema con su propia fuente:
    salen de tamaños distintos entre sí, con sus colores fijos que no siguen al
    tema, y en un equipo sin esa fuente aparece un cuadrado. Estos son cuatro
    iconos del mismo trazo, del color del texto que tengan al lado. */
const W = ({ children }: { children: ReactElement | ReactElement[] }) => (
  <svg
    viewBox="0 0 20 20"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const WIDGETS: Array<{ kind: WidgetKind; icon: ReactElement; label: string }> = [
  {
    kind: "pomodoro" as WidgetKind,
    // Un tomate: el cuerpo y su hoja. Es el nombre del método, no un adorno.
    icon: (
      <W>
        <path d="M10 6.6c3 0 5.2 2.2 5.2 5.1 0 2.9-2.2 5.1-5.2 5.1s-5.2-2.2-5.2-5.1c0-2.9 2.2-5.1 5.2-5.1z" />
        <path d="M10 6.6V4.4M10 4.4c-1 -1.1 -2.4 -1.3 -3.4 -0.9M10 4.4c1 -1.1 2.4 -1.3 3.4 -0.9" />
      </W>
    ),
    label: "Pomodoro",
  },
  {
    kind: "crono",
    icon: (
      <W>
        <circle cx="10" cy="11.6" r="5.6" />
        <path d="M10 11.6V8.6M8.2 3h3.6M10 3v2.4" />
      </W>
    ),
    label: "Cronómetro",
  },
  {
    kind: "cuenta",
    // Un reloj de arena: cuenta hacia abajo, y eso no lo dice un reloj normal.
    icon: (
      <W>
        <path d="M5.5 3h9M5.5 17h9" />
        <path d="M6.8 3v2.2c0 2 3.2 3.4 3.2 4.8s-3.2 2.8-3.2 4.8V17" />
        <path d="M13.2 3v2.2c0 2-3.2 3.4-3.2 4.8s3.2 2.8 3.2 4.8V17" />
      </W>
    ),
    label: "Cuenta atrás",
  },
  {
    kind: "calc",
    icon: (
      <W>
        <rect x="4.2" y="2.8" width="11.6" height="14.4" rx="2" />
        <path d="M6.8 6.4h6.4M7 10.2h1.2M9.4 10.2h1.2M11.8 10.2H13M7 13.4h1.2M9.4 13.4h1.2M11.8 13.4H13" />
      </W>
    ),
    label: "Calculadora",
  },
  {
    kind: "cal",
    icon: (
      <W>
        <rect x="3" y="4.6" width="14" height="12.6" rx="2" />
        <path d="M3 8.4h14M7 2.8v3.2M13 2.8v3.2" />
      </W>
    ),
    label: "Calendario",
  },
  ...TOOLS,
];

/** Cuáles de la lista son utilidades, para poder separarlas en el menú sin
    llevar dos listas. */
export const ES_UTILIDAD = new Set<WidgetKind>(TOOLS.map((x) => x.kind));

/** mm:ss a partir de milisegundos, sin negativos. */
function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Un reloj que se repinta solo mientras hace falta, y solo entonces. */
function useTicker(active: boolean, everyMs = 250): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => force((n) => n + 1), everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs]);
  return 0;
}

/* ------------------------------------------------------------------ pomodoro */

const FOCO_MIN = 25;
const DESCANSO_MIN = 5;

function Pomodoro() {
  const { t } = useT();
  const [fase, setFase] = useState<"foco" | "descanso">("foco");
  const [finAt, setFinAt] = useState<number | null>(null);
  const [restante, setRestante] = useState(FOCO_MIN * 60_000);
  const [vueltas, setVueltas] = useState(0);
  const corriendo = finAt !== null;
  useTicker(corriendo);

  const total = (fase === "foco" ? FOCO_MIN : DESCANSO_MIN) * 60_000;
  const queda = corriendo ? Math.max(0, finAt - Date.now()) : restante;

  // El cambio de fase se decide al pintar, no en el intervalo: así una pestaña
  // estrangulada que despierta tarde salta directamente donde toca en vez de
  // arrastrar el retraso.
  useEffect(() => {
    if (!corriendo || queda > 0) return;
    const siguiente = fase === "foco" ? "descanso" : "foco";
    // Suena Y avisa el sistema. Antes solo sonaba un repique corto, y estando
    // en la Cabina con el lienzo en otra pestaña se pierde: el aviso es lo
    // único que llega cuando no estás mirando el reloj que tú pusiste.
    alarm();
    void notify({
      mode: "siempre",
      tag: "pomodoro",
      title: fase === "foco" ? t("Se acabó la concentración") : t("Se acabó el descanso"),
      body:
        siguiente === "descanso"
          ? t("Descanso de {n} minutos.", { n: String(DESCANSO_MIN) })
          : t("Otra vuelta de {n} minutos.", { n: String(FOCO_MIN) }),
    });
    const dura = (siguiente === "foco" ? FOCO_MIN : DESCANSO_MIN) * 60_000;
    if (fase === "foco") setVueltas((v) => v + 1);
    setFase(siguiente);
    setFinAt(Date.now() + dura);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corriendo, queda, fase]);

  const alternar = () => {
    if (corriendo) {
      setRestante(Math.max(0, finAt - Date.now()));
      setFinAt(null);
    } else {
      setFinAt(Date.now() + (restante || total));
    }
  };
  const reiniciar = () => {
    setFinAt(null);
    setFase("foco");
    setRestante(FOCO_MIN * 60_000);
    setVueltas(0);
  };

  const pct = total > 0 ? 1 - queda / total : 0;
  return (
    <div className="wdg-body wdg-pomo" data-fase={fase}>
      <div className="wdg-ring" style={{ ["--p" as string]: String(pct) }}>
        <span className="wdg-big">{mmss(queda)}</span>
      </div>
      <p className="wdg-sub">
        {fase === "foco" ? t("Concentración") : t("Descanso")}
        {vueltas > 0 && ` · ${vueltas} ${vueltas === 1 ? t("vuelta") : t("vueltas")}`}
      </p>
      <div className="wdg-row">
        <button className="np-btn" onClick={alternar}>
          {corriendo ? t("Pausar") : t("Empezar")}
        </button>
        <button className="mini" onClick={reiniciar} data-tip={t("Volver a empezar")}>
          <ResetIcon size={13} />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- cuenta atrás */

/** Los tiempos de un botón. Son los que uno pide de verdad: lo que tarda el
    café, un descanso corto, media hora de trabajo. */
const ATAJOS = [1, 5, 10, 25];

/**
 * Una cuenta atrás normal, la que el pomodoro no puede ser porque el pomodoro
 * son 25 y 5 y no se discute. Aquí eliges los minutos.
 *
 * Al llegar a cero avisa por las tres vías que tenemos: suena, sale la
 * notificación de Windows y parpadea el botón de la barra de tareas. Un reloj
 * que llega a cero en silencio no sirve para nada, que es justo lo que pasaba.
 */
function Cuenta() {
  const { t } = useT();
  const [min, setMin] = useState(5);
  const [finAt, setFinAt] = useState<number | null>(null);
  const [restante, setRestante] = useState(5 * 60_000);
  const [sonado, setSonado] = useState(false);
  const corriendo = finAt !== null;
  useTicker(corriendo);

  const total = min * 60_000;
  const queda = corriendo ? Math.max(0, finAt - Date.now()) : restante;

  useEffect(() => {
    if (!corriendo || queda > 0 || sonado) return;
    setSonado(true);
    alarm();
    void notify({
      mode: "siempre",
      tag: "cuenta-atras",
      title: t("Se acabó el tiempo"),
      body: t("La cuenta atrás de {n} minutos ha llegado a cero.", { n: String(min) }),
    });
    setFinAt(null);
    setRestante(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corriendo, queda, sonado]);

  const poner = (m: number) => {
    setMin(m);
    setFinAt(null);
    setRestante(m * 60_000);
    setSonado(false);
  };

  const alternar = () => {
    if (corriendo) {
      setRestante(Math.max(0, finAt - Date.now()));
      setFinAt(null);
    } else {
      setSonado(false);
      setFinAt(Date.now() + (restante || total));
    }
  };

  const pct = total > 0 ? 1 - queda / total : 0;
  return (
    <div className="wdg-body wdg-pomo" data-fase="cuenta">
      <div className="wdg-ring" style={{ ["--p" as string]: String(pct) }}>
        <span className="wdg-big">{mmss(queda)}</span>
      </div>
      <div className="wdg-row wdg-atajos">
        {ATAJOS.map((m) => (
          <button key={m} className="mini" data-on={min === m} onClick={() => poner(m)}>
            {m}
          </button>
        ))}
        <input
          className="wdg-min nodrag"
          type="number"
          min={1}
          max={180}
          value={min}
          onChange={(e) => poner(Math.min(180, Math.max(1, Number(e.currentTarget.value) || 1)))}
          onKeyDown={(e) => e.stopPropagation()}
          data-tip={t("Minutos")}
        />
      </div>
      <div className="wdg-row">
        <button className="np-btn" onClick={alternar}>
          {corriendo ? t("Pausar") : t("Empezar")}
        </button>
        <button className="mini" onClick={() => poner(min)} data-tip={t("Poner a cero")}>
          <ResetIcon size={13} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- cronómetro */

function Crono() {
  const { t } = useT();
  const [desde, setDesde] = useState<number | null>(null);
  const [acum, setAcum] = useState(0);
  const [vueltas, setVueltas] = useState<number[]>([]);
  const corriendo = desde !== null;
  useTicker(corriendo, 60);

  const ms = acum + (corriendo ? Date.now() - desde : 0);
  const cent = Math.floor((ms % 1000) / 10);

  return (
    <div className="wdg-body">
      <span className="wdg-big wdg-mono">
        {mmss(ms)}
        <em className="wdg-cent">{String(cent).padStart(2, "0")}</em>
      </span>
      <div className="wdg-row">
        <button
          className="np-btn"
          onClick={() => {
            if (corriendo) {
              setAcum((a) => a + Date.now() - desde);
              setDesde(null);
            } else setDesde(Date.now());
          }}
        >
          {corriendo ? t("Parar") : t("Empezar")}
        </button>
        <button
          className="mini"
          data-tip={t("Marcar una vuelta")}
          disabled={!corriendo}
          onClick={() => setVueltas((v) => [ms, ...v].slice(0, 12))}
        >
          <FlagIcon size={13} />
        </button>
        <button
          className="mini"
          data-tip={t("Poner a cero")}
          onClick={() => {
            setDesde(null);
            setAcum(0);
            setVueltas([]);
          }}
        >
          <ResetIcon size={13} />
        </button>
      </div>
      {vueltas.length > 0 && (
        <ol className="wdg-laps">
          {vueltas.map((v, i) => (
            <li key={i}>
              <span>{vueltas.length - i}</span>
              <span className="wdg-mono">{mmss(v)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- calculadora */

/**
 * El teclado, en el orden en el que lo tiene cualquier calculadora.
 *
 * Antes las teclas iban en una lista corrida y el `=` acababa entre el punto y
 * el `+`, en mitad de los números. Nadie lo busca ahí: el `=` va aparte, alto y
 * marcado, y el cero ancho debajo, que es lo que la mano ya sabe hacer sin
 * mirar. Borrar y limpiar suben arriba, lejos de los números, para no darles
 * sin querer.
 */
const TECLAS: Array<{ k: string; clase?: string; tip?: string }> = [
  { k: "C", clase: "fn" },
  { k: "⌫", clase: "fn" },
  { k: "÷", clase: "op" },
  { k: "×", clase: "op" },
  { k: "7" },
  { k: "8" },
  { k: "9" },
  { k: "−", clase: "op" },
  { k: "4" },
  { k: "5" },
  { k: "6" },
  { k: "+", clase: "op" },
  { k: "1" },
  { k: "2" },
  { k: "3" },
  { k: "=", clase: "eq" },
  { k: "0", clase: "cero" },
  { k: "." },
];

function Calc() {
  const [expr, setExpr] = useState("");
  const [previo, setPrevio] = useState("");

  // Se evalúa a mano, sin `eval` ni `Function`: es una calculadora dentro de
  // una app con acceso al disco, y no hay ninguna razón para dejar que un
  // texto cualquiera se ejecute aquí.
  const calcular = useCallback((s: string): string => {
    const tok = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tok || tok.length === 0) return "";
    const nums: number[] = [];
    const ops: string[] = [];
    for (const p of tok) {
      if (/^[+\-*/]$/.test(p)) ops.push(p);
      else nums.push(parseFloat(p));
    }
    if (nums.length !== ops.length + 1) return "";
    // Primero * y /, luego + y −: sin esto "2+3*4" daría 20.
    for (let i = 0; i < ops.length; ) {
      if (ops[i] === "*" || ops[i] === "/") {
        const r = ops[i] === "*" ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1];
        nums.splice(i, 2, r);
        ops.splice(i, 1);
      } else i++;
    }
    let out = nums[0];
    for (let i = 0; i < ops.length; i++) out = ops[i] === "+" ? out + nums[i + 1] : out - nums[i + 1];
    if (!isFinite(out)) return "∞";
    return String(Math.round(out * 1e10) / 1e10);
  }, []);

  const pulsa = (k: string) => {
    if (k === "=") {
      const r = calcular(expr);
      setPrevio(expr);
      setExpr(r);
    } else if (k === "C") {
      setExpr("");
      setPrevio("");
    } else if (k === "⌫") {
      setExpr((e) => e.slice(0, -1));
    } else setExpr((e) => e + k);
  };

  const avance = expr ? calcular(expr) : "";
  return (
    <div className="wdg-body wdg-calc">
      <div className="wdg-screen">
        {previo && <span className="wdg-prev">{previo}</span>}
        <span className="wdg-mono wdg-expr">{expr || "0"}</span>
        {avance && avance !== expr && <span className="wdg-preview">= {avance}</span>}
      </div>
      <div className="wdg-pad">
        {TECLAS.map(({ k, clase }) => (
          <button key={k} className="wdg-key" data-tipo={clase} onClick={() => pulsa(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- calendario */

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** El id del archivo donde vive la nota de un día. Va con el mismo sistema que
    las notas del lienzo (%LOCALAPPDATA%\Adeorq\notas), así que lo que escribas
    en un día es un `.md` que también puede leer un agente. */
function idDeDia(y: number, m: number, d: number): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `dia-${y}-${dos(m + 1)}-${dos(d)}`;
}

function Calendario() {
  const { t } = useT();
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [dia, setDia] = useState<number | null>(hoy.getDate());
  const [texto, setTexto] = useState("");
  const [escritos, setEscritos] = useState<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    // getDay() cuenta desde el domingo; aquí la semana empieza en lunes.
    const hueco = (primero.getDay() + 6) % 7;
    const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: hueco }, () => null),
      ...Array.from({ length: dias }, (_, i) => i + 1),
    ];
  }, [mes]);

  // Qué días del mes tienen algo escrito, para el punto de debajo del número.
  const refrescaPuntos = useCallback(() => {
    void noteList().then((ids) => setEscritos(new Set(ids)));
  }, []);
  useEffect(refrescaPuntos, [refrescaPuntos]);

  // Al cambiar de día se trae lo que hubiera escrito ese día.
  useEffect(() => {
    if (dia === null) return;
    let vivo = true;
    void noteRead(idDeDia(mes.getFullYear(), mes.getMonth(), dia)).then((f) => {
      if (vivo) setTexto(f.text);
    });
    return () => {
      vivo = false;
    };
  }, [dia, mes]);

  const guardar = (nuevo: string) => {
    setTexto(nuevo);
    if (dia === null) return;
    const id = idDeDia(mes.getFullYear(), mes.getMonth(), dia);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void noteWrite(id, nuevo).then(() =>
        setEscritos((prev) => {
          const s = new Set(prev);
          if (nuevo.trim()) s.add(id);
          else s.delete(id);
          return s;
        }),
      );
    }, 600);
  };

  const mueve = (d: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + d, 1));
  const alHoy = () => {
    setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDia(hoy.getDate());
  };
  const esHoy = (d: number) =>
    d === hoy.getDate() &&
    mes.getMonth() === hoy.getMonth() &&
    mes.getFullYear() === hoy.getFullYear();

  const elegido =
    dia !== null ? new Date(mes.getFullYear(), mes.getMonth(), dia) : null;

  return (
    <div className="wdg-body wdg-cal">
      <div className="wdg-calhead">
        <button className="mini" onClick={() => mueve(-1)}>
          ‹
        </button>
        <button className="wdg-month" onClick={alHoy}>
          {MESES[mes.getMonth()]} {mes.getFullYear()}
        </button>
        <button className="mini" onClick={() => mueve(1)}>
          ›
        </button>
      </div>
      <div className="wdg-grid">
        {DIAS.map((d, i) => (
          <span key={`d${i}`} className="wdg-dow">
            {d}
          </span>
        ))}
        {celdas.map((d, i) =>
          d === null ? (
            <span key={`h${i}`} />
          ) : (
            <button
              key={d}
              className="wdg-day"
              data-today={esHoy(d)}
              data-sel={d === dia}
              data-escrito={escritos.has(idDeDia(mes.getFullYear(), mes.getMonth(), d))}
              onClick={() => setDia(d)}
            >
              {d}
            </button>
          ),
        )}
      </div>

      {/* La nota del día. Es el mismo sistema que las notas del lienzo, así
          que lo que escribas aquí es un archivo de texto de verdad y no algo
          atrapado dentro del calendario. */}
      {elegido && (
        <div className="wdg-caldia">
          <span className="wdg-caldia-fecha">
            {elegido.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <textarea
            className="wdg-caldia-nota nodrag nowheel"
            value={texto}
            placeholder={t("Qué pasa este día…")}
            onChange={(e) => guardar(e.currentTarget.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ el nodo */

/**
 * El tirador de la esquina, SIEMPRE visible.
 *
 * React Flow trae su redimensionador, pero solo aparece cuando el nodo está
 * seleccionado: hay que descubrir que primero se pulsa y luego se estira. Esto
 * es la esquina de toda la vida, la que se ve sin que nadie te la enseñe. El
 * de la selección se queda además, para poder tirar de cualquier borde.
 *
 * El dibujo NO son dos rayitas diagonales. Eran, y a 11 px no decían nada:
 * ahora es la escuadra de la esquina con una flecha que sale en diagonal, que
 * es el gesto que hay que hacer. Y el botón mide 24 px aunque el icono mida
 * 15: lo que se agarra es el botón, no el dibujo.
 */
export function Grip({ minWidth, minHeight }: { minWidth: number; minHeight: number }) {
  return (
    <NodeResizeControl
      className="wdg-grip"
      position="bottom-right"
      minWidth={minWidth}
      minHeight={minHeight}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {/* La escuadra: el rincón del que se tira. */}
          <path d="M14.2 9.4v4.8H9.4" />
          {/* Y la flecha hacia dentro, que es hacia donde encoge y de donde
              se estira. */}
          <path d="M13.4 13.4L7.4 7.4" />
          <path d="M7.4 11V7.4H11" />
        </g>
      </svg>
    </NodeResizeControl>
  );
}

const CUERPOS: Record<WidgetKind, () => ReactElement> = {
  pomodoro: Pomodoro,
  crono: Crono,
  calc: Calc,
  cal: Calendario,
  cuenta: Cuenta,
  ...TOOL_BODIES,
};

export default function WidgetNode({ data }: NodeProps<Node<WidgetData>>) {
  const { t } = useT();
  const meta = WIDGETS.find((w) => w.kind === data.kind) ?? WIDGETS[0];
  const Cuerpo = CUERPOS[data.kind];
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="wdg" ref={ref} onPointerDownCapture={nodragEnControles}>
      {/* Las cuatro esquinas y los cuatro bordes, SIN tener que seleccionar
          antes: el resizer va siempre puesto y son sus asas las que aparecen al
          acercarte. `selected` solo decide si además se ve el marco. */}
      <NodeResizer isVisible minWidth={200} minHeight={190} />
      <Grip minWidth={200} minHeight={190} />
      {/* Mismos asideros que una terminal: un widget puede colgar de una
          flecha aunque hoy no reciba nada por ella. */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header className="wdg-head">
        <span className="wdg-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <span className="wdg-name">{meta.label}</span>
        <button className="wdg-x" onClick={() => data.onClose(data.nodeId)} data-tip={t("Quitar")}>
          <CloseIcon size={13} />
        </button>
      </header>
      <Cuerpo />
    </div>
  );
}
