// Un chat con un modelo, como una pieza más del lienzo.
//
// Las terminales abren AGENTES: se loguean con tu cuenta, leen tu proyecto y
// trabajan. Esto es la otra mitad, la que faltaba: una conversación normal con
// un modelo, por clave de API, para lo que no merece una sesión de agente
// entera —una duda, una traducción, «explícame este error»— y para hablar con
// modelos que ni siquiera tienen CLI (Munir, 2026-07-30).
//
// Va por OpenRouter porque UNA clave da acceso a casi todos los modelos: un
// conector por marca sería el mismo trabajo repetido y cinco claves que
// mantener. La clave nunca pasa por aquí; vive cifrada y solo la usa Rust.
//
// Lo que cuesta se enseña SIEMPRE, en la cabecera y por respuesta. Con una
// suscripción no puedes pasarte, pagas igual hables mucho o poco; con una clave
// de API sí, y sin verlo. Un chat que no dice lo que va costando es el camino
// corto a una factura sorpresa.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import {
  chatEnviar,
  chatGuardar,
  chatLeer,
  chatModelos,
  comoDinero,
  type Mensaje,
  type Modelo,
} from "../lib/chat";
import {
  ChevronIcon,
  CloseIcon,
  SendIcon,
} from "./Icons";

export interface ChatData extends Record<string, unknown> {
  nodeId: string;
  /** El archivo donde vive esta conversación. Es lo único que guarda el
      tablero: el texto va aparte, como en las notas. */
  chatId: string;
  modelo: string;
  onClose: (id: string) => void;
  onModelo: (nodeId: string, modelo: string) => void;
}

/** Con el que nace una pieza nueva. Barato, rápido y de sobra para una duda. */
export const MODELO_DEFECTO = "anthropic/claude-haiku-4.5";

