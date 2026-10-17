import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  listProjects,
  projectIcons,
  scanSessions,
  type Account,
  type Project,
  type SessionInfo,
} from "../lib/pty";
import { anadirProyecto, leerPerfil, sinRaiz } from "../lib/perfil";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import { usePartes } from "../lib/partes";
import { dejarPedido } from "../lib/conserje";
import type { Animo } from "../lib/campana";
import type { View } from "../lib/vistas";
import Mascota from "./Mascota";
import ProjectAvatar from "./ProjectAvatar";
import PanelPedir from "./PanelPedir";
import PanelUso from "./PanelUso";
import { ChevronIcon, PlusIcon } from "./Icons";

/* La pestaña de inicio, desde el 2026-10-17: Adeo a la izquierda con una sola
   caja para pedirle cosas, y a la derecha tus proyectos y tu uso. Munir eligió
   esta forma entre cuatro (la 2, «Pídeselo a Adeo», con «tus proyectos y tus
   estadísticas» a la derecha) después de decir del Panel de antes que eran
   «demasiadas cosas a la vez»: cuatro cifras en caja, un índice de dos
   secciones, la tarjeta entera del Capataz y los proyectos calientes. */

interface Props {
  onGoProject: (name: string) => void;
  onCreated: (name: string) => void;
  /** Ir a una sesión: la que te pregunta algo, con «Contestar». */
  onResume: (s: SessionInfo) => void;
  /** Ir a otra pestaña: la Cabina, el Chat con lo que pediste, tu uso. */
  irA: (v: View) => void;
  /** Las cuentas, para leer tu uso. */
  cuentas: Account[];
}

/** Una sesión viva que te ha preguntado algo o espera tu OK. */
const reclama = (s: SessionInfo) => s.live && (s.state === "pregunta" || s.state === "ofrece");

