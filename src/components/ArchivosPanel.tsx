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
//
// Y enseña lo que el AGENTE está haciendo con ellos (Munir, 2026-10-12): qué
// lee, qué edita, cuál está editando ahora y el paso a verde cuando hace el
// commit. Sale del transcript de la sesión que tienes delante, que se relee
// cada `SESION_MS`; qué marca lleva cada archivo lo decide `lib/tocados.ts`
// (`scripts/tocados-check.ts`) y lo pinta `ArchivosAgente.tsx`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import Espera from "./Espera";
import {
  aLaPapelera,
  archivosDeSesion,
  crearArchivo,
  crearCarpeta,
  estadoArchivos,
  listarCarpeta,
  renombrarRuta,
  type ArchivosSesion,
  type EstadoArchivos,
} from "../lib/archivos";
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
import { sessionIdOf } from "../lib/comandos";
import { proveedorDe } from "../lib/providers";
import { writePty } from "../lib/pty";
import { cambiadosPorCarpeta, lineasDe, marcaDeCarpeta, resumenDe } from "../lib/tocados";
import { tipoDeArchivo } from "../lib/tipoArchivo";
import { ETIQUETA, Lineas, ListaTocados, PieCommit, TarjetaAgente } from "./ArchivosAgente";
import IconoArchivo from "./IconoArchivo";
import { ChevronIcon, DuplicarIcon, ExternalIcon, FolderIcon, PencilIcon, PlusIcon, TrashIcon } from "./Icons";
import { kindDeComando } from "./KindIcon";
import { useMenu, type MenuItem } from "./Overlays";
import { SOLTADO_EVENTO } from "./TerminalPane";

/** La sesión cuyo agente se enseña trabajando en estos archivos. */
export interface SesionDeArchivos {
  cwd: string;
  sessionId?: string | null;
  /** El id de su CLI en `lib/providers.ts`; una consola pelada no tiene agente. */
  cli: string;
}

/**
 * De quién son los archivos que se enseñan: la terminal que tienes delante y,
 * si lo que tienes delante es un editor o la web, la primera terminal abierta
 * en esa misma carpeta. Una de otro proyecto no vale: sus archivos no están en
 * este árbol.
 */
export function sesionParaArchivos(
  panes: { id: number; cwd: string; command?: string[]; archivos?: string[]; web?: string }[],
  enfocado: number | null,
  raiz: string,
): SesionDeArchivos | null {
  const terminales = panes.filter((p) => !p.archivos && p.web == null);
  const p = terminales.find((x) => x.id === enfocado) ?? terminales.find((x) => clave(x.cwd) === clave(raiz));
  if (!p) return null;
  return { cwd: p.cwd, sessionId: sessionIdOf(p.command) ?? null, cli: kindDeComando(p.command?.join(" ") ?? "") };
}

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
/** Cada cuánto se relee el transcript de la sesión. Más a menudo que el disco:
    es lo que hace que «editando» salga mientras edita y no cuando ya acabó, y
    releer un transcript que no ha crecido no cuesta nada (`read_tail` lo recuerda). */
const SESION_MS = 1_500;

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

/** Lo que se está escribiendo en el árbol: el nombre de algo nuevo dentro de
    una carpeta, o el nuevo nombre de algo que ya está. */
type Edicion = { que: "archivo" | "carpeta"; carpeta: string } | { que: "renombrar"; ruta: string; nombre: string };

/** La carpeta donde vive una ruta. */
const carpetaDe = (ruta: string) => ruta.slice(0, Math.max(ruta.lastIndexOf("\\"), ruta.lastIndexOf("/")));

/**
 * La fila donde se escribe un nombre, en su sitio del árbol (como en VS Code y
 * en el explorador de Windows: no un diálogo aparte). Intro lo da por bueno,
 * Esc lo deja; al renombrar llega seleccionado sin la extensión, que es lo que
 * se suele cambiar. Si Rust dice que no (ya existe, un carácter que Windows no
 * deja), se queda abierta con el porqué debajo.
 */
