// La actividad de la sesión enfocada: lo que pasa por detrás de la terminal.
//
// Munir lo pidió el 2026-08-17: «una pestaña a la derecha que te diga cuándo
// estás utilizando un skill o cuándo está un MCP activo, para tener más
// control de todo lo que funciona detrás de tus terminales; y una sección de
// monitoreo de cómo funcionan las requests al servidor». Las dos cosas ya
// están escritas en el transcript del CLI, así que esto es mirar, no gastar:
// ni un token, igual que el modo chat (`lib/conversacion.ts`).
//
// El sondeo es cada pocos segundos y solo mientras la cara está abierta: el
// panel se desmonta al cerrarla, y con él su reloj.

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { latido } from "../lib/latido";
import {
  sessionActivity,
  type Actividad,
  type EventoActividad,
} from "../lib/conversacion";
import { BoltIcon, BroadcastIcon, RobotIcon, SparkIcon } from "./Icons";

interface Props {
  /** La sesión que se mira: la de la terminal que tienes delante. */
  cwd: string | null;
  sessionId?: string | null;
  /** Cómo se llama en pantalla, para decir de quién es esta actividad. */
  nombre?: string | null;
}

const SONDEO_MS = 5000;

/** «hace 2 min», sin fecha: esto es un panel de ahora, no un historial. */
function hace(iso: string, t: (s: string) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return t("ahora");
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Tokens en corto: 12.400 no cabe en una fila, «12k» sí. */
function tok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function IconoDeClase({ clase }: { clase: EventoActividad["clase"] }) {
  if (clase === "skill") return <SparkIcon size={13} />;
  if (clase === "mcp") return <BroadcastIcon size={13} />;
  if (clase === "agente") return <RobotIcon size={13} />;
  return <BoltIcon size={13} />;
}

export default function ActividadPanel({ cwd, sessionId, nombre }: Props) {
  const { t } = useT();
  const [act, setAct] = useState<Actividad | null>(null);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    if (!cwd) {
      setAct(null);
      return;
    }
    let vivo = true;
    setAct(null);
    setFallo("");
    const pedir = () => {
      sessionActivity(cwd, sessionId ?? undefined)
        .then((a) => {
          if (!vivo) return;
          setAct(a);
          setFallo("");
        })
        .catch((e) => vivo && setFallo(String(e)));
    };
    pedir();
    // Ver `lib/latido.ts`: con la ventana tapada este panel no se ve, y leerle
    // la cola al transcript cada cinco segundos es trabajo tirado.
    const parar = latido(pedir, SONDEO_MS);
    return () => {
      vivo = false;
      parar();
    };
  }, [cwd, sessionId]);

  if (!cwd) {
    return (
      <p className="act-vacio">
        {t(
          "Enfoca una terminal y aquí verás lo que pasa por detrás: skills, MCP, herramientas y llamadas al modelo.",
        )}
      </p>
    );
  }
  if (!act) {
    return (
      <p className="act-vacio">
        {fallo
          ? t("Esta terminal aún no tiene conversación en el disco.")
          : t("Leyendo el transcript…")}
      </p>
    );
  }

  // Lo del MCP y las skills, resumido arriba: es la pregunta exacta que trajo
  // este panel («¿está un MCP activo?»), y merece respuesta sin leer la lista.
  const mcps = [...new Set(act.eventos.filter((e) => e.clase === "mcp").map((e) => e.nombre))];
  const skills = [
    ...new Set(act.eventos.filter((e) => e.clase === "skill").map((e) => e.nombre)),
  ];
  const eventos = [...act.eventos].reverse();
  const llamadas = [...act.llamadas].reverse();

  return (
    <div className="act">
      {nombre && (
        <div className="act-quien" data-tip={cwd}>
          {nombre}
        </div>
      )}

      {(mcps.length > 0 || skills.length > 0) && (
        <div className="act-chips">
          {mcps.map((m) => (
            <span key={`m-${m}`} className="act-chip" data-clase="mcp">
              <BroadcastIcon size={11} /> {m}
            </span>
          ))}
          {skills.map((s) => (
            <span key={`s-${s}`} className="act-chip" data-clase="skill">
              <SparkIcon size={11} /> {s}
            </span>
          ))}
        </div>
      )}

      <div className="act-tit">{t("Qué ha usado")}</div>
      {eventos.length === 0 ? (
        <p className="act-nada">
          {t("Todavía nada: cuando use una skill, un MCP o una herramienta, saldrá aquí.")}
        </p>
      ) : (
        <div className="act-lista">
          {eventos.map((e, i) => (
            <div key={i} className="act-fila" data-clase={e.clase}>
              <span className="act-ico">
                <IconoDeClase clase={e.clase} />
              </span>
              <span className="act-nom">
                {e.nombre}
                {e.veces > 1 && <i className="act-veces">×{e.veces}</i>}
              </span>
              {e.detalle && (
                <span className="act-det" data-tip={e.detalle}>
                  {e.detalle}
                </span>
              )}
              <span className="act-hace">{hace(e.hora, t)}</span>
            </div>
          ))}
        </div>
      )}

      {/* El monitoreo de las requests: cada llamada del CLI al servidor del
          modelo, con lo que llevó y lo que trajo. Los totales son de la cola
          leída del transcript, no de la sesión entera desde su primer día. */}
      <div className="act-tit">{t("Llamadas al modelo")}</div>
      <div className="act-totales">
        {act.totalLlamadas}
        {" · "}
        {t("entrada")} {tok(act.entradaTotal)}
        {" · "}
        {t("salida")} {tok(act.salidaTotal)}
      </div>
      {llamadas.length === 0 ? (
        <p className="act-nada">{t("Sin llamadas en la cola leída.")}</p>
      ) : (
        <div className="act-lista">
          {llamadas.map((ll, i) => (
            <div key={i} className="act-fila act-llamada">
              <span className="act-nom">{ll.modelo || "?"}</span>
              <span
                className="act-det"
                data-tip={t("entrada · caché leída · salida, en tokens")}
              >
                {tok(ll.entrada + ll.cacheEscrita)} · {tok(ll.cacheLeida)} · {tok(ll.salida)}
              </span>
              <span className="act-hace">{hace(ll.hora, t)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
