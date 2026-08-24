// Comprobación del cazador de localhost, con salidas REALES de terminal.
//
//   npx tsc scripts/puertos-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/puertos-check.js
//
// Lo que se comprueba aquí no se puede mirar en pantalla: el fallo que importa
// es que el puerto venga separado de la dirección por una secuencia de color,
// y eso no se ve, se lee en los bytes. Los casos de abajo están copiados tal
// cual de lo que escriben Vite, Next y Python.
import { cola, localesEn, sinAnsi, COLA_MAX } from "../src/lib/puertos";

let fallos = 0;
function ok(que: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    console.log(`  ok   ${que}`);
  } else {
    fallos++;
    console.log(`  MAL  ${que}\n         salió ${a}\n         debía ${b}`);
  }
}

const ESC = "";
const urls = (t: string) => localesEn(t).map((x) => x.url);

// ── EL CASO QUE JUSTIFICA TODO ESTO ───────────────────────────────────────
// Vite pinta el puerto en negrita, así que entre "localhost:" y "5173" hay una
// secuencia de escape. Sin limpiar el ANSI primero, aquí no sale ningún puerto.
console.log("\nLo que escriben los servidores de verdad");
ok(
  "Vite, con el puerto en negrita en medio de la dirección",
  urls(`  ${ESC}[32m➜${ESC}[39m  ${ESC}[1mLocal${ESC}[22m:   ${ESC}[36mhttp://localhost:${ESC}[1m5173${ESC}[22m/${ESC}[39m`),
  ["http://localhost:5173/"],
);
ok(
  "Vite anuncia además la de red, que NO es de esta máquina",
  urls("  ➜  Local:   http://localhost:1420/\n  ➜  Network: http://192.168.1.44:1420/"),
  ["http://localhost:1420/"],
);
ok(
  "Next",
  urls("   ▲ Next.js 15.0.3\n   - Local:        http://localhost:3000"),
  ["http://localhost:3000"],
);
ok(
  "Python, que se anuncia en 0.0.0.0",
  urls("Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ..."),
  ["http://localhost:8000/"],
);
ok(
  // Un enlace de terminal se escribe `ESC ]8;;URL BEL texto ESC ]8;; BEL`, así
  // que la dirección aparece DOS veces: dentro de la marca y como texto
  // visible. Se cuenta una sola vez, porque es un solo servidor.
  "una dirección envuelta en un enlace OSC 8",
  urls(`${ESC}]8;;http://localhost:4321/http://localhost:4321/${ESC}]8;;`),
  ["http://localhost:4321/"],
);
ok("IPv6", urls("listening on http://[::1]:9000/"), ["http://localhost:9000/"]);
ok("con ruta, que se conserva", urls("http://127.0.0.1:8080/admin/panel"), [
  "http://localhost:8080/admin/panel",
]);

// ── LO QUE NO DEBE ABRIR NADA ─────────────────────────────────────────────
console.log("\nLo que NO cuenta");
// Un puerto suelto en prosa es la mitad de las conversaciones sobre código.
ok("«el puerto 3000» en prosa", urls("arranca el servidor en el puerto 3000"), []);
ok("«localhost» sin esquema ni puerto", urls("mira en localhost:3000"), []);
// Sin puerto es el 80, y ahí no vive ningún servidor de desarrollo.
ok("sin puerto", urls("http://localhost/docs"), []);
ok("una máquina de la red, no la tuya", urls("http://192.168.1.44:5173/"), []);
ok("un dominio que EMPIEZA por localhost", urls("https://localhosting.com:8080/"), []);
ok("un puerto imposible", urls("http://localhost:99999/"), []);

// ── DETALLES QUE SE NOTAN AL USARLO ───────────────────────────────────────
console.log("\nDetalles");
ok(
  "el punto final de la frase no entra en la dirección",
  urls("Ya lo tienes en http://localhost:5173/."),
  ["http://localhost:5173/"],
);
ok(
  "la misma dirección dos veces se cuenta una",
  urls("Local: http://localhost:5173/ y otra vez http://localhost:5173/"),
  ["http://localhost:5173/"],
);
ok(
  "dos servidores distintos salen los dos",
  urls("api en http://localhost:3001/ y web en http://localhost:5173/"),
  ["http://localhost:3001/", "http://localhost:5173/"],
);
ok("el ANSI se va del todo", sinAnsi(`${ESC}[1;36mhola${ESC}[0m`), "hola");

// La cola: el PTY entrega trozos, no líneas, y una dirección puede partirse.
console.log("\nLa cola entre trozos");
{
  const trozo1 = "arrancando…  ➜  Local:   http://localh";
  const trozo2 = "ost:5173/\n";
  ok("partida en dos, cada trozo por su lado no ve nada", urls(trozo1).concat(urls(trozo2)), []);
  ok("pegando la cola del anterior, sí", urls(cola(trozo1) + trozo2), ["http://localhost:5173/"]);
  ok("la cola no crece sin fin", cola("x".repeat(2000)).length, COLA_MAX);
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
