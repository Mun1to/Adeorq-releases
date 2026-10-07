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
  // agentes en `a_medias` se espera a que terminen y se hace solo. Lo que
  // cuenta como «a medio trabajo» está en `lib/actualizar.ts`; los estados
  // salen del almacén de la Cabina, sin pasar por props.
  const estados = useCabina((s) => s.estados);
  const frenan = useMemo(() => trabajando(estados), [estados]);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

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

  const install = () => {
    if (!update) return;
    setPhase("downloading");
    let total = 0;
    let got = 0;
    update
      .downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total > 0) setPct(Math.min(99, Math.round((got / total) * 100)));
        } else if (e.event === "Finished") setPct(100);
      })
      .then(() => setPhase("done"))
      .catch((e) => {
        setError(String(e));
        setPhase("error");
      });
  };

  const hacer = (que: Pendiente) => {
    if (que === "instalar") install();
    else void relaunch();
  };
  /** Lo que pide el botón: ahora si nadie está a medio trabajo, y si no, en cuanto acaben. */
  const pedir = (que: Pendiente) => {
    if (frenan.length > 0) setPendiente(que);
    else hacer(que);
  };
  useEffect(() => {
    if (pendiente && frenan.length === 0) {
      setPendiente(null);
      hacer(pendiente);
    }
    // `hacer` cambia en cada render (cierra sobre `update`); lo que decide es
    // que la lista se vacíe con algo pendiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente, frenan.length]);

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
  const esperando = pendiente !== null && frenan.length > 0;
  const nombre = esperando
    ? t("Espera a que terminen")
    : phase === "done"
      ? t("Reinicia para estrenar")
      : t("Actualizar Adeorq");
  // Esperando, el mismo botón es «no esperes»: lo hace ya, con los agentes a
  // medias. Es su decisión, y la tarjeta lo dice en la línea de debajo.
  const accion = esperando
    ? () => {
        const que = pendiente;
        setPendiente(null);
        hacer(que);
      }
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
