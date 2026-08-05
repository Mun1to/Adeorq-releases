import { useEffect, useState } from "react";
import {
  mediaNext,
  mediaNow,
  mediaPlayPause,
  mediaPrev,
  type NowPlayingInfo,
} from "../lib/pty";
import { useT } from "../lib/i18n";

// The music strip in the top bar. It reads Windows' media session, so it works
// with Spotify without asking Munir for any account: no login, no tokens.
const POLL_MS = 4000;

export default function NowPlaying() {
  const { t } = useT();
  const [info, setInfo] = useState<NowPlayingInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const look = () => {
      // Volume lives in Windows' own mixer: one slider less in the bar.
      mediaNow()
        .then(setInfo)
        .catch(() => setInfo(null));
    };
    look();
    const timer = setInterval(look, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!info) return null;

  const label = info.artist ? `${info.title} · ${info.artist}` : info.title;

  const act = (fn: () => Promise<unknown>) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void fn().catch(() => {});
    // Give the player a moment, then refresh what is showing.
    window.setTimeout(() => {
      mediaNow().then(setInfo).catch(() => {});
    }, 450);
  };

  return (
    <div className="np" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="np-title"
        data-tip={`${label}\n${info.app}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="np-eq" data-on={info.playing}>
          <i />
          <i />
          <i />
        </span>
        <span className="np-text">{label}</span>
      </button>
      <button
        className="np-btn-mini"
        data-tip={t("Canción anterior")}
        onClick={act(mediaPrev)}
      >
        ⏮
      </button>
      <button
        className="np-btn-mini np-play"
        data-tip={info.playing ? t("Pausar") : t("Reanudar")}
        onClick={act(mediaPlayPause)}
      >
        {info.playing ? "❚❚" : "▶"}
      </button>
      <button
        className="np-btn-mini"
        data-tip={t("Siguiente canción")}
        onClick={act(mediaNext)}
      >
        ⏭
      </button>
      {open && (
        <div className="np-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="np-pop-title">{info.title}</div>
          {info.artist && <div className="np-pop-artist">{info.artist}</div>}
          <div className="np-pop-app">{info.app}</div>
        </div>
      )}
    </div>
  );
}
