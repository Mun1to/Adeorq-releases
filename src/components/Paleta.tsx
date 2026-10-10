// La paleta: Ctrl+K, escribes, Enter. Qué entradas hay y cómo se filtran está
// en `lib/paleta.ts`, con el porqué de que exista.
//
// Tiene un segundo modo, el de Ctrl+P: abrir un archivo del proyecto escribiendo
// parte de su nombre (`lib/abrirPorNombre.ts`). Es la misma caja y las mismas
// teclas; cambia la lista.

import { useEffect, useMemo, useRef, useState } from "react";
import { filtrarArchivos, rutaEntera } from "../lib/abrirPorNombre";
import { listarNombres } from "../lib/archivos";
import { useT } from "../lib/i18n";
import { entradasDeLaPaleta, filtrarPaleta, type Entrada } from "../lib/paleta";
import { listProjects, type Project } from "../lib/pty";
import { PESTANAS, type View } from "../lib/vistas";

interface Props {
  panes: Array<{ id: number; name: string }>;
  delLienzo: Array<{ id: number; name: string }>;
  irA: (view: View) => void;
  abrirProyecto: (name: string, cwd: string) => void;
  irATerminal: (id: number, enLienzo: boolean) => void;
  /** La carpeta del proyecto que tienes delante, que es donde se buscan los
      archivos de Ctrl+P. Vacía si no hay ninguno. */
  raiz: string;
  abrirArchivo: (ruta: string) => void;
}

type Modo = "comandos" | "archivos";

