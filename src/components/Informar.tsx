// «Adeo es una IA» y el botón de informar de un problema (política 11.16 de la
// Microsoft Store y artículo 50 del AI Act; el porqué y a dónde va, en
// `lib/informar.ts`). Dos piezas, las dos sueltas y sin caja:
//
//   BotonInformar  el botón, junto a cada respuesta de Adeo;
//   AvisoIA        la línea de debajo de la caja: lo que es Adeo + el mismo botón,
//                  a la vista aunque no haya ninguna respuesta todavía.
//
// Van en el Chat, en la ventana de la bola, en el chat de un enjambre y (con
// su propio código, porque es otra página) en el móvil.

import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { CORREO, correoDelInforme, direccionDelInforme, type DondeInforma } from "../lib/informar";

/** Abre el formulario en el navegador de quien informa. Si la versión no se
 *  puede leer (el front suelto, sin Tauri) la plantilla lo dice. */
async function informar(donde: DondeInforma, ingles: boolean): Promise<void> {
  const version = await getVersion().catch(() => "");
  await openUrl(direccionDelInforme({ version, ingles, donde })).catch(() => {});
}

/** Lo mismo por correo, para quien no tiene cuenta de GitHub. */
async function informarPorCorreo(donde: DondeInforma, ingles: boolean): Promise<void> {
  const version = await getVersion().catch(() => "");
  await openUrl(correoDelInforme({ version, ingles, donde })).catch(() => {});
}

export function BotonInformar({ donde }: { donde: DondeInforma }) {
  const { t, lang } = useT();
  return (
    <button
      className="inf-boton"
      data-tip={t("Abre un formulario público en GitHub. No lleva tu conversación: pegas tú lo que quieras enseñar.")}
      onClick={() => void informar(donde, lang === "en")}
    >
      {t("Informar de un problema")}
    </button>
  );
}

/** El correo, solo en la línea de debajo de la caja (no junto a cada respuesta).
 *  Dice la dirección en su ayuda porque, sin un programa de correo configurado,
 *  el clic no abre nada y quien lee puede escribir a mano. */
function BotonCorreo({ donde }: { donde: DondeInforma }) {
  const { t, lang } = useT();
  return (
    <button
      className="inf-boton inf-correo"
      aria-label={t("Informar de un problema por correo")}
      data-tip={t("Abre tu programa de correo con un mensaje ya escrito para {correo}. No lleva tu conversación: pegas tú lo que quieras enseñar.", { correo: CORREO })}
      onClick={() => void informarPorCorreo(donde, lang === "en")}
    >
      {t("o por correo")}
    </button>
  );
}

export function AvisoIA({ donde, className }: { donde: DondeInforma; className?: string }) {
  const { t } = useT();
  return (
    <p className={className ? `inf-aviso ${className}` : "inf-aviso"}>
      {/* En el chat con un modelo del lienzo no habla Adeo sino el modelo que
          eligió la persona: la frase tiene que decir quién es. */}
      <span>{donde === "modelo" ? t("Este modelo es una IA y puede equivocarse.") : t("Adeo es una IA y puede equivocarse.")}</span>
      {/* El espacio no se pinta (es un flex) pero sí se lee: sin él, un lector de
          pantalla une la frase con el botón. */}
      {" "}
      <BotonInformar donde={donde} />
      {" "}
      <BotonCorreo donde={donde} />
    </p>
  );
}
