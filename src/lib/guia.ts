// «Que me la explique mi agente» (Ajustes › Ayuda): el encargo con el que nace
// la sesión que enseña la app. La guía va empaquetada en el instalador y es
// larga; quien acaba de llegar no sabe por dónde empezar a leerla, y su propio
// agente sí: lee el fichero y pregunta. Se le pide que pregunte ANTES de
// explicar para que no recite la guía entera, y que no toque nada, porque nace
// en la carpeta de los proyectos y esto es una clase, no un encargo.

import type { Translate } from "./i18n";

export function encargoDeGuia(t: Translate, ruta: string): string {
  return t(
    "Lee la guía de Adeorq, que está en {ruta}, y enséñame a usar la app. Antes de explicar nada, pregúntame qué quiero hacer con ella; luego explícame solo esa parte, paso a paso y llamando a cada botón por el nombre que tiene en la guía. No cambies ningún archivo.",
    { ruta },
  );
}
