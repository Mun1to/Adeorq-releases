// Lo que escribes y no mandas no se pierde al irte (Munir, 2026-10-16: «que el
// texto que escribas en el modo chat, si te vas a otra terminal o sitio, no se
// borre»): cada terminal y cada conversación guarda el suyo, también al
// recargar, y al mandarlo se borra.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-borradores.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });

  const ir = async (hash) => {
    await page.goto(`${B}/?vez=${Math.random()}${hash}`);
    await page.waitForSelector("#texto");
    await page.waitForTimeout(400);
  };
  const caja = () => page.evaluate(() => ({ texto: document.getElementById("texto").value, enviar: !document.getElementById("enviar").disabled }));

  // 1. Una terminal: se escribe, se va a otra, y al volver sigue ahí.
  await ir("#terminal=1@111");
  await page.fill("#texto", "a medio escribir para la 1");
  await ir("#terminal=5@111");
  pasos.enOtra = await caja();
  debe(pasos.enOtra.texto === "", `otra terminal no hereda lo de la 1 (${JSON.stringify(pasos.enOtra)})`);
  await page.fill("#texto", "y esto para la 5");
  await ir("#terminal=1@111");
  pasos.vuelta = await caja();
  debe(pasos.vuelta.texto === "a medio escribir para la 1" && pasos.vuelta.enviar, `al volver a la 1 sigue lo escrito y se puede mandar (${JSON.stringify(pasos.vuelta)})`);

  // 2. Al mandarlo se borra, y al volver ya no está.
  await page.click("#enviar");
  await page.waitForTimeout(700);
  const escrito = await (await page.request.get(`${B}/api/escrito?panel=1`, { headers: AUT })).json();
  debe(escrito.texto === "a medio escribir para la 1", `se mandó lo guardado (${escrito.texto})`);
  await ir("#terminal=5@111");
  pasos.la5 = await caja();
  debe(pasos.la5.texto === "y esto para la 5", `la 5 conserva el suyo (${JSON.stringify(pasos.la5)})`);
  await ir("#terminal=1@111");
  pasos.trasMandar = await caja();
  debe(pasos.trasMandar.texto === "", `lo mandado no vuelve (${JSON.stringify(pasos.trasMandar)})`);

  // 3. Una conversación con el conserje, igual.
  await ir("#conv=vieja1");
  await page.fill("#texto", "idea para el conserje");
  await ir("#terminal=1@111");
  await ir("#conv=vieja1");
  pasos.conv = await caja();
  debe(pasos.conv.texto === "idea para el conserje", `la conversación conserva lo suyo (${JSON.stringify(pasos.conv)})`);
  // Borrarlo a mano también lo olvida.
  await page.fill("#texto", "");
  await ir("#conv=vieja1");
  debe((await caja()).texto === "", "vaciar la caja lo olvida");
  return { pasos, fallos };
}
