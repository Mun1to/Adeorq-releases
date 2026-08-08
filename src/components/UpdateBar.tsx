import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useT } from "../lib/i18n";
import { AdeorqMark, CloseIcon, DownloadIcon } from "./Icons";

// Auto-update like VoCript: check once on start (and every few hours for the
// panels Munir leaves open for days), then install only when he says so.
// Dev builds have no updater endpoint, so check() just fails and we stay quiet.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const NOTIFIED_KEY = "adeorq-update-notified";

type Phase = "idle" | "found" | "downloading" | "done" | "error";

export default function UpdateBar() {
  const { t } = useT();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");

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
    const look = () => {
      check()
        .then((u) => {
          if (u) {
            setUpdate(u);
            setPhase("found");
            void announce(u.version);
          }
        })
        .catch(() => {
          // No endpoint (dev build) or no connection: never nag about it.
        });
    };
    look();
    const timer = setInterval(look, CHECK_EVERY_MS);
    return () => clearInterval(timer);
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
  const nombre = phase === "done" ? t("Reinicia para estrenar") : t("Actualizar Adeorq");
  const accion = phase === "done" ? () => void relaunch() : install;

  return (
    <div className="update-card" data-phase={phase} role="status">
      <button
        className="update-card-main"
        onClick={accion}
        disabled={phase === "downloading"}
        data-tip={
          phase === "done"
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
            {phase === "downloading"
              ? `${pct}%`
              : phase === "error"
                ? error
                : `v${update.version}`}
          </span>
        </span>
        {/* La flecha a la derecha del original de Claude es «ir a», y esto no
            lleva a ninguna parte: descarga. Un icono de bajar, macizo. */}
        <span className="update-flecha">
          <DownloadIcon size={19} />
        </span>
      </button>
      {/* La barra de descarga va PEGADA al borde de abajo de la tarjeta, no como
          un elemento más: así crece sin mover ni un píxel de lo de arriba. */}
      {phase === "downloading" && (
        <span className="update-barra" style={{ width: `${pct}%` }} />
      )}
      {phase !== "downloading" && (
        <button
          className="update-no"
          data-tip={t("Ahora no")}
          onClick={() => setUpdate(null)}
        >
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  );
}
