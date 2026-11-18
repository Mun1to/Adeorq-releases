// Pegar una imagen en las cajas de Adeo con Ctrl+V (Munir, 2026-11-17: «que te pueda pegar en
// Adeo una imagen fácilmente con Ctrl+V», como se la pega a una terminal).
//
// En cada caja de Adeo que hay (el Chat de Adeo, la de la barra de la Cabina y la del Chat con
// una sesión) pega lo que pegaría Windows con una captura en el portapapeles: un evento `paste`
// con un archivo `image/png`. Mira que se llama a `save_pasted_image` y que la ruta entra entre
// comillas donde estaba el cursor, sin borrar lo ya escrito. Y que un pegado de solo texto no lo
// toca nadie (el navegador lo pega como siempre). Y que si guardarla falla, cada caja lo dice:
// hasta el 2026-11-17 el pegado se cancelaba y no salía nada en ninguna de las tres (la de la
// Cabina guardaba el error, pero solo lo pinta en su fase «error»).
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/adeo-pegar-imagen.js
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  // Una sesión para la tercera caja (el chat con una sesión), y un guardado que puede
  // fallar a propósito (`window.__falloPegar`): sin aviso, la imagen se perdía en silencio.
  const SESION = "Sesion para pegar";
  await page.addInitScript((title) => {
    window.__sesiones?.push({ id: "cccc1111-2222-4333-8444-000000000001", cwd: "C:\\proyectos\\Vidorq", title, project: "Vidorq", live: false, estado: "lista", hours: 1 });
    const d = window.__TAURI_INTERNALS__;
    const antes = d.invoke;
    d.invoke = (cmd, args) => (cmd === "save_pasted_image" && window.__falloPegar ? Promise.reject("disco lleno") : antes(cmd, args));
  }, SESION);
  await page.reload();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(1500);

  /** Escribe «mira esto» en la caja, deja el cursor al final y pega una imagen (o texto). */
  const pegar = (sel, conImagen) => page.evaluate(async ({ sel, conImagen }) => {
    const caja = document.querySelector(sel);
    if (!caja) return { hay: false };
    const poner = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    caja.focus();
    poner.call(caja, "mira esto");
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    caja.setSelectionRange(caja.value.length, caja.value.length);
    const antes = window.__llamadas.filter(([c]) => c === "save_pasted_image").length;
    const dt = new DataTransfer();
    if (conImagen) dt.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "captura.png", { type: "image/png" }));
    else dt.setData("text/plain", "hola");
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    caja.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 600));
    const llamadas = window.__llamadas.filter(([c]) => c === "save_pasted_image");
    return {
      hay: true,
      parado: ev.defaultPrevented,
      guardo: llamadas.length - antes,
      ext: llamadas.at(-1)?.[1]?.ext ?? null,
      valor: document.querySelector(sel)?.value ?? null,
    };
  }, { sel, conImagen });

  const comprobar = async (nombre, sel) => {
    const r = await pegar(sel, true);
    pasos[nombre] = r;
    if (!r.hay) return fallos.push(`${nombre}: no encuentro la caja`);
    debe(r.parado, `${nombre}: el pegado de la imagen no se para (el navegador no sabe meterla en una caja)`);
    debe(r.guardo === 1 && r.ext === "png", `${nombre}: no guarda la imagen (save_pasted_image: ${r.guardo}, ext ${r.ext})`);
    debe(/^mira esto "C:\\.+\\pastes\\pegado-\d+\.png" $/.test(r.valor ?? ""), `${nombre}: la ruta no entra entre comillas detrás de lo escrito: «${r.valor}»`);
    // Y si guardarla falla, la caja lo dice en vez de tragarse el pegado.
    const aviso = () => page.evaluate(() => /No pude pegar la imagen: disco lleno|I could not paste the image: disco lleno/.test(document.body.innerText));
    await page.evaluate(() => { window.__falloPegar = true; });
    const tras = await pegar(sel, true);
    const dice = await aviso();
    await page.evaluate(() => { window.__falloPegar = false; });
    // Y el siguiente pegado bueno lo quita (la revisión aparte: se quedaba en las tres).
    await pegar(sel, true);
    const sigue = await aviso();
    pasos[`${nombre}Falla`] = { dice, texto: tras.valor, sigueTrasPegarBien: sigue };
    debe(dice, `${nombre}: si guardar la imagen falla, la caja no dice nada`);
    debe(tras.valor === "mira esto", `${nombre}: el fallo cambió lo escrito: «${tras.valor}»`);
    debe(!sigue, `${nombre}: el aviso del fallo sigue ahí después de pegar bien`);
  };

  // 1. El Chat de Adeo (el doble arranca en él).
  await page.locator('.topbar button[data-tip="Chat"], .tabs button:has-text("Chat")').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator(".cj-nueva").first().click().catch(() => {});
  await page.waitForTimeout(500);
  const texto = await pegar(".cj-caja textarea.chat-input", false);
  pasos.soloTexto = texto;
  debe(texto.hay && !texto.parado && texto.guardo === 0, `un pegado de solo texto no debe tocarse: ${JSON.stringify(texto)}`);
  await comprobar("chatDeAdeo", ".cj-caja textarea.chat-input");

  // 2. La caja de Adeo en la barra de la Cabina.
  await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  if (!(await page.locator(".grid > .pane").count())) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude")?.click());
    await page.waitForTimeout(1500);
  }
  await page.locator(".franja-btn:has(.orbe)").first().click().catch(() => {});
  await page.waitForTimeout(800);
  await comprobar("barraDeLaCabina", ".foreman-input");

  // 3. El chat con una sesión (la pestaña Chat, en «Sesiones», con la sesión elegida en su lista).
  await page.locator('[data-tab="chat"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.locator(".chat-view :text-is('Sesiones'), .chat-view :text-is('Sessions')").first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator(".chat-fila", { hasText: SESION }).first().click().catch((e) => fallos.push(`no encuentro la sesión «${SESION}» en el Chat: ${e.message.split("\n")[0]}`));
  await page.waitForTimeout(600);
  await comprobar("chatConUnaSesion", ".chat-view textarea.chat-input");

  return { pasos, fallos };
}
