// Deja abierto el menú de posponer (H) con su caja de «otra hora», sobre la página
// en la que acaba `decisiones-escritorio.js`, para pasarle los detectores de la
// guía de estilo (`docs/contexto/estilo.md`): sin cárceles y sin rótulos en
// mayúsculas espaciadas. Una sola vuelta, con el doble de ese banco:
//
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/decisiones-escritorio.js scripts/laboratorio/decisiones-posponer-menu.js scripts/laboratorio/carceles.js scripts/laboratorio/mayusculas.js
//
// Devuelve { fallos: [...] }: vacío es que el menú está donde debe y sin tapar el pie.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const CAPTURAS = ".playwright-mcp";
  await page.locator(".dec-fila[data-on=true]").first().focus();
  await page.keyboard.press("h");
  await page.waitForSelector(".dec-posponer", { timeout: 3000 });
  await page.keyboard.press("o");
  await page.waitForSelector(".dec-hora", { timeout: 3000 });
  await page.keyboard.type("16:30");
  const caja = await page.evaluate(() => {
    const m = document.querySelector(".dec-posponer").getBoundingClientRect();
    const barra = document.querySelector(".dec-barra")?.getBoundingClientRect();
    const dec = document.querySelector(".dec").getBoundingClientRect();
    return { dentro: m.left >= dec.left && m.right <= dec.right && m.top >= dec.top && m.bottom <= dec.bottom, tapaLaBarra: barra ? m.bottom > barra.top && m.top < barra.bottom : false };
  });
  debe(caja.dentro, `el menú cabe dentro de la pestaña (${JSON.stringify(caja)})`);
  debe(!caja.tapaLaBarra, "y no tapa la barra de enviar del pie");
  await page.screenshot({ path: `${CAPTURAS}/dec-posponer-hora.png` });
  return { fallos };
}
