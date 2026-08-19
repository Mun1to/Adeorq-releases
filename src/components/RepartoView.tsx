// El Reparto: varias tareas de golpe, cada una a su sitio.
//
// El Asistente resuelve UNA cosa muy bien: le sueltas una frase y te deja el
// encargo escrito en la terminal con el cerebro que le toca. Lo que no sabía
// hacer es un día entero: cinco pendientes, cinco terminales, y cada una con lo
// suyo sin pisar a la de al lado.
//
// Lo que pasa aquí, en orden:
//   1. escribes las tareas (o las marcas de tus objetivos y de la Agenda),
//   2. UNA llamada las clasifica todas y reparte los archivos (`foreman.rs`),
//   3. el código decide destino, cuenta, modelo y esfuerzo de cada una mirando
//      tus clientes, tus cuentas, tu cuota y tu plan (`lib/reparto.ts`),
//   4. se escribe el papel común en el BUZON.md del proyecto,
//   5. y se abren, cada una con su prompt ya en el idioma de su cliente.
//
// El paso 3 no gasta un token: es la misma pieza que ya decide en el Asistente.

import { useEffect, useMemo, useState } from "react";
import {
  escribirBuzon,
  foremanLote,
  listProjects,
  readInbox,
  type Account,
  type Note,
  type Project,
} from "../lib/pty";
import { goalsRead, hoy, type Goal } from "../lib/goals";
import { mirarMundo, mundoEnCache } from "../lib/mundo";
import { leerPerfil } from "../lib/perfil";
import { comoPeso, modoAviso, PESO, techoDelPlan, type Mundo } from "../lib/router";
import { MODEL_ALIASES, type ModelAlias } from "../lib/models";
import { useMenu } from "./Overlays";
import {
  interpretarLote,
  repartir,
  rolDePuesto,
  tituloDelReparto,
  MAX_TAREAS,
  type Reparto,
} from "../lib/reparto";
import type { RepartoInicial } from "../App";
import { providerOf } from "../lib/providers";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";
import { useRef } from "react";
import ProviderMark from "./ProviderMark";

/**
 * Los cuatro puestos de siempre, como atajo para escribir.
 *
 * Vivían en la sección «Misión» del Panel, que tenía su propio camino para
 * desplegar agentes. Esa sección ya no existe (Munir, 2026-08-02): lo que
 * aportaba era esto, cuatro áreas escritas de antemano para no teclearlas cada
 * vez, así que se quedan aquí, que es donde se reparte de verdad.
 */
const ROLES = [
  { key: "Frontend", desc: "la interfaz: HTML, CSS y componentes" },
  { key: "Backend", desc: "el servidor, los datos y las APIs" },
  { key: "Seguridad", desc: "revisar y endurecer: secretos, validación de entradas, dependencias" },
  { key: "Diseño", desc: "tipografías, paleta, espaciado y consistencia visual" },
];

interface Props {
  /** Todas las cuentas configuradas, para saber con cuál abrir cada una. */
  cuentas: Account[];
  /** El proyecto donde está trabajando ahora, como propuesta. */
  sugerido?: string | null;
  /** Lo que trae quien abrió esta pantalla desde otro sitio: la Misión del
      Panel o el kanban del lienzo llegan con las tareas ya escritas. */
  inicial?: RepartoInicial;
  /** Abre el lote entero como UNA cuadrilla. Lo ejecuta App, que es quien
      tiene el PTY. Va de golpe y no puesto a puesto a propósito: seis
      terminales sueltas son seis terminales, y una cuadrilla marcada sale
      agrupada en el tablero de la Cabina con su color y su «2 de 5». */
  onAbrirLote: (
    objetivo: string,
    cwd: string,
    partes: Array<{
      label: string;
      prompt: string;
      rol: string;
      encargo?: string;
      frontera?: string;
      cli?: string;
      model?: string;
      esfuerzo?: string;
      cuenta?: Account;
    }>,
  ) => void;
  onClose: () => void;
}

/**
 * Qué significa elegir ese cerebro, en una línea.
 *
 * Sin esto la lista son cuatro nombres sin consecuencia, y elegir «fable»
 * porque suena mejor es exactamente la forma de que un lote de seis agentes
 * salga diez veces más caro sin enterarte. Se dice lo que pesa y, si ninguna de
 * tus cuentas lo incluye, se dice también: el router lo bajaría igualmente al
 * abrir, y enterarse ahí es tarde.
 */
function pistaDeModelo(m: ModelAlias, mundo: Mundo | null): string {
  const peso = comoPeso(m);
  const cuentas = mundo?.cuentas ?? [];
  if (cuentas.length === 0) return peso;
  const alcanza = cuentas.some((c) => {
    const techo = techoDelPlan(c.plan);
    return !techo || PESO[m] <= PESO[techo];
  });
  return alcanza ? peso : `${peso} · tu plan no lo incluye`;
}

