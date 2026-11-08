// Ajustes › Escudo: preparar la verificación la primera vez (la contraseña, la
// pregunta y la llave de Windows Hello), ver lo que ha cambiado en los archivos
// importantes y deshacerlo, y cómo va el vigilante.
//
// Solo existe en el equipo donde se instaló el escudo (decisión F1): sin la
// carpeta `%LOCALAPPDATA%\Adeorq\escudo\`, que crea `node escudo/instalar.mjs --preparar`,
// esto no pinta nada y el grupo no sale en Ajustes. Lo de Rust, en
// `src-tauri/src/escudo.rs`; el contrato, en `docs/contexto/escudo.md`.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import { Ocupado } from "./Espera";

export interface EstadoEscudo {
  instalado: boolean;
  pregunta: string | null;
  llave: boolean;
  llaveInstalada: boolean;
  llaveCoincide: boolean | null;
  hello: boolean | null;
  dePrueba: boolean;
  vigilante: {
    activo: boolean;
    archivos: number;
    ultimaVuelta: number | null;
    nuevas: number;
    error: string | null;
  };
}

interface Cambio {
  ruta: string;
  cuando: number;
  panel: number | null;
  cli: string | null;
  como: string;
  verificado: boolean;
  porque: string | null;
  antes: string | null;
  despues: string | null;
  sinEscudo: boolean;
  visto: boolean;
  deshecho: boolean;
  sePuedeDeshacer: boolean;
}

/** El nombre del archivo y su carpeta, que es lo que se reconoce de un vistazo. */
function partes(ruta: string): { nombre: string; carpeta: string } {
  const trozos = ruta.split(/[\\/]/).filter(Boolean);
  return { nombre: trozos[trozos.length - 1] ?? ruta, carpeta: trozos.slice(0, -1).join("\\") };
}

