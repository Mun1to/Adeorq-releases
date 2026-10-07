import { useEffect, useMemo, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useT } from "../lib/i18n";
import { anotarRastro } from "../lib/pty";
import { useCabina } from "../lib/cabina";
import { quienFrena, trabajando } from "../lib/actualizar";
import { AdeorqMark, CloseIcon, DownloadIcon } from "./Icons";

// Auto-update like VoCript: check once on start (and every few hours for the
// panels Munir leaves open for days), then install only when he says so.
// Dev builds have no updater endpoint, so check() just fails and we stay quiet.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** Lo mínimo entre dos comprobaciones. Ahora que también se mira al volver a
    la ventana, sin este suelo un rato de alt-tabs serían veinte peticiones. */
const MIN_ENTRE_MS = 5 * 60 * 1000;
const NOTIFIED_KEY = "adeorq-update-notified";

type Phase = "idle" | "found" | "downloading" | "done" | "error";
/** Lo que Munir pidió y está esperando a que los agentes terminen. */
type Pendiente = "instalar" | "reiniciar";

export default function UpdateBar() {
  const { t } = useT();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  // Una actualización no corta a un agente a medio trabajo (decisión C3 de
  // Munir, 2026-10-07): instalar y reiniciar matan el proceso, así que si hay
  // agentes trabajando se espera a que terminen y se hace solo. Lo que cuenta
  // como «a medio trabajo» está en `lib/actualizar.ts`; los estados salen del
  // almacén de la Cabina, sin pasar por props.
  //
  // Instalar va en DOS pasos (2026-10-08): primero se descarga, que no cierra
  // nada, y se instala después, que en Windows es lo que cierra la app. Antes
  // se miraba quién trabajaba al pulsar y luego bajaba: lo que empezara en
  // esos segundos se cortaba. Ahora se mira en el instante de instalar, y
  // mientras se espera se vuelve a mirar cada segundo, porque lo que se mueve
  // en una terminal no es estado de React.
  const estados = useCabina((s) => s.estados);
  const [ahora, setAhora] = useState(() => Date.now());
  const frenan = useMemo(() => trabajando(estados, undefined, ahora), [estados, ahora]);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  /** Ya bajada y esperando a instalarse. */
  const [descargada, setDescargada] = useState(false);
  /** «Pulsa para no esperar»: se instala en cuanto esté bajada, trabaje quien trabaje. */
  const [sinEsperar, setSinEsperar] = useState(false);

  // A Windows toast on top of the in-app bar: Adeorq lives minimised for days,
  // so the bar alone would go unseen. Announced once per version.
  const announce = async (version: string) => {
    if (sessionStorage.getItem(NOTIFIED_KEY) === version) return;
    sessionStorage.setItem(NOTIFIED_KEY, version);
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (granted) {
        sendNotification({
          title: `Adeorq ${version} disponible`,
          body: "Ábrelo y pulsa «Actualizar ahora» en la barra de arriba.",
        });
      }
    } catch {
      // Notifications blocked by the system: the in-app bar still shows.
    }
  };

  useEffect(() => {
    // Cuándo se miró por última vez, para no preguntar cien veces al ir y
    // volver de la ventana. Fuera del estado: no se pinta, y cambiarlo no tiene
    // que rehacer nada.
    let ultima = 0;
    const look = (motivo: string) => {
      const ahora = Date.now();
      if (ahora - ultima < MIN_ENTRE_MS) return;
      ultima = ahora;
      check()
        .then((u) => {
          if (u) {
            setUpdate(u);
            setPhase("found");
            void announce(u.version);
          }
        })
        .catch((e) => {
          // En pantalla no se dice nada, y eso estaba bien: sin conexión o en
          // una compilación de desarrollo no hay endpoint, y dar la lata por
          // eso sería peor. Lo que estaba mal era que TAMPOCO quedaba en
          // ningún sitio: Adeorq no tiene consola, así que el comprobador podía
          // llevar horas fallando sin un solo indicio, y un «reinicié y no me
          // aparece el aviso» no se podía ni empezar a mirar (Munir,
          // 2026-08-08). Ahora va al rastro, que es donde se mira primero.
          void anotarRastro(`el comprobador de actualizaciones falló (${motivo}): ${e}`);
        });
    };
    look("arranque");
    const timer = setInterval(() => look("cada 6 h"), CHECK_EVERY_MS);
    // Y al volver a la ventana. Sin esto, un fallo puntual en el arranque (la
    // red que aún no está, la caché de GitHub sirviendo el archivo de hace un
    // minuto) dejaba a Adeorq seis horas sin volver a mirar, y la única salida
    // era reiniciarla otra vez y confiar.
    const alVolver = () => {
      if (!document.hidden) look("al volver");
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  const fallo = (e: unknown) => {
    setError(String(e));
    setPhase("error");
    setPendiente(null);
  };
  /** El primer paso: bajar la versión. No cierra nada, así que no espera a nadie. */
  const descargar = () => {
    if (!update || descargada || phase === "downloading") return;
    setPhase("downloading");
    let total = 0;
    let got = 0;
    update
      .download((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total > 0) setPct(Math.min(99, Math.round((got / total) * 100)));
        } else if (e.event === "Finished") setPct(100);
      })
      .then(() => {
        setDescargada(true);
        setPhase("found");
      })
      .catch(fallo);
  };
  /** El segundo: instalar lo bajado. En Windows la app se cierra aquí. */
  const instalar = () => {
    if (!update) return;
    setPhase("downloading");
    update.install().then(() => setPhase("done")).catch(fallo);
  };

  /** Lo que pide el botón. Instalar siempre empieza bajando; el resto lo decide el efecto de abajo. */
  const pedir = (que: Pendiente) => {
    setSinEsperar(false);
    setPendiente(que);
    if (que === "instalar") descargar();
  };
  // Mientras algo espera, se vuelve a mirar cada segundo quién se mueve.
  useEffect(() => {
    if (!pendiente) return;
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(reloj);
  }, [pendiente]);
  useEffect(() => {
    if (!pendiente) return;
    if (pendiente === "instalar" && !descargada) return;
    // Lo de ESTE instante, no lo del último render: es lo que se va a cortar.
    if (!sinEsperar && trabajando(useCabina.getState().estados).length > 0) return;
    setPendiente(null);
    setSinEsperar(false);
    if (pendiente === "instalar") instalar();
    else void relaunch();
    // `instalar` cierra sobre `update` y cambia en cada render; lo que decide
    // es que haya algo pendiente y que el reloj de arriba vuelva a mirar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente, descargada, sinEsperar, ahora]);

  if (phase === "idle" || !update) return null;

  // Una TARJETA abajo a la izquierda, no una franja arriba del todo.
  //
  // Era una línea que cruzaba la ventana entera y empujaba hacia abajo la app
  // completa: por un aviso que se lee en dos segundos, se recolocaban la barra,
  // la Cabina y todas las terminales, y encima el único sitio de la pantalla
  // donde uno no está mirando es el borde de arriba. Munir pidió la forma que
  // usa la app de escritorio de Claude (2026-08-08): una tarjeta pequeña que se
  // posa sobre el contenido sin moverlo, con la marca a la izquierda y un solo
  // gesto a la derecha.
  const esperando =
    pendiente !== null &&
    (pendiente === "reiniciar" || descargada) &&
    !sinEsperar &&
    frenan.length > 0;
  const nombre = esperando
    ? t("Espera a que terminen")
    : phase === "done"
      ? t("Reinicia para estrenar")
      : t("Actualizar Adeorq");
  // Esperando, el mismo botón es «no esperes»: lo hace ya, con los agentes a
  // medias. Es su decisión, y la tarjeta lo dice en la línea de debajo.
  const accion = esperando
    ? () => setSinEsperar(true)
    : phase === "done"
      ? () => pedir("reiniciar")
      : () => pedir("instalar");

  return (
    <div className="update-card" data-phase={esperando ? "esperando" : phase} role="status">
      <button
        className="update-card-main"
        onClick={accion}
        disabled={phase === "downloading"}
        data-tip={
          esperando
            ? t("Actualizar en cuanto terminen {quien}", { quien: quienFrena(frenan) })
            : phase === "done"
              ? t("Reiniciar Adeorq")
              : t("Descargar e instalar la versión {v}", { v: update.version })
        }
      >
        <span className="update-mark">
          <AdeorqMark size={26} />
        </span>
        <span className="update-texto">
          <span className="update-tit">
            {phase === "error" ? t("No pude actualizar") : nombre}
          </span>
          <span className="update-sub">
            {esperando
              ? t("{quien} a medio trabajo · pulsa para no esperar", { quien: quienFrena(frenan) })
              : phase === "downloading"
                ? `${pct}%`
                : phase === "error"
                  ? error
                  : `v${update.version}`}
          </span>
        </span>
        {/* La flecha a la derecha del original de Claude es «ir a», y esto no
            lleva a ninguna parte: descarga. Un icono de bajar, macizo.
            Mientras baja NO se pinta: la barra de abajo ya lo está diciendo, y
            un icono de «descargar» al lado de algo que ya se está descargando
            es la misma información dos veces (Munir, 2026-08-08). */}
        {phase !== "downloading" && (
          <span className="update-flecha">
            <DownloadIcon size={19} />
          </span>
        )}
      </button>
      {/* La barra de descarga va PEGADA al borde de abajo de la tarjeta, no como
          un elemento más: así crece sin mover ni un píxel de lo de arriba. */}
      {phase === "downloading" && (
        <span className="update-barra" style={{ width: `${pct}%` }} />
      )}
      {phase !== "downloading" && (
        <button
          className="update-no"
          data-tip={esperando ? t("Dejar de esperar") : t("Ahora no")}
          onClick={() => (esperando ? setPendiente(null) : setUpdate(null))}
        >
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  );
}
