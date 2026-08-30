// La ventana donde se pega un token que ha pedido un agente.
//
// Sale sola cuando alguien escribe `adeorq secreto <nombre>` en una terminal, y
// existe para que deje de pasar lo de siempre: el agente abriendo un bloc de
// notas y dejando un `token-loquesea.txt` en la carpeta del proyecto (Munir,
// 2026-08-30). El valor que se pega va a Rust y de ahí al almacén cifrado; no
// vuelve al agente, no aparece en su terminal y no queda en ningún fichero del
// proyecto.
//
// El aviso de dónde acaba guardado no es un adorno: en Windows es el Gestor de
// Credenciales y en Linux un fichero con permisos 600, que no es lo mismo, y
// esto se lee justo antes de pegar un token que puede valer dinero.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";

interface Pedido {
  nombre: string;
  motivo: string;
}

export default function PedirSecreto() {
  const { t } = useT();
  /* El velo cierra solo si el ratón BAJÓ en él, no si acabó ahí: soltar el
     botón fuera después de seleccionar el token cerraría el diálogo. */
  const bajoEnVelo = useRef(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const [guardar, setGuardar] = useState(true);
  const [donde, setDonde] = useState("");
  const caja = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fuera = listen<Pedido>("secreto-pedido", (e) => {
      setValor("");
      setGuardar(true);
      setPedido(e.payload);
    });
    void invoke<string>("secretos_donde")
      .then(setDonde)
      .catch(() => {});
    return () => {
      void fuera.then((f) => f());
    };
  }, []);

  /* El foco en la caja al abrir: quien llega aquí viene de copiar un token y lo
     único que quiere es pegarlo. */
  useEffect(() => {
    if (pedido) caja.current?.focus();
  }, [pedido]);

  const responder = (v: string | null) => {
    const nombre = pedido?.nombre;
    setPedido(null);
    setValor("");
    if (!nombre) return;
    void invoke("secreto_responder", { nombre, valor: v, guardar: v ? guardar : false }).catch(
      () => {},
    );
  };

  if (!pedido) return null;

  return (
    <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => responder(null))}>
      <div className="modal secreto-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t("Un agente necesita una clave")}</h3>
        <p className="modal-text">
          {t("La pide con el nombre")} <code className="secreto-nombre">{pedido.nombre}</code>
          {pedido.motivo ? `: ${pedido.motivo}` : "."}
        </p>
        <p className="modal-text secreto-como">
          {t(
            "Pégala aquí y entra directa en su comando. No se escribe en la terminal, así que el agente no la lee ni se queda en su historial.",
          )}
        </p>
        <input
          ref={caja}
          className="secreto-caja"
          type="password"
          value={valor}
          spellCheck={false}
          autoComplete="off"
          placeholder={t("Pega aquí la clave")}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valor.trim()) responder(valor.trim());
            if (e.key === "Escape") responder(null);
            e.stopPropagation();
          }}
        />
        <label className="secreto-guardar">
          <input
            type="checkbox"
            checked={guardar}
            onChange={(e) => setGuardar(e.target.checked)}
          />
          <span>
            {donde === "archivo"
              ? t("Guardarla para la próxima vez (en un archivo solo tuyo, permisos 600)")
              : t("Guardarla para la próxima vez (en el Gestor de Credenciales de Windows)")}
          </span>
        </label>
        <div className="modal-actions">
          <button className="mini modal-cancel" onClick={() => responder(null)}>
            {t("Cancelar")}
          </button>
          <button className="np-btn" disabled={!valor.trim()} onClick={() => responder(valor.trim())}>
            {t("Dársela")}
          </button>
        </div>
      </div>
    </div>
  );
}
