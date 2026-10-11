// La campana de avisos, que es la mascota: vive en la barra de arriba, su
// postura dice lo más urgente de tus terminales, lleva encima el número de lo
// que te reclama y, al pulsarla, enseña la lista. Lo que decide está en
// `lib/campana.ts`; el dibujo, en `Mascota.tsx`.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCabina } from "../lib/cabina";
import { animoDe, conectarAvisos, sinLeer, useAvisos, type Animo, type Aviso } from "../lib/campana";
import { pendientes, useDecisiones } from "../lib/decisiones";
import { haceCuanto } from "../lib/estados";
import { useT, type Translate } from "../lib/i18n";
import { cortados } from "../lib/programados";
import { useSuena } from "../lib/suena";
import { useProgramados } from "./AgendaProgramados";
import { EstadoIcon } from "./Icons";
import Mascota from "./Mascota";

/** Lo que dice el globo de Adeo, según cómo esté. */
function pista(t: Translate, animo: Animo, cuantos: number, decisiones: number): string {
  const que =
    animo === "espera"
      ? cuantos > 1
        ? t("{n} terminales te reclaman", { n: cuantos })
        : t("Una terminal te espera")
      : animo === "duda"
        ? decisiones > 1
          ? t("{n} decisiones te esperan en la pestaña Decisiones", { n: decisiones })
          : t("Una decisión te espera en la pestaña Decisiones")
        : animo === "lista"
          ? t("Un agente ha terminado")
          : animo === "apurada"
            ? t("Un encargo programado se ha parado: míralo en la Agenda")
            : animo === "trabaja"
              ? t("Tus agentes están trabajando")
              : animo === "baila"
                ? t("Nada te reclama, y suena música")
                : animo === "dormida"
                  ? t("No hay terminales abiertas")
                  : t("Nada te reclama ahora");
  return `${que}\n${t("Soy Adeo. Clic: ver los avisos")}`;
}

export default function Campana({
  irATerminal,
  enfocado,
}: {
  irATerminal: (id: number) => void;
  /** La terminal en la que estás: al entrar en una, su «terminó» ya está visto. */
  enfocado: number | null;
}) {
  const { t } = useT();
  const lista = useAvisos((s) => s.lista);
  const vista = useAvisos((s) => s.vista);
  const entrar = useAvisos((s) => s.entrar);
  const estados = useCabina((s) => s.estados);
  const [abierta, setAbierta] = useState(false);
  const [sitio, setSitio] = useState({ x: 12, y: 46 });
  /** Sube con cada pulsación: la mascota da un brinco. */
  const [toque, setToque] = useState(0);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => conectarAvisos(), []);
  // Solo al CAMBIAR de terminal, que es algo que haces tú: si un agente termina
  // en la que ya tenías delante, puede que no estés mirando.
  useEffect(() => {
    if (enfocado != null) entrar(enfocado);
  }, [enfocado, entrar]);

  // Lo que Adeo sabe además de las terminales: las decisiones que siguen
  // vivas, los encargos programados que el freno paró y si suena música.
  const decisiones = pendientes(useDecisiones());
  const [programados] = useProgramados();
  const suena = useSuena((s) => s.suena);
  const cuantos = sinLeer(lista);
  const animo = animoDe(lista, estados, { decisiones, cortados: programados ? cortados(programados.encargos) : 0, suena });

  const cerrar = () => {
    setAbierta(false);
    // Se dan por vistos al CERRAR, no al abrir: mientras miras la lista, los
    // nuevos siguen marcados como nuevos y los que terminaron siguen ahí.
    vista();
  };
  const alternar = () => {
    setToque((n) => n + 1);
    if (abierta) return cerrar();
    const r = boton.current?.getBoundingClientRect();
    if (r) setSitio({ x: Math.max(8, r.left), y: r.bottom + 8 });
    setAbierta(true);
  };

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !boton.current?.contains(n)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
    };
    window.addEventListener("mousedown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("mousedown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
    };
    // `cerrar` cambia en cada pintado y no hace falta reenganchar por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const visibles = lista.slice().reverse();
  const ahora = Date.now();
  const ir = (a: Aviso) => {
    irATerminal(a.paneId);
    cerrar();
  };

  return (
    <>
      <button
        ref={boton}
        className="campana"
        data-abierta={abierta || undefined}
        data-tip={abierta ? undefined : pista(t, animo, cuantos, decisiones)}
        aria-label={t("Adeo: avisos")}
        aria-expanded={abierta}
        onClick={() => alternar()}
      >
        <Mascota animo={animo} toque={toque} />
        {cuantos > 0 && <span className="campana-n">{cuantos}</span>}
      </button>
      {abierta &&
        // Fuera de la barra: la barra recorta lo que se sale de ella, y su
        // cristal (`backdrop-filter`) hace de caja también para lo fijo.
        createPortal(
          <div ref={panel} className="avisos" role="dialog" aria-label={t("Avisos")} style={{ left: sitio.x, top: sitio.y }}>
            <header className="avisos-cab">
              <b>{t("Avisos")}</b>
            </header>
            {visibles.length === 0 ? (
              <div className="avisos-vacio">
                <Mascota animo={animo === "dormida" ? "dormida" : "quieta"} alto={56} />
                <p>{t("Nada te reclama ahora.")}</p>
              </div>
            ) : (
              <ul className="avisos-lista">
                {visibles.map((a) => {
                  const hace = haceCuanto(ahora - a.cuando);
                  return (
                    <li key={a.n}>
                      <button className="aviso" data-tipo={a.tipo} data-nuevo={!a.leido || undefined} onClick={() => ir(a)}>
                        <span className="aviso-icono">
                          <EstadoIcon estado={a.tipo === "hecho" ? "lista" : "pregunta"} size={15} />
                        </span>
                        <span className="aviso-cuerpo">
                          <span className="aviso-nombre">
                            {a.nombre}
                            <em>{a.tipo === "hecho" ? t("terminó") : t("te espera")}</em>
                          </span>
                          {a.porque && <span className="aviso-porque">{a.porque}</span>}
                        </span>
                        <span className="aviso-cuando">{hace || t("ahora")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
