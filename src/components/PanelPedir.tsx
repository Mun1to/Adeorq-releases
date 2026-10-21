// La caja del Panel: lo que le pides a Adeo, que es el conserje del Chat.
//
// Escribes (o dictas) y al mandarlo se abre el Chat con una conversación nueva
// del conserje que ya lo lleva dentro: él lo parte en trabajos y abre una
// sesión para cada uno (`dejarPedido`, en `lib/conserje.ts`). Antes aquí
// estaba la tarjeta entera del Capataz, con tres botones, tres modos y cinco
// ejemplos (Munir, 2026-10-17: «demasiadas cosas a la vez»); el Capataz sigue
// en Ctrl+Mayús+A.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { algunoPensando, onPensando } from "../lib/conserje";
import { dictar, transcribir, vozLista, type Dictado } from "../lib/voz";
import { SendIcon, VozIcon } from "./Icons";

export default function PanelPedir({ onPedir }: { onPedir: (texto: string) => void }) {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [oyendo, setOyendo] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [vozError, setVozError] = useState<string | null>(null);
  const dictado = useRef<Dictado | null>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  /** Adeo pensando en alguna conversación (la de aquí o la del móvil): la caja
      lleva entonces su filo de luz dando la vuelta. */
  const [trabaja, setTrabaja] = useState(algunoPensando);
  useEffect(() => onPensando(() => setTrabaja(algunoPensando())), []);

  // Crece con lo que lleva, hasta seis renglones, como la caja del conserje.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  // Irse del Panel con el micrófono abierto lo dejaría encendido: se suelta, y
  // lo dicho se tira, que es lo que quiere decir irse sin terminar.
  useEffect(
    () => () => {
      dictado.current?.cancelar();
      dictado.current = null;
    },
    [],
  );

  const enviar = () => {
    const txt = texto.trim();
    if (!txt) return;
    setTexto("");
    onPedir(txt);
  };

  // El mismo dictado que el Capataz (`lib/voz.ts`): un clic empieza a oír y
  // otro termina, y lo dicho se SUMA a lo escrito en vez de pisarlo.
  const voz = () => {
    setVozError(null);
    const d = dictado.current;
    if (d) {
      dictado.current = null;
      setOyendo(false);
      setTranscribiendo(true);
      d.parar()
        .then((wav) => transcribir(wav))
        .then((dicho) => {
          if (dicho) setTexto((prev) => (prev.trim() ? `${prev.trim()} ${dicho}` : dicho));
        })
        .catch((e) => setVozError(String(e)))
        .finally(() => setTranscribiendo(false));
      return;
    }
    // Se pregunta ANTES de abrir el micrófono si whisper está: al revés, hablabas
    // para nada y el aviso llegaba al terminar.
    vozLista()
      .then(() => dictar())
      .then((nuevo) => {
        dictado.current = nuevo;
        setOyendo(true);
      })
      .catch((e) => setVozError(String(e)));
  };

  const nota = oyendo
    ? t("Te escucho. Pulsa otra vez para terminar.")
    : transcribiendo
      ? t("Transcribiendo…")
      : (vozError ?? t("Adeo lo reparte en sesiones y el router elige el modelo."));

  return (
    <div className="inicio-caja" data-trabajando={trabaja}>
      <textarea
        ref={caja}
        id="inicio-pedir"
        className="inicio-texto"
        rows={2}
        value={texto}
        aria-label={t("Lo que le pides a Adeo")}
        placeholder={t("Dile a Adeo qué hacemos: «abre lo de Orquio», «repasa el login», «sube lo de hoy»…")}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            enviar();
          }
        }}
      />
      <div className="inicio-mandos">
        <span className="inicio-nota" data-oyendo={oyendo || undefined} data-error={(!oyendo && !transcribiendo && !!vozError) || undefined}>
          {nota}
        </span>
        <span className="inicio-botones">
          <button
            type="button"
            className="mini icono"
            data-tip={t("Dictar")}
            aria-label={t("Dictar")}
            aria-pressed={oyendo}
            disabled={transcribiendo}
            onClick={() => voz()}
          >
            <VozIcon />
          </button>
          <button type="button" className="np-btn inicio-enviar" disabled={!texto.trim()} onClick={() => enviar()}>
            <SendIcon size={15} />
            {t("Enviar")}
          </button>
        </span>
      </div>
    </div>
  );
}
