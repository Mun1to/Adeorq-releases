// Lo que se escribe en la barra del navegador (`lib/urlweb.ts`, `comoUrl`).
//
// Munir escribió «casa» y el panel fue a `http://casa`: «No se encontró la dirección IP del
// servidor de casa» (2026-10-18, la primera vez que abrió el navegador de verdad). Un navegador
// normal busca lo que no parece una dirección. Lo que no puede pasar: que una palabra o una frase
// se tome por un servidor, que un puerto suelto deje de ir a localhost, o que una web de fuera se
// pida sin cifrar.
//
//   pnpm bancos urlweb

import { BUSCADORES, buscadorElegido, comoEmpotrable, comoUrl } from "../src/lib/urlweb";

const BUSCADOR = BUSCADORES.google.url;

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = sale === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${String(sale)}, se esperaba ${String(esperado)}`}`);
}

// Lo que se busca.
es("una palabra suelta se busca", comoUrl("casa"), `${BUSCADOR}casa`);
es("una frase se busca", comoUrl("como hacer pan"), `${BUSCADOR}como%20hacer%20pan`);
es("con tildes y signos, bien escapada", comoUrl("¿qué es C#?"), `${BUSCADOR}${encodeURIComponent("¿qué es C#?")}`);
es("algo con punto pero con espacios se busca", comoUrl("react hooks.md"), `${BUSCADOR}react%20hooks.md`);

// El buscador se elige en Ajustes (Munir, 2026-10-18): Google de fábrica, también sin `localStorage`.
es("sin nada elegido, Google", buscadorElegido(), "google");
es("con Brave Search", comoUrl("casa", "brave"), "https://search.brave.com/search?q=casa");
es("con DuckDuckGo", comoUrl("casa", "duckduckgo"), "https://duckduckgo.com/?q=casa");
es("una dirección no se busca, elijas el que elijas", comoUrl("github.com", "brave"), "https://github.com");

// Lo de esta máquina y de tu red, sin cifrar como siempre.
es("un puerto suelto va a localhost", comoUrl("3000"), "http://localhost:3000");
es("localhost con puerto", comoUrl("localhost:5173"), "http://localhost:5173");
es("localhost a secas", comoUrl("localhost"), "http://localhost");
es("una IP con puerto y ruta", comoUrl("127.0.0.1:8080/x"), "http://127.0.0.1:8080/x");
es("una IP de tu red", comoUrl("192.168.1.10:3000"), "http://192.168.1.10:3000");
es("IPv6 de esta máquina", comoUrl("[::1]:3000"), "http://[::1]:3000");
es("un nombre de tu red con puerto", comoUrl("mi-servidor:8080"), "http://mi-servidor:8080");

// Las webs de fuera, cifradas.
es("un dominio va por https", comoUrl("github.com"), "https://github.com");
es("un dominio con ruta", comoUrl("github.com/Mun1to"), "https://github.com/Mun1to");
es("con https ya escrito, tal cual", comoUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
es("con http ya escrito, tal cual", comoUrl("http://example.com"), "http://example.com");
es("vacío no va a ninguna parte", comoUrl("   "), "");

// El enlace de YouTube que se deja meter en un iframe es cosa del iframe: en el Chromium de
// verdad `/watch` funciona, y cambiarlo por `/embed` quitaba media página.
es("youtube se queda como lo pegas", comoUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/watch?v=abc123");
es("y en un iframe pasa a /embed", comoEmpotrable(comoUrl("https://www.youtube.com/watch?v=abc123")), "https://www.youtube.com/embed/abc123");

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
