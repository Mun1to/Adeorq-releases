// El árbol de archivos del proyecto, en la barra de la derecha.
//
// Lee UNA carpeta cada vez, la que acabas de desplegar: un explorador que
// escanea el proyecto entero para pintar doce filas se hace esperar por nada
// (ver `docs/ARCHIVOS.md`). Toda la lógica de qué se ve y qué pasa al plegar
// está en `lib/arbol.ts`, con sus casos en `scripts/arbol-check.ts`; aquí solo
// queda pedir y pintar.
//
// Y se pone al día solo (Munir, 2026-10-08: «que se vaya actualizando en tiempo
// real, y colores de estado»). Mientras está a la vista vuelve a leer cada
// `REFRESCO_MS` las carpetas que tienes desplegadas y le pregunta a git qué está
// distinto del último commit; cada fila lleva el color de su estado y un punto,
// y arriba se cuenta cuántos hay de cada uno. Qué estado gana está en
// `lib/estadoArchivos.ts`, con sus casos en `scripts/estado-archivos-check.ts`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { estadoArchivos, listarCarpeta, type EstadoArchivos } from "../lib/archivos";
import { conBorrados, filasVisibles, nombreDeRuta, plegar, rutaCorta, type Fila, type Leidas } from "../lib/arbol";
import {
  borradosDe,
  clave,
  contar,
  ESTADOS,
  estadoDeCarpeta,
  estadosDe,
  letrasDe,
  type EstadoArchivo,
  type LetraGit,
} from "../lib/estadoArchivos";
import { acabaDeArrastrar, lineaDeRuta, vigilarArrastre } from "../lib/arrastrarRuta";
import { useCabina } from "../lib/cabina";
import { writePty } from "../lib/pty";
import { tipoDeArchivo } from "../lib/tipoArchivo";
import IconoArchivo from "./IconoArchivo";
import { ChevronIcon, DuplicarIcon, ExternalIcon, FolderIcon } from "./Icons";
import { useMenu, type MenuItem } from "./Overlays";
import { SOLTADO_EVENTO } from "./TerminalPane";

/**
 * Lo que pasa al soltar un archivo del árbol sobre una terminal: lo mismo que
 * al soltar uno traído de fuera de la ventana (`App.tsx`). Su ruta queda
 * escrita, sin Intro; la terminal se entera por el mismo aviso (y dice, si es
 * una imagen y su CLI no lee rutas, que esa no la va a ver), y se queda con el
 * teclado para que sigas escribiendo.
 */
function soltarRutaEn(panel: number, destino: HTMLElement, ruta: string): void {
  void writePty(panel, lineaDeRuta(ruta)).catch(() => {});
  window.dispatchEvent(new CustomEvent(SOLTADO_EVENTO, { detail: { id: panel, paths: [ruta] } }));
  // El panel coge el foco como si lo hubieras pulsado, y su terminal el teclado.
  destino.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  destino.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus();
}

/** Cada cuánto se vuelve a mirar el disco y git mientras el panel está a la vista. */
const REFRESCO_MS = 2_500;

