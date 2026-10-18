import { useEffect, useRef, useState } from "react";
import { WEB_EVENTO, type WebAvisada } from "../lib/puertos";
import { puertoEscucha } from "../lib/navegador";
import { useT } from "../lib/i18n";

// Cuando una terminal levanta un servidor, Adeorq ofrece abrir la web.
//
// Munir, 2026-08-24: «que cuando una terminal nombre algo de un localhost o
// puerto, automáticamente se abra la pestaña de navegador del panel de la
// derecha». Arrancar un servidor de desarrollo y copiar la dirección al panel
// de al lado es el paso que sobra: la terminal ya la ha escrito.
//
// Y Munir, 2026-10-07: «haz que pregunte antes de abrir en Adeorq la ventana de
// localhost». Abrirla sola era de las pocas cosas que la app hacía sin que la
// tocaras, y un servidor que arranca no siempre es uno que quieres mirar (un
// agente levanta el suyo para probar y lo tira). Así que ahora sale una
// pastilla abajo a la derecha, junto al panel donde se abriría, con «Abrir» y
// «Ahora no»; a los veinte segundos sin contestar se va sola, que una pregunta
// que se queda para siempre es otro aviso que estorba. El ajuste sigue
// apagándolo todo, pregunta incluida.
//
// ── POR QUÉ ES UN COMPONENTE Y NO UN `useEffect` DENTRO DE `App` ──────────
//
// Porque ahí no se podía probar. `App.tsx` pasa de las 2.000 líneas y necesita
// media app montada para arrancar, así que un efecto dentro suyo solo se
// comprueba abriendo Adeorq y haciendo clics, que es justo lo que un agente no
// puede hacer en este escritorio. Aquí fuera se monta en un banco de pruebas
// con dos líneas, se le dispara el evento y se mira si llama a `onAbrir`.
//
// ── LA MITAD QUE EVITA QUE ESTO SEA UN CASTIGO ────────────────────────────
//
// Encontrar `http://localhost:3000` en una terminal NO significa que ahí haya
// un servidor: un agente escribe esa dirección en sus respuestas todo el rato.
// Por eso entre el aviso y la pregunta hay otra, y la contesta el sistema
// operativo: ¿contesta ese puerto? Si no contesta, no se pregunta nada, y la
// prosa se cae sola sin tener que adivinar cuál era prosa.

/** Lo que dura la pregunta en pantalla si no la contestas. */
export const PREGUNTA_MS = 20_000;

/** Lo que se espera para volver a mirar un puerto que no contestaba, si la
    terminal lo sigue nombrando: la dirección suele salir antes que el servidor
    (el comando escrito, o un agente que avisa de que lo va a arrancar). */
export const OTRA_VEZ_MS = 1000;

interface Props {
  /** Si está apagado, no se escucha nada: ni el evento, ni el puerto. */
  activo: boolean;
  /**
   * Abrir esa dirección. Quien lo reciba NO debe cambiar de vista: sacarte del
   * lienzo porque dijiste «Abrir» a una web es peor que el paso que ahorra.
   */
  onAbrir: (url: string) => void;
  /**
   * Cómo se pregunta si un puerto está vivo. Solo se pasa en las pruebas; en la
   * app va por Rust, que prueba IPv4 e IPv6 con un plazo de 250 ms.
   */
  comprobar?: (puerto: number) => Promise<boolean>;
}

/** «http://localhost:5173/» se lee «localhost:5173»: lo demás no informa. */
function corta(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export default function WebAuto({ activo, onAbrir, comprobar }: Props) {
  const { t } = useT();
  const [pregunta, setPregunta] = useState<string | null>(null);
  /* Los puertos por los que ya se preguntó: una vez por puerto, contestes lo que
     contestes. Un servidor de desarrollo repite su dirección al recargar y un
     agente la nombra en cada respuesta, y la terminal avisa de todas. */
  const preguntados = useRef(new Set<number>());

  useEffect(() => {
    if (!activo) {
      setPregunta(null);
      return;
    }
    const preguntar = comprobar ?? puertoEscucha;
    let vivo = true;
    /* Lo que se está mirando de cada puerto que aún no contestó: si hay una
       pregunta al sistema en vuelo, hasta cuándo no se vuelve a mirar, y el
       reloj de la siguiente si la terminal lo volvió a nombrar entretanto. */
    const mirando = new Map<number, { url: string; enVuelo: boolean; hasta: number; reloj?: number }>();
    const mirar = (puerto: number) => {
      const m = mirando.get(puerto);
      if (!m || !vivo) return;
      m.enVuelo = true;
      void preguntar(puerto)
        .catch(() => false)
        .then((responde) => {
          m.enVuelo = false;
          // `vivo` y no una comprobación suelta: la pregunta tarda hasta un
          // cuarto de segundo, y en ese hueco puedes haber apagado el ajuste o
          // cerrado la vista. Preguntar después de eso sería desobedecer con
          // retraso. Si llegan dos, se queda la última: es la que acabas de ver
          // aparecer en la terminal.
          if (!vivo) return;
          if (responde) {
            mirando.delete(puerto);
            if (m.reloj) window.clearTimeout(m.reloj);
            preguntados.current.add(puerto);
            setPregunta(m.url);
          } else {
            m.hasta = Date.now() + OTRA_VEZ_MS;
          }
        });
    };
    const alAnunciar = (e: Event) => {
      const d = (e as CustomEvent<WebAvisada>).detail;
      if (!d?.puerto || !d.url || preguntados.current.has(d.puerto)) return;
      const m = mirando.get(d.puerto);
      if (!m) {
        mirando.set(d.puerto, { url: d.url, enVuelo: false, hasta: 0 });
        mirar(d.puerto);
        return;
      }
      m.url = d.url;
      // Ya se está mirando o acaba de no contestar: otra vez al acabar la espera.
      if (m.reloj) return;
      m.reloj = window.setTimeout(() => {
        m.reloj = undefined;
        if (!m.enVuelo) mirar(d.puerto);
      }, Math.max(0, m.hasta - Date.now(), m.enVuelo ? OTRA_VEZ_MS : 0));
    };
    window.addEventListener(WEB_EVENTO, alAnunciar);
    return () => {
      vivo = false;
      for (const m of mirando.values()) if (m.reloj) window.clearTimeout(m.reloj);
      window.removeEventListener(WEB_EVENTO, alAnunciar);
    };
  }, [activo, comprobar]);

  // Se va sola. Cada pregunta nueva vuelve a contar desde cero.
  useEffect(() => {
    if (!pregunta) return;
    const reloj = window.setTimeout(() => setPregunta(null), PREGUNTA_MS);
    return () => window.clearTimeout(reloj);
  }, [pregunta]);

  if (!pregunta) return null;
  return (
    <div className="deshacer-pill web-pregunta" role="status">
      <span>{t("¿Abro {u} en la web?", { u: corta(pregunta) })}</span>
      <button
        className="mini"
        onClick={() => {
          onAbrir(pregunta);
          setPregunta(null);
        }}
      >
        {t("Abrir")}
      </button>
      <button className="mini modal-cancel" onClick={() => setPregunta(null)}>
        {t("Ahora no")}
      </button>
    </div>
  );
}
