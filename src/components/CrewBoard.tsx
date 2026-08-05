import { useEffect, useMemo, useRef, useState } from "react";
import { readCrewInbox, type CrewNote, type PaneStatus, type WorkState } from "../lib/pty";
import { PINTA, haceCuanto } from "../lib/estados";
import { useT } from "../lib/i18n";
import type { Team } from "../App";

/**
 * El tablero de la cuadrilla.
 *
 * Cuando el Capataz reparte un encargo entre seis terminales, repartir era la
 * parte fácil. La difícil es la de después: con seis paneles abiertos no se ve
 * de un vistazo quién trabaja, quién ya terminó y —lo que de verdad cuesta
 * tiempo— quién lleva diez minutos parado esperando que le contestes. Un
 * agente esperándote no avisa: se queda quieto, y el reparto que iba a ahorrar
 * media hora la pierde ahí.
 *
 * Esto no pregunta nada a ningún modelo. Lee lo que el panel ya sabe de cada
 * terminal y el BUZON.md que los propios puestos escriben. Por eso no gasta
 * cuota y por eso no se equivoca: no interpreta, mira.
 */

interface Puesto {
  paneId: number;
  team: Team;
  cwd: string;
  estado: WorkState;
  /** Desde cuándo está así, en ms. Null si aún no lo hemos visto cambiar. */
  desde: number | null;
}

interface Props {
  panes: Array<{ id: number; cwd: string; team?: Team }>;
  status: Record<number, PaneStatus>;
  onFocus: (paneId: number) => void;
  /** Cierra la cuadrilla entera. Cuando termina un reparto son tres o seis
      terminales que ya no hacen nada, y cerrarlas de una en una es el peaje
      de haberlas abierto juntas. */
  onCerrar: (paneIds: number[]) => void;
  /** Aparta sus terminales del mosaico SIN cerrarlas: siguen trabajando y
      vuelven enteras. La barra se queda, que es de donde se traen de vuelta. */
  onMinimizar: (teamId: string) => void;
  /** Qué cuadrillas están apartadas ahora mismo. */
  ocultas: Set<string>;
}

/**
 * El buzón es un archivo markdown, pero aquí no se pinta markdown: se leen
 * recados. Los asteriscos de negrita, las comillas de cita y la numeración
 * salían tal cual («1. **Esta tarea es...**»), que es ruido de formato de un
 * archivo que el usuario no está abriendo (Munir, 2026-08-02).
 */
function enLimpio(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/^[>\s]+/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^[-*]\s+/, "")
    .trim();
}

// El vocabulario de los estados vive en lib/estados.ts: lo comparte con el
// kanban del lienzo, y dos copias es como acabas con un agente que aquí «TE
// ESPERA» y allí está «trabajando».

