// Para probar un recorrido sobre la página que ya está montada (sin recargar).
// Uso: node tocar.mjs <paso>...   con pasos:
//   vista:<clave>            pulsa la pestaña de arriba
//   clic:<selector>[|texto]  clic de verdad en el primer elemento que case
//   js:<expresión>           evalúa y enseña el resultado
//   espera:<ms>
//   foto:<nombre>            fotos/<nombre>.png
import { abrir, apartarRaton, dormir, vista } from "./escena.mjs";

const p = await abrir();
await dormir(1200);
for (const paso of process.argv.slice(2)) {
  const i = paso.indexOf(":");
  const [que, resto] = [paso.slice(0, i), paso.slice(i + 1)];
  if (que === "vista") await vista(p, resto, 2000);
  else if (que === "clic") {
    const [sel, texto] = resto.split("|");
    console.log("clic", sel, texto ?? "", JSON.stringify(await p.clic(sel, texto).catch((e) => String(e))));
    await dormir(900);
  } else if (que === "js") console.log(JSON.stringify(await p.js(resto).catch((e) => String(e)), null, 1));
  else if (que === "espera") await dormir(Number(resto));
  else if (que === "foto") {
    await apartarRaton(p);
    await dormir(400);
    console.log(await p.foto(`fotos/${resto}.png`));
  }
}
p.cerrar();