function FilaDeNombre({
  hondo,
  inicial,
  error,
  onListo,
  onCancelar,
}: {
  hondo: number;
  inicial: string;
  error: string;
  onListo: (nombre: string) => void;
  onCancelar: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  /** Ya se dio por buena o se dejó: el «salir del campo» que puede llegar al
      quitar la fila no puede crear el archivo otra vez. */
  const cerrada = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const punto = inicial.lastIndexOf(".");
    el.setSelectionRange(0, punto > 0 ? punto : inicial.length);
    // Solo al nacer: luego la selección es de quien escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dejar = () => {
    cerrada.current = true;
    onCancelar();
  };
  const terminar = (valor: string) => {
    if (cerrada.current) return;
    const v = valor.trim();
    if (!v || v === inicial) dejar();
    else onListo(v);
  };
  return (
    <div className="arch-editar" style={{ paddingLeft: 8 + hondo * 13 }}>
      <input
        ref={ref}
        className="arch-editar-campo"
        defaultValue={inicial}
        spellCheck={false}
        aria-label={t("Nombre")}
        aria-invalid={error ? true : undefined}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            terminar(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            dejar();
          }
        }}
        onBlur={(e) => {
          if (cerrada.current) return;
          // Si ya dijo que no, salir del campo es dejarlo: no se reintenta solo.
          if (error) dejar();
          else terminar(e.currentTarget.value);
        }}
      />
      {error && <p className="arch-editar-error">{error}</p>}
    </div>
  );
}

interface Props {
  /** La carpeta que se enseña. Viene de fuera porque el explorador SIGUE a lo
      que estés haciendo: la terminal que tienes delante manda. */
  raiz: string;
  /** Abrir un archivo. Lo que se hace con él lo decide quien llama. */
  onAbrir: (ruta: string) => void;
  /** El que está abierto ahora, para marcarlo en la lista. */
  abierto?: string | null;
  /** La sesión que trabaja en esta carpeta, para enseñar lo que toca su agente.
      Sin ella (o con un CLI que no lo deja escrito) el panel se queda con git. */
  sesion?: SesionDeArchivos | null;
}

