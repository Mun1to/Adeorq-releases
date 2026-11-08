// La ventana del escudo: lo que sale cuando un agente quiere cambiar un archivo
// importante (la roja: PIN de Windows, contraseña y pregunta) o hacer algo
// posiblemente grave, como publicar (la del PIN solo).
//
// Sale sola, montada siempre en `App` como la de pegar un token, cuando Rust
// emite `escudo-pedido` (`src-tauri/src/escudo.rs`). La firma del PIN no pasa
// por aquí: la hace Windows Hello en Rust y se queda allí hasta que llegan la
// contraseña y la respuesta. Esta ventana solo enseña y pregunta.
//
// De lo que enseña, solo el archivo va firmado: es la ruta que quedará abierta.
// El título, la explicación y el cambio (o el comando, en la del PIN) los
// escribe el gancho; el cambio es una muestra, y por eso el texto dice que el
// permiso vale para el archivo entero.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import { redact } from "../lib/redact";
import type { Pane } from "../lib/tablero";

interface Pedido {
  id: number;
  tipo: "rojo" | "pin";
  /** La terminal que lo pide, si es una de Adeorq (creída por su contraseña). */
  panel: number | null;
  deAdeorq: boolean;
  cli: string;
  titulo: string;
  explicacion: string[];
  diff: string;
  diffCortado: boolean;
  /** La ruta firmada; `null` si no es un archivo (publicar, un comando). */
  archivo: string | null;
  /** Si esa ruta es una carpeta (la memoria se abre entera). */
  esCarpeta: boolean;
  hasta: string;
  /** En la roja, la pregunta de seguridad que guardaste. */
  pregunta: string | null;
}

type Paso = "inicio" | "pin" | "contrasena" | "pregunta";

const FALLOS_MAX = 3;

/** `stream`: el modo emisión (Munir, 2026-11-08: «espero que cuando esté en el modo stream se censuren
 *  las respuestas»). Lo que escribe va tapado, su pregunta no sale y el resto pasa por `redact`, como el
 *  texto de las terminales. */
