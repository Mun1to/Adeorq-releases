import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useT } from "../lib/i18n";

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

  return (
    <div className="update-bar" data-phase={phase}>
      {phase === "found" && (
        <>
          <span>
            {t("Hay una versión nueva de Adeorq")} (<strong>{update.version}</strong>).
          </span>
          <button className="np-btn update-btn" onClick={install}>
            {t("Actualizar ahora")}
          </button>
          <button className="mini" data-tip={t("Ahora no")} onClick={() => setUpdate(null)}>
            ×
          </button>
        </>
      )}
      {phase === "downloading" && (
        <span>
          {t("Descargando la actualización…")} {pct}%
        </span>
      )}
      {phase === "done" && (
        <>
          <span>{t("Listo. Reinicia para estrenar la versión nueva.")}</span>
          <button className="np-btn update-btn" onClick={() => void relaunch()}>
            {t("Reiniciar")}
          </button>
        </>
      )}
      {phase === "error" && (
        <>
          <span>{t("No pude actualizar")}: {error}</span>
          <button className="mini" onClick={() => setUpdate(null)}>
            ×
          </button>
        </>
      )}
    </div>
  );
}