export default function ArchivosPanel({ raiz, onAbrir, abierto, sesion }: Props) {
  const { t } = useT();
  const [leidas, setLeidas] = useState<Leidas>(new Map());
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [git, setGit] = useState<EstadoArchivos | null>(null);
  const [tocados, setTocados] = useState<ArchivosSesion | null>(null);
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

  // Lo que toca el agente de la sesión que tienes delante. Qué CLI lo deja
  // escrito, y en qué formato, lo dice su ficha (`archivosDelDisco`).
  const agente = sesion ? proveedorDe(sesion.cli) : undefined;
  const formato = agente?.archivosDelDisco;
  const quien = agente ? (agente.marca ?? agente.label) : "";
  const sesionCwd = sesion?.cwd ?? "";
  const sesionId = sesion?.sessionId ?? "";
  useEffect(() => {
    setTocados(null);
    if (!sesionCwd || !formato) return;
    let vivo = true;
    const vuelta = () => {
      if (document.hidden) return;
      archivosDeSesion(sesionCwd, sesionId || undefined, formato === "rollout")
        // Sin conversación en el disco todavía no hay nada que enseñar: no es un fallo.
        .catch(() => null)
        .then((a) => {
          if (!vivo) return;
          setTocados(a);
          setAhora(Date.now());
        });
    };
    const reloj = window.setInterval(vuelta, SESION_MS);
    vuelta();
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [sesionCwd, sesionId, formato]);

  const estados = useMemo(
    () => estadosDe([...leidas.values()].flat(), git?.cambios ?? [], sinGuardar, ahora),
    [leidas, git, sinGuardar, ahora],
  );
  const cuenta = useMemo(() => contar(raiz, estados), [raiz, estados]);
  const letras = useMemo(() => letrasDe(git?.cambios ?? []), [git]);
  const resumen = useMemo(() => resumenDe(tocados, git, raiz, ahora), [tocados, git, raiz, ahora]);
  const lineas = useMemo(() => lineasDe(git?.cambios ?? []), [git]);
  const dentro = useMemo(() => cambiadosPorCarpeta(raiz, git?.cambios ?? []), [raiz, git]);
  // Lo que ese CLI no deja escrito se dice, y no se inventa.
  const nota = !agente
    ? ""
    : !formato
      ? t("{q} no deja escrito qué archivos toca: aquí solo sale lo que dice git.", { q: quien })
      : tocados && !tocados.lee
        ? t("{q} no deja escrito qué archivos lee: aquí salen solo los que edita.", { q: quien })
        : "";
  const showMenu = useMenu();

  const alternar = (ruta: string, desplegada: boolean) => {
    if (desplegada) setLeidas((prev) => plegar(prev, ruta));
    else void leer(ruta);
  };

  // Crear, renombrar y mandar a la papelera, desde el clic derecho. El nombre se
  // escribe en su sitio del árbol (`FilaDeNombre`).
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [errorEdicion, setErrorEdicion] = useState("");
  const empezar = async (e: Edicion) => {
    setErrorEdicion("");
    // Algo nuevo dentro de una carpeta plegada: se despliega para verlo nacer.
    if (e.que !== "renombrar" && e.carpeta !== raiz && !leidasRef.current.has(e.carpeta)) await leer(e.carpeta);
    setEdicion(e);
  };
  const acabar = async (nombre: string) => {
    const e = edicion;
    if (!e) return;
    try {
      if (e.que === "renombrar") {
        await renombrarRuta(e.ruta, nombre);
        // Lo desplegado de debajo tenía la ruta vieja.
        setLeidas((prev) => plegar(prev, e.ruta));
        await leer(carpetaDe(e.ruta));
      } else {
        const ruta = await (e.que === "archivo" ? crearArchivo : crearCarpeta)(e.carpeta, nombre);
        await leer(e.carpeta);
        // Un archivo nuevo se abre para escribirlo; una carpeta, se despliega.
        if (e.que === "archivo") onAbrir(ruta);
        else void leer(ruta);
      }
      setEdicion(null);
      setErrorEdicion("");
    } catch (err) {
      setErrorEdicion(String(err));
    }
  };
  const tirar = async (ruta: string) => {
    try {
      await aLaPapelera(ruta);
      setLeidas((prev) => plegar(prev, ruta));
      await leer(carpetaDe(ruta));
    } catch (err) {
      setError(String(err));
    }
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
    const esCarpeta = !f || f.carpeta;
    return [
      { label: f ? f.nombre : nombreDeRuta(ruta), heading: true },
      ...(f && !f.carpeta && !borrado ? [{ label: t("Abrir"), icon: <ExternalIcon size={15} />, onClick: () => onAbrir(ruta) }] : []),
      ...(esCarpeta && !borrado
        ? [
            { label: t("Archivo nuevo…"), icon: <PlusIcon size={15} />, onClick: () => void empezar({ que: "archivo", carpeta: ruta }) },
            { label: t("Carpeta nueva…"), icon: <FolderIcon size={15} />, onClick: () => void empezar({ que: "carpeta", carpeta: ruta }) },
          ]
        : []),
      { label: "", separator: true },
      { label: t("Copiar ruta"), icon: <DuplicarIcon size={15} />, onClick: () => copiar(ruta) },
      ...(f ? [{ label: t("Copiar ruta relativa"), hint: relativa, icon: <DuplicarIcon size={15} />, onClick: () => copiar(relativa) }] : []),
      ...(borrado
        ? []
        : [
            { label: "", separator: true },
            { label: t("Enseñar en el explorador"), icon: <FolderIcon size={15} />, onClick: () => void revealItemInDir(ruta).catch(() => {}) },
          ]),
      // La raíz no se renombra ni se tira desde aquí: es el proyecto entero.
      ...(f && !borrado
        ? [
            { label: t("Renombrar…"), icon: <PencilIcon size={15} />, onClick: () => void empezar({ que: "renombrar", ruta, nombre: f.nombre }) },
            { label: t("Mandar a la papelera"), icon: <TrashIcon size={15} />, danger: true, onClick: () => void tirar(ruta) },
          ]
        : []),
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

      <TarjetaAgente resumen={resumen} git={git} quien={quien} raiz={raiz} nota={nota} conLeyenda={!!formato} />
      <ListaTocados resumen={resumen} quien={quien} raiz={raiz} onAbrir={onAbrir} />

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
        {edicion && edicion.que !== "renombrar" && edicion.carpeta === raiz && (
          <FilaDeNombre
            key="nuevo-en-la-raiz"
            hondo={0}
            inicial=""
            error={errorEdicion}
            onListo={(n) => void acabar(n)}
            onCancelar={() => {
              setEdicion(null);
              setErrorEdicion("");
            }}
          />
        )}
        {filas.map((f) => {
          const est = f.carpeta ? estadoDeCarpeta(f.ruta, estados) : (estados.get(clave(f.ruta)) ?? null);
          const letra = f.carpeta ? undefined : letras.get(clave(f.ruta));
          // Uno borrado no se puede abrir: ya no está. Se enseña para saber cuál era.
          const borrado = letra === "D";
          const tipo = f.carpeta ? undefined : tipoDeArchivo(f.nombre);
          // Lo del agente: su marca (una carpeta lleva la de lo de dentro), las
          // líneas que cambia el archivo y cuántos cambiados guarda la carpeta.
          const marca = f.carpeta ? marcaDeCarpeta(f.ruta, resumen.marcas) : (resumen.marcas.get(clave(f.ruta)) ?? null);
          const lin = f.carpeta ? undefined : lineas.get(clave(f.ruta));
          const cambiados = f.carpeta ? (dentro.get(clave(f.ruta)) ?? 0) : 0;
          // Lo que pasa ahora y el commit se dicen con palabras; ahí las líneas ceden el sitio.
          const etiqueta = !f.carpeta && (marca === "editando" || marca === "leyendo" || marca === "commit") ? marca : null;
          const cancelar = () => {
            setEdicion(null);
            setErrorEdicion("");
          };
          // Renombrándose: la fila se vuelve el campo, en su mismo sitio.
          if (edicion?.que === "renombrar" && edicion.ruta === f.ruta) {
            return (
              <FilaDeNombre
                key={f.ruta}
                hondo={f.hondo}
                inicial={edicion.nombre}
                error={errorEdicion}
                onListo={(n) => void acabar(n)}
                onCancelar={cancelar}
              />
            );
          }
          // Algo nuevo dentro de esta carpeta: el campo va justo debajo, el
          // primero de sus hijos.
          const nuevoAqui =
            edicion && edicion.que !== "renombrar" && edicion.carpeta === f.ruta ? (
              <FilaDeNombre
                key={`nuevo-${f.ruta}`}
                hondo={f.hondo + 1}
                inicial=""
                error={errorEdicion}
                onListo={(n) => void acabar(n)}
                onCancelar={cancelar}
              />
            ) : null;
          const fila = (
            <button
              key={f.ruta}
              className="arch-fila"
              data-carpeta={f.carpeta}
              data-on={abierto === f.ruta}
              data-estado={est ?? undefined}
              data-agente={marca ?? undefined}
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
              {cambiados > 0 && <span className="arch-dentro">{t(cambiados === 1 ? "{n} cambiado" : "{n} cambiados", { n: cambiados })}</span>}
              {lin && !etiqueta && <Lineas mas={lin.mas} menos={lin.menos} />}
              {etiqueta && (
                <span className="arch-etq" key={etiqueta}>
                  {t(ETIQUETA[etiqueta])}
                </span>
              )}
              {/* El punto dice lo que pasa AHORA (se escribe, sin guardar); la
                  letra, lo que git le va a contar al commit. Con letra, el punto
                  solo se queda si añade algo que la letra no dice. Y si quien
                  escribe es el agente, ya lo dice su etiqueta. */}
              {est && (!letra || est === "tocando" || est === "sinGuardar") && etiqueta !== "editando" && <i className="arch-punto" />}
              {letra && (
                <b className="arch-letra" data-tip={t(QUE_LETRA[letra])}>
                  {letra}
                </b>
              )}
            </button>
          );
          return nuevoAqui ? [fila, nuevoAqui] : fila;
        })}

        {!filas.length && !cargando && (
          <p className="arch-vacio">{t("Esta carpeta está vacía.")}</p>
        )}
        <Espera activo={cargando && !filas.length} className="arch-vacio">
          {t("Leyendo…")}
        </Espera>
        {error && <p className="side-error">{error}</p>}
      </div>
      <PieCommit resumen={resumen} />
    </div>
  );
}
