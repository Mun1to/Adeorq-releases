// La campana de avisos, que es la mascota: vive en la barra de arriba, su
// postura dice lo más urgente de tus terminales, lleva encima el número de lo
// que te reclama y, al pulsarla, enseña la lista. Lo que decide está en
// `lib/campana.ts`; el dibujo, en `Mascota.tsx`.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCabina } from "../lib/cabina";
import { animoDe, conectarAvisos, sinLeer, useAvisos, type Animo, type Aviso } from "../lib/campana";
import { haceCuanto } from "../lib/estados";
import { useT, type Translate } from "../lib/i18n";
import { EstadoIcon } from "./Icons";
import Mascota from "./Mascota";

/** Lo que dice el globo de la mascota, según cómo esté. */
function pista(t: Translate, animo: Animo, cuantos: number): string {
  const que =
    animo === "espera"
      ? cuantos > 1
        ? t("{n} terminales te reclaman", { n: cuantos })
        : t("Una terminal te espera")
      : animo === "lista"
        ? t("Un agente ha terminado")
        : animo === "trabaja"
          ? t("Tus agentes están trabajando")
          : animo === "dormida"
            ? t("No hay terminales abiertas")
            : t("Nada te reclama ahora");
  return `${que}\n${t("Clic: ver los avisos")}`;
}

export default function Campana({ irATerminal }: { irATerminal: (id: number) => void }) {
  const { t } = useT();
  const lista = useAvisos((s) => s.lista);
  const marcarLeidos = useAvisos((s) => s.marcarLeidos);
  const vaciar = useAvisos((s) => s.vaciar);
  const estados = useCabina((s) => s.estados);
  const [abierta, setAbierta] = useState(false);
  const [soloAhora, setSoloAhora] = useState(false);
  const [sitio, setSitio] = useState({ x: 12, y: 46 });
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => conectarAvisos(), []);

  const cuantos = sinLeer(lista);
  const animo = animoDe(lista, estados);

  const cerrar = () => {
    setAbierta(false);
    // Se dan por leídos al CERRAR, no al abrir: mientras miras la lista, los
    // nuevos siguen marcados como nuevos.
    marcarLeidos();
  };
  const alternar = () => {
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

  const visibles = (soloAhora ? lista.filter((a) => a.vigente) : lista).slice().reverse();
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
        data-tip={abierta ? undefined : pista(t, animo, cuantos)}
        aria-label={t("Avisos")}
        aria-expanded={abierta}
        onClick={() => alternar()}
      >
        <Mascota animo={animo} />
        {cuantos > 0 && <span className="campana-n">{cuantos}</span>}
      </button>
      {abierta &&
        // Fuera de la barra: la barra recorta lo que se sale de ella, y su
        // cristal (`backdrop-filter`) hace de caja también para lo fijo.
        createPortal(
          <div ref={panel} className="avisos" role="dialog" aria-label={t("Avisos")} style={{ left: sitio.x, top: sitio.y }}>
            <header className="avisos-cab">
              <b>{t("Avisos")}</b>
              <span className="avisos-filtros">
                <button className="choice" data-on={!soloAhora} onClick={() => setSoloAhora(false)}>
                  {t("Todos")}
                </button>
                <button className="choice" data-on={soloAhora} onClick={() => setSoloAhora(true)}>
                  {t("Ahora")}
                </button>
              </span>
            </header>
            {visibles.length === 0 ? (
              <div className="avisos-vacio">
                <Mascota animo={animo === "dormida" ? "dormida" : "quieta"} alto={52} />
                <p>{soloAhora || lista.length === 0 ? t("Nada te reclama ahora.") : t("Sin avisos.")}</p>
              </div>
            ) : (
              <ul className="avisos-lista">
                {visibles.map((a) => {
                  const esta = a.paneId in estados;
                  const hace = haceCuanto(ahora - a.cuando);
                  return (
                    <li key={a.n}>
                      <button
                        className="aviso"
                        data-tipo={a.tipo}
                        data-vigente={a.vigente}
                        data-nuevo={!a.leido || undefined}
                        disabled={!esta}
                        onClick={() => ir(a)}
                      >
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
                        <span className="aviso-cuando">{esta ? hace || t("ahora") : t("cerrada")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {lista.some((a) => !a.vigente) && (
              <footer className="avisos-pie">
                <button className="mini" onClick={() => vaciar()}>
                  {t("Quitar los que ya pasaron")}
                </button>
              </footer>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