export default function ChatNode({ data, selected }: NodeProps<Node<ChatData>>) {
  const { t } = useT();
  const d = data;
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  /** Lo que va llegando de la respuesta en curso, aún sin cerrar. */
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coste, setCoste] = useState(0);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [filtro, setFiltro] = useState("");
  const finRef = useRef<HTMLDivElement>(null);
  const cargado = useRef(false);

  // La conversación de su archivo, una vez.
  useEffect(() => {
    if (cargado.current) return;
    cargado.current = true;
    chatLeer(d.chatId)
      .then(setMensajes)
      .catch(() => {});
  }, [d.chatId]);

  // Y de vuelta al disco cuando cambia. No en cada tecla: solo cuando un turno
  // se cierra, que es cuando hay algo que valga la pena conservar.
  useEffect(() => {
    if (!cargado.current || !mensajes.length) return;
    void chatGuardar(d.chatId, mensajes).catch(() => {});
  }, [mensajes, d.chatId]);

  // Abajo del todo con cada trozo que llega: un chat que no sigue al texto
  // obliga a arrastrar la barra mientras el modelo escribe.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes, enVuelo]);

  const abrirLista = useCallback(() => {
    setEligiendo((v) => !v);
    if (!modelos.length) {
      chatModelos()
        .then(setModelos)
        .catch((e) => setError(String(e)));
    }
  }, [modelos.length]);

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = q
      ? modelos.filter((m) => m.nombre.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      : modelos;
    // Sin filtro la lista son cientos: se enseñan los primeros y se dice que
    // hay más, en vez de pintar mil filas que nadie va a recorrer.
    return base.slice(0, 60);
  }, [modelos, filtro]);

  const enviar = useCallback(async () => {
    const dicho = texto.trim();
    if (!dicho || enVuelo !== null) return;
    setError(null);
    setTexto("");
    const conmigo: Mensaje[] = [...mensajes, { role: "user", content: dicho }];
    setMensajes(conmigo);
    setEnVuelo("");
    try {
      // El canal lleva el id de la pieza: con dos chats abiertos en el lienzo,
      // uno solo compartido haría que las dos respuestas se mezclaran en las
      // dos ventanas.
      const uso = await chatEnviar(d.chatId, d.modelo, conmigo, (trozo) =>
        setEnVuelo((prev) => (prev ?? "") + trozo),
      );
      setCoste((c) => c + uso.coste);
      setEnVuelo((completo) => {
        // El turno se cierra con lo que haya llegado, aunque venga vacío: así
        // el historial guardado y lo que ves en pantalla son lo mismo.
        setMensajes((prev) => [...prev, { role: "assistant", content: completo ?? "" }]);
        return null;
      });
    } catch (e) {
      setEnVuelo((completo) => {
        // Lo ya escrito NO se tira: media respuesta cortada sigue valiendo, y
        // perderla por un corte de red es perder lo que ya has pagado.
        if (completo) setMensajes((prev) => [...prev, { role: "assistant", content: completo }]);
        return null;
      });
      setError(String(e));
    }
  }, [texto, mensajes, enVuelo, d.chatId, d.modelo]);

  const nombreModelo =
    modelos.find((m) => m.id === d.modelo)?.nombre ?? d.modelo.split("/").pop() ?? d.modelo;

  return (
    <div className="rf-chat nowheel" data-selected={selected}>
      <NodeResizer minWidth={340} minHeight={260} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="rf-handle" />

      <header className="ch-head">
        <button
          className="ch-modelo"
          data-tip={t("Cambiar de modelo")}
          onClick={abrirLista}
        >
          {nombreModelo}
          <span className="ch-caret"><ChevronIcon size={13} /></span>
        </button>
        <span className="ch-coste" data-tip={t("Lo que llevas gastado en esta conversación")}>
          {comoDinero(coste)}
        </span>
        <button
          className="ch-x"
          data-tip={t("Quitar el chat del lienzo")}
          onClick={() => d.onClose(d.nodeId)}
        >
          <CloseIcon size={13} />
        </button>
      </header>

      {eligiendo && (
        <div className="ch-lista nodrag" onPointerDown={nodragEnControles}>
          <input
            className="ch-buscar"
            autoFocus
            placeholder={t("Buscar modelo…")}
            value={filtro}
            onChange={(e) => setFiltro(e.currentTarget.value)}
          />
          <div className="ch-lista-cuerpo">
            {modelos.length === 0 && <p className="ch-vacio">{t("Pidiendo el catálogo…")}</p>}
            {lista.map((m) => (
              <button
                key={m.id}
                className="ch-opcion"
                data-on={m.id === d.modelo || undefined}
                onClick={() => {
                  d.onModelo(d.nodeId, m.id);
                  setEligiendo(false);
                }}
              >
                <span className="ch-opcion-nombre">{m.nombre}</span>
                <span className="ch-opcion-precio">
                  {m.entrada_millon === 0 && m.salida_millon === 0
                    ? t("gratis")
                    : `${m.entrada_millon.toFixed(2)} / ${m.salida_millon.toFixed(2)} $ ${t("por millón")}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ch-charla nodrag">
        {mensajes.length === 0 && enVuelo === null && (
          <p className="ch-vacio">
            {t("Pregunta lo que sea. Esto no es un agente: no ve tus archivos ni toca nada.")}
          </p>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className="ch-msg" data-de={m.role}>
            {m.content}
          </div>
        ))}
        {enVuelo !== null && (
          <div className="ch-msg" data-de="assistant" data-escribiendo={true}>
            {enVuelo || t("…")}
          </div>
        )}
        {error && <p className="ch-error">{error}</p>}
        <div ref={finRef} />
      </div>

      <div className="ch-pie nodrag" onPointerDown={nodragEnControles}>
        <textarea
          className="ch-in"
          rows={2}
          placeholder={t("Escribe… (Enter envía, Mayús+Enter salta de línea)")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <button
          className="ch-enviar"
          disabled={!texto.trim() || enVuelo !== null}
          data-tip={t("Enviar")}
          onClick={() => void enviar()}
        >
          {enVuelo !== null ? "…" : <SendIcon size={14} />}
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  );
}