export default function EscudoVentana({ panes, stream = false }: { panes: Pane[]; stream?: boolean }) {
  const { t } = useT();
  const tapar = (s: string) => (stream ? redact(s).text : s);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [paso, setPaso] = useState<Paso>("inicio");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallos, setFallos] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const abierto = useRef<number | null>(null);

  useEffect(() => {
    const llega = listen<Pedido>("escudo-pedido", (e) => {
      abierto.current = e.payload.id;
      setPedido(e.payload);
      setPaso("inicio");
      setTexto("");
      setError(null);
      setFallos(0);
      setOcupado(false);
    });
    const cierra = listen<{ id: number }>("escudo-cerrado", (e) => {
      if (abierto.current === e.payload.id) {
        abierto.current = null;
        setPedido(null);
      }
    });
    return () => {
      void llega.then((f) => f());
      void cierra.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (paso === "contrasena" || paso === "pregunta") caja.current?.focus();
  }, [paso]);

  if (!pedido) return null;
  const rojo = pedido.tipo === "rojo";

  const cerrar = () => {
    abierto.current = null;
    setPedido(null);
  };

  const rechazar = () => {
    const id = pedido.id;
    cerrar();
    void invoke("escudo_rechazar", { id }).catch(() => {});
  };

  /* El PIN: Windows saca su cuadro y Rust se queda la firma. En la del PIN
     solo, con esto ya está. */
  const pin = () => {
    setError(null);
    setPaso("pin");
    void invoke("escudo_firmar", { id: pedido.id })
      .then(() => {
        if (rojo) setPaso("contrasena");
        else cerrar();
      })
      .catch((e) => {
        setError(t(String(e)));
        setPaso("inicio");
      });
  };

  const comprobar = () => {
    if (!texto.trim() || ocupado) return;
    const esPaso = paso === "contrasena" ? "contrasena" : "respuesta";
    setOcupado(true);
    void invoke<boolean>("escudo_comprobar", { id: pedido.id, paso: esPaso, texto })
      .then((bien) => {
        setOcupado(false);
        setTexto("");
        if (bien) {
          setError(null);
          if (esPaso === "contrasena") setPaso("pregunta");
          else cerrar();
          return;
        }
        const n = fallos + 1;
        setFallos(n);
        if (n >= FALLOS_MAX) {
          cerrar();
          return;
        }
        setError(
          esPaso === "contrasena"
            ? t("Esa no es tu contraseña. Te quedan {n} intentos.", { n: FALLOS_MAX - n })
            : t("Esa no es la respuesta. Te quedan {n} intentos.", { n: FALLOS_MAX - n }),
        );
      })
      .catch((e) => {
        setOcupado(false);
        setError(t(String(e)));
      });
  };

  const nombre = pedido.panel != null ? panes.find((p) => p.id === pedido.panel)?.name : undefined;
  const quien = !pedido.deAdeorq
    ? t("Lo pide un programa que no es una terminal de Adeorq.")
    : nombre
      ? t("Lo pide la terminal «{n}».", { n: nombre })
      : t("Lo pide la terminal {n}.", { n: pedido.panel ?? "?" });

  const lineas = pedido.diff ? tapar(pedido.diff).split("\n") : [];

  return (
    <div className="modal-overlay escudo-velo" data-sin-mods="">
      <div
        className="modal escudo-modal"
        data-tipo={pedido.tipo}
        role="alertdialog"
        aria-labelledby="escudo-titulo"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") rechazar();
          e.stopPropagation();
        }}
      >
        <p className="escudo-quien">{quien}</p>
        <h3 className="modal-title escudo-titulo" id="escudo-titulo">
          {tapar(pedido.titulo)}
        </h3>
        {pedido.explicacion.map((l, i) => (
          <p className="modal-text" key={i}>
            {tapar(l)}
          </p>
        ))}

        {pedido.archivo && (
          <p className="modal-text escudo-que">
            {pedido.esCarpeta ? t("La carpeta:") : t("El archivo:")} <code>{tapar(pedido.archivo)}</code>
          </p>
        )}

        {lineas.length > 0 && (
          <pre className="escudo-diff" aria-label={pedido.archivo ? t("Lo que cambia") : t("Lo que va a hacer")}>
            {lineas.map((l, i) => (
              <span key={i} data-signo={l.startsWith("+") ? "mas" : l.startsWith("-") ? "menos" : undefined}>
                {l}
                {"\n"}
              </span>
            ))}
            {pedido.diffCortado && <span className="escudo-sigue">{t("(el cambio sigue, es más largo)")}</span>}
          </pre>
        )}

        <p className="modal-text escudo-vale">
          {rojo ? (
            <>
              {t("Si lo apruebas, ")}
              <b>
                {!pedido.archivo
                  ? t("podrá hacerlo durante media hora")
                  : pedido.esCarpeta
                    ? t("podrá cambiar lo que hay en esa carpeta durante media hora")
                    : t("podrá cambiar este archivo entero durante media hora")}
              </b>
              {pedido.archivo ? t(", no solo lo que se ve arriba.") : "."}
              {t(" Si en ese rato lee algo de fuera, se te volverá a pedir.")}
            </>
          ) : (
            <>
              {t("Si dices que sí, ")}
              <b>{t("vale diez minutos")}</b>
              {t(" para volver a hacer esto mismo desde esta terminal, por si tiene que repetirlo.")}
              {t(" Si en ese rato lee algo de fuera, se te volverá a pedir.")}
            </>
          )}
        </p>

        {paso === "pin" && (
          <p className="modal-text escudo-paso">
            {rojo
              ? t("Paso 1 de 3: pon tu PIN de Windows en el cuadro que acaba de salir.")
              : t("Pon tu PIN de Windows en el cuadro que acaba de salir.")}
          </p>
        )}

        {(paso === "contrasena" || paso === "pregunta") && (
          <label className="escudo-campo">
            <span className="escudo-paso">
              {paso === "contrasena"
                ? t("Paso 2 de 3: tu contraseña de Adeorq.")
                : stream
                  ? t("Paso 3 de 3: la respuesta a tu pregunta de seguridad (en emisión no se enseña).")
                  : t("Paso 3 de 3: {p}", { p: pedido.pregunta ?? "" })}
            </span>
            <input
              ref={caja}
              className="secreto-caja"
              type={paso === "contrasena" || stream ? "password" : "text"}
              value={texto}
              spellCheck={false}
              autoComplete="off"
              disabled={ocupado}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") comprobar();
              }}
            />
          </label>
        )}

        {error && <p className="modal-text escudo-error">{error}</p>}

        <div className="modal-actions">
          <button className="mini modal-cancel" onClick={() => rechazar()}>
            {rojo ? t("No lo dejes") : t("No")}
          </button>
          {paso === "inicio" && (
            <button className="np-btn escudo-si" onClick={() => pin()}>
              {rojo ? t("Aprobar con mis tres pasos") : t("Sí, con mi PIN")}
            </button>
          )}
          {paso === "contrasena" && (
            <button className="np-btn" disabled={!texto.trim() || ocupado} onClick={() => comprobar()}>
              {t("Seguir")}
            </button>
          )}
          {paso === "pregunta" && (
            <button className="np-btn" disabled={!texto.trim() || ocupado} onClick={() => comprobar()}>
              {t("Aprobar")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
