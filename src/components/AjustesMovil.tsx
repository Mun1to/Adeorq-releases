// Ajustes > Móvil: encender el conserje en el móvil, llevarlo a Tailscale,
// emparejar un móvil y quitarlo. El servidor es `src-tauri/src/movil.rs`.
//
// La forma la eligió Munir el 2026-10-15 entre cuatro dibujadas («la 1»): el
// estado en tres filas (este PC, Tailscale, tu móvil) con su punto y lo que hay
// que hacer en la fila que falla; debajo, el QR con sus dos pasos al lado; y
// los móviles emparejados. Antes era texto suelto en verde y rojo, y su móvil
// llevaba tres días fuera de Tailscale sin que nada se lo dijera.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { encode } from "uqr";
import { useT } from "../lib/i18n";
import Espera, { Ocupado } from "./Espera";
import { MovilIcon, PcIcon, RedIcon } from "./Icons";
import { hace } from "../lib/uso";
import {
  movilAvisar,
  movilEmparejar,
  movilEncender,
  movilEstado,
  movilOlvidar,
  movilTailscale,
  type EstadoMovil,
  type Tailscale,
} from "../lib/movil";

const DESCARGA = "https://tailscale.com/download";
/** Como `PUERTO_TAILSCALE` de `movil.rs`. */
const PUERTO_TAILSCALE = 8443;

/** La dirección en QR, para no teclear `https://…ts.net:8443` en el móvil.
 *  Módulos oscuros sobre blanco y con su margen de cuatro: invertido o sin
 *  margen, hay cámaras que no lo leen. Un solo `path`, no un `rect` por módulo. */