export default function RepartoView({ cuentas, sugerido, inicial, onAbrirLote, onClose }: Props) {
  const { t } = useT();
  const menu = useMenu();
  const [texto, setTexto] = useState(() => inicial?.texto ?? "");
  const [objetivos, setObjetivos] = useState<Goal[]>([]);
  const [ideas, setIdeas] = useState<Note[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [proyectos, setProyectos] = useState<Project[]>([]);
  const [proyecto, setProyecto] = useState<string>("");
  const [pensando, setPensando] = useState(false);
  const [reparto, setReparto] = useState<Reparto | null>(null);
  /** La foto del equipo con la que se repartió. Se guarda para poder rehacer
      el reparto cuando eliges otro cerebro a mano, sin volver a llamar al
      Capataz: la clasificación ya está hecha y no cambia porque tú cambies un
      modelo. */
  const [mundo, setMundo] = useState<Mundo | null>(null);
  const [objetivoDelLote, setObjetivoDelLote] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const bajoEnVelo = useRef(false);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProyectos(list);
        // El que pidió quien abrió la pantalla manda sobre el que se estaba
        // mirando: si la Misión dice «esto va en Adeorq», cambiarlo por el
        // proyecto que tenías delante sería abrir el reparto en otro sitio.
        const pedido =
          inicial?.proyecto &&
          list.find((p) => p.path === inicial.proyecto || p.name === inicial.proyecto);
        const hit = pedido || (sugerido && list.find((p) => p.name === sugerido));
        setProyecto(hit ? hit.path : (list[0]?.path ?? ""));
      })
      .catch((e) => setError(String(e)));
    // Lo que ya tenías escrito en la casa: los objetivos de hoy y lo que tus
    // agentes te han ido dejando. Tenerlo aquí evita el copiar y pegar que
    // hace que nadie use estas dos cosas juntas.
    goalsRead(hoy())
      .then((d) => setObjetivos(d.goals.filter((g) => !g.done)))
      .catch(() => {});
    readInbox()
      .then(setIdeas)
      .catch(() => {});
  }, [sugerido, inicial?.proyecto]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const marcar = (clave: string) => {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });
  };

  /** Todo lo que entra al reparto: lo escrito más lo marcado, sin repetidos. */
  const crudas = useMemo(() => {
    const escritas = texto
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)\]]+\s*/, "").trim())
      .filter(Boolean);
    const deLaCasa = [
      ...objetivos.filter((g) => marcadas.has(`o${g.idx}`)).map((g) => g.text),
      ...ideas.filter((n) => marcadas.has(`i${n.line}`)).map((n) => n.text),
    ];
    return [...new Set([...escritas, ...deLaCasa])];
  }, [texto, objetivos, ideas, marcadas]);

  const repartirYa = () => {
    if (!crudas.length || pensando) return;
    setPensando(true);
    setError(null);
    setReparto(null);
    const nombre = proyectos.find((p) => p.path === proyecto)?.name ?? "";
    // El objetivo escrito a mano (la Misión del Panel) entra en el contexto del
    // Capataz: sin él, cuatro líneas de rol sueltas no dicen PARA QUÉ es el
    // equipo, y las fronteras salen peor repartidas.
    const contexto = [
      nombre ? `Proyecto: ${nombre} (${proyecto})` : "Sin proyecto elegido",
      inicial?.objetivo ? `Objetivo del equipo: ${inicial.objetivo}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const lista = crudas.map((c, i) => `${i + 1}. ${c}`).join("\n");

    // La llamada y la foto del equipo van EN PARALELO, igual que en el
    // Asistente: mirar qué hay conectado tarda mucho menos que redactar.
    Promise.all([
      foremanLote(lista, contexto),
      mirarMundo(cuentas).catch(() => mundoEnCache(cuentas)),
    ])
      .then(([raw, vivas]) => {
        const { objetivo, tareas } = interpretarLote(raw, crudas);
        // Lo que escribió Munir manda sobre lo que deduzca el modelo: si él
        // dijo cuál era la misión, resumírsela de vuelta es cambiársela.
        const meta = inicial?.objetivo || objetivo;
        setObjetivoDelLote(meta);
        const conProyecto = tareas.map((t) => ({ ...t, proyecto: nombre }));
        const elMundo: Mundo = {
          cuentas: vivas,
          avisos: modoAviso(),
          usa: leerPerfil().clis,
        };
        setMundo(elMundo);
        setReparto(repartir(conProyecto, elMundo, meta, new Date().toLocaleString()));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setPensando(false));
  };

  /**
   * Llevarle la contraseña al router en un caso concreto.
   *
   * El reparto entero se rehace, no solo esa fila: cambiar un cerebro cambia lo
   * que pesa el lote, y el botón de abajo dice cuánto pesa. Enseñar «×22» con
   * un opus recién puesto a mano sería mentir en el único número que hay para
   * decidir si aceptas.
   *
   * Lo que NO se rehace es la clasificación: la exigencia de cada tarea ya está
   * calculada y no cambia porque tú prefieras otro modelo, así que aquí no se
   * gasta ni un token ni se vuelve a llamar al Capataz.
   */
  const cambiarCerebro = (i: number, pedido: ModelAlias | undefined) => {
    if (!reparto || !mundo) return;
    const tareas = reparto.puestos.map((p, j) =>
      j === i ? { ...p.tarea, pedido } : p.tarea,
    );
    setReparto(repartir(tareas, mundo, objetivoDelLote, new Date().toLocaleString()));
  };

  /** Abre el lote entero: primero el papel, luego la gente. */
  const abrirTodo = async () => {
    if (!reparto || abierto) return;
    setAbierto(true);
    try {
      if (proyecto) await escribirBuzon(proyecto, reparto.acta);
    } catch (e) {
      // Que el buzón falle no puede impedir trabajar: se avisa y se sigue, los
      // encargos ya llevan dentro quién hace qué.
      setError(`${t("No pude escribir el BUZON.md")}: ${String(e)}`);
    }
    // Una cuadrilla, no N terminales sueltas: el reparto ya sabe que estas
    // tareas van juntas, y hasta ahora esa información se perdía justo al
    // abrirlas. El escalonado lo hace `openTeam` (seis agentes arrancando a la
    // vez son medio giga de golpe y la ventana se queda tiesa).
    onAbrirLote(
      objetivoDelLote || inicial?.objetivo || t("varias tareas a la vez"),
      proyecto,
      reparto.puestos.map((p) => ({
        label: p.tarea.texto.split("\n")[0].slice(0, 40),
        prompt: p.prompt,
        rol: rolDePuesto(p.tarea),
        // El encargo humano, no el prompt: ese lleva dentro el acta, las
        // fronteras de los demás y las reglas, y en una fila del tablero no
        // se lee nada de eso.
        encargo: (p.tarea.encargo ?? p.tarea.texto).split("\n")[0],
        frontera: p.tarea.frontera,
        cli: p.receta.cli,
        model: p.receta.modelo,
        esfuerzo: p.receta.esfuerzo,
        cuenta: p.receta.cuenta,
      })),
    );
    inicial?.alAbrir?.();
    onClose();
  };

  const sobran = crudas.length > MAX_TAREAS;

  return (
    <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, onClose)}>
      <div className="modal reparto" onClick={(e) => e.stopPropagation()}>
        <header className="wiz-head">
          <h3 className="modal-title">{t("Repartir varias tareas")}</h3>
          <span className="rep-cuenta">
            {crudas.length
              ? t("{n} tareas", { n: crudas.length })
              : t("ninguna todavía")}
          </span>
        </header>

        {!reparto && (
          <>
            <p className="card-hint">
              {t(
                "Una tarea por línea. Se clasifican todas de una vez, cada una se abre con el cliente y el modelo que pide, y se atan por el BUZON.md del proyecto para que no se pisen.",
              )}
            </p>

            <textarea
              className="finder rep-texto"
              autoFocus
              rows={5}
              placeholder={t("arreglar el hover del botón\nescribir los tests del router\nauditar el login")}
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
            />

            {/* Los cuatro de siempre, a un clic. Añaden su línea al cuadro de
                arriba en vez de abrir nada: desde ahí siguen el mismo camino
                que cualquier tarea escrita a mano. */}
            <div className="rep-roles">
              <span className="rep-eti">{t("O monta un equipo")}</span>
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  className="mini rep-rol"
                  data-tip={r.desc}
                  onClick={() =>
                    setTexto((prev) =>
                      prev.split("\n").some((l) => l.trim().startsWith(`${r.key}:`))
                        ? prev
                        : `${prev.trimEnd()}${prev.trim() ? "\n" : ""}${r.key}: ${r.desc}\n`,
                    )
                  }
                >
                  + {t(r.key)}
                </button>
              ))}
            </div>

            <div className="rep-fila">
              <label className="rep-eti">{t("En el proyecto")}</label>
              <select
                className="finder rep-proyecto"
                value={proyecto}
                onChange={(e) => setProyecto(e.currentTarget.value)}
              >
                {proyectos.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {(objetivos.length > 0 || ideas.length > 0) && (
              <div className="rep-casa">
                <span className="rep-eti">{t("O coge lo que ya tienes apuntado")}</span>
                <div className="rep-lista">
                  {objetivos.map((g) => (
                    <label key={`o${g.idx}`} className="rep-item">
                      <input
                        type="checkbox"
                        checked={marcadas.has(`o${g.idx}`)}
                        onChange={() => marcar(`o${g.idx}`)}
                      />
                      <span className="rep-item-tag">{t("objetivo")}</span>
                      <span className="rep-item-txt">{g.text}</span>
                    </label>
                  ))}
                  {ideas.map((n) => (
                    <label key={`i${n.line}`} className="rep-item">
                      <input
                        type="checkbox"
                        checked={marcadas.has(`i${n.line}`)}
                        onChange={() => marcar(`i${n.line}`)}
                      />
                      <span className="rep-item-tag">{n.kind}</span>
                      <span className="rep-item-txt">
                        {n.text}
                        {n.project ? <em> · {n.project}</em> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {sobran && (
              <p className="onb-flojo">
                {t("Entran {n} de golpe; el resto se queda para la próxima tanda.", {
                  n: MAX_TAREAS,
                })}
              </p>
            )}
          </>
        )}

        {reparto && (
          <div className="rep-resultado">
            {objetivoDelLote && <p className="rep-objetivo">{objetivoDelLote}</p>}
            <ul className="rep-puestos">
              {reparto.puestos.map((p, i) => {
                const prov = providerOf(p.receta.cli);
                return (
                  <li key={i} className="rep-puesto">
                    <span className="rep-num">{i + 1}</span>
                    <div className="rep-cuerpo">
                      <p className="rep-tarea">{p.tarea.texto}</p>
                      <div className="rep-destino">
                        <span className="fm-pastilla fm-cli" style={{ ["--c" as string]: prov.hue }}>
                          <ProviderMark id={p.receta.cli} />
                          {prov.label}
                        </span>
                        {/* El cerebro se puede cambiar a mano. El router
                            acierta casi siempre, pero «casi siempre» no es
                            «siempre», y quien escribió la tarea sabe cosas que
                            no caben en su texto. Lo elegido manda sobre la
                            clasificación; la cuota sigue pudiendo bajarlo, que
                            eso no es una opinión sino lo que te queda. */}
                        {p.receta.modelo && (
                          <button
                            className="fm-pastilla fm-cerebro fm-cerebro-btn"
                            data-mano={!!p.tarea.pedido}
                            data-tip={
                              p.tarea.pedido
                                ? t("Lo elegiste tú. Pulsa para cambiarlo o volver al automático.")
                                : t("Lo eligió el router. Pulsa para llevarle la contraria.")
                            }
                            onClick={(e) =>
                              menu(e, [
                                { label: t("Qué cerebro le pones"), heading: true },
                                {
                                  label: t("Automático"),
                                  hint: t("lo que decida el router"),
                                  onClick: () => cambiarCerebro(i, undefined),
                                },
                                ...MODEL_ALIASES.map((m) => ({
                                  label: m,
                                  hint: pistaDeModelo(m, mundo),
                                  onClick: () => cambiarCerebro(i, m),
                                })),
                              ])
                            }
                          >
                            {p.receta.modelo}
                          </button>
                        )}
                        {p.receta.esfuerzo && (
                          <span className="fm-pastilla">{p.receta.esfuerzo}</span>
                        )}
                        {p.receta.cuenta && (
                          <span className="fm-pastilla">{p.receta.cuenta.label}</span>
                        )}
                      </div>
                      {p.tarea.frontera && (
                        <p className="rep-frontera">
                          {t("suyo")}: <code>{p.tarea.frontera}</code>
                        </p>
                      )}
                      {p.receta.porque.length > 0 && (
                        <p className="fm-porque">{p.receta.porque[p.receta.porque.length - 1]}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {reparto.avisos.map((a, i) => (
              <p key={i} className="fm-aviso">
                {a}
              </p>
            ))}
          </div>
        )}

        {error && <p className="onb-mal">{error}</p>}

        <footer className="onb-pie">
          <button className="mini" onClick={onClose}>
            {t("Cerrar")}
          </button>
          <div className="onb-nav">
            {reparto ? (
              <>
                <button className="mini" onClick={() => setReparto(null)}>
                  {t("Cambiar las tareas")}
                </button>
                <button className="np-btn" disabled={abierto} onClick={() => void abrirTodo()}>
                  {tituloDelReparto(reparto)}
                </button>
              </>
            ) : (
              <button className="np-btn" disabled={!crudas.length || pensando} onClick={repartirYa}>
                {pensando ? t("Repartiendo…") : t("Repartir")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
