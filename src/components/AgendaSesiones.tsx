import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import {
  lastReply,
  ollamaLine,
  readEncargos,
  scanSessions,
  type Encargo,
  type SessionInfo,
} from "../lib/pty";
import ProjectAvatar from "./ProjectAvatar";
import { FlagIcon, FoldersIcon } from "./Icons";

// Todas tus sesiones, ordenadas por quién te espera.
//
// Va en dos capas, y la de abajo funciona sola:
//
//   1. Lo que se sabe del disco y es EXACTO: en qué estado está cada sesión
//      (te pregunta, te ofrece algo, terminó, está a medias), de cuándo es, de
//      qué proyecto, y para qué se abrió. Nada de esto cuesta un token ni
//      espera a nadie.
//   2. La línea de "qué necesita de ti", que sí hace falta leer para saberla.
//      Esa la escribe un modelo LOCAL (Ollama), solo para las sesiones que
//      están esperando —que son un puñado, no las cuarenta— y solo si tienes
//      uno elegido en Ajustes.
//
// Si Ollama no está abierto, la capa 2 no aparece y ya está. El modelo añade
// prosa, no información: quién te espera lo sabe la capa 1.

interface Props {
  /** El modelo local elegido en Ajustes, o "" si no quiere ninguno. */
  modelo: string;
  onResume: (s: SessionInfo) => void;
}

/** Lo que hay que hacer con cada estado, que es lo único que importa aquí. */
const PINTA: Record<string, { label: string; urge: number }> = {
  pregunta: { label: "te pregunta", urge: 0 },
  ofrece: { label: "espera tu OK", urge: 1 },
  tuya: { label: "te toca", urge: 2 },
  a_medias: { label: "a medias", urge: 3 },
  lista: { label: "terminó", urge: 4 },
  "": { label: "sin saber", urge: 5 },
};

/** Las que de verdad te esperan: solo a estas se les pregunta al modelo.
    Lo usa también la portada de la Agenda para su cifra, y por eso se exporta:
    dos definiciones de «te espera» acabarían diciendo números distintos en dos
    sitios de la misma pantalla. */
export const ESPERAN = new Set(["pregunta", "ofrece", "tuya"]);

const REFRESCO_MS = 60_000;

