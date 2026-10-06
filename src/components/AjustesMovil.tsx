// Ajustes > Móvil: encender el conserje en el móvil, llevarlo a Tailscale,
// emparejar un móvil y quitarlo. El servidor es `src-tauri/src/movil.rs`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { encode } from "uqr";
import { useT } from "../lib/i18n";
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

export default function AjustesMovil() {
  const { t } = useT();
  const [estado, setEstado] = useState<EstadoMovil | null>(null);
  const [ts, setTs] = useState<Tailscale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState<{ valor: string; hasta: number } | null>(null);
  const [prueba, setPrueba] = useState<string | null>(null);
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

  const quedan = codigo ? Math.max(0, Math.round((codigo.hasta - ahora) / 1000)) : 0;
  // La dirección solo cuando Tailscale ya la sirve: antes, el móvil no llegaría.
  const direccion = ts?.llevado ? ts.direccion : null;
  // Tailscale dice su enlace cuando le falta activar algo en tu cuenta.
  const enlace = ts?.salida.match(/https:\/\/(?![^\s/]*\.ts\.net)\S+/)?.[0] ?? null;

  return (
    <section className="panel-card">
      <h2>{t("El conserje en el móvil")}</h2>
      <p className="card-hint">
        {t(
          "Habla con el conserje desde el móvil, estés donde estés. Llega por Tailscale, una red privada entre tus aparatos: desde internet no se ve, y solo entran los móviles que emparejes aquí. Desde el móvil hablas con el conserje y lees sus sesiones; ninguna terminal.",
        )}
      </p>
      <label className="setting-row setting-switch">
        <span>{t("Conserje en el móvil")}</span>
        <input type="checkbox" checked={!!estado?.encendido} onChange={(e) => encender(e.currentTarget.checked)} />
      </label>
      {estado?.encendido && !estado.sirviendo && (
        <p className="setting-line setting-bad">
          ⚠ {t("El puerto {p} lo tiene otro programa (¿otra Adeorq abierta?), así que el móvil no llega.", { p: estado.puerto })}
        </p>
      )}

      {estado?.encendido && estado.despierto && (
        <p className="setting-line setting-good">
          ✓ {t("Mientras esté encendido, este PC no se duerme solo; la pantalla sí se apaga. Déjalo enchufado y con la tapa abierta: con batería se duerme a los pocos minutos.")}
        </p>
      )}

      {estado?.encendido && (
        <>
          <h3 className="movil-paso">{t("1. Tailscale, en este PC y en tu móvil")}</h3>
          {!ts ? (
            <p className="setting-line">{t("Mirando Tailscale…")}</p>
          ) : !ts.instalado ? (
            <>
              <p className="setting-line setting-bad">⚠ {t("Tailscale no está instalado en este PC.")}</p>
              <p className="card-hint">
                {t("Instálalo aquí y en tu móvil, entra con la misma cuenta en los dos y vuelve. Es gratis para uso personal.")}
              </p>
              <div className="movil-botones">
                <button className="mini" onClick={() => void openUrl(DESCARGA).catch(() => {})}>
                  {t("Descargar Tailscale")}
                </button>
                <button className="mini" disabled={ocupado} onClick={() => mirarTailscale(false)}>
                  {t("Volver a mirar")}
                </button>
              </div>
            </>
          ) : !ts.conectado ? (
            <>
              <p className="setting-line setting-bad">⚠ {t("Tailscale está instalado pero sin sesión: ábrelo y entra con tu cuenta.")}</p>
              <div className="movil-botones">
                <button className="mini" disabled={ocupado} onClick={() => mirarTailscale(false)}>
                  {t("Volver a mirar")}
                </button>
              </div>
            </>
          ) : ts.llevado ? (
            <>
              <p className="setting-line setting-good">✓ {t("El conserje ya está en tu red de Tailscale.")}</p>
              {ts.ajeno && (
                <p className="setting-line setting-bad">
                  ⚠ {t("En su mismo puerto de Tailscale hay otra cosa ({a}): comparte dirección con el conserje y podría leer la clave del móvil. Quítala de tailscale serve.", { a: ts.ajeno })}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="setting-line setting-good">✓ {t("Tailscale conectado.")}</p>
              {ts.ajeno ? (
                <p className="setting-line setting-bad">
                  ⚠ {t("El puerto {p} de Tailscale ya lo usa otra cosa ({a}), y no la piso. Quítala con «tailscale serve --https={p} off» y vuelve a pulsar.", { p: PUERTO_TAILSCALE, a: ts.ajeno })}
                </p>
              ) : ts.denegado ? (
                <p className="setting-line setting-bad">
                  ⚠ {t("Tailscale no deja a tu usuario ponerlo. Ejecuta una vez «sudo tailscale set --operator=$USER» y vuelve a pulsar.")}
                </p>
              ) : (
                <p className="card-hint">
                  {t(
                    "Pulsa para que Tailscale lleve el conserje a tu red. Solo hace falta una vez: se queda puesto aunque reinicies. La primera vez puede pedirte activar HTTPS en tu cuenta; si sale un enlace, ábrelo, actívalo y vuelve a pulsar.",
                  )}
                </p>
              )}
              <div className="movil-botones">
                <button className="mini" disabled={ocupado} onClick={() => mirarTailscale(true)}>
                  {ocupado ? t("Conectando…") : t("Llevar el conserje a Tailscale")}
                </button>
                {enlace && (
                  <button className="mini" onClick={() => void openUrl(enlace).catch(() => {})}>
                    {t("Abrir el enlace de Tailscale")}
                  </button>
                )}
              </div>
              {ts.salida && <pre className="movil-salida">{ts.salida}</pre>}
            </>
          )}

          <h3 className="movil-paso">{t("2. Empareja tu móvil")}</h3>
          {direccion ? (
            <div className="movil-direccion">
              <QrDireccion texto={direccion} />
              <p className="card-hint">
                {t("Escanéalo con la cámara del móvil, o abre {d}, y escribe el código que salga aquí.", { d: direccion })}
              </p>
            </div>
          ) : (
            <p className="card-hint">{t("Cuando el paso 1 esté hecho, aquí saldrá la dirección que abrir en el móvil.")}</p>
          )}
          {codigo && quedan > 0 ? (
            <div className="movil-codigo" aria-live="polite">
              <strong>{codigo.valor}</strong>
              <span>{t("Vale {m}:{s}", { m: Math.floor(quedan / 60), s: String(quedan % 60).padStart(2, "0") })}</span>
            </div>
          ) : (
            <div className="movil-botones">
              <button className="mini" onClick={emparejar}>
                {t("Emparejar un móvil")}
              </button>
            </div>
          )}

          {!!estado.dispositivos.length && (
            <>
              <h3 className="movil-paso">{t("3. Los avisos")}</h3>
              <p className="card-hint">
                {estado.avisos
                  ? t("{n} móvil(es) con avisos: cuando una sesión te pregunte o termine y no estés delante del PC, le llega.", { n: estado.avisos })
                  : t("Ningún móvil ha pedido avisos todavía. En el móvil, en la lista del conserje, toca «Avisarme en este móvil».")}
              </p>
              {!!estado.avisos && (
                <div className="movil-botones">
                  <button
                    className="mini"
                    disabled={ocupado}
                    onClick={() => {
                      setPrueba(null);
                      movilAvisar(t("Prueba de Adeorq"), t("Si lees esto, los avisos llegan a tu móvil."))
                        .then((n) => setPrueba(t("Mandado a {n} móvil(es). Si no llega en un minuto, mira rastro.log.", { n })))
                        .catch((e) => setError(String(e)));
                    }}
                  >
                    {t("Mandar un aviso de prueba")}
                  </button>
                  {prueba && <span className="setting-line">{prueba}</span>}
                </div>
              )}
              <h3 className="movil-paso">{t("Móviles emparejados")}</h3>
              <ul className="movil-lista">
                {estado.dispositivos.map((d) => {
                  const visto = hace(d.visto * 1000);
                  return (
                    <li key={d.id}>
                      <span>
                        <strong>{d.nombre}</strong>
                        <em>{t("visto {c}", { c: t(visto.clave, { n: visto.valor }) })}</em>
                      </span>
                      <button className="mini" onClick={() => olvidar(d.id)}>
                        {t("Quitar")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      {error && <p className="setting-line setting-bad">⚠ {error}</p>}
    </section>
  );
}
