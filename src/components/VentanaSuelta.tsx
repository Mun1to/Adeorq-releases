// Una terminal de Adeorq viviendo sola, en su propia ventana de Windows.
//
// Esto NO es una terminal nueva. Es la MISMA: su proceso sigue donde estaba, en
// el mapa de Rust, y lo único que ha cambiado de sitio es quién la pinta. Por
// eso al abrirse hace dos cosas y ninguna más:
//
//   1. Pide el historial de ese panel (`pty_historial`) y lo escribe de golpe,
//      para que la conversación aparezca entera en vez de una pantalla negra.
//   2. Monta el `TerminalPane` de siempre, que al arrancar llama a `pty_spawn`
//      y se encuentra con que ese id YA existe, así que se engancha en vez de
//      abrir un segundo proceso.
//
// Se reusa el `TerminalPane` entero, con su cabecera, en vez de escribir una
// terminal más simple para aquí: la cabecera es donde vive el modelo, el
// porcentaje de contexto, la campana, el aviso de secretos y media docena de
// cosas más que costaría meses volver a tener. Munir lo pidió así de hecho: la
// ventana lleva el marco de Windows arriba y la cabecera de Adeorq debajo.

import { useEffect, useRef, useState } from "react";
import TerminalPane from "./TerminalPane";
import { anotarRastro, datosPanel, devolverPanel, ptyHistorial } from "../lib/pty";
import { NOTIFY_KEY, type NotifyMode } from "../lib/notify";
import { useT } from "../lib/i18n";

interface Props {
  id: number;
  /** El nombre se lo pone el usuario, así que Rust no lo conoce: viaja en la
      dirección de la ventana, que es lo único que no se puede preguntar. */
  nombre: string;
}

/** Los ajustes de la terminal, leídos de donde ya viven. `localStorage` es del
    ORIGEN, no de la ventana, así que aquí se lee exactamente lo mismo que en la
    principal sin tener que pasarse nada. */
const AJUSTES = {
  fontSize: () => Number(localStorage.getItem("adeorq-term-font")) || 15,
  autoFont: () => localStorage.getItem("adeorq-term-autofont") !== "0",
  stream: () => localStorage.getItem("adeorq-stream") === "1",
  notify: () => (localStorage.getItem(NOTIFY_KEY) as NotifyMode) || "fondo",
};

export default function VentanaSuelta({ id, nombre }: Props) {
  const { t } = useT();
  const [datos, setDatos] = useState<{ cwd: string; command?: string[] } | null>(null);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<string | null>(null);
  /** Que el historial se escriba UNA vez. Un segundo render no puede volver a
      volcar cien mil caracteres en el xterm. */
  const volcado = useRef(false);

  /* Esta ventana no tiene consola, así que si su JavaScript se cae no queda
     rastro en ninguna parte y desde fuera se ve igual que si no se hubiera
     abierto (Munir, 2026-08-15: «se popea un segundo y desaparece»). Estas tres
     líneas son lo que distingue «no llegó a montarse» de «se montó y algo la
     cerró después». */
  useEffect(() => {
    void anotarRastro(`ventana suelta ${id}: su página ha arrancado`);
    const alFallar = (e: ErrorEvent) =>
      void anotarRastro(`ventana suelta ${id}: se cayó su página — ${e.message}`);
    const alRechazar = (e: PromiseRejectionEvent) =>
      void anotarRastro(`ventana suelta ${id}: promesa sin recoger — ${String(e.reason)}`);
    window.addEventListener("error", alFallar);
    window.addEventListener("unhandledrejection", alRechazar);
    return () => {
      window.removeEventListener("error", alFallar);
      window.removeEventListener("unhandledrejection", alRechazar);
    };
  }, [id]);

  useEffect(() => {
    let vivo = true;
    Promise.all([datosPanel(id), ptyHistorial(id).catch(() => "")])
      .then(([d, h]) => {
        if (!vivo) return;
        setDatos({ cwd: d.cwd, command: d.command ?? undefined });
        setHistorial(h);
        void anotarRastro(`ventana suelta ${id}: tiene su terminal y su historial`);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(String(e));
        void anotarRastro(`ventana suelta ${id}: no pudo con los datos — ${e}`);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  // El título de la ventana de Windows. Lo pone el front y no Rust porque el
  // nombre puede cambiar mientras está fuera.
  useEffect(() => {
    document.title = `${nombre} · Adeorq`;
  }, [nombre]);

  if (error) {
    return (
      <div className="suelta-vacia">
        <p>{t("Esta terminal ya no existe.")}</p>
        <button onClick={() => void devolverPanel(id)}>{t("Cerrar")}</button>
      </div>
    );
  }
  if (!datos || historial === null) return <div className="suelta-vacia" />;

  return (
    <div className="suelta">
      <TerminalPane
        id={id}
        cwd={datos.cwd}
        name={nombre}
        command={datos.command}
        /* Sola en su ventana: no hay mosaico del que salir, ni otro panel con
           el que intercambiarse, ni nada que maximizar. Los botones que no
           tienen sentido aquí no se pasan, y `TerminalPane` ya sabe no
           pintarlos cuando falta su función. */
        hidden={false}
        focused
        maximized={false}
        /* Es lo que convierte la ✕ del panel en el botón de VOLVER: aquí cerrar
           devuelve la terminal al mosaico, y el botón lo dice con su icono y
           sus palabras en vez de amenazar con «Cerrar terminal». */
        suelta
        fontSize={AJUSTES.fontSize()}
        autoFont={AJUSTES.autoFont()}
        stream={AJUSTES.stream()}
        notifyMode={AJUSTES.notify()}
        alone
        /* Cerrar aquí devuelve la terminal a Adeorq, NO mata al agente. Matarlo
           desde una ventana suelta sería la forma más fácil de perder una hora
           de trabajo sin querer: la X de Windows y este botón hacen lo mismo. */
        onClose={() => void devolverPanel(id)}
        onFocusPane={() => {}}
        onSplit={() => {}}
        onToggleMax={() => {}}
        onSecret={() => {}}
        volcar={volcado.current ? undefined : historial}
        onVolcado={() => {
          volcado.current = true;
        }}
      />
    </div>
  );
}
