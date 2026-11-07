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
//
// Y desde el 2026-11-03 (decisión A1 de Munir): cuando la pide un programa de
// fuera de Adeorq y ya está guardada, no hay nada que pegar: la ventana solo
// pregunta si se le da esta vez. El valor no pasa por aquí ni entonces: lo lee
// Rust del almacén (`secreto_permitir`).
//
// Desde el 2026-11-06 («Claves que duran»): la ventana de pegar dice si la que
// pegas sustituye a una que ya no vale, y si ya tienes guardada una con un nombre
// parecido (para no pegar dos veces la misma). Y aquí sale el aviso de que una
// clave caduca dentro de una semana o ya no vale (`claves_caducan.rs`).

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { useT, type Lang } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";
import { DONDE_SE_CREA as DONDE, fechaDeClave } from "../lib/clavesCaducan";

interface Pedido {
  nombre: string;
  motivo: string;
  /** La pide algo de fuera de una terminal de Adeorq. */
  deFuera?: boolean;
  /** Ya está guardada: solo queda dársela o no. */
  guardada?: boolean;
  /** Ya había una con este nombre: la que se pegue la sustituye. */
  reemplaza?: boolean;
  /** La que había ya no vale (caducó o su servicio la rechaza). */
  muerta?: boolean;
  /** Guardadas con un nombre parecido. */
  parecidas?: string[];
}

/** Una clave que caduca pronto o ya no vale, sin su valor. */
interface Caduca {
  nombre: string;
  servicio: string | null;
  aviso: "semana" | "no_vale";
  /** Segundos desde 1970, si el servicio lo dice. */
  caduca: number | null;
}