export default function AgendaSesiones({ modelo, onResume }: Props) {
  const { t } = useT();
  const [sesiones, setSesiones] = useState<SessionInfo[]>([]);
  const [encargos, setEncargos] = useState<Record<string, Encargo>>({});
  /** La línea del modelo por sesión, y con qué versión de la sesión se hizo:
      sin lo segundo se volvería a preguntar lo mismo cada minuto. */
  const [lineas, setLineas] = useState<Record<string, { texto: string; sello: string }>>({});
  const [pensando, setPensando] = useState(0);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const releer = useCallback(() => {
    void scanSessions()
      .then((s) => vivo.current && setSesiones(s.filter((x) => x.fresh !== "muerta")))
      .catch(() => {});
    void readEncargos()
      .then((e) => vivo.current && setEncargos(e))
      .catch(() => {});
  }, []);

  useEffect(() => {
    releer();
    const id = setInterval(releer, REFRESCO_MS);
    return () => clearInterval(id);
  }, [releer]);

  const ordenadas = useMemo(
    () =>
      [...sesiones].sort((a, b) => {
        const ua = PINTA[a.state]?.urge ?? 5;
        const ub = PINTA[b.state]?.urge ?? 5;
        if (ua !== ub) return ua - ub;
        // Dentro del mismo estado, lo más reciente primero: es lo que tienes
        // más fresco en la cabeza y lo que menos cuesta retomar.
        return a.hours - b.hours;
      }),
    [sesiones],
  );

  const esperando = ordenadas.filter((s) => ESPERAN.has(s.state));

  /**
   * La capa 2. Corre por detrás, de una en una y solo sobre las que esperan.
   *
   * De una en una a propósito: son llamadas a un modelo que corre en ESTE
   * ordenador, y lanzarle seis a la vez le quita la GPU a lo que estés
   * haciendo. Ir en fila tarda más y no se nota, porque esto no bloquea nada.
   */
  useEffect(() => {
    if (!modelo || !esperando.length) return;
    let cancelado = false;

    void (async () => {
      for (const s of esperando) {
        if (cancelado || !vivo.current) return;
        // El sello cambia cuando la sesión ha seguido hablando; si no ha
        // cambiado, la línea de antes sigue valiendo y no se vuelve a pedir.
        const sello = `${s.hours}·${s.sizeKb}`;
        if (lineas[s.id]?.sello === sello) continue;

        const cola = await lastReply(s.cwd, s.id, 2500).catch(() => null);
        if (!cola || cancelado) continue;

        setPensando((n) => n + 1);
        try {
          const texto = await ollamaLine(
            modelo,
            "Eres el ayudante de un panel de programación. Abajo va lo último que " +
              "escribió un agente en una sesión que está esperando a su dueño.\n\n" +
              "Escribe UNA sola frase, en español, de menos de 110 caracteres, " +
              "diciendo qué necesita de él. Sin saludos, sin comillas, sin " +
              "explicar lo que haces. Si le hace una pregunta, di cuál.\n\n" +
              `--- lo último que escribió ---\n${cola}`,
          );
          if (!cancelado && vivo.current && texto) {
            setLineas((prev) => ({ ...prev, [s.id]: { texto: texto.split("\n")[0], sello } }));
          }
        } catch {
          // Ollama cerrado, modelo sin descargar o demasiado lento: esta
          // sesión se queda sin línea y las demás siguen intentándolo.
        } finally {
          setPensando((n) => n - 1);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
    // `lineas` NO va en las dependencias: se escribe dentro del propio efecto,
    // así que meterlo lo relanzaría en cada respuesta del modelo, para siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, esperando.map((s) => `${s.id}:${s.hours}:${s.sizeKb}`).join("|")]);

  if (!sesiones.length) return null;

  return (
    <section className="panel-card agenda-card">
      <h2>
        <FoldersIcon size={16} />
        {t("Todas tus sesiones")}
      </h2>
      <p className="card-hint">
        {t(
          "Lo que tienes vivo ahora mismo, lo que te espera primero. El estado sale del disco y es exacto; la línea de debajo la escribe tu modelo local, solo para las que te esperan.",
        )}
        {pensando > 0 && <span className="ag-pensando"> · {t("mirando…")}</span>}
      </p>

      <ul className="ag-ses">
        {ordenadas.map((s) => {
          const pinta = PINTA[s.state] ?? PINTA[""];
          const linea = lineas[s.id]?.texto;
          const e = encargos[s.id];
          return (
            <li key={s.id}>
              <button
                className="ag-ses-row"
                data-urge={pinta.urge <= 2}
                onClick={() => onResume(s)}
                data-tip={t("Retomar esta sesión aquí")}
              >
                <ProjectAvatar name={s.project} className="pavatar-mini" />
                <span className="ag-ses-cuerpo">
                  <span className="ag-ses-cab">
                    {/* El título se ve en emisión, como en la barra lateral.
                        Lo de debajo (qué necesita, el encargo) no. */}
                    <span className="ag-ses-tit">{s.title}</span>
                    <span className="ag-ses-proj">{s.project}</span>
                    <span className="ag-ses-estado" data-k={s.state}>
                      {t(pinta.label)}
                    </span>
                    <span className="ag-ses-ago">{s.ago}</span>
                  </span>
                  {/* Lo que el modelo entendió que necesita, y si no hay
                      modelo, para qué se abrió. Nunca las dos: la fila tiene
                      una línea y la que importa es la de ahora. */}
                  {linea ? (
                    <span className="ag-ses-necesita stream-hide">{linea}</span>
                  ) : e?.encargo ? (
                    <span className="ag-ses-encargo stream-hide">
                        <FlagIcon size={12} /> {e.encargo}
                      </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
