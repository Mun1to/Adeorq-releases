import { useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { type Account } from "../lib/pty";
import { limitesDe, loQueTePara } from "../lib/cuota";
import { anotarCuota } from "../lib/mundo";
import { useT } from "../lib/i18n";

// El aviso de cuota: que enterarse de que se te ha acabado el plan no sea el
// propio agente plantándose a mitad de una tarea.
//
// Adeorq ya sabía el dato y no lo miraba nunca por su cuenta: la pestaña
// Cuentas pregunta los límites al abrirla y ahí se queda. Esto lo pregunta
// solo, cada tanto, y cuando una cuenta se acerca al final avisa Y ofrece la
// salida, que es la mitad que faltaba: saber que te has quedado sin plan sin
// poder hacer nada es media noticia.
//
// Preguntar NO gasta cuota: `/usage` es un comando local del CLI (ver el
// comentario de usage_limits en Rust). Lo que sí cuesta es un proceso por
// cuenta, y por eso no se pregunta si no hay ninguna terminal de agente
// abierta: sin nadie trabajando no hay nada que interrumpir.

/** A partir de aquí se avisa. Por debajo, la cuenta aguanta la sesión. */
const UMBRAL = 85;
/** Y una cuenta solo vale como salida por debajo de esto: mandarte a otra que
    también está a punto de agotarse es hacerte perder el turno dos veces. */
const MARGEN = 60;
const MIRAR_CADA_MS = 20 * 60 * 1000;
/** La primera mirada no es en el arranque: ahí la app está montando terminales
    y lo último que hace falta es competir con ellas por el disco. */
const PRIMERA_MIRADA_MS = 45 * 1000;
const AVISADO_KEY = "adeorq-cuota-avisada";

interface Lectura {
  /** El peor de sus límites, que es el que te va a cortar primero. */
  peor: number;
  /** Cuándo se renueva, tal como lo escribe el CLI. */
  resets: string;
}

/** Un panel de agente vivo, con lo que hace falta para relevarlo. */
export interface PanelVivo {
  cwd: string;
  account?: string;
  name?: string;
  /** Su transcript: de ahí sale el acta con lo último que dijo. */
  sessionId?: string;
}

interface Props {
  /** Las cuentas de Claude, la principal incluida. */
  cuentas: Account[];
  /** Los paneles de agente vivos. Sin ninguno no se pregunta nada. */
  paneles: PanelVivo[];
  /** Abre el relevo. El origen viaja entero porque la terminal nueva nace con
   *  un acta de dónde iba la vieja, no vacía (ver `lib/relevo.ts`). */
  onAbrir: (cuenta: Account, origen: PanelVivo & { cuenta?: string }) => void;
}

export default function AvisoCuota({ cuentas, paneles, onAbrir }: Props) {
  const { t } = useT();
  const [lecturas, setLecturas] = useState<Record<string, Lectura>>({});
  /** El aviso que ya has cerrado, por cuenta y por renovación: cuando la cuota
      se renueva el texto de la renovación cambia y vuelve a poder avisar. */
  const [cerrado, setCerrado] = useState("");
  // Las cuentas cambian poco y el sondeo dura minutos: por una ref, para que
  // añadir una cuenta no reinicie el reloj a medias.
  const cuentasRef = useRef(cuentas);
  cuentasRef.current = cuentas;
  const hayAgentes = paneles.length > 0;

  useEffect(() => {
    if (!hayAgentes) return;
    let stop = false;
    let timer = 0;

    const mirar = async () => {
      for (const acc of cuentasRef.current) {
        if (stop) return;
        try {
          // Por el portero de `lib/cuota.ts`, no directo: preguntarlo lanza un
          // proceso `claude` de cinco segundos y aquí se preguntaba una vez por
          // cuenta cada veinte minutos, aparte de lo que preguntaran el panel de
          // uso y el router por su cuenta. Ahora la lectura se comparte.
          const l = await limitesDe(acc.dir);
          const peor = loQueTePara(l);
          if (stop) return;
          setLecturas((prev) => ({
            ...prev,
            [acc.id]: { peor: peor.percent, resets: peor.resets },
          }));
          // Y de paso se lo queda el router, que necesita este mismo número
          // para recomendar cerebro. Sin esta línea repetiría el sondeo entero
          // un minuto después para enterarse de lo mismo (ver `lib/mundo.ts`).
          anotarCuota(acc.id, peor.percent);
        } catch {
          // Sin CLI, sin sesión iniciada o tardando demasiado: esto es un
          // extra, y un extra que falla se calla. La pestaña Cuentas ya enseña
          // el error de verdad cuando él va a mirar.
        }
      }
      if (!stop) timer = window.setTimeout(() => void mirar(), MIRAR_CADA_MS);
    };

    timer = window.setTimeout(() => void mirar(), PRIMERA_MIRADA_MS);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [hayAgentes]);

  const conLectura = cuentas
    .map((acc) => ({ acc, l: lecturas[acc.id] }))
    .filter((x): x is { acc: Account; l: Lectura } => !!x.l);
  const apurada = conLectura
    .filter((x) => x.l.peor >= UMBRAL)
    .sort((a, b) => b.l.peor - a.l.peor)[0];
  const salidas = conLectura
    .filter((x) => x.l.peor <= MARGEN && x.acc.id !== apurada?.acc.id)
    .sort((a, b) => a.l.peor - b.l.peor);

  const clave = apurada ? `${apurada.acc.id}|${apurada.l.resets}|${apurada.l.peor >= 99}` : "";

  // Un aviso de Windows además de la barra: Adeorq vive minimizado mientras el
  // agente trabaja, que es justo cuando esto pasa. Uno por cuenta y renovación.
  useEffect(() => {
    if (!clave || !apurada) return;
    if (sessionStorage.getItem(AVISADO_KEY) === clave) return;
    sessionStorage.setItem(AVISADO_KEY, clave);
    void (async () => {
      try {
        let ok = await isPermissionGranted();
        if (!ok) ok = (await requestPermission()) === "granted";
        if (ok) {
          sendNotification({
            title: `Adeorq · ${apurada.acc.label} ${apurada.l.peor}%`,
            body: t("Se renueva {r}. Ábrelo para seguir en otra cuenta.", {
              r: apurada.l.resets || "?",
            }),
          });
        }
      } catch {
        // Notificaciones bloqueadas por el sistema: la barra sigue saliendo.
      }
    })();
  }, [clave, apurada, t]);

  if (!apurada || cerrado === clave) return null;

  // A quién se releva: el panel que trabajaba con la cuenta que se agota, y si
  // no se puede saber, el primero. De ahí sale la carpeta Y el acta.
  const origen = paneles.find((p) => p.account === apurada.acc.label) ?? paneles[0];

  return (
    <div className="update-bar cuota-bar" data-lleno={apurada.l.peor >= 99}>
      <span>
        {t("«{c}» va por el {p}% de su límite.", {
          c: apurada.acc.label,
          p: apurada.l.peor,
        })}
        {apurada.l.resets ? ` ${t("Se renueva {r}.", { r: apurada.l.resets })}` : ""}
      </span>
      {salidas.length > 0 ? (
        <>
          <span className="cuota-sep">{t("Seguir en")}:</span>
          {salidas.map(({ acc, l }) => (
            <button
              key={acc.id}
              className="np-btn update-btn"
              disabled={!origen}
              data-tip={t(
                "Abre una terminal con esa cuenta y le deja escrito dónde ibas, para que no empieces de cero",
              )}
              onClick={() => {
                setCerrado(clave);
                if (origen) onAbrir(acc, { ...origen, cuenta: apurada.acc.label });
              }}
            >
              {acc.label} ({l.peor}%)
            </button>
          ))}
        </>
      ) : (
        <span className="cuota-sep">
          {t("No tienes otra cuenta con margen. Se añaden en la pestaña Cuentas.")}
        </span>
      )}
      <button className="mini" data-tip={t("Ahora no")} onClick={() => setCerrado(clave)}>
        ×
      </button>
    </div>
  );
}
