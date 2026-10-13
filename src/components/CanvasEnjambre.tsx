// El enjambre, como pieza del lienzo: arriba el nombre, luego una fila por
// sesión, y debajo el chat del grupo con UNA caja.
//
// Munir, al contestar la página de decisión (2026-10-13): «la cajita principal
// con el chat principal + las sesiones son filas, solo el nombre arriba del
// todo», y en cada fila «el nombre de la sesión y el proyecto y el modelo, y
// también el logo del proveedor». Lo que escribes va a Adeo, que lo reparte.
//
// El Adeo de color es EL DEL ENJAMBRE: va en la cabecera y firma lo que dice en
// el chat. Las filas no llevan Adeo («las sesiones son sesiones, no Adeo»): la
// primera versión se lo puso a cada una y él lo corrigió esa misma noche.
//
// Aquí se pinta y se habla con el disco. Qué dice cada fila lo decide
// `lib/enjambre.ts`; meter, sacar y minimizar terminales lo hace el lienzo
// (`lib/enjambreEnLienzo.ts`), que es quien las tiene.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import { aHtml } from "../lib/markdown";
import { abrirEnlacesFuera } from "../lib/enlacesFuera";
import type { Tinte } from "../lib/mascota";
import {
  animoDelChat,
  conserjeDijo,
  conserjeEnjambre,
  conserjeMiembros,
  conserjeOlvidar,
  conserjeParar,
  onPaso,
  type Estado,
  type Turno,
} from "../lib/conserje";
import {
  acabanDeTerminar,
  lectorDeRespuesta,
  estadosLeidos,
  estadosParaAdeo,
  filaDe,
  MAX_MIEMBROS,
  PALABRA_FILA,
  puedeEntrar,
  recuento,
  tinteDe,
  trabajoDe,
  type EstadoFila,
  type Fila,
} from "../lib/enjambre";
import { enviarAlEnjambre, respuestaDe, turnoAcabadoEn, useLienzoVivo, type EnjambreData, type SesionLeible } from "../lib/enjambreEnLienzo";
import type { PaneStatus } from "../lib/pty";
import { useConversacion } from "./Conserje";
import Mascota from "./Mascota";
import ProviderMark from "./ProviderMark";
import { CloseIcon, EyeIcon, EyeOffIcon, PlusIcon, SendIcon, TargetIcon, UnlinkIcon } from "./Icons";

export type { EnjambreData } from "../lib/enjambreEnLienzo";

/** Para el Adeo de la cabecera, que usa las cuentas del chat del conserje: una
 *  sesión de la que no se sabe nada no lo pone ni a teclear ni a esperar. */
const comoEstado = (e: EstadoFila): Estado => (e === "nosesabe" ? "cerrada" : e);

/** Cuánto se espera a leer lo que contestó una sesión: su transcript va un
 *  instante por detrás del aviso de que acabó. */
const ESPERA_RESPUESTA_MS = 1500;
/** Cuánto de una respuesta se trae al hilo. Entera está en su terminal. */
const LARGO_RESPUESTA = 6000;
/** Cada cuánto se mira si ha contestado una sesión a la que Adeo le acaba de
 *  mandar algo, y cuándo se deja de mirar: lo que tarde más de media hora ya
 *  lo recoge el estado del panel, que se relee solo. */
const MIRAR_RESPUESTA_MS = 4000;
const ESPERA_MAXIMA_MS = 30 * 60_000;
/** Cuánto dura armada la ✕ de deshacer antes de volver a su sitio. */
const ARMADA_MS = 4000;

/** Una sesión a la que Adeo acaba de escribir: lo último que había dicho ANTES
 *  de mandárselo, que es con lo que se sabe que ha contestado, y desde cuándo. */
interface Esperada extends SesionLeible {
  antes: string | null;
  desde: number;
}

/** La sesión de una fila, si de su CLI se puede traer lo que contesta y ya se
 *  sabe cuál es su sesión (la de un Codex se aprende a los treinta segundos). */
function leible(f: Fila | undefined, s: PaneStatus | undefined): SesionLeible | undefined {
  const lector = f && lectorDeRespuesta(f.cli);
  return lector && s?.sessionId ? { lector, cwd: s.cwd, sid: s.sessionId } : undefined;
}

