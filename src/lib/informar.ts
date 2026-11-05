// Informar de un problema con lo que dice Adeo.
//
// Existe por la política 11.16 de la Microsoft Store (contenido que genera una
// IA en vivo): pide un medio, a la vista, para que quien usa la app avise al
// desarrollador. A VoCript la rechazaron dos veces porque el suyo estaba a tres
// clics de la pantalla y porque no se veía con la app recién instalada, sin
// nada escrito todavía (`docs/contexto/tiendas.md`, 3.3). Por eso el botón vive
// junto a cada respuesta de Adeo Y junto a la caja, aunque no haya respuestas.
//
// A dónde va: una incidencia nueva en el repo público, con el título y la
// plantilla ya escritos. Lo que NO lleva la dirección es la conversación: la
// incidencia es pública, y una respuesta de Adeo puede traer nombres de
// proyectos, rutas o correos de esa persona. La plantilla le pide que pegue solo
// lo que quiera enseñar, y le avisa de que es público.
//
// Sin `labels=` en la dirección, y es a propósito. Un parámetro de esa dirección
// pide el mismo permiso que la acción que hace, y la documentación de GitHub
// dice que sin él la dirección devuelve un 404 («you must have permission to add
// a label to an issue to use the `labels` query parameter», leído el
// 2026-11-05). Quien informa no tiene permiso de clasificar nada en nuestro repo,
// así que con la etiqueta el botón podía llevarle a una página rota, que es
// justo lo que la política no perdona. La etiqueta `ai-output` la pone Munir al
// recibirla, o una plantilla de formulario del repo (esas sí aplican la suya a
// cualquiera). Hasta entonces el título lleva «problema con Adeo» para buscarlo.
//
// El correo: una incidencia exige cuenta de GitHub, y quien no la tiene se queda
// sin medio de avisar, que es justo lo que pide 11.16 («a means for users to
// report inappropriate content to the developer»). Por eso la línea de debajo de
// la caja lleva también un `mailto:` con el asunto ya escrito. Solo ahí: junto a
// cada respuesta no, para que no sean dos botones en cada burbuja. El correo no es
// público, así que su mensaje no avisa de eso; la conversación tampoco va dentro,
// porque una respuesta de Adeo puede traer nombres de proyectos o rutas y quien
// informa decide qué pega. El correo lo dio Munir para esto (2026-11-05).
//
// Pura a propósito (sin Tauri): la prueba es `scripts/informar-check.ts`, y la
// página del móvil (`src-tauri/src/movil.html`) lleva la misma función escrita
// en JavaScript; esa prueba mira que las dos den la misma dirección.

/** Dónde se pulsó, para que se sepa de qué pantalla habla quien lo lee.
 *  `modelo` es el chat con un modelo del lienzo (`CanvasChat.tsx`): ahí no habla
 *  Adeo sino el modelo que eligió esa persona por su clave de OpenRouter, y ni la
 *  frase ni el informe pueden decir lo contrario. */
export type DondeInforma = "chat" | "plan" | "enjambre" | "movil" | "modelo" | "inicio";

/** El repo público, que es donde cualquiera puede abrir una incidencia. */
export const INCIDENCIAS = "https://github.com/Mun1to/Adeorq-releases/issues/new";

const TITULO = { es: "Informe de un problema con Adeo: ", en: "Report an issue with Adeo: " };
const TITULO_MODELO = { es: "Informe de un problema con un modelo del lienzo: ", en: "Report an issue with a canvas model: " };

const DONDE = {
  es: { chat: "el Chat de Adeo", plan: "la ventana de Adeo (la bola)", enjambre: "el chat de un enjambre", movil: "Adeo en el móvil", modelo: "el chat con un modelo del lienzo", inicio: "la caja de Adeo de la primera pantalla" },
  en: { chat: "the Adeo Chat", plan: "the Adeo window (the ball)", enjambre: "a swarm chat", movil: "Adeo on the phone", modelo: "a model chat on the canvas", inicio: "the Adeo box on the first screen" },
};

const CUERPO = {
  es: {
    version: "Versión de Adeorq",
    donde: "Dónde",
    desconocida: "no la sé",
    que: "Qué ha pasado",
    cuenta: "Cuéntalo con tus palabras: qué le pediste a Adeo y qué dijo o hizo que no está bien. Si quieres enseñar un trozo de lo que dijo, pégalo aquí:",
    cuentaModelo: "Cuéntalo con tus palabras: qué modelo era, qué le pediste y qué dijo que no está bien. Si quieres enseñar un trozo de lo que dijo, pégalo aquí:",
    antes: "Antes de enviar",
    publica: "Esta incidencia es pública: la puede leer cualquiera. Pega solo lo que quieras enseñar, y quita antes los nombres de proyectos, las rutas, los correos y las claves.",
  },
  en: {
    version: "Adeorq version",
    donde: "Where",
    desconocida: "I do not know",
    que: "What happened",
    cuenta: "Tell it in your own words: what you asked Adeo and what it said or did that is not right. If you want to show a piece of what it said, paste it here:",
    cuentaModelo: "Tell it in your own words: which model it was, what you asked it and what it said that is not right. If you want to show a piece of what it said, paste it here:",
    antes: "Before you send",
    publica: "This issue is public: anyone can read it. Paste only what you want to show, and first remove project names, paths, emails and keys.",
  },
};

/** El correo de contacto público de Adeorq (el que lleva la política de privacidad). */
export const CORREO = "munitodev@gmail.com";

const ASUNTO = { es: "Informe de un problema con Adeo", en: "Report an issue with Adeo" };
const ASUNTO_MODELO = { es: "Informe de un problema con un modelo del lienzo", en: "Report an issue with a canvas model" };
const PRIVADO = {
  es: "Este correo llega a quien desarrolla Adeorq. Pega solo lo que quieras enseñar.",
  en: "This email goes to whoever develops Adeorq. Paste only what you want to show.",
};

export interface Informe {
  /** La versión de Adeorq; vacía si no se pudo leer. */
  version: string;
  ingles: boolean;
  donde: DondeInforma;
}

/** La dirección que abre el formulario de una incidencia nueva, ya rellena. */
export function direccionDelInforme({ version, ingles, donde }: Informe): string {
  const l = ingles ? "en" : "es";
  const c = CUERPO[l];
  const cuerpo = [
    `**${c.version}:** ${version || c.desconocida}`,
    `**${c.donde}:** ${DONDE[l][donde]}`,
    "",
    `**${c.que}**`,
    donde === "modelo" ? c.cuentaModelo : c.cuenta,
    "",
    "",
    `**${c.antes}**`,
    c.publica,
  ].join("\n");
  const titulo = (donde === "modelo" ? TITULO_MODELO : TITULO)[l];
  return `${INCIDENCIAS}?title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(cuerpo)}`;
}

/** El mismo informe por correo: un `mailto:` con el asunto y el cuerpo ya
 *  escritos, en texto plano (un correo no pinta el markdown) y con los saltos
 *  de línea que pide el formato (RFC 6068). Sin la conversación. */
export function correoDelInforme({ version, ingles, donde }: Informe): string {
  const l = ingles ? "en" : "es";
  const c = CUERPO[l];
  const cuerpo = [
    `${c.version}: ${version || c.desconocida}`,
    `${c.donde}: ${DONDE[l][donde]}`,
    "",
    c.que,
    donde === "modelo" ? c.cuentaModelo : c.cuenta,
    "",
    "",
    PRIVADO[l],
  ].join("\r\n");
  const asunto = (donde === "modelo" ? ASUNTO_MODELO : ASUNTO)[l];
  return `mailto:${CORREO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