export default function PedirSecreto() {
  const { t, lang } = useT();
  /* El velo cierra solo si el ratón BAJÓ en él, no si acabó ahí: soltar el
     botón fuera después de seleccionar el token cerraría el diálogo. */
  const bajoEnVelo = useRef(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const [guardar, setGuardar] = useState(true);
  const [donde, setDonde] = useState("");
  const [avisos, setAvisos] = useState<Caduca[]>([]);
  const caja = useRef<HTMLInputElement>(null);
  /* El texto del aviso, en el idioma de ahora: el oyente nace una vez. */
  const textos = useRef({ t, lang });
  textos.current = { t, lang };

  useEffect(() => {
    const fuera = listen<Pedido>("secreto-pedido", (e) => {
      setValor("");
      setGuardar(true);
      setPedido(e.payload);
    });
    const caduca = listen<Caduca>("secreto-caduca", (e) => {
      setAvisos((a) => [...a.filter((x) => x.nombre !== e.payload.nombre), e.payload]);
      // Y en el escritorio, por si no estás mirando Adeorq. Sin pedir permiso aquí:
      // si no lo diste para los avisos de las terminales, este no insiste.
      const { t, lang } = textos.current;
      const { titulo, frase } = textoDeAviso(e.payload, t, lang);
      void isPermissionGranted()
        .then((si) => si && sendNotification({ title: titulo, body: frase }))
        .catch(() => {});
    });
    void invoke<string>("secretos_donde")
      .then(setDonde)
      .catch(() => {});
    return () => {
      void fuera.then((f) => f());
      void caduca.then((f) => f());
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

  /** A un programa de fuera, con la clave ya guardada: dársela o no. */
  const permitir = (dar: boolean) => {
    const nombre = pedido?.nombre;
    setPedido(null);
    if (!nombre) return;
    void invoke("secreto_permitir", { nombre, dar }).catch(() => {});
  };

  /* Lo que espera un agente va primero; el aviso de caducidad, cuando no hay nada
     que pegar. */
  if (!pedido) {
    const aviso = avisos[0];
    if (!aviso) return null;
    const cerrar = () => setAvisos((a) => a.slice(1));
    const servicio = aviso.servicio ?? "";
    const fecha = aviso.caduca ? fechaDeClave(aviso.caduca, lang) : "";
    return (
      <div className="modal-overlay" data-sin-mods="" {...propsDeVelo(bajoEnVelo, cerrar)}>
        <div className="modal secreto-modal" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title">
            {aviso.aviso === "semana" ? t("Una clave caduca pronto") : t("Una clave ya no vale")}
          </h3>
          <p className="modal-text">
            {aviso.aviso === "semana" ? (
              <>
                {t("La clave")} <code className="secreto-nombre">{aviso.nombre}</code> {t("de {servicio} deja de valer el", { servicio })}{" "}
                <b>{fecha}</b>.
              </>
            ) : (
              <>
                {t("{servicio} ya no acepta la clave", { servicio })} <code className="secreto-nombre">{aviso.nombre}</code>
                {t(": caducó o la borraron.")}
              </>
            )}
          </p>
          <p className="modal-text secreto-como">
            {t("Crea una nueva en {servicio}", { servicio })}
            {DONDE[servicio] ? ` (${t(DONDE[servicio])})` : ""}
            {t(" y ")}
            <b>{t("pégala en Adeorq")}</b>
            {t(" la próxima vez que un agente la pida. Si le pones un año de duración, no vuelve a pasar en mucho tiempo.")}
          </p>
          <div className="modal-actions">
            <button className="np-btn" onClick={cerrar}>
              {t("Entendido")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pedido.deFuera && pedido.guardada) {
    return (
      <div className="modal-overlay" data-sin-mods="" {...propsDeVelo(bajoEnVelo, () => permitir(false))}>
        <div className="modal secreto-modal" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title">{t("Un programa de fuera de Adeorq pide una clave")}</h3>
          <p className="modal-text">
            {t("Pide la clave")} <code className="secreto-nombre">{pedido.nombre}</code>
            {pedido.motivo ? `: ${pedido.motivo}` : "."}
          </p>
          <p className="modal-text secreto-como">
            {t("No viene de una terminal de Adeorq. ")}
            <b>{t("Dásela solo si sabes qué programa es.")}</b>
          </p>
          <div className="modal-actions">
            <button className="mini modal-cancel" onClick={() => permitir(false)}>
              {t("No")}
            </button>
            <button className="np-btn" onClick={() => permitir(true)}>
              {t("Dársela esta vez")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" data-sin-mods="" {...propsDeVelo(bajoEnVelo, () => responder(null))}>
      <div className="modal secreto-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">
          {pedido.deFuera
            ? t("Un programa de fuera de Adeorq pide una clave")
            : pedido.reemplaza && pedido.muerta
              ? t("Una clave ya no vale: hace falta otra")
              : pedido.reemplaza
                ? t("Un agente pide otra clave")
                : t("Un agente necesita una clave")}
        </h3>
        <p className="modal-text">
          {t("La pide con el nombre")} <code className="secreto-nombre">{pedido.nombre}</code>
          {pedido.motivo ? `: ${pedido.motivo}` : "."}
        </p>
        {pedido.reemplaza && (
          <p className="modal-text">
            {pedido.muerta ? t("La que tenías guardada ya no vale. ") : t("Ya tienes una guardada con este nombre. ")}
            <b>{t("La que pegues la sustituye.")}</b>
          </p>
        )}
        {!!pedido.parecidas?.length && (
          <p className="modal-text">
            {t("Ya tienes guardada una con un nombre parecido:")}{" "}
            {pedido.parecidas.map((n, i) => (
              <span key={n}>
                {i > 0 && ", "}
                <code className="secreto-nombre">{n}</code>
              </span>
            ))}
            {". "}
            <b>{t("Si es la misma, cancela")}</b>
            {t(": el agente puede usar esa sin que la pegues otra vez.")}
          </p>
        )}
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
              : donde === "llavero"
                ? t("Guardarla para la próxima vez (en el Llavero de tu Mac)")
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

/** El aviso del escritorio: el título y una frase con qué hacer. */
function textoDeAviso(a: Caduca, t: ReturnType<typeof useT>["t"], lang: Lang): { titulo: string; frase: string } {
  const servicio = a.servicio ?? "";
  if (a.aviso === "semana") {
    const fecha = a.caduca ? fechaDeClave(a.caduca, lang) : "";
    return {
      titulo: t("Una clave caduca pronto"),
      frase: t("La clave {nombre} de {servicio} deja de valer el {fecha}. Crea una nueva y pégala en Adeorq cuando un agente la pida.", {
        nombre: a.nombre,
        servicio,
        fecha,
      }),
    };
  }
  return {
    titulo: t("Una clave ya no vale"),
    frase: t("{servicio} ya no acepta la clave {nombre}. Crea una nueva y pégala en Adeorq cuando un agente la pida.", {
      nombre: a.nombre,
      servicio,
    }),
  };
}
