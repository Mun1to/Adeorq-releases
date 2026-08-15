// El árbol de archivos del proyecto, en la barra de la derecha.
//
// Lee UNA carpeta cada vez, la que acabas de desplegar: un explorador que
// escanea el proyecto entero para pintar doce filas se hace esperar por nada
// (ver `docs/ARCHIVOS.md`). Toda la lógica de qué se ve y qué pasa al plegar
// está en `lib/arbol.ts`, con sus casos en `scripts/arbol-check.ts`; aquí solo
// queda pedir y pintar.

import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { listarCarpeta } from "../lib/archivos";
import { filasVisibles, nombreDeRuta, plegar, type Leidas } from "../lib/arbol";
import { ChevronIcon } from "./Icons";

interface Props {
  /** La carpeta que se enseña. Viene de fuera porque el explorador SIGUE a lo
      que estés haciendo: la terminal que tienes delante manda. */
  raiz: string;
  /** Abrir un archivo. Lo que se hace con él lo decide quien llama. */
  onAbrir: (ruta: string) => void;
  /** El que está abierto ahora, para marcarlo en la lista. */
  abierto?: string | null;
}

export default function ArchivosPanel({ raiz, onAbrir, abierto }: Props) {
  const { t } = useT();
  const [leidas, setLeidas] = useState<Leidas>(new Map());
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const leer = useCallback(async (ruta: string) => {
    try {
      const c = await listarCarpeta(ruta);
      setLeidas((prev) => new Map(prev).set(ruta, c.filas));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Al cambiar de proyecto se empieza de cero: las carpetas abiertas del
  // anterior no existen en este, y arrastrarlas dejaría filas fantasma.
  useEffect(() => {
    if (!raiz) return;
    setLeidas(new Map());
    setCargando(true);
    leer(raiz).finally(() => setCargando(false));
  }, [raiz, leer]);

  const alternar = (ruta: string, desplegada: boolean) => {
    if (desplegada) setLeidas((prev) => plegar(prev, ruta));
    else void leer(ruta);
  };

  const filas = filasVisibles(leidas, raiz);

  if (!raiz) {
    return <p className="arch-vacio">{t("Abre un proyecto para ver sus archivos.")}</p>;
  }

  return (
    <div className="arch">
      <div className="arch-raiz" data-tip={raiz}>
        {nombreDeRuta(raiz)}
      </div>

      <div className="arch-arbol">
        {filas.map((f) => (
          <button
            key={f.ruta}
            className="arch-fila"
            data-carpeta={f.carpeta}
            data-on={abierto === f.ruta}
            style={{ paddingLeft: 8 + f.hondo * 13 }}
            title={f.nombre}
            onClick={() => (f.carpeta ? alternar(f.ruta, f.desplegada) : onAbrir(f.ruta))}
          >
            <span className="arch-ico">
              {f.carpeta ? <ChevronIcon size={11} up={f.desplegada} /> : null}
            </span>
            <span className="arch-nom">{f.nombre}</span>
          </button>
        ))}

        {!filas.length && !cargando && (
          <p className="arch-vacio">{t("Esta carpeta está vacía.")}</p>
        )}
        {cargando && !filas.length && <p className="arch-vacio">{t("Leyendo…")}</p>}
        {error && <p className="side-error">{error}</p>}
      </div>
    </div>
  );
}