/** Qué significa cada color, en el globo del punto y de la cuenta de arriba. */
const QUE_ES: Record<EstadoArchivo, string> = {
  conflicto: "En conflicto: git no sabe juntar los cambios",
  tocando: "Se está escribiendo ahora mismo",
  sinGuardar: "Sin guardar en tu editor",
  nuevo: "Nuevo, todavía sin commit",
  cambiado: "Cambiado desde el último commit",
  borrado: "Borrado, todavía sin commit",
};
/** La cuenta de arriba, en singular y en plural: «1 cambiados» no lo dice nadie. */
const CUENTA: Record<EstadoArchivo, [string, string]> = {
  conflicto: ["{n} en conflicto", "{n} en conflicto"],
  tocando: ["{n} ahora", "{n} ahora"],
  sinGuardar: ["{n} sin guardar", "{n} sin guardar"],
  nuevo: ["{n} nuevo", "{n} nuevos"],
  cambiado: ["{n} cambiado", "{n} cambiados"],
  borrado: ["{n} borrado", "{n} borrados"],
};
/** Lo que quiere decir la letra de git que va al final de la fila. */
const QUE_LETRA: Record<LetraGit, string> = {
  M: "Modificado desde el último commit",
  A: "Nuevo, todavía sin commit",
  D: "Borrado, todavía sin commit",
  R: "Renombrado, todavía sin commit",
  U: "En conflicto: git no sabe juntar los cambios",
};

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
  const [git, setGit] = useState<EstadoArchivos | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const sinGuardar = useCabina((s) => s.sinGuardar);
  /** Las carpetas desplegadas de ESTE instante, para la vuelta del reloj. */
  const leidasRef = useRef(leidas);
  leidasRef.current = leidas;

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
    setGit(null);
    setCargando(true);
    leer(raiz).finally(() => setCargando(false));
  }, [raiz, leer]);

  // La vuelta del reloj: lo desplegado otra vez, y git. Con la ventana escondida
  // no se mira nada, que es cuando nadie lo iba a ver.
  useEffect(() => {
    if (!raiz) return;
    let vivo = true;
    const vuelta = async () => {
      if (document.hidden) return;
      const abiertas = [...leidasRef.current.keys()];
      const [est, carpetas] = await Promise.all([
        estadoArchivos(raiz).catch(() => null),
        Promise.allSettled(abiertas.map((r) => listarCarpeta(r))),
      ]);
      if (!vivo) return;
      if (est) setGit(est);
      setLeidas((prev) => {
        const m = new Map(prev);
        carpetas.forEach((c, i) => {
          const r = abiertas[i];
          if (!m.has(r)) return; // la plegaste mientras tanto
          if (c.status === "fulfilled") m.set(r, c.value.filas);
          else if (r !== raiz) m.delete(r); // ya no existe
        });
        return m;
      });
      setAhora(Date.now());
    };
    const reloj = window.setInterval(() => void vuelta(), REFRESCO_MS);
    void vuelta();
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [raiz]);

  const estados = useMemo(
    () => estadosDe([...leidas.values()].flat(), git?.cambios ?? [], sinGuardar, ahora),
    [leidas, git, sinGuardar, ahora],
  );
  const cuenta = useMemo(() => contar(raiz, estados), [raiz, estados]);
  const letras = useMemo(() => letrasDe(git?.cambios ?? []), [git]);
  const showMenu = useMenu();

  const alternar = (ruta: string, desplegada: boolean) => {
    if (desplegada) setLeidas((prev) => plegar(prev, ruta));
    else void leer(ruta);
  };

  // Lo borrado sin commit vuelve a su carpeta como fila tachada: el disco ya no
  // lo lista, y sin esto solo se veía en la cuenta de arriba.
  const filas = useMemo(
    () => filasVisibles(conBorrados(leidas, borradosDe(git?.cambios ?? [])), raiz),
    [leidas, git, raiz],
  );

  /** El clic derecho de una fila (o de la raíz, sin fila): copiar su ruta, que
      es lo que se le pega a un agente, y enseñarla en el explorador. */
  const menuDe = (ruta: string, f?: Fila, borrado = false): MenuItem[] => {
    const copiar = (texto: string) => void navigator.clipboard.writeText(texto).catch(() => {});
    const relativa = rutaCorta(ruta, raiz).replace(/\\/g, "/");
    return [
      { label: f ? f.nombre : nombreDeRuta(ruta), heading: true },
      ...(f && !f.carpeta && !borrado ? [{ label: t("Abrir"), icon: <ExternalIcon size={15} />, onClick: () => onAbrir(ruta) }] : []),
      { label: t("Copiar ruta"), icon: <DuplicarIcon size={15} />, onClick: () => copiar(ruta) },
      ...(f ? [{ label: t("Copiar ruta relativa"), hint: relativa, icon: <DuplicarIcon size={15} />, onClick: () => copiar(relativa) }] : []),
      ...(borrado
        ? []
        : [
            { label: "", separator: true },
            { label: t("Enseñar en el explorador"), icon: <FolderIcon size={15} />, onClick: () => void revealItemInDir(ruta).catch(() => {}) },
          ]),
    ];
  };

  if (!raiz) {
    return <p className="arch-vacio">{t("Abre un proyecto para ver sus archivos.")}</p>;
  }

  return (
    <div className="arch">
      <div className="arch-raiz" data-tip={raiz} onContextMenu={(e) => showMenu(e, menuDe(raiz))}>
        {nombreDeRuta(raiz)}
      </div>

      {ESTADOS.some((e) => cuenta[e]) && (
        <div className="arch-cuentas">
          {ESTADOS.filter((e) => cuenta[e]).map((e) => (
            <span key={e} className="arch-cuenta" data-estado={e} data-tip={t(QUE_ES[e])}>
              <i className="arch-punto" />
              {t(CUENTA[e][cuenta[e] === 1 ? 0 : 1], { n: cuenta[e] ?? 0 })}
            </span>
          ))}
        </div>
      )}

      <div className="arch-arbol">
        {filas.map((f) => {
          const est = f.carpeta ? estadoDeCarpeta(f.ruta, estados) : (estados.get(clave(f.ruta)) ?? null);
          const letra = f.carpeta ? undefined : letras.get(clave(f.ruta));
          // Uno borrado no se puede abrir: ya no está. Se enseña para saber cuál era.
          const borrado = letra === "D";
          const tipo = f.carpeta ? undefined : tipoDeArchivo(f.nombre);
          return (
            <button
              key={f.ruta}
              className="arch-fila"
              data-carpeta={f.carpeta}
              data-on={abierto === f.ruta}
              data-estado={est ?? undefined}
              data-borrado={borrado || undefined}
              style={{ paddingLeft: 8 + f.hondo * 13 }}
              title={est ? `${f.nombre} · ${t(QUE_ES[est])}` : f.nombre}
              onClick={() => {
                // El clic que llega al soltar un arrastre no abre ni despliega nada.
                if (acabaDeArrastrar() || borrado) return;
                if (f.carpeta) alternar(f.ruta, f.desplegada);
                else onAbrir(f.ruta);
              }}
              // Se arrastra a una terminal para dejarle su ruta. Uno borrado no:
              // esa ruta ya no lleva a ningún sitio.
              onPointerDown={(e) => (borrado ? undefined : vigilarArrastre(e, (panel, destino) => soltarRutaEn(panel, destino, f.ruta)))}
              onContextMenu={(e) => showMenu(e, menuDe(f.ruta, f, borrado))}
            >
              <span className="arch-ico" data-tipo={tipo}>
                {tipo ? <IconoArchivo tipo={tipo} /> : <ChevronIcon size={11} up={f.desplegada} />}
              </span>
              <span className="arch-nom">{f.nombre}</span>
              {/* El punto dice lo que pasa AHORA (se escribe, sin guardar); la
                  letra, lo que git le va a contar al commit. Con letra, el punto
                  solo se queda si añade algo que la letra no dice. */}
              {est && (!letra || est === "tocando" || est === "sinGuardar") && <i className="arch-punto" />}
              {letra && (
                <b className="arch-letra" data-tip={t(QUE_LETRA[letra])}>
                  {letra}
                </b>
              )}
            </button>
          );
        })}

        {!filas.length && !cargando && (
          <p className="arch-vacio">{t("Esta carpeta está vacía.")}</p>
        )}
        {cargando && !filas.length && <p className="arch-vacio">{t("Leyendo…")}</p>}
        {error && <p className="side-error">{error}</p>}
      </div>
    </div>
  );
}
