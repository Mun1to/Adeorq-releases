// Avisar a un bot, del lado de la ventana (`lib/bots.ts`): qué campana avisa a
// un bot y cómo se leen en inglés los motivos que cuenta Rust.
//
// Lo que no puede pasar: que una campana que no es de las dos de siempre
// (un reloj del lienzo) llegue a un bot, o que con la app en inglés salga una
// frase a medias en español.
//
//   pnpm bancos bots

import { estadoDeAviso, traducirMotivo } from "../src/lib/bots";
import { makeT } from "../src/lib/i18n";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = sale === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale «${String(sale)}», se esperaba «${String(esperado)}»`}`);
}

es("una pregunta es «espera»", estadoDeAviso("12:ask"), "espera");
es("un turno acabado es «termino»", estadoDeAviso("12:done"), "termino");
es("un reloj del lienzo no avisa a un bot", estadoDeAviso("reloj-3"), null);
es("una etiqueta vacía tampoco", estadoDeAviso(""), null);
es("«ask» a media etiqueta no vale", estadoDeAviso("12:asked"), null);

const en = makeT("en");
const es_ = makeT("es");
es("el código de salida, en inglés", traducirMotivo("salió con el código 3", en), "exited with code 3");
es("el código y lo que dijo el programa", traducirMotivo("salió con el código 1: telegram not configured", en), "exited with code 1: telegram not configured");
es("el plazo", traducirMotivo("no contestó en 40 segundos", en), "did not answer in 40 seconds");
es("el webhook rechaza la clave", traducirMotivo("el webhook no aceptó la clave (401)", en), "the webhook did not accept the key (401)");
es("el webhook contesta otra cosa", traducirMotivo("el webhook contestó 500", en), "the webhook answered 500");
es("un destino sin instalar", traducirMotivo("Hermes no está instalado en este equipo", en), "Hermes is not installed on this computer");
es("un motivo con su destino delante", traducirMotivo("Hermes: falta el destino.", en), "Hermes: the destination is missing.");
es("una dirección mala, con su destino", traducirMotivo("Grok Bot: Tiene que empezar por https://.", en), "Grok Bot: It has to start with https://.");
es("la espera entre pruebas", traducirMotivo("Espera unos segundos antes de probar otra vez.", en), "Wait a few seconds before testing again.");
es("lo que dice el sistema se deja como llega", traducirMotivo("no se pudo lanzar: Access is denied. (os error 5)", en), "could not start it: Access is denied. (os error 5)");
es("algo que no conoce se deja tal cual", traducirMotivo("algo raro", en), "algo raro");
es("en español no se toca nada", traducirMotivo("salió con el código 3", es_), "salió con el código 3");
es("en español, con destino, tampoco", traducirMotivo("OpenClaw: falta el destino.", es_), "OpenClaw: falta el destino.");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
