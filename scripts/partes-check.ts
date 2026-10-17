// Las partes de Adeorq que se apagan enteras (`src/lib/partes.ts`). Lógica
// pura, se corre con `pnpm bancos partes`.

const armario = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => armario.get(k) ?? null,
  setItem: (k: string, v: string) => void armario.set(k, v),
  removeItem: (k: string) => void armario.delete(k),
  clear: () => armario.clear(),
  key: () => null,
  length: 0,
} as Storage;

import {
  PARTES,
  PARTES_KEY,
  alternarParte,
  leerApagadas,
  limpiarPartes,
  pestanasEncendidas,
  seVe,
  vistaPosible,
  type Parte,
} from "../src/lib/partes";
import { PESTANAS, VISTAS } from "../src/lib/vistas";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const j = (x: unknown) => JSON.stringify(x);
const nada = { cabina: 0, lienzo: 0 };

// Las cuatro grandes, y ninguna más (C2): lo demás va siempre.
ok("solo las cuatro grandes", j(PARTES.map((p) => p.id)) === j(["cabina", "lienzo", "memoria", "chat"]));
ok("y todas son vistas de verdad", PARTES.every((p) => VISTAS.some((t) => t.key === p.id)));

// Lo guardado se limpia: repetidos, nombres de otra versión y las dos de terminales.
ok("sin repetidos ni nombres raros", j(limpiarPartes(["chat", "chat", "agenda", 3, "memoria"])) === j(["chat", "memoria"]));
ok("nunca las dos de terminales: se queda encendida la Cabina", j(limpiarPartes(["cabina", "lienzo"])) === j(["lienzo"]));
ok("lo que no es una lista, ninguna", j(limpiarPartes("cabina")) === "[]");
armario.set(PARTES_KEY, "{roto");
ok("un JSON roto no apaga nada", j(leerApagadas()) === "[]");
armario.set(PARTES_KEY, j(["memoria"]));
ok("se lee lo guardado", j(leerApagadas()) === j(["memoria"]));

// Encender y apagar.
ok("apagar una", j(alternarParte([], "memoria").apagadas) === j(["memoria"]));
ok("encender una", j(alternarParte(["memoria", "chat"], "memoria").apagadas) === j(["chat"]));
const segunda = alternarParte(["cabina"], "lienzo");
ok("no deja apagar la segunda de terminales, y dice por qué", j(segunda.apagadas) === j(["cabina"]) && /no se pueden apagar a la vez/.test(segunda.porque ?? ""), j(segunda));
ok("la Memoria y el Chat no tienen esa regla", j(alternarParte(["chat"], "memoria").apagadas) === j(["chat", "memoria"]));

// Qué pestaña se abre de verdad.
const ap: Parte[] = ["lienzo", "memoria", "chat"];
ok("el Lienzo apagado lleva a la Cabina", vistaPosible("lienzo", ap, nada) === "cabina");
ok("la Cabina apagada lleva al Lienzo", vistaPosible("cabina", ["cabina"], nada) === "lienzo");
ok("la Memoria y el Chat apagados, al Panel", vistaPosible("memoria", ap, nada) === "panel" && vistaPosible("chat", ap, nada) === "panel");
ok("lo que no es una parte, tal cual", vistaPosible("agenda", ap, nada) === "agenda" && vistaPosible("ajustes", ap, nada) === "ajustes");
ok("lo encendido, tal cual", vistaPosible("cabina", ap, nada) === "cabina");

// Regla 2: apagada con terminales abiertas, se sigue viendo hasta cerrarlas.
ok("el Lienzo apagado con dos terminales sigue a la vista", seVe("lienzo", ["lienzo"], { cabina: 0, lienzo: 2 }) && vistaPosible("lienzo", ["lienzo"], { cabina: 0, lienzo: 2 }) === "lienzo");
ok("sin terminales, ya no", !seVe("lienzo", ["lienzo"], nada));
ok("la Memoria no tiene terminales que esperar", !seVe("memoria", ["memoria"], { cabina: 3, lienzo: 3 }));

// La cabecera, sin las apagadas.
const claves = pestanasEncendidas(PESTANAS, ap, nada).map((t) => t.key);
ok("la cabecera pierde las apagadas y nada más", j(claves) === j(["panel", "cabina", "decisiones", "perfil", "ajustes"]), j(claves));
ok("con todas encendidas, las siete", pestanasEncendidas(PESTANAS, [], nada).length === PESTANAS.length);
// La Memoria vive dentro del Perfil: apagada, el Perfil sigue y ella sale de la paleta.
const vistas = pestanasEncendidas(VISTAS, ap, nada).map((t) => t.key);
ok("la paleta pierde la Memoria apagada y el Perfil se queda", !vistas.includes("memoria") && vistas.includes("perfil") && vistas.includes("agenda"), j(vistas));

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
if (fallos) process.exit(1);