export default function CrewBoard({
  panes,
  status,
  onFocus,
  onCerrar,
  onMinimizar,
  ocultas,
}: Props) {
  const { t } = useT();
  const [ahora, setAhora] = useState(() => Date.now());
  const [buzon, setBuzon] = useState<Record<string, CrewNote[]>>({});
  // Plegadas por id, no una sola bandera: con dos cuadrillas abiertas, cerrar
  // una para ver mejor la otra cerraba las dos.
  const [plegadas, setPlegadas] = useState<Set<string>>(() => new Set());
  // Toda cuadrilla NACE plegada: la lista de puestos entera, de golpe, es la
  // vista que Munir vio como "ocupa mucha altura y no aprovecha el espacio"
  // (2026-08-02). Ahora está también agrupada en la barra lateral, así que
  // aquí basta con la fila de cabecera hasta que se pida ver más. Una vez
  // que él la despliega a mano, se queda así: esto solo decide el ESTRENO.
  const conocidasRef = useRef<Set<string>>(new Set());
  /** La cuadrilla que ha pedido cerrarse y espera un segundo clic. Cerrar mata
      a sus agentes con lo que lleven dentro, así que no puede irse en el mismo
      clic con el que se pulsa sin querer. */
  const [cerrando, setCerrando] = useState<string | null>(null);

  // Desde cuándo cada pane está en el estado en el que está. No viene del
  // backend: se aprende mirando, y por eso vive en una ref que sobrevive a los
  // repintados sin provocarlos.
  const desdeRef = useRef<Record<number, { estado: WorkState; t: number }>>({});

  const cuadrillas = useMemo(() => {
    const grupos = new Map<string, Puesto[]>();
    for (const p of panes) {
      if (!p.team) continue;
      const estado = status[p.id]?.state ?? "";
      const prev = desdeRef.current[p.id];
      if (!prev || prev.estado !== estado) {
        desdeRef.current[p.id] = { estado, t: Date.now() };
      }
      const lista = grupos.get(p.team.id) ?? [];
      lista.push({
        paneId: p.id,
        team: p.team,
        cwd: p.cwd,
        estado,
        desde: desdeRef.current[p.id].t,
      });
      grupos.set(p.team.id, lista);
    }
    // Por número de puesto, no por el orden en que se abrieron: el «2 de 5»
    // tiene que caer siempre en el mismo sitio o no sirve como referencia.
    for (const lista of grupos.values()) lista.sort((a, b) => a.team.n - b.team.n);
    return [...grupos.values()];
  }, [panes, status]);

  useEffect(() => {
    const nuevas = cuadrillas
      .map((puestos) => puestos[0].team.id)
      .filter((id) => !conocidasRef.current.has(id));
    if (!nuevas.length) return;
    for (const id of nuevas) conocidasRef.current.add(id);
    setPlegadas((prev) => new Set([...prev, ...nuevas]));
  }, [cuadrillas]);

  // El reloj de «lleva 4 min esperándote». Cada 20 s basta y no da guerra.
  useEffect(() => {
    if (cuadrillas.length === 0) return;
    const id = setInterval(() => setAhora(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [cuadrillas.length]);

  // El buzón de cada cuadrilla, releído cada pocos segundos. Es un archivo de
  // texto en el disco del proyecto: leerlo es barato y siempre está al día.
  const carpetas = cuadrillas.map((c) => c[0]?.cwd).filter(Boolean).join("|");
  useEffect(() => {
    if (!carpetas) return;
    let vivo = true;
    const leer = () => {
      for (const cwd of carpetas.split("|")) {
        void readCrewInbox(cwd)
          .then((notas) => {
            if (vivo) setBuzon((prev) => ({ ...prev, [cwd]: notas }));
          })
          .catch(() => {});
      }
    };
    leer();
    const id = setInterval(leer, 6_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [carpetas]);

  if (cuadrillas.length === 0) return null;

  const plegar = (id: string) =>
    setPlegadas((prev) => {
      const s = new Set(prev);
      if (!s.delete(id)) s.add(id);
      return s;
    });

  return (
    <div className="crew">
      {cuadrillas.map((puestos) => {
        const team = puestos[0].team;
        const notas = buzon[puestos[0].cwd] ?? [];
        const esperando = puestos.filter((p) => PINTA[p.estado]?.urge).length;
        const hechos = puestos.filter((p) => p.estado === "lista").length;
        const plegado = plegadas.has(team.id);
        return (
          <section className="crew-box" key={team.id} style={{ ["--crew" as string]: team.color }}>
            <header className="crew-head" onClick={() => plegar(team.id)}>
              <span className="crew-dot" />
              <span className="crew-goal" data-tip={team.objetivo}>
                {team.objetivo}
              </span>
              {/* Cuánto va hecho, en una barra. Un «3 puestos» no dice si la
                  cuadrilla acaba de empezar o le queda uno: eso es lo que de
                  verdad quieres saber sin desplegar nada. */}
              <span
                className="crew-prog"
                data-tip={t("{n} de {total} han terminado", { n: hechos, total: puestos.length })}
              >
                <span className="crew-prog-riel">
                  <span
                    className="crew-prog-lleno"
                    style={{ width: `${(hechos / puestos.length) * 100}%` }}
                  />
                </span>
                <span className="crew-prog-txt">
                  {hechos}/{puestos.length}
                </span>
              </span>
              {/* Lo primero que se lee, porque es lo único que te toca hacer a ti. */}
              {esperando > 0 && (
                <span className="crew-wait">
                  {esperando} {esperando === 1 ? t("te espera") : t("te esperan")}
                </span>
              )}
              {/* Apartar sus terminales de la Cabina sin cerrarlas. La barra
                  se queda aquí, con su progreso, que es lo que permite traerlas
                  de vuelta cuando toque. */}
              <button
                className="mini crew-min"
                data-activo={ocultas.has(team.id) || undefined}
                data-tip={
                  ocultas.has(team.id)
                    ? t("Traer de vuelta sus terminales")
                    : t("Apartar sus terminales (siguen trabajando)")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onMinimizar(team.id);
                }}
              >
                {ocultas.has(team.id) ? "◱" : "◲"}
              </button>
              <button className="mini crew-fold" data-tip={plegado ? t("Desplegar") : t("Plegar")}>
                {plegado ? "▾" : "▴"}
              </button>
              {/* Cerrar la cuadrilla entera. En dos tiempos: el primero pide
                  confirmación en el propio botón y el segundo cierra, porque
                  esto se lleva por delante lo que sus agentes tengan a medias. */}
              <button
                className="mini crew-cerrar"
                data-armado={cerrando === team.id || undefined}
                data-tip={t("Cerrar las {n} terminales de esta cuadrilla", {
                  n: puestos.length,
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cerrando === team.id) {
                    onCerrar(puestos.map((p) => p.paneId));
                    setCerrando(null);
                    return;
                  }
                  setCerrando(team.id);
                  window.setTimeout(
                    () => setCerrando((v) => (v === team.id ? null : v)),
                    4000,
                  );
                }}
              >
                {cerrando === team.id ? t("¿Cerrar {n}?", { n: puestos.length }) : "✕"}
              </button>
            </header>

            {!plegado && (
              <>
                {/* Una tarjeta por puesto, no una fila de tabla. La lista de
                    filas grises obligaba a LEER para saber qué pasaba; aquí
                    cada puesto es una pieza con su estado en la primera línea
                    y su color, así que la que te espera salta a la vista sin
                    leer una palabra (Munir, 2026-08-02: «genérico y poco
                    directo»). */}
                <div className="crew-puestos">
                  {puestos.map((p) => {
                    const pinta = PINTA[p.estado] ?? PINTA[""];
                    const rato = p.desde ? haceCuanto(ahora - p.desde) : "";
                    return (
                      <button
                        key={p.paneId}
                        className="crew-card"
                        data-urge={pinta.urge || undefined}
                        data-hecho={p.estado === "lista" || undefined}
                        onClick={() => onFocus(p.paneId)}
                        // Qué se le mandó a ESTE puesto. Era lo que faltaba
                        // aquí: el tablero decía quién te espera, pero no
                        // para qué se abrió, y sin eso hay que entrar en la
                        // terminal a leer el primer mensaje para acordarte.
                        data-tip={
                          p.team.encargo
                            ? `${p.team.rol}\n${p.team.encargo.slice(0, 240)}${
                                p.team.encargo.length > 240 ? "…" : ""
                              }\n\n${t("Ir a esta terminal")}`
                            : t("Ir a esta terminal")
                        }
                      >
                        <span className="crew-card-top">
                          <span className="crew-card-ico">{pinta.icon}</span>
                          <span className="crew-card-estado">{t(pinta.label)}</span>
                          <span className="crew-card-rato">{rato}</span>
                        </span>
                        <span className="crew-card-rol">
                          {p.team.rol}
                          <em>
                            {p.team.n}/{p.team.de}
                          </em>
                        </span>
                        {p.team.encargo && (
                          <span className="crew-card-encargo">{p.team.encargo}</span>
                        )}
                        {/* Los archivos que son suyos. Es la respuesta a la
                            única pregunta que se hace uno viendo cinco agentes
                            sobre el mismo repo: ¿y estos dos no se pisan? El
                            reparto ya la calculaba, pero se quedaba dentro del
                            prompt, donde no la lee nadie. */}
                        {p.team.frontera && (
                          <code className="crew-card-frontera">{p.team.frontera}</code>
                        )}
                      </button>
                    );
                  })}
                </div>

                {notas.length > 0 && (
                  <div className="crew-buzon">
                    <span className="crew-buzon-tit">{t("Se han dicho")}</span>
                    <ul>
                      {notas.map((n, i) => (
                        <li key={i}>
                          {n.who && <b>{enLimpio(n.who)}</b>} {enLimpio(n.text)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
