// El ancho de la barra izquierda: qué pide el puntero al arrastrar su tirador.
//
//   npx tsc scripts/ancho-barra-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/ancho-barra-check.js
//
// Lo que se defiende es UNA cosa: que el borde de la barra vaya donde va el
// puntero. La cuenta fue «la x del puntero menos 52» mucho después de que el
// carril de 52 px de la izquierda dejara de existir, y el borde iba 52 px por
// detrás (medido el 2026-10-12 con la app de verdad: el puntero en 300 y el
// borde en 248). Y los topes: el mínimo es donde la cabecera cabe entera.

import { BARRA_MAX, BARRA_MIN, anchoAlArrastrar, anchoDeBarra, anchoGuardado } from "../src/lib/anchoBarra";

let fallos = 0;
function ok(nombre: string, real: boolean, porque?: string) {
  if (real) console.log(`ok   ${nombre}`);
  else {
    fallos++;
    console.log(`FALLA ${nombre}${porque ? ` — ${porque}` : ""}`);
  }
}

// ── El borde sigue al puntero ────────────────────────────────────────────────
{
  // La barra empieza en el borde de la ventana y se agarra justo por su borde.
  const pegada = { izquierda: 0, desfase: 0 };
  ok("con la barra pegada a la izquierda, el puntero en 300 deja el borde en 300", anchoAlArrastrar(300, pegada) === 300, "con la cuenta vieja salía 248");
  ok("y en 260, en 260", anchoAlArrastrar(260, pegada) === 260);

  // Agarrada dos píxeles a la derecha del borde: esa distancia se conserva.
  const conDesfase = { izquierda: 0, desfase: 2 };
  ok("agarrada 2 px a la derecha del borde, el borde va 2 px por detrás y no salta", anchoAlArrastrar(302, conDesfase) === 300);

  // Si algún día vuelve a haber algo a su izquierda, se descuenta solo.
  const conCarril = { izquierda: 52, desfase: 0 };
  ok("con un carril de 52 px a la izquierda, el ancho es lo que queda", anchoAlArrastrar(352, conCarril) === 300);
}

// ── Los topes ────────────────────────────────────────────────────────────────
{
  const pegada = { izquierda: 0, desfase: 0 };
  ok("por debajo del mínimo se queda en el mínimo", anchoAlArrastrar(40, pegada) === BARRA_MIN);
  ok("por encima del máximo se queda en el máximo", anchoAlArrastrar(1900, pegada) === BARRA_MAX);
  ok("un puntero con decimales da un ancho entero", anchoDeBarra(260.6) === 261);
  ok("el mínimo deja sitio a la cabecera: no baja de 224", BARRA_MIN >= 224, "con 200 se cortaban tres botones");
}

// ── Lo guardado ──────────────────────────────────────────────────────────────
{
  ok("sin nada guardado nace en 300", anchoGuardado(null) === 300);
  ok("uno guardado dentro de los topes se respeta", anchoGuardado("340") === 340);
  ok("uno guardado con el mínimo de antes (200) sube al de ahora", anchoGuardado("200") === BARRA_MIN, "no vuelve a 300: él la quería estrecha");
  ok("una basura guardada vuelve al de fábrica", anchoGuardado("hola") === 300 && anchoGuardado("9000") === 300);
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
if (fallos) process.exit(1);