function QrDireccion({ texto }: { texto: string }) {
  const { d, lado } = useMemo(() => {
    const qr = encode(texto, { ecc: "M", border: 4 });
    let d = "";
    qr.data.forEach((fila, y) =>
      fila.forEach((oscuro, x) => {
        if (oscuro) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, lado: qr.size };
  }, [texto]);
  return (
    <svg className="movil-qr" viewBox={`0 0 ${lado} ${lado}`} shapeRendering="crispEdges" role="img" aria-label={texto}>
      <rect width={lado} height={lado} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** Una fila del estado: qué es, cómo está con su punto, y si falla, qué hacer. */
function Fila({
  icono,
  que,
  bien,
  como,
  botones,
  children,
}: {
  icono: ReactNode;
  que: string;
  /** `null` mientras no se sabe o mientras depende de otra fila. */
  bien: boolean | null;
  como: ReactNode;
  botones?: ReactNode;
  children?: ReactNode;
}) {
  const clase = bien === null ? "" : bien ? "ok" : "falta";
  return (
    <div className={`movil-fila ${bien === false ? "falta" : ""}`}>
      {icono}
      <span className="movil-fila-que">{que}</span>
      <span className="movil-fila-como">
        <i className={`movil-punto ${clase}`} />
        <span>{como}</span>
      </span>
      <span className="movil-fila-botones">{botones}</span>
      {children}
    </div>
  );
}

export default function AjustesMovil() {
  const { t } = useT();
  const [estado, setEstado] = useState<EstadoMovil | null>(null);
  const [ts, setTs] = useState<Tailscale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState<{ valor: string; hasta: number } | null>(null);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  const releer = useCallback(() => {
    movilEstado()
      .then((e) => {
        setEstado(e);
        // El código se apaga solo al emparejar: ahí se ve que el móvil entró.
        if (!e.codigo) setCodigo(null);
      })
      .catch((e) => setError(String(e)));
  }, []);
  const mirarTailscale = useCallback((conectar: boolean) => {
    setOcupado(true);
    movilTailscale(conectar)
      .then(setTs)
      .catch((e) => setError(String(e)))
      .finally(() => setOcupado(false));
  }, []);

  useEffect(() => {
    releer();
    mirarTailscale(false);
  }, [releer, mirarTailscale]);

  // Con un código a la vista: la cuenta atrás, y mirar si el móvil ya entró.
  useEffect(() => {
    if (!codigo) return;
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    const vigia = window.setInterval(releer, 2500);
    return () => {
      window.clearInterval(reloj);
      window.clearInterval(vigia);
    };
  }, [codigo, releer]);

  const encender = (on: boolean) => {
    setError(null);
    movilEncender(on)
      .then(setEstado)
      .catch((e) => setError(String(e)));
  };
  const emparejar = () => {
    setError(null);
    movilEmparejar()
      .then((c) => {
        setCodigo({ valor: c.valor, hasta: Date.now() + c.quedan * 1000 });
        setAhora(Date.now());
      })
      .catch((e) => setError(String(e)));
  };
  const olvidar = (id: string) => {
    movilOlvidar(id)
      .then(setEstado)
      .catch((e) => setError(String(e)));
  };
  const probarAviso = () => {
    setPrueba(null);
    movilAvisar(t("Prueba de Adeorq"), t("Si lees esto, los avisos llegan a tu móvil."))
      .then((n) => setPrueba(t("Mandado a {n} móvil(es). Si no llega en un minuto, mira rastro.log.", { n })))
      .catch((e) => setError(String(e)));
  };

  const quedan = codigo ? Math.max(0, Math.round((codigo.hasta - ahora) / 1000)) : 0;
  // La dirección solo cuando Tailscale ya la sirve: antes, el móvil no llegaría.
  const direccion = ts?.llevado ? ts.direccion : null;
  // Tailscale dice su enlace cuando le falta activar algo en tu cuenta.
  const enlace = ts?.salida.match(/https:\/\/(?![^\s/]*\.ts\.net)\S+/)?.[0] ?? null;
  const movil = ts?.moviles[0];
  const volverAMirar = (
    <button className="mini" disabled={ocupado} onClick={() => mirarTailscale(false)}>
      <Ocupado activo={ocupado} mientras={t("Mirando…")}>
        {t("Volver a mirar")}
      </Ocupado>
    </button>
  );

  // La fila de Tailscale en este PC: instalado, con sesión y llevando el conserje.
  const filaTailscale = () => {
    const icono = <RedIcon size={18} />;
    if (!ts) return <Fila icono={icono} que="Tailscale" bien={null} como={<Espera activo>{t("Mirando Tailscale…")}</Espera>} />;
    if (!ts.instalado) {
      return (
        <Fila
          icono={icono}
          que="Tailscale"
          bien={false}
          como={t("No está instalado en este PC")}
          botones={
            <>
              <button className="mini" onClick={() => void openUrl(DESCARGA).catch(() => {})}>
                {t("Descargar Tailscale")}
              </button>
              {volverAMirar}
            </>
          }
        >
          <p className="movil-fila-ayuda">
            {t("Instálalo aquí y en tu móvil, entra con la misma cuenta en los dos y vuelve. Es gratis para uso personal.")}
          </p>
        </Fila>
      );
    }
    if (!ts.conectado) {
      return (
        <Fila icono={icono} que="Tailscale" bien={false} como={t("Instalado, pero sin sesión")} botones={volverAMirar}>
          <p className="movil-fila-ayuda">{t("Ábrelo en este PC y entra con tu cuenta.")}</p>
        </Fila>
      );
    }
    if (ts.llevado) {
      return (
        <Fila icono={icono} que="Tailscale" bien={!ts.ajeno} como={t("El conserje está en tu red")}>
          {ts.ajeno && (
            <p className="movil-fila-ayuda">
              {t("En su mismo puerto de Tailscale hay otra cosa ({a}): comparte dirección con el conserje y podría leer la clave del móvil. Quítala de tailscale serve.", { a: ts.ajeno })}
            </p>
          )}
        </Fila>
      );
    }
    return (
      <Fila
        icono={icono}
        que="Tailscale"
        bien={false}
        como={t("Falta llevar el conserje a tu red")}
        botones={
          <>
            <button className="mini" disabled={ocupado || !!ts.ajeno} onClick={() => mirarTailscale(true)}>
              <Ocupado activo={ocupado} mientras={t("Conectando…")}>
                {t("Llevar el conserje a Tailscale")}
              </Ocupado>
            </button>
            {enlace && (
              <button className="mini" onClick={() => void openUrl(enlace).catch(() => {})}>
                {t("Abrir el enlace de Tailscale")}
              </button>
            )}
          </>
        }
      >
        <p className="movil-fila-ayuda">
          {ts.ajeno
            ? t("El puerto {p} de Tailscale ya lo usa otra cosa ({a}), y no la piso. Quítala con «tailscale serve --https={p} off» y vuelve a pulsar.", { p: PUERTO_TAILSCALE, a: ts.ajeno })
            : ts.denegado
              ? t("Tailscale no deja a tu usuario ponerlo. Ejecuta una vez «sudo tailscale set --operator=$USER» y vuelve a pulsar.")
              : t("Solo hace falta una vez: se queda puesto aunque reinicies. La primera vez puede pedirte activar HTTPS en tu cuenta; si sale un enlace, ábrelo, actívalo y vuelve a pulsar.")}
        </p>
        {ts.salida && <pre className="movil-salida">{ts.salida}</pre>}
      </Fila>
    );
  };

  // La fila de tu móvil: si está en tu red de Tailscale ahora. Un móvil con
  // Tailscale apagado no llega a la dirección, y desde él no se ve por qué.
  const filaMovil = () => {
    const icono = <MovilIcon size={18} />;
    if (!ts?.conectado) return <Fila icono={icono} que={t("Tu móvil")} bien={null} como={t("Cuando Tailscale esté listo en este PC")} />;
    if (!movil) {
      return (
        <Fila icono={icono} que={t("Tu móvil")} bien={false} como={t("No hay ningún móvil en tu red")} botones={volverAMirar}>
          <p className="movil-fila-ayuda">{t("Instala Tailscale en el móvil y entra con la misma cuenta que aquí.")}</p>
        </Fila>
      );
    }
    if (movil.en_linea) return <Fila icono={icono} que={t("Tu móvil")} bien como={t("{m}, conectado", { m: movil.nombre })} />;
    const visto = movil.visto ? hace(movil.visto * 1000) : null;
    return (
      <Fila
        icono={icono}
        que={t("Tu móvil")}
        bien={false}
        como={
          visto
            ? t("{m}, fuera de Tailscale (visto {c})", { m: movil.nombre, c: t(visto.clave, { n: visto.valor }) })
            : t("{m}, fuera de Tailscale", { m: movil.nombre })
        }
        botones={volverAMirar}
      >
        <p className="movil-fila-ayuda">{t("Abre Tailscale en el móvil y enciéndelo: sin eso la dirección no abre.")}</p>
      </Fila>
    );
  };

  return (
    <section className="panel-card">
      <div className="movil-cab">
        <h2>{t("El conserje en el móvil")}</h2>
        <label className="setting-switch">
          <input
            type="checkbox"
            aria-label={t("Conserje en el móvil")}
            checked={!!estado?.encendido}
            onChange={(e) => encender(e.currentTarget.checked)}
          />
        </label>
      </div>
      <p className="card-hint">
        {t("Habla con el conserje y con tus terminales desde el móvil, estés donde estés. Llega por Tailscale, una red privada entre tus aparatos: desde internet no se ve, y solo entran los móviles que emparejes aquí.")}
      </p>

      {estado?.encendido && (
        <>
          <div className="movil-estado">
            <Fila
              icono={<PcIcon size={18} />}
              que={t("Este PC")}
              bien={estado.sirviendo}
              como={
                !estado.sirviendo ? (
                  t("El puerto {p} lo tiene otro programa (¿otra Adeorq abierta?)", { p: estado.puerto })
                ) : estado.despierto ? (
                  <span title={t("La pantalla sí se apaga. Déjalo enchufado y con la tapa abierta: con batería se duerme a los pocos minutos.")}>
                    {t("Despierto mientras esté encendido")}
                  </span>
                ) : (
                  t("Sirviendo el conserje")
                )
              }
            />
            {filaTailscale()}
            {filaMovil()}
          </div>

          <p className="movil-rotulo">{t("Emparejar un móvil")}</p>
          <div className={`movil-emparejar ${direccion ? "" : "sin-qr"}`}>
            {direccion && <QrDireccion texto={direccion} />}
            <ol className="movil-pasos">
              <li>
                <b>1</b>
                <div>
                  {direccion ? (
                    <>
                      {t("Escanéalo con la cámara, o abre en el móvil:")}
                      <span className="movil-direccion">
                        <code>{direccion}</code>
                        <button
                          className="mini"
                          onClick={() =>
                            void navigator.clipboard.writeText(direccion).then(
                              () => {
                                setCopiado(true);
                                window.setTimeout(() => setCopiado(false), 1600);
                              },
                              () => {},
                            )
                          }
                        >
                          {copiado ? t("Copiada") : t("Copiar")}
                        </button>
                      </span>
                    </>
                  ) : (
                    t("Cuando Tailscale esté listo, aquí sale la dirección que abrir en el móvil.")
                  )}
                </div>
              </li>
              <li>
                <b>2</b>
                <div>
                  {codigo && quedan > 0 ? (
                    <>
                      {t("Escribe este código en el móvil:")}
                      <span className="movil-codigo" aria-live="polite">
                        <strong>{`${codigo.valor.slice(0, 3)} ${codigo.valor.slice(3)}`}</strong>
                        <span>{t("Vale {m}:{s}", { m: Math.floor(quedan / 60), s: String(quedan % 60).padStart(2, "0") })}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      {t("Pide un código y escríbelo en el móvil:")}
                      <button className="mini" onClick={emparejar}>
                        {t("Emparejar un móvil")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            </ol>
          </div>

          {!!estado.dispositivos.length && (
            <>
              <p className="movil-rotulo">{t("Emparejados")}</p>
              <ul className="movil-lista">
                {estado.dispositivos.map((d) => {
                  const visto = hace(d.visto * 1000);
                  const cuando = t("visto {c}", { c: t(visto.clave, { n: visto.valor }) });
                  return (
                    <li key={d.id}>
                      <MovilIcon size={18} />
                      <span className="movil-quien">
                        <strong>{d.nombre}</strong>
                        <em>{d.avisos ? `${cuando} · ${t("con avisos")}` : cuando}</em>
                      </span>
                      <span className="movil-fila-botones">
                        {d.avisos && (
                          <button className="mini" disabled={ocupado} onClick={probarAviso}>
                            {t("Probar aviso")}
                          </button>
                        )}
                        <button className="mini" onClick={() => olvidar(d.id)}>
                          {t("Quitar")}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {estado.avisos === 0 ? (
                <p className="movil-prueba">{t("Ningún móvil ha pedido avisos todavía. En el móvil, en la lista del conserje, toca «Avisarme en este móvil».")}</p>
              ) : (
                prueba && <p className="movil-prueba">{prueba}</p>
              )}
            </>
          )}
        </>
      )}
      {error && <p className="setting-line setting-bad">⚠ {error}</p>}
    </section>
  );
}