export default function AjustesEscudo() {
  const { t } = useT();
  const [est, setEst] = useState<EstadoEscudo | null>(null);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState("");
  const [otraVez, setOtraVez] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [creando, setCreando] = useState(false);

  const leer = useCallback(() => {
    invoke<EstadoEscudo>("escudo_estado")
      .then((e) => {
        setEst(e);
        if (e.instalado) {
          return invoke<Cambio[]>("escudo_cambios").then(setCambios);
        }
      })
      .catch((e) => setError(t(String(e))));
  }, []);

  useEffect(() => {
    leer();
    const fuera = listen("escudo-cambio", () => leer());
    // Lo que deja pasar el gancho no avisa: se relee de vez en cuando mientras
    // esto está abierto.
    const reloj = window.setInterval(() => leer(), 30_000);
    return () => {
      window.clearInterval(reloj);
      void fuera.then((f) => f());
    };
  }, [leer]);

  if (!est?.instalado) return null;

  const preparar = () => {
    if (contrasena !== otraVez) {
      setError(t("Las dos contraseñas no son iguales."));
      return;
    }
    setGuardando(true);
    setError(null);
    invoke("escudo_preparar", { contrasena, pregunta, respuesta })
      .then(() => {
        setContrasena("");
        setOtraVez("");
        setRespuesta("");
        leer();
      })
      .catch((e) => setError(t(String(e))))
      .finally(() => setGuardando(false));
  };

  const crearLlave = () => {
    setCreando(true);
    setError(null);
    invoke("escudo_crear_llave")
      .then(leer)
      .catch((e) => setError(t(String(e))))
      .finally(() => setCreando(false));
  };

  const deshacer = (c: Cambio) => {
    setError(null);
    invoke("escudo_deshacer", { ruta: c.ruta, antes: c.antes, despues: c.despues })
      .then(leer)
      .catch((e) => setError(t(String(e))));
  };

  const loCambieYo = (c: Cambio) => {
    setError(null);
    invoke("escudo_lo_cambie_yo", { ruta: c.ruta, despues: c.despues })
      .then(leer)
      .catch((e) => setError(t(String(e))));
  };

  const cuando = (ms: number) => {
    const h = hace(ms);
    return t(h.clave, { n: h.valor });
  };

  /** Quién lo cambió y cómo, en una frase. */
  const como = (c: Cambio) => {
    if (c.sinEscudo) {
      return c.despues == null ? t("Lo borraron sin pasar por el escudo") : t("Cambió sin pasar por el escudo");
    }
    if (c.como === "Deshacer") return t("Lo deshiciste tú desde aquí");
    const quien = c.panel != null ? t("La terminal {n}", { n: c.panel }) : t("Un agente");
    if (c.verificado) return t("{q}, con tus tres pasos", { q: quien });
    // «reglas-limpia»: un AGENTS.md o CLAUDE.md con el editor, sin nada de fuera ni enlaces (decisión G2).
    if (c.porque === "memoria-limpia" || c.porque === "reglas-limpia") return t("{q}, sin preguntarte: no había leído nada de fuera", { q: quien });
    if (c.porque === "memoria-manchada") return t("{q}, sin preguntarte, justo después de leer algo de fuera: míralo", { q: quien });
    return t("{q}, sin verificación", { q: quien });
  };

  const v = est.vigilante;
  const preparada = est.pregunta != null;
  const puedeGuardar = contrasena.length >= 8 && otraVez.length > 0 && pregunta.trim() !== "" && respuesta.trim() !== "";

  return (
    <>
      <section className="panel-card" data-sin-mods="">
        <h2>{t("Tu contraseña y tu pregunta")}</h2>
        <p className="card-hint">
          {t("Antes de dejar que un agente cambie un archivo importante, la ventana roja te pide tres cosas: ")}
          <b>{t("tu PIN de Windows, esta contraseña y la respuesta a esta pregunta")}</b>
          {t(". Adeorq no guarda el texto, solo lo justo para saber si aciertas.")}
        </p>
        {preparada ? (
          // `stream-hide`: en emisión la pregunta va tapada (se ve con Alt), como las rutas de abajo.
          <p className="setting-line setting-good">
            {t("Ya están guardadas. Tu pregunta es:")} <span className="stream-hide">«{est.pregunta ?? ""}»</span>
          </p>
        ) : (
          <div className="escudo-formulario">
            <label className="setting-row escudo-fila">
              <span>{t("Contraseña")}</span>
              <input
                className="finder setting-input"
                type="password"
                value={contrasena}
                placeholder={t("8 caracteres o más")}
                autoComplete="new-password"
                onChange={(e) => setContrasena(e.currentTarget.value)}
              />
            </label>
            <label className="setting-row escudo-fila">
              <span>{t("Otra vez")}</span>
              <input
                className="finder setting-input"
                type="password"
                value={otraVez}
                autoComplete="new-password"
                onChange={(e) => setOtraVez(e.currentTarget.value)}
              />
            </label>
            <label className="setting-row escudo-fila">
              <span>{t("Pregunta")}</span>
              <input
                className="finder setting-input stream-hide"
                value={pregunta}
                placeholder={t("Una que solo sepas tú")}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setPregunta(e.currentTarget.value)}
              />
            </label>
            <label className="setting-row escudo-fila">
              <span>{t("Respuesta")}</span>
              <input
                className="finder setting-input"
                type="password"
                value={respuesta}
                placeholder={t("Dan igual las mayúsculas y las tildes")}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setRespuesta(e.currentTarget.value)}
              />
            </label>
            <div className="escudo-acciones">
              <button className="np-btn" disabled={!puedeGuardar || guardando} onClick={() => preparar()}>
                <Ocupado activo={guardando} mientras={t("Guardando…")}>
                  {t("Guardar mi contraseña y mi pregunta")}
                </Ocupado>
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel-card" data-sin-mods="">
        <h2>{t("Tu llave de Windows Hello")}</h2>
        <p className="card-hint">
          {t("Cada aprobación va firmada con tu PIN de Windows. ")}
          <b>{t("Un agente no puede firmar por ti")}</b>
          {t(", aunque lea y escriba lo mismo que tú.")}
        </p>
        {est.dePrueba && <p className="setting-line setting-bad">{t("Esta ventana de desarrollo firma con una llave de prueba, no con tu PIN.")}</p>}
        {!est.llave ? (
          <>
            {est.hello === false && (
              <p className="setting-line setting-bad">
                {t("Windows Hello no está puesto en este equipo. Ponle un PIN en Configuración › Cuentas › Opciones de inicio de sesión.")}
              </p>
            )}
            <div className="escudo-acciones">
              <button className="np-btn" disabled={creando || est.hello === false} onClick={() => crearLlave()}>
                <Ocupado activo={creando} mientras={t("Esperando a tu PIN…")}>
                  {t("Crear la llave con mi PIN")}
                </Ocupado>
              </button>
            </div>
          </>
        ) : !est.llaveInstalada ? (
          <p className="setting-line">
            {t("La llave está creada. ")}
            <b>{t("Falta instalarla")}</b>
            {t(", con permiso de administrador, para que el escudo se fíe de ella.")}
            <small className="escudo-pie">node escudo\instalar.mjs --aplicar</small>
          </p>
        ) : est.llaveCoincide === false ? (
          <p className="setting-line setting-bad">
            {t("La llave instalada no es la de esta Adeorq: ")}
            <b>{t("vuelve a instalar el escudo")}</b>
            {t(" para que se fíe de tus firmas.")}
          </p>
        ) : (
          <p className="setting-line setting-good">{t("La llave está creada e instalada.")}</p>
        )}
      </section>

      <section className="panel-card" data-sin-mods="">
        <h2>{t("Lo que ha cambiado")}</h2>
        <p className="card-hint">
          {t("Los archivos importantes (reglas, memoria, configuración de los agentes) y quién los cambió. ")}
          {t("Lo que cambió sin pasar por el escudo sale en rojo, y ")}
          <b>{t("«Deshacer» lo deja como estaba")}</b>.
        </p>
        {v.error ? (
          <p className="setting-line setting-bad">{t(v.error)}</p>
        ) : v.activo ? (
          <p className="setting-line">
            {t("Miro {n} archivos cada 30 segundos.", { n: v.archivos })}
            {v.ultimaVuelta != null && ` ${t("La última vez, {c}.", { c: cuando(v.ultimaVuelta) })}`}
          </p>
        ) : (
          <p className="setting-line">{t("En esta ventana de desarrollo no miro los archivos: lo hace la Adeorq instalada.")}</p>
        )}
        {error && <p className="setting-line setting-bad">{error}</p>}
        {cambios.length === 0 ? (
          <p className="setting-line">{t("Todavía no ha cambiado nada.")}</p>
        ) : (
          <div className="escudo-cambios">
            {cambios.map((c, i) => {
              const { nombre, carpeta } = partes(c.ruta);
              const rojo = c.sinEscudo && !c.visto && !c.deshecho;
              return (
                <div className="escudo-cambio" data-rojo={rojo || undefined} key={`${c.ruta}-${c.cuando}-${i}`}>
                  <div className="escudo-cambio-que">
                    <b>{nombre}</b>
                    <span className="escudo-cambio-donde stream-hide">{carpeta}</span>
                    <span>
                      {como(c)} · {cuando(c.cuando)}
                      {c.deshecho && ` · ${t("deshecho")}`}
                      {c.visto && ` · ${t("lo cambiaste tú")}`}
                    </span>
                  </div>
                  <div className="escudo-cambio-botones">
                    {rojo && (
                      <button className="mini" onClick={() => loCambieYo(c)}>
                        {t("Lo cambié yo")}
                      </button>
                    )}
                    {c.sePuedeDeshacer && (
                      <button className="mini" onClick={() => deshacer(c)}>
                        {t("Deshacer")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