/**
 * Un turno del chat del grupo. Lo que dice Adeo lo firma el Adeo de ESTE
 * enjambre, con su color (`tinte`); lo que contesta una sesión, el logo de su
 * CLI (`marca`, si esa sesión sigue en el grupo) y su nombre.
 */
const TurnoDelGrupo = memo(function TurnoDelGrupo({ turno, tinte, marca }: { turno: Turno; tinte?: Tinte; marca?: string }) {
  const { t } = useT();
  const html = useMemo(() => aHtml(turno.texto), [turno.texto]);
  /** Lo que contesta una sesión puede ser una pantalla entera: sale recogido. */
  const [entero, setEntero] = useState(false);
  const largo = turno.rol === "sesion" && turno.texto.length > 420;
  return (
    <article className="enj-turno" data-rol={turno.rol}>
      {turno.rol === "conserje" && (
        <span className="enj-turno-quien">
          <Mascota animo="quieta" alto={16} tinte={tinte} />
          Adeo
        </span>
      )}
      {turno.rol === "sesion" && (
        <span className="enj-turno-quien">
          {marca && (
            <span className="enj-marca">
              <ProviderMark id={marca} />
            </span>
          )}
          {turno.de}
        </span>
      )}
      <div
        className="enj-burbuja chat-burbuja"
        data-recogida={largo && !entero ? true : undefined}
        onClick={abrirEnlacesFuera}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {largo && (
        <button className="enj-mas" onClick={() => setEntero((v) => !v)}>
          {entero ? t("Recoger") : t("Ver entera")}
        </button>
      )}
    </article>
  );
});

function FilaDeSesion({ fila, onIr, onSacar }: { fila: Fila; onIr: () => void; onSacar: () => void }) {
  const { t } = useT();
  const detalle = [fila.proyecto, fila.modelo].filter(Boolean).join(" · ");
  return (
    <li className="enj-fila" data-estado={fila.estado} data-panel={fila.panel}>
      <span className="enj-marca">
        <ProviderMark id={fila.cli} />
      </span>
      <button className="enj-fila-id" data-tip={t("Ir a su terminal")} onClick={() => onIr()}>
        <strong>{fila.nombre || t("Sesión sin nombre")}</strong>
        {detalle && <em>{detalle}</em>}
      </button>
      <span
        className="cj-estado enj-estado"
        data-tip={
          fila.estado === "nosesabe"
            ? t("Este CLI no cuenta si trabaja o ha acabado: solo se sabe si te pregunta algo")
            : fila.porcentaje !== undefined
              ? t("Contexto gastado: {n} %", { n: Math.round(fila.porcentaje) })
              : undefined
        }
      >
        <span className="cj-punto" />
        {t(PALABRA_FILA[fila.estado])}
      </span>
      <button className="enj-mini" data-tip={t("Ir a su terminal")} onClick={() => onIr()}>
        <TargetIcon size={13} />
      </button>
      <button className="enj-mini" data-tip={t("Sacarla del enjambre: sigue viva, a su lado")} onClick={() => onSacar()}>
        <UnlinkIcon size={13} />
      </button>
    </li>
  );
}