export default function Paleta({ panes, delLienzo, irA, abrirProyecto, irATerminal, raiz, abrirArchivo }: Props) {
  const { t } = useT();
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState<Modo>("comandos");
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState(0);
  const [proyectos, setProyectos] = useState<Project[]>([]);
  /** Los archivos del proyecto, o `null` mientras se piden. */
  const [nombres, setNombres] = useState<string[] | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  /** Quién tenía el teclado al abrirla, para devolvérselo al cerrar. */
  const antes = useRef<HTMLElement | null>(null);
  /** El modo de este instante, para el oyente de teclas, que se engancha una vez. */
  const modoRef = useRef(modo);
  modoRef.current = modo;

  // Ctrl+K, estés donde estés. En captura y cortando el paso: dentro de una
  // terminal esa tecla le llegaba al shell (borra hasta el final de la línea),
  // y aquí manda la paleta, que es lo que hace también VS Code con la suya.
  //
  // Ctrl+P NO se le quita a una terminal: ahí es del programa (en un shell y en
  // Claude Code es «la orden anterior»), y con Ctrl+F y Ctrl+K ya son dos las
  // que se le quitan. Desde una terminal se llega por Ctrl+K, que trae «Abrir
  // un archivo por su nombre». Fuera de ellas sí, y de paso deja de abrir el
  // diálogo de imprimir del navegador de dentro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla !== "k" && tecla !== "p") return;
      const pide: Modo = tecla === "k" ? "comandos" : "archivos";
      if (pide === "archivos" && (e.target as HTMLElement | null)?.closest?.(".xterm")) return;
      e.preventDefault();
      e.stopPropagation();
      setAbierta((v) => {
        if (!v) antes.current = document.activeElement as HTMLElement | null;
        // La misma tecla la cierra; la otra, con la paleta abierta, la cambia de modo.
        return !v || pide !== modoRef.current;
      });
      setModo(pide);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Nace vacía cada vez, y pregunta por los proyectos al abrirse y no antes:
  // uno recién creado tiene que salir, y cerrada no cuesta nada. Lo mismo los
  // archivos: se piden al entrar en su modo, que un agente los crea y los borra.
  useEffect(() => {
    if (!abierta) return;
    setQ("");
    setElegido(0);
    let viva = true;
    if (modo === "comandos") {
      listProjects()
        .then((p) => {
          if (viva) setProyectos(p);
        })
        .catch(() => {});
    } else {
      setNombres(null);
      (raiz ? listarNombres(raiz) : Promise.resolve([]))
        .then((n) => {
          if (viva) setNombres(n);
        })
        .catch(() => viva && setNombres([]));
    }
    return () => {
      viva = false;
    };
  }, [abierta, modo, raiz]);

  const entradas = useMemo(
    () => (abierta && modo === "comandos" ? entradasDeLaPaleta({ pestanas: PESTANAS, proyectos, panes, delLienzo }, t) : []),
    [abierta, modo, proyectos, panes, delLienzo, t],
  );
  const hallados = useMemo(
    () => (abierta && modo === "archivos" ? filtrarArchivos(nombres ?? [], q) : []),
    [abierta, modo, nombres, q],
  );
  // Las dos listas, con la misma forma, para que flechas y Enter no sepan de modos.
  const quedan: Entrada[] = useMemo(
    () =>
      modo === "comandos"
        ? filtrarPaleta(entradas, q)
        : hallados.map((a) => ({ id: `archivo:${a.ruta}`, grupo: a.carpeta, texto: a.nombre, accion: { tipo: "archivo", ruta: a.ruta } })),
    [modo, entradas, hallados, q],
  );
  const marcada = Math.min(elegido, Math.max(0, quedan.length - 1));

  useEffect(() => {
    lista.current?.children[marcada]?.scrollIntoView({ block: "nearest" });
  }, [marcada]);

  if (!abierta) return null;

  const cerrar = () => {
    setAbierta(false);
    antes.current?.focus();
  };
  const lanzar = (e: Entrada) => {
    const a = e.accion;
    // De los comandos a los archivos sin cerrar: es la misma caja.
    if (a.tipo === "archivos") return setModo("archivos");
    if (a.tipo === "archivo") {
      setAbierta(false);
      return abrirArchivo(rutaEntera(raiz, a.ruta));
    }
    if (a.tipo === "atajo") {
      // El atajo actúa sobre el panel que tenía el teclado: se le devuelve
      // antes de pulsarlo por él.
      cerrar();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: a.key, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
      return;
    }
    setAbierta(false);
    if (a.tipo === "vista") irA(a.view);
    else if (a.tipo === "proyecto") abrirProyecto(a.name, a.cwd);
    else irATerminal(a.id, a.enLienzo);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cerrar();
    else if (e.key === "ArrowDown") setElegido(Math.min(marcada + 1, quedan.length - 1));
    else if (e.key === "ArrowUp") setElegido(Math.max(marcada - 1, 0));
    else if (e.key === "Enter" && quedan[marcada]) lanzar(quedan[marcada]);
    else return;
    e.preventDefault();
  };

  return (
    <div className="paleta" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="paleta-caja" role="dialog" aria-label={modo === "comandos" ? t("Comandos") : t("Abrir un archivo por su nombre")}>
        <input
          // Con su modo de clave: al cambiar de comandos a archivos nace otra
          // caja, vacía y con el teclado dentro.
          key={modo}
          className="paleta-input"
          autoFocus
          value={q}
          placeholder={modo === "comandos" ? t("Qué quieres hacer") : t("Qué archivo abro")}
          aria-label={modo === "comandos" ? t("Buscar un comando") : t("Buscar un archivo por su nombre")}
          onChange={(e) => {
            setQ(e.target.value);
            setElegido(0);
          }}
          onKeyDown={(e) => tecla(e)}
        />
        <ul className="paleta-lista" role="listbox" ref={lista}>
          {quedan.map((e, i) => (
            <li
              key={e.id}
              className="paleta-fila"
              role="option"
              aria-selected={i === marcada}
              onMouseMove={() => setElegido(i)}
              onClick={() => lanzar(e)}
            >
              <span className="paleta-texto">{e.texto}</span>
              {e.atajo ? <kbd>{e.atajo}</kbd> : <span className="paleta-que">{e.grupo}</span>}
            </li>
          ))}
          {quedan.length === 0 && (
            <li className="paleta-vacio">
              {modo === "comandos"
                ? t("No encuentro eso.")
                : !raiz
                  ? t("Abre un proyecto para ver sus archivos.")
                  : nombres === null
                    ? t("Leyendo…")
                    : t("No hay ningún archivo con ese nombre.")}
            </li>
          )}
        </ul>
        <footer className="paleta-pie">{t("↑↓ para moverte · Enter para ir · Esc para cerrar")}</footer>
      </div>
    </div>
  );
}
