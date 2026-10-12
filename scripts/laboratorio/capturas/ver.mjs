// Enseña hasta cuatro grabaciones en el tablero de 2x2 y saca la foto.
// Uso: node ver.mjs <foto.png> <grabación[:cli[:proyecto]]>...
import { abrir, cerrarTerminales, dormir, panelGrabado, recargar, sembrar, sinWebgl } from "./escena.mjs";

const [foto, ...cuales] = process.argv.slice(2);
const proyectos = ["storefront-api", "mobile-app", "invoice-cli", "landing-web"];
const panes = cuales.map((c, i) => {
  const [grabacion, cli = "claude", proyecto = proyectos[i]] = c.split(":");
  return panelGrabado({ nombre: `${proyecto} · ${grabacion}`, proyecto, grabacion: `${grabacion}.bin`, cli });
});
const p = await abrir();
await sembrar(p, {
  "adeorq-lang": "en",
  "adeorq-lateral": "",
  "adeorq-layout": {
    panes,
    cols: panes.length > 2 ? [{ w: 1, hs: [1, 1], idx: [0, 1] }, { w: 1, hs: [1, 1], idx: [2, 3].filter((i) => i < panes.length) }] : panes.map((_, i) => ({ w: 1, hs: [1], idx: [i] })),
    ocultos: [],
  },
});
await cerrarTerminales(p);
await recargar(p, 8000);
await sinWebgl(p);
await dormir(3000);
console.log(await p.foto(`fotos/${foto}`));
p.cerrar();
