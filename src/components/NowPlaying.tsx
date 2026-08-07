import { useEffect, useRef, useState } from "react";
import {
  mediaNext,
  mediaNow,
  mediaPlayPause,
  mediaPrev,
  type NowPlayingInfo,
} from "../lib/pty";
import { useT } from "../lib/i18n";
import { latido } from "../lib/latido";

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
    // Ver `lib/latido.ts`: con Adeorq minimizado no hay barra que actualizar,
    // y esto preguntaba a Windows qué suena cada cuatro segundos igual.
    return latido(look, POLL_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const label = info?.artist ? `${info.title} · ${info.artist}` : (info?.title ?? "");

  /* Cuánto se sale el título de su hueco, MEDIDO.
   *
   * Contar letras no vale: el ancho depende de la fuente, del idioma y de lo
   * ancha que tengas la ventana, y un carrusel que se mueve cuando el texto sí
   * cabía es una animación regalada en la barra de cristal, que es justo lo
   * que costó núcleo y medio en agosto. Aquí se pregunta al navegador. */
  const caja = useRef<HTMLSpanElement>(null);
  const tira = useRef<HTMLSpanElement>(null);
  const [sobra, setSobra] = useState(0);

  useEffect(() => {
    const medir = () => {
      const c = caja.current;
      const t = tira.current;
      if (!c || !t) return;
      // Un par de píxeles de margen: los anchos fraccionarios dejan sobras de
      // medio píxel que encenderían el carrusel en un título que cabe entero.
      const fuera = t.scrollWidth - c.clientWidth;
      setSobra(fuera > 2 ? fuera : 0);
    };
    medir();
    const c = caja.current;
    if (!c) return;
    // La barra se estrecha al cambiar el tamaño de la ventana, y entonces un
    // título que cabía deja de caber.
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, [label]);

  if (!info) return null;

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
        {/* El título entero, pasando.
            En una ventana estrecha aquí caben veinte letras y una canción se
            queda en «Pass The Dutchie · Music…»: no sabes ni de quién es
            (Munir, 2026-08-07). En vez de cortarlo, pasa como un carrusel.
            Se para al pasar el ratón, para poder leerlo quieto. */}
        <span className="np-text" ref={caja} data-largo={sobra > 0 || undefined}>
          <span
            className="np-tira"
            ref={tira}
            style={sobra > 0 ? ({ ["--sobra" as string]: `${sobra}px` }) : undefined}
          >
            {label}
          </span>
        </span>
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