export default function PanelView({ onGoProject, onCreated, onResume, irA, cuentas }: Props) {
  const { t } = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [iconos, setIconos] = useState<Record<string, string>>({});
  const [todos, setTodos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [toque, setToque] = useState(0);
  const [apagadas] = usePartes();
  useEffect(() => {
    listProjects()
      .then((ps) => {
        setProjects(ps);
        projectIcons(ps.map((p) => p.path))
          .then(setIconos)
          .catch(() => {});
      })
      .catch(() => {});
    scanSessions().then(setSessions).catch(() => {});
  }, []);

  const fresh = useMemo(() => sessions.filter((s) => s.fresh !== "muerta"), [sessions]);
  const liveCount = useMemo(() => fresh.filter((s) => s.live).length, [fresh]);
  const esperan = useMemo(() => fresh.filter(reclama), [fresh]);

  // Lo de cada proyecto esta semana: cuántas tiene en marcha, si alguna te
  // espera y cuándo fue lo último.
  const porProyecto = useMemo(() => {
    const m = new Map<string, { vivas: number; espera: boolean; ultima: number }>();
    for (const s of fresh) {
      const e = m.get(s.project) ?? { vivas: 0, espera: false, ultima: 0 };
      if (s.live) e.vivas++;
      if (reclama(s)) e.espera = true;
      e.ultima = Math.max(e.ultima, s.mtime ?? 0);
      m.set(s.project, e);
    }
    return m;
  }, [fresh]);

  // Primero los que te esperan, luego los que tienen a alguien dentro y luego
  // por lo último que pasó. Los demás, por nombre, detrás de «Ver los N».
  const activos = useMemo(() => {
    const rango = (n: string) => {
      const e = porProyecto.get(n);
      return e?.espera ? 2 : e?.vivas ? 1 : 0;
    };
    return projects
      .filter((p) => porProyecto.has(p.name))
      .sort((a, b) => rango(b.name) - rango(a.name) || porProyecto.get(b.name)!.ultima - porProyecto.get(a.name)!.ultima);
  }, [projects, porProyecto]);
  const resto = useMemo(
    () => projects.filter((p) => !porProyecto.has(p.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects, porProyecto],
  );
  const lista = todos ? [...activos, ...resto] : activos.length ? activos : resto.slice(0, 8);

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

  // Y debajo, la frase que resume el estado. Lo que TE TOCA a ti no va aquí:
  // va en su propia línea, con su botón, en el sitio de esta.
  const resumen = useMemo(() => {
    if (liveCount > 0)
      return liveCount === 1
        ? t("Una sesión en marcha y nada pendiente de ti.")
        : t("{n} sesiones en marcha y nada pendiente de ti.", { n: liveCount });
    if (fresh.length > 0) return t("Todo tranquilo. Nada corriendo ahora mismo.");
    return t("Tu taller, a vista de pájaro.");
  }, [liveCount, fresh.length, t]);

  // Adeo dice lo mismo que la frase: te llama si alguien espera y teclea si
  // hay alguien trabajando.
  const animo: Animo = esperan.length ? "espera" : liveCount ? "trabaja" : "quieta";

  const iconoDe = (proyecto: string) => iconos[projects.find((p) => p.name === proyecto)?.path ?? ""];

  const cuandoFue = (segundos: number) => {
    const a = hace(segundos * 1000);
    return t(a.clave, { n: a.valor });
  };

  const pedir = (texto: string) => {
    dejarPedido(texto);
    irA("chat");
  };

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
      setCreando(false);
      onCreated(p.name);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel inicio">
      <div className="inicio-izq">
        <div className="inicio-centro">
          <button type="button" className="inicio-adeo" aria-label="Adeo" onClick={() => setToque((n) => n + 1)}>
            <Mascota animo={animo} alto={98} toque={toque} />
          </button>
          {/* El nombre sale del perfil: era «Munito» a fuego, así que la app
              saludaba al que la escribió en el ordenador de cualquiera. */}
          <h1>{nombre ? `${t(saludo)}, ${nombre}.` : `${t(saludo)}.`}</h1>
          {esperan.length > 0 ? (
            <div className="inicio-aviso">
              <ProjectAvatar name={esperan[0].project} src={iconoDe(esperan[0].project)} />
              <span className="inicio-aviso-txt">
                {esperan.length === 1
                  ? t("«{s}» te pregunta algo.", { s: esperan[0].title })
                  : t("«{s}» y {n} más te esperan.", { s: esperan[0].title, n: esperan.length - 1 })}
              </span>
              <button type="button" className="np-btn" onClick={() => onResume(esperan[0])}>
                {t("Contestar")}
              </button>
            </div>
          ) : (
            <button type="button" className="inicio-estado" onClick={() => irA("cabina")}>
              {resumen}
              <ChevronIcon der size={15} />
            </button>
          )}
          {/* Con el Chat apagado (`lib/partes.ts`) no hay conserje al que pedir. */}
          {!apagadas.includes("chat") && <PanelPedir onPedir={pedir} />}
        </div>
      </div>

      <aside className="inicio-der">
        <section className="panel-card inicio-card" aria-label={t("Tus proyectos")}>
          <h2 className="inicio-tit">{t("Tus proyectos")}</h2>
          <div className="inicio-proys" data-todos={todos || undefined}>
            {lista.map((p) => {
              const e = porProyecto.get(p.name);
              return (
                <button key={p.path} type="button" className="inicio-proy" onClick={() => onGoProject(p.name)}>
                  <ProjectAvatar name={p.name} src={iconos[p.path]} />
                  <span className="inicio-proy-n">{p.name}</span>
                  {e?.espera ? (
                    <span className="inicio-proy-e" data-estado="espera">
                      {t("te pregunta algo")}
                    </span>
                  ) : e?.vivas ? (
                    <span className="inicio-proy-e" data-estado="vivo">
                      {e.vivas === 1 ? t("una trabajando") : t("{n} trabajando", { n: e.vivas })}
                    </span>
                  ) : e?.ultima ? (
                    <span className="inicio-proy-e">{cuandoFue(e.ultima)}</span>
                  ) : null}
                </button>
              );
            })}
            {projects.length === 0 && <p className="card-hint">{t("Todavía no tienes proyectos: crea el primero.")}</p>}
          </div>
          {creando && (
            <div className="np-row inicio-crear">
              <input
                className="finder"
                id="inicio-nuevo-proyecto"
                autoFocus
                placeholder={t("Nombre del proyecto")}
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void crear();
                  if (e.key === "Escape") setCreando(false);
                }}
              />
              <button type="button" className="np-btn" disabled={busy || !newName.trim()} onClick={() => void crear()}>
                {t("Crear")}
              </button>
            </div>
          )}
          {msg && <p className={msg.ok ? "np-ok" : "np-err"}>{msg.text}</p>}
          <div className="inicio-pie">
            {resto.length > 0 && (
              <button type="button" className="inicio-enlace" onClick={() => setTodos((v) => !v)}>
                {todos ? t("Ver menos") : t("Ver los {n}", { n: projects.length })}
                {!todos && <ChevronIcon der size={15} />}
              </button>
            )}
            <button type="button" className="inicio-enlace" onClick={() => setCreando((v) => !v)}>
              <PlusIcon size={15} />
              {t("Nuevo proyecto")}
            </button>
          </div>
        </section>
        <PanelUso cuentas={cuentas} onVer={() => irA("perfil")} />
      </aside>
    </div>
  );
}
