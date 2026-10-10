// La paleta de comandos: Ctrl+K, escribes, Enter. Qué entradas hay y cómo se
// filtran está en `lib/paleta.ts`, con el porqué de que exista.

import { useEffect, useMemo, useRef, useState } from "react";
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
}

export default function Paleta({ panes, delLienzo, irA, abrirProyecto, irATerminal }: Props) {
  const { t } = useT();
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState(0);
  const [proyectos, setProyectos] = useState<Project[]>([]);
  const lista = useRef<HTMLUListElement>(null);
  /** Quién tenía el teclado al abrirla, para devolvérselo al cerrar. */
  const antes = useRef<HTMLElement | null>(null);

  // Ctrl+K, estés donde estés. En captura y cortando el paso: dentro de una
  // terminal esa tecla le llegaba al shell (borra hasta el final de la línea),
  // y aquí manda la paleta, que es lo que hace también VS Code con la suya.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      e.stopPropagation();
      setAbierta((v) => {
        if (!v) antes.current = document.activeElement as HTMLElement | null;
        return !v;
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Nace vacía cada vez, y pregunta por los proyectos al abrirse y no antes:
  // uno recién creado tiene que salir, y cerrada no cuesta nada.
  useEffect(() => {
    if (!abierta) return;
    setQ("");
    setElegido(0);
    let viva = true;
    listProjects()
      .then((p) => {
        if (viva) setProyectos(p);
      })
      .catch(() => {});
    return () => {
      viva = false;
    };
  }, [abierta]);

  const entradas = useMemo(
    () => (abierta ? entradasDeLaPaleta({ pestanas: PESTANAS, proyectos, panes, delLienzo }, t) : []),
    [abierta, proyectos, panes, delLienzo, t],
  );
  const quedan = useMemo(() => filtrarPaleta(entradas, q), [entradas, q]);
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
      <div className="paleta-caja" role="dialog" aria-label={t("Comandos")}>
        <input
          className="paleta-input"
          autoFocus
          value={q}
          placeholder={t("Qué quieres hacer")}
          aria-label={t("Buscar un comando")}
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
          {quedan.length === 0 && <li className="paleta-vacio">{t("No encuentro eso.")}</li>}
        </ul>
        <footer className="paleta-pie">{t("↑↓ para moverte · Enter para ir · Esc para cerrar")}</footer>
      </div>
    </div>
  );
}
