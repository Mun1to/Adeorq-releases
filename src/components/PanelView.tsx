import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  listProjects,
  scanSessions,
  type Project,
  type SessionInfo,
} from "../lib/pty";
import { anadirProyecto, leerPerfil, raiz, sinRaiz } from "../lib/perfil";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { hueOf } from "../lib/colors";
import { useT } from "../lib/i18n";
import Secciones from "./Secciones";
import { IconoAhora, IconoProyectos } from "./IconosSeccion";

interface Props {
  onGoProject: (name: string) => void;
  onCreated: (name: string) => void;
  /** Para que el número de «trabajando ahora» lleve a verlas, y no sea un
      número que solo se mira. */
  onGoCabina: () => void;
  foremanCard: React.ReactNode;
}

export default function PanelView({
  onGoProject,
  onCreated,
  onGoCabina,
  foremanCard,
}: Props) {
  const { t } = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
    scanSessions().then(setSessions).catch(() => {});
  }, []);

  const fresh = useMemo(() => sessions.filter((s) => s.fresh !== "muerta"), [sessions]);
  const liveCount = useMemo(() => fresh.filter((s) => s.live).length, [fresh]);
  const hot = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of fresh) count.set(s.project, (count.get(s.project) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [fresh]);

  // Lo que de verdad hay que saber al abrir el panel: quién te espera y cuánta
  // gente hay fuera trabajando. Estaba todo dentro de las sesiones y no lo
  // miraba nadie: había que abrir la Cabina y repasar terminal por terminal.
  const esperando = useMemo(
    () => fresh.filter((s) => s.live && (s.state === "pregunta" || s.state === "ofrece")).length,
    [fresh],
  );
  const agentesFuera = useMemo(
    () => fresh.filter((s) => s.live).reduce((n, s) => n + s.agentsLive, 0),
    [fresh],
  );
  const proyectosTocados = useMemo(
    () => new Set(fresh.map((s) => s.project)).size,
    [fresh],
  );

  const nombre = leerPerfil().nombre.trim();

  // Un saludo que sabe la hora que es. Cuesta una línea y hace que el panel
  // parezca que está al tanto, en vez de decir «Hola» a las tres de la mañana.
  const saludo = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Aún en pie";
    if (h < 13) return "Buenos días";
    if (h < 21) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  // Y debajo, la frase que resume el estado. Se prefiere lo que TE TOCA a ti:
  // que alguien espere respuesta importa más que cuántos estén trabajando.
  const resumen = useMemo(() => {
    if (esperando > 0)
      return esperando === 1
        ? t("Una sesión espera respuesta tuya.")
        : t("{n} sesiones esperan respuesta tuya.", { n: esperando });
    if (liveCount > 0)
      return liveCount === 1
        ? t("Una sesión en marcha y nada pendiente de ti.")
        : t("{n} sesiones en marcha y nada pendiente de ti.", { n: liveCount });
    if (fresh.length > 0) return t("Todo tranquilo. Nada corriendo ahora mismo.");
    return t("Tu taller, a vista de pájaro.");
  }, [esperando, liveCount, fresh.length, t]);

  const crear = async () => {
    if (busy || !newName.trim()) return;
    // Sin carpeta madre no hay un «dentro de» que suponer, y suponerlo sería
    // crear el proyecto en la carpeta de usuario sin decirlo. Se pregunta.
    let donde: string | undefined;
    if (sinRaiz()) {
      const elegida = await pickFolder({
        directory: true,
        title: t("Dónde crear la carpeta del proyecto"),
      }).catch(() => null);
      if (typeof elegida !== "string") return;
      donde = elegida;
    }
    setBusy(true);
    setMsg(null);
    try {
      const p = await createProject(newName.trim(), donde);
      // Fuera de la carpeta madre no saldría solo en la lista: se apunta.
      if (donde) anadirProyecto(p.path);
      setMsg({
        ok: true,
        text: `${p.name} creado con AGENTS.md, docs/METAS.md, .gitignore${p.hasGit ? " y git" : ""}.`,
      });
      setNewName("");
      onCreated(p.name);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <header className="panel-hero">
        {/* El nombre sale del perfil: era «Munito» a fuego, así que la app
            saludaba al que la escribió en el ordenador de cualquiera. */}
        <h1>{nombre ? `${t(saludo)}, ${nombre}.` : `${t(saludo)}.`}</h1>
        <p>{resumen}</p>
      </header>

      {/* Los números de arriba dicen QUÉ HAY, no cuánto hay: cada uno lleva
          debajo el dato que hace falta para decidir si hay que hacer algo, y
          los que se pueden mirar por dentro llevan al sitio de un clic. Antes
          eran tres cifras sueltas que no llevaban a ninguna parte. */}
      <div className="stats">
        <button className="stat-card" data-live={liveCount > 0} onClick={onGoCabina}>
          <span className="stat-num">{liveCount}</span>
          <span className="stat-label">{t("trabajando ahora")}</span>
          <span className="stat-foot">
            {agentesFuera === 1
              ? t("un agente desplegado")
              : agentesFuera > 1
                ? t("{n} agentes desplegados", { n: agentesFuera })
                : liveCount > 0
                  ? t("sin subagentes fuera")
                  : t("nadie en marcha")}
          </span>
        </button>
        <div className="stat-card">
          <span className="stat-num">{esperando}</span>
          <span className="stat-label">{t("te esperan")}</span>
          <span className="stat-foot">
            {esperando > 0 ? t("han preguntado algo") : t("nada pendiente de ti")}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{fresh.length}</span>
          <span className="stat-label">{t("sesiones esta semana")}</span>
          <span className="stat-foot">
            {t("en {n} proyectos", { n: proyectosTocados })}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{projects.length}</span>
          <span className="stat-label">{t("proyectos")}</span>
          <span className="stat-foot">{sinRaiz() ? t("añadidos por ti") : raiz()}</span>
        </div>
      </div>

      <Secciones
        memoria="adeorq-panel-seccion"
        secciones={[
          { id: "ahora", label: "Ahora", icon: <IconoAhora />, badge: liveCount || "" },
          { id: "proyectos", label: "Proyectos", icon: <IconoProyectos />, badge: projects.length },
        ]}
      >
        {(activa) => (
          <>
            {activa === "ahora" && <SeccionAhora />}
            {activa === "proyectos" && <SeccionProyectos />}
          </>
        )}
      </Secciones>
    </div>
  );

  function SeccionAhora() {
    return (
      <>
        {foremanCard}
        <section className="panel-card">
          <h2>{t("Proyectos calientes")}</h2>
          <p className="card-hint">{t("Donde más se ha trabajado esta semana. Clic para ir.")}</p>
          <div className="hot-list">
            {hot.map(([name, n]) => (
              <button key={name} className="hot-item" onClick={() => onGoProject(name)}>
                <span className="ws-dot" style={{ background: hueOf(name) }} />
                <span className="hot-name">{name}</span>
                <span className="count">{n}</span>
              </button>
            ))}
            {hot.length === 0 && <p className="card-hint">{t("Sin actividad reciente.")}</p>}
          </div>
        </section>
      </>
    );
  }

  function SeccionProyectos() {
    return (
      <>
        <section className="panel-card">
          <h2>{t("＋ Nuevo proyecto")}</h2>
          <p className="card-hint">
            {sinRaiz()
              ? t(
                  "Eliges dónde crearla y nace con AGENTS.md (tus reglas), METAS.md y git, ya puesta en el panel.",
                )
              : t(
                  "Crea la carpeta en {d} con AGENTS.md (tus reglas), METAS.md y git, listo para la primera sesión.",
                  { d: raiz() },
                )}
          </p>
          <div className="np-row">
            <input
              className="finder"
              placeholder={t("Nombre del proyecto")}
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crear();
              }}
            />
            <button className="np-btn" disabled={busy || !newName.trim()} onClick={() => void crear()}>
              {t("Crear")}
            </button>
          </div>
          {msg && (
            <p className={msg.ok ? "np-ok" : "np-err"}>{msg.text}</p>
          )}
        </section>

        {/* La lista entera, no solo los seis calientes: esta sección va de
            elegir proyecto, y el de la semana pasada también cuenta. */}
        <section className="panel-card">
          <h2>{t("Todos tus proyectos")}</h2>
          <p className="card-hint">
            {sinRaiz()
              ? t("Los {n} que has añadido tú. Clic para ir a sus sesiones.", {
                  n: projects.length,
                })
              : t("Los {n} que hay en {d}. Clic para ir a sus sesiones.", {
                  n: projects.length,
                  d: raiz(),
                })}
          </p>
          <div className="hot-list">
            {projects.map((p) => (
              <button key={p.path} className="hot-item" onClick={() => onGoProject(p.name)}>
                <span className="ws-dot" style={{ background: hueOf(p.name) }} />
                <span className="hot-name">{p.name}</span>
                {p.hasGit && <span className="count">git</span>}
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

}