export default function EnjambreNode({ data, selected }: NodeProps<Node<EnjambreData>>) {
  const { t } = useT();
  const d = data;
  const sesiones = useLienzoVivo((v) => v.sesiones);
  const estados = useLienzoVivo((v) => v.estados);
  const duenos = useLienzoVivo((v) => v.duenos);
  const [conv, releer] = useConversacion(d.conv);

  const filas = useMemo(
    () => d.miembros.map((m) => filaDe(m, sesiones.find((s) => s.panel === m.panel), estados[m.panel])),
    [d.miembros, sesiones, estados],
  );
  const libres = useMemo(
    () => sesiones.filter((s) => puedeEntrar(s.cli) && duenos[s.panel] === undefined),
    [sesiones, duenos],
  );

  // Rust tiene que saber quién es del grupo para dejar que Adeo le escriba, y
  // cómo se llama cada una para que la reconozca. Se manda la lista entera cada
  // vez que cambia algo de eso: una sesión se titula sola al rato de abrirse.
  const trabajos = useMemo(() => {
    const ahora = Math.floor(Date.now() / 1000);
    return filas.flatMap((f) => {
      const s = sesiones.find((x) => x.panel === f.panel);
      return s ? [trabajoDe(f, s, estados[f.panel]?.sessionId, ahora)] : [];
    });
  }, [filas, sesiones, estados]);
  const clave = JSON.stringify(trabajos.map((w) => [w.panel, w.nombre, w.modelo, w.cli, w.carpeta, w.sesion]));
  const trabajosRef = useRef(trabajos);
  trabajosRef.current = trabajos;
  useEffect(() => {
    let vivo = true;
    void conserjeEnjambre(d.conv, d.nombre)
      .then(() => conserjeMiembros(d.conv, trabajosRef.current))
      .then(() => vivo && releer())
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [d.conv, d.nombre, clave, releer]);

  // Lo que contesta cada sesión al acabar entra en el hilo, con su nombre.
  const antes = useRef<Record<number, EstadoFila>>({});
  useEffect(() => {
    const ahora = estadosLeidos(filas);
    const acabaron = acabanDeTerminar(antes.current, ahora);
    antes.current = ahora;
    for (const panel of acabaron) {
      const sesion = leible(filas.find((x) => x.panel === panel), estados[panel]);
      if (!sesion) continue;
      window.setTimeout(() => {
        void respuestaDe(sesion, LARGO_RESPUESTA)
          .then((dicho) => (dicho ? conserjeDijo(d.conv, panel, dicho) : false))
          .then((nuevo) => nuevo && releer())
          .catch(() => {});
      }, ESPERA_RESPUESTA_MS);
    }
  }, [filas, estados, d.conv, releer]);

  // Y las que acaban de recibir un encargo se miran MÁS de cerca. El estado de
  // un panel se relee cada veinte segundos, así que una sesión que contesta en
  // diez pasa de «ha terminado» a «ha terminado» sin que nadie la vea trabajar,
  // y su respuesta no entraría nunca. Mientras alguna tenga algo pendiente se
  // le pregunta a su transcript cada pocos segundos, y se sabe que ha
  // contestado porque lo último que dijo ya no es lo que decía al mandárselo.
  const esperando = useRef(new Map<number, Esperada>());
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    if (!pendientes) return;
    const mirar = () => {
      for (const [panel, e] of esperando.current) {
        const fuera = () => {
          esperando.current.delete(panel);
          setPendientes(esperando.current.size);
        };
        if (Date.now() - e.desde > ESPERA_MAXIMA_MS) {
          fuera();
          continue;
        }
        void turnoAcabadoEn(e)
          .then((acabado) => (acabado ? respuestaDe(e, LARGO_RESPUESTA) : null))
          .then((dicho) => {
            if (!dicho || dicho === e.antes || !esperando.current.has(panel)) return;
            fuera();
            return conserjeDijo(d.conv, panel, dicho).then((nuevo) => nuevo && releer());
          })
          .catch(() => {});
      }
    };
    const reloj = window.setInterval(mirar, MIRAR_RESPUESTA_MS);
    return () => window.clearInterval(reloj);
  }, [pendientes, d.conv, releer]);

  /** Las sesiones de las que se puede traer la respuesta, con lo último que
   *  dijeron ANTES de mandarles nada: es con lo que se compara después. */
  const fotoDeRespuestas = async () => {
    const foto = new Map<number, Esperada>();
    await Promise.all(
      filas.map(async (f) => {
        const sesion = leible(f, estados[f.panel]);
        if (!sesion) return;
        const antes = await respuestaDe(sesion, LARGO_RESPUESTA).catch(() => null);
        foto.set(f.panel, { ...sesion, antes, desde: Date.now() });
      }),
    );
    return foto;
  };

  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [paso, setPaso] = useState("");
  const [envios, setEnvios] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Lo que acabas de mandar, pintado ya: Adeo tarda unos segundos. */
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [fallo, setFallo] = useState<{ texto: string; error: string } | null>(null);
  /** La lista de sesiones para marcar. Un enjambre que nace vacío la trae
      abierta, y no se cierra al marcar la primera: se cierra con «Listo». */
  const [anadiendo, setAnadiendo] = useState(d.miembros.length === 0);
  const [renombrando, setRenombrando] = useState(false);
  const [borrador, setBorrador] = useState(d.nombre);
  /** La ✕ pide dos toques cuando hay conversación que se borraría. */
  const [armada, setArmada] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [conv?.turnos.length, pensando, pendiente, aviso, fallo]);

  useEffect(() => {
    if (pendiente && conv?.turnos.some((x) => x.rol === "tu" && x.texto === pendiente)) setPendiente(null);
  }, [conv, pendiente]);

  useEffect(() => {
    const un = onPaso((p) => {
      if (p.id === d.conv) setPaso(p.paso);
    });
    return () => {
      void un.then((f) => f());
    };
  }, [d.conv]);

  useEffect(() => {
    if (!armada) return;
    const reloj = window.setTimeout(() => setArmada(false), ARMADA_MS);
    return () => window.clearTimeout(reloj);
  }, [armada]);

  const enviar = async (repetir?: string) => {
    const txt = (repetir ?? texto).trim();
    if (!txt || pensando) return;
    if (!filas.length) {
      setAviso(t("Este enjambre todavía no tiene sesiones: añade alguna y vuelve a mandarlo."));
      return;
    }
    if (repetir === undefined) setTexto("");
    setAviso(null);
    setFallo(null);
    setPaso("");
    setPendiente(txt);
    setEnvios((n) => n + 1);
    setPensando(true);
    const foto = await fotoDeRespuestas();
    const r = await enviarAlEnjambre(d.conv, txt, estadosParaAdeo(filas));
    for (const panel of r.escritos) {
      const e = foto.get(panel);
      if (e) esperando.current.set(panel, { ...e, desde: Date.now() });
    }
    setPendientes(esperando.current.size);
    releer();
    if (r.aviso) setAviso(r.aviso);
    if (r.error) setFallo({ texto: txt, error: r.error });
    setPensando(false);
    setPaso("");
  };

  const confirmarNombre = () => {
    const nuevo = borrador.trim().slice(0, 60);
    if (nuevo && nuevo !== d.nombre) d.onRename(d.nodeId, nuevo);
    setRenombrando(false);
  };

  const deshacer = () => {
    if (conv?.turnos.length && !armada) {
      setArmada(true);
      return;
    }
    void conserjeOlvidar(d.conv).catch(() => {});
    d.onClose(d.nodeId);
  };

  const meter = (panel: number) => {
    if (d.miembros.length >= MAX_MIEMBROS) return;
    d.onMiembros(d.nodeId, [...d.miembros, { panel }]);
  };

  const cuenta = recuento(filas.map((f) => f.estado));
  const tinte = tinteDe(d.color);
  /** El CLI de la sesión que firma un turno, si sigue en el grupo. */
  const marcaDe = (de: string | undefined) => filas.find((f) => f.nombre === de)?.cli;
  const eligiendoSesiones = anadiendo || filas.length === 0;

  return (
    <div className="rf-enjambre nowheel" data-selected={selected} data-conv={d.conv} data-color={d.color} style={{ ["--enj" as string]: tinte?.cuerpo }}>
      <NodeResizer isVisible={!!selected} minWidth={340} minHeight={320} />
      <header className="enj-head">
        <Mascota
          animo={animoDelChat(pensando, filas.map((f) => comoEstado(f.estado)), { fallo: !!fallo, escribiendo: !!texto.trim() })}
          alto={24}
          tinte={tinte}
          envio={envios}
        />
        {renombrando ? (
          <input
            className="enj-nombre-in nodrag"
            value={borrador}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setBorrador(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNombre();
              else if (e.key === "Escape") setRenombrando(false);
            }}
            onBlur={() => confirmarNombre()}
          />
        ) : (
          <strong
            className="enj-nombre"
            data-tip={t("Doble clic para renombrar")}
            onDoubleClick={() => {
              setBorrador(d.nombre);
              setRenombrando(true);
            }}
          >
            {d.nombre}
          </strong>
        )}
        <span className="enj-recuento">{cuenta.map((p) => t(p.clave, { n: p.n })).join(" · ")}</span>
        <button
          className="enj-mini nodrag"
          disabled={!filas.length}
          data-on={d.plegadas}
          data-tip={d.plegadas ? t("Enseñar sus terminales, a su lado") : t("Minimizar sus terminales: siguen trabajando")}
          onClick={() => d.onPlegar(d.nodeId, !d.plegadas)}
        >
          {d.plegadas ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
        <button
          className="enj-mini enj-x nodrag"
          data-armada={armada || undefined}
          data-tip={armada ? t("Otra vez para deshacerlo: el chat del grupo se borra, las terminales se quedan") : t("Deshacer el enjambre (las terminales se quedan)")}
          onClick={() => deshacer()}
        >
          {armada ? t("¿Deshacer?") : <CloseIcon size={13} />}
        </button>
      </header>

      {d.eligiendo && filas.length > 0 && (
        <div className="enj-elige nodrag">
          <span>{t("¿Qué hago con sus terminales?")}</span>
          <button className="enj-boton" onClick={() => d.onPlegar(d.nodeId, false)}>
            {t("Dejarlas a la vista")}
          </button>
          <button className="enj-boton" onClick={() => d.onPlegar(d.nodeId, true)}>
            {t("Minimizarlas")}
          </button>
          {/* El deshacer de juntar va AQUÍ, a la vista, y no en Ctrl+Z: en el
              lienzo ese atajo solo es del dibujo mientras dibujas, porque dentro
              de una terminal suspende el proceso que corre (`CanvasView`). */}
          <button className="enj-boton enj-no" data-tip={t("Quita el enjambre; las terminales se quedan como estaban")} onClick={() => deshacer()}>
            {t("No juntarlas")}
          </button>
        </div>
      )}

      <ul className="enj-filas nodrag">
        {filas.map((f) => (
          <FilaDeSesion
            key={f.panel}
            fila={f}
            onIr={() => d.onIr(d.nodeId, f.panel)}
            onSacar={() => d.onMiembros(d.nodeId, d.miembros.filter((m) => m.panel !== f.panel))}
          />
        ))}
        <li className="enj-anadir">
          {eligiendoSesiones ? (
            <div className="enj-libres">
              <span className="enj-libres-tit">
                {libres.length
                  ? t("Marca las sesiones que entran")
                  : t("No hay más sesiones de agente en el lienzo. Abre una, o arrastra aquí una terminal.")}
              </span>
              {libres.map((s) => (
                <button key={s.panel} className="enj-libre" data-panel={s.panel} disabled={d.miembros.length >= MAX_MIEMBROS} onClick={() => meter(s.panel)}>
                  <span className="enj-marca">
                    <ProviderMark id={s.cli} />
                  </span>
                  <strong>{estados[s.panel]?.name || s.nombre}</strong>
                  <PlusIcon size={12} />
                </button>
              ))}
              {filas.length > 0 && (
                <button className="enj-boton" onClick={() => setAnadiendo(false)}>
                  {t("Listo")}
                </button>
              )}
            </div>
          ) : (
            <button className="enj-boton enj-mas-sesiones" onClick={() => setAnadiendo(true)}>
              <PlusIcon size={12} /> {t("Añadir sesión")}
            </button>
          )}
        </li>
      </ul>

      <div className="enj-hilo nodrag">
        {!conv?.turnos.length && !pendiente && (
          <p className="enj-vacio">
            {t("Escribe abajo lo que hay que hacer. Adeo se lo pasa a la sesión que toque, reescrito para que lo entienda a la primera.")}
          </p>
        )}
        {conv?.turnos.map((turno) => <TurnoDelGrupo key={turno.n} turno={turno} tinte={tinte} marca={marcaDe(turno.de)} />)}
        {pendiente && !conv?.turnos.some((x) => x.rol === "tu" && x.texto === pendiente) && (
          <TurnoDelGrupo turno={{ n: 0, rol: "tu", texto: pendiente, resumen: "", cuando: 0 }} />
        )}
        {pensando && (
          <p className="enj-pensando">
            <Mascota animo="piensa" alto={16} tinte={tinte} />
            {paso || t("Adeo está repartiendo…")}
            <button className="enj-boton" onClick={() => void conserjeParar(d.conv)}>
              {t("Parar")}
            </button>
          </p>
        )}
        {aviso && <p className="enj-aviso">{aviso}</p>}
        {fallo && (
          <p className="enj-aviso" data-mal>
            {fallo.error}
            <button className="enj-boton" onClick={() => void enviar(fallo.texto)}>
              {t("Reintentar")}
            </button>
          </p>
        )}
        <div ref={finRef} />
      </div>

      <div className="enj-pie nodrag" onPointerDown={nodragEnControles}>
        <textarea
          ref={cajaRef}
          className="enj-in"
          rows={2}
          placeholder={t("Dile al enjambre qué hay que hacer: Adeo lo reparte")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <button className="enj-enviar" disabled={!texto.trim() || pensando} data-tip={t("Enviar")} onClick={() => void enviar()}>
          <SendIcon size={14} />
        </button>
      </div>
    </div>
  );
}
