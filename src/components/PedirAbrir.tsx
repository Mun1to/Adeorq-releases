// La ventana de cuando un programa de fuera de Adeorq quiere abrir una terminal
// con encargo (decisión C1 de Munir, `src-tauri/src/pedir_abrir.rs`).
//
// Se enseña lo que va a pasar y nada más: quién dice ser, qué programa, en qué
// carpeta y el texto entero. El foco va a «No» y «Abrir» tarda un momento en
// dejarse pulsar: quien estaba tecleando o a punto de hacer clic en otra cosa no
// puede abrirla sin querer. Al cerrarse, el teclado vuelve adonde estaba.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";

/** Lo que tarda «Abrir» en dejarse pulsar. */
const SE_PUEDE_ABRIR_MS = 700;

interface Pedido {
  peticion: number;
  /** El nombre que se puso él: no prueba nada, y la ventana lo dice así. */
  quien: string;
  cli: string;
  carpeta: string;
  encargo: string;
}

export default function PedirAbrir() {
  const { t } = useT();
  const bajoEnVelo = useRef(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [sePuede, setSePuede] = useState(false);
  const no = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const pide = listen<Pedido>("abrir-pedido", (e) => setPedido(e.payload));
    const acaba = listen<number>("abrir-pedido-fin", (e) => setPedido((p) => (p?.peticion === e.payload ? null : p)));
    return () => {
      void pide.then((f) => f());
      void acaba.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!pedido) return;
    const antes = document.activeElement;
    no.current?.focus();
    setSePuede(false);
    const id = setTimeout(() => setSePuede(true), SE_PUEDE_ABRIR_MS);
    return () => {
      clearTimeout(id);
      if (antes instanceof HTMLElement) antes.focus();
    };
  }, [pedido]);

  if (!pedido) return null;

  const contestar = (abrir: boolean) => {
    setPedido(null);
    void invoke("abrir_contestar", { peticion: pedido.peticion, abrir }).catch(() => {});
  };

  return (
    <div className="modal-overlay" data-sin-mods="" {...propsDeVelo(bajoEnVelo, () => contestar(false))}>
      <div
        className="modal abrir-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") contestar(false);
          e.stopPropagation();
        }}
      >
        <h3 className="modal-title">{t("Un programa de fuera de Adeorq quiere abrir una terminal")}</h3>
        <p className="modal-text">
          {pedido.quien ? (
            <>
              {t("Dice llamarse")} <b>{pedido.quien}</b>.
            </>
          ) : (
            t("No dice cómo se llama.")
          )}{" "}
          {t("Ábrela solo si sabes qué programa es.")}
        </p>
        <p className="modal-text">
          <b>{pedido.cli}</b> {t("en la carpeta")} <b className="abrir-carpeta">{pedido.carpeta}</b>
          {t(", con este encargo:")}
        </p>
        <div className="abrir-encargo">{pedido.encargo}</div>
        <div className="modal-actions">
          <button ref={no} className="mini modal-cancel" onClick={() => contestar(false)}>
            {t("No")}
          </button>
          <button className="np-btn" disabled={!sePuede} onClick={() => contestar(true)}>
            {t("Abrir")}
          </button>
        </div>
      </div>
    </div>
  );
}
