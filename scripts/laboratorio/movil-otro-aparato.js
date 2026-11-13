// Emparejar otro aparato desde uno que ya lo está (2026-11-13, Munir desde
// clase: «Si hazlo», para sacar en el móvil el código del PC de clase). En
// Ajustes del móvil, «Emparejar otro aparato» pide a `/api/emparejar/codigo` el
// mismo código que el botón de Ajustes > Móvil del PC y enseña sus seis cifras,
// la cuenta atrás y la dirección; caducado, deja pedir otro; y con ese código
// otro aparato se empareja por la pantalla de siempre.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-otro-aparato.js
//   (o `node scripts/laboratorio/bancos-movil.mjs otro-aparato`)
//
// Con `FOTOS=<carpeta>` deja allí las fotos a 390 px, en oscuro y en claro.
// Devuelve { pasos, fallos }. Cambia el estado del doble: va contra uno recién arrancado.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const FOTOS = typeof process !== "undefined" ? process.env.FOTOS : null;
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const alDoble = (ruta, cuerpo, clave = CLAVE) =>
    fetch(`${B}${ruta}`, {
      method: cuerpo ? "POST" : "GET",
      headers: { ...(clave ? { Authorization: `Bearer ${clave}` } : {}), "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(async (r) => ({ estado: r.status, v: await r.json().catch(() => ({})) }));
  const foto = async (nombre) => {
    if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nombre}.png` });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term", { state: "attached" });
  const entrar = async () => {
    await page.click("#abrir-cajon");
    await page.click("#cajon .a-ajustes");
    await page.waitForSelector("#otro-aparato");
    await page.waitForTimeout(300);
  };
  const caja = () => page.evaluate(() => {
    const c = document.getElementById("otro-aparato");
    const strong = c?.querySelector(".codigo-otro strong");
    const cuerpo = document.querySelector(".cuerpo");
    return {
      boton: c?.querySelector("#pedir-codigo")?.textContent.trim() ?? null,
      cifras: strong?.textContent ?? null,
      letra: strong ? parseFloat(getComputedStyle(strong).fontSize) : 0,
      quedan: document.getElementById("otro-quedan")?.textContent ?? null,
      donde: c?.querySelector(".otro-donde")?.textContent.trim() ?? null,
      direccion: c?.querySelector(".otro-donde b")?.textContent ?? null,
      cabe: cuerpo.scrollWidth <= cuerpo.clientWidth + 1,
      origen: location.origin,
    };
  });

  // 1. Sin clave el PC no saca ningún código (en Rust lo fija `cargo test --lib movil`).
  pasos.sinClave = (await alDoble("/api/emparejar/codigo", {}, null)).estado;
  debe(pasos.sinClave === 401, `sin clave, 401 (${pasos.sinClave})`);

  // 2. El botón, en «Tus aparatos», justo antes de la última sección (la de este aparato).
  await entrar();
  pasos.secciones = await page.$$eval("#ajustes .seccion", (s) => s.map((x) => x.textContent.trim()));
  debe(pasos.secciones.indexOf("Tus aparatos") === pasos.secciones.length - 2, `«Tus aparatos» va justo antes de la última sección (${pasos.secciones})`);
  pasos.antes = await caja();
  debe(pasos.antes.boton === "Emparejar otro aparato" && !pasos.antes.cifras, `de entrada, solo el botón (${JSON.stringify(pasos.antes)})`);
  await page.$eval("#otro-aparato", (c) => c.scrollIntoView({ block: "center" }));
  await foto("otro-aparato-1-boton-oscuro");

  // 3. Un código de vida corta: sus cifras, su cuenta atrás y, al acabarse, «Pedir otro código».
  await alDoble("/api/sembrar-vida", { segundos: 3 });
  await page.click("#pedir-codigo");
  await page.waitForSelector(".codigo-otro strong");
  const corto = await caja();
  pasos.corto = corto;
  debe(/^\d{3} \d{3}$/.test(corto.cifras || ""), `seis cifras en dos grupos (${corto.cifras})`);
  debe(/^Vale 0:0[1-3]$/.test(corto.quedan || ""), `la cuenta atrás de un código de 3 s (${corto.quedan})`);
  await page.waitForFunction(() => document.querySelector("#otro-aparato #pedir-codigo"), null, { timeout: 6000 }).catch(() => {});
  pasos.caducado = await caja();
  debe(pasos.caducado.boton === "Pedir otro código" && !pasos.caducado.cifras && /caducado/.test(pasos.caducado.donde || ""), `caducado, lo dice y deja pedir otro (${JSON.stringify(pasos.caducado)})`);
  const viejo = corto.cifras.replace(" ", "");
  pasos.conElCaducado = await alDoble("/api/emparejar", { codigo: viejo, nombre: "Tarde" }, null);
  debe(pasos.conElCaducado.estado === 403, `el caducado no empareja (${pasos.conElCaducado.estado})`);

  // 4. El de verdad, diez minutos: grandes, sin salirse, con la dirección de esta página.
  await alDoble("/api/sembrar-vida", { segundos: 600 });
  await page.click("#pedir-codigo");
  await page.waitForSelector(".codigo-otro strong");
  const vivo = await caja();
  pasos.vivo = vivo;
  debe(/^\d{3} \d{3}$/.test(vivo.cifras || ""), `seis cifras (${vivo.cifras})`);
  debe(vivo.letra >= 36, `las cifras, grandes (${vivo.letra}px)`);
  debe(/^Vale (10:00|9:5\d)$/.test(vivo.quedan || ""), `diez minutos (${vivo.quedan})`);
  debe(vivo.direccion === vivo.origen && /Tailscale/.test(vivo.donde || ""), `dice a dónde ir en el otro aparato (${vivo.donde})`);
  debe(vivo.cabe, "Ajustes no se sale de la pantalla");
  await page.waitForTimeout(2200);
  pasos.baja = (await caja()).quedan;
  debe(pasos.baja !== vivo.quedan && /^Vale 9:5\d$/.test(pasos.baja || ""), `la cuenta atrás baja (${vivo.quedan} → ${pasos.baja})`);
  await page.$eval("#otro-aparato", (c) => c.scrollIntoView({ block: "center" }));
  await foto("otro-aparato-2-codigo-oscuro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  pasos.tema = await page.evaluate(() => document.documentElement.dataset.tema);
  debe(pasos.tema === "claro", `sigue al teléfono en claro (${pasos.tema})`);
  pasos.contraste = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const tinta = lum(getComputedStyle(document.querySelector(".codigo-otro strong")).color);
    const fondo = lum(getComputedStyle(document.documentElement).getPropertyValue("--fondo").trim().replace(/^#(..)(..)(..)$/, (_, a, b, c) => `rgb(${parseInt(a, 16)},${parseInt(b, 16)},${parseInt(c, 16)})`));
    return Math.round(((Math.max(tinta, fondo) + 0.05) / (Math.min(tinta, fondo) + 0.05)) * 10) / 10;
  });
  debe(pasos.contraste >= 7, `las cifras se leen en claro (contraste ${pasos.contraste})`);
  await foto("otro-aparato-3-codigo-claro");
  await page.emulateMedia({ colorScheme: "dark" });

  // 5. Irse de Ajustes y volver: el código sigue ahí, no hay que pedir otro.
  await page.click("#abrir-cajon");
  await page.click('#cajon .fila[data-ir="lista"]');
  await page.waitForSelector("#portada-term", { state: "attached" });
  await entrar();
  pasos.alVolver = (await caja()).cifras;
  debe(pasos.alVolver === vivo.cifras, `al volver a Ajustes sigue el mismo código (${pasos.alVolver})`);

  // 6. Otro aparato se empareja con él por la pantalla de siempre. Comparte el
  //    almacén con este (mismo navegador), así que se le quita la clave antes:
  //    este la sigue teniendo en memoria.
  await page.evaluate(() => localStorage.removeItem("adeorq-movil-clave"));
  const otro = await page.context().newPage();
  otro.on("pageerror", (e) => errores.push(`otro: ${e}`));
  await otro.setViewportSize({ width: 390, height: 844 });
  await otro.goto(`${B}/`);
  await otro.waitForSelector("#codigo");
  pasos.pantallaEmparejar = await otro.$eval(".emparejar p", (p) => p.textContent);
  debe(/Ajustes > Emparejar otro aparato/.test(pasos.pantallaEmparejar), `la pantalla de emparejar dice que el código sale también de otro aparato (${pasos.pantallaEmparejar})`);
  await otro.fill("#codigo", vivo.cifras.replace(" ", ""));
  await otro.fill("#nombre", "Windows · Edge");
  await otro.click("#entrar");
  await otro.waitForSelector(".emparejar", { state: "detached", timeout: 5000 }).catch(() => {});
  pasos.otro = await otro.evaluate(() => ({ emparejar: !!document.querySelector(".emparejar"), clave: localStorage.getItem("adeorq-movil-clave") }));
  debe(!pasos.otro.emparejar && /^otra-/.test(pasos.otro.clave || ""), `el otro aparato entra con su clave (${JSON.stringify(pasos.otro)})`);
  pasos.otroYo = await alDoble("/api/yo", null, pasos.otro.clave);
  debe(pasos.otroYo.estado === 200 && pasos.otroYo.v.nombre === "Windows · Edge", `y el PC lo conoce (${JSON.stringify(pasos.otroYo)})`);
  pasos.otraVez = (await alDoble("/api/emparejar", { codigo: vivo.cifras.replace(" ", ""), nombre: "Tercero" }, null)).estado;
  debe(pasos.otraVez === 403, `el código vale una vez (${pasos.otraVez})`);
  await otro.close();
  await page.evaluate((c) => localStorage.setItem("adeorq-movil-clave", c), CLAVE);

  debe(!errores.length, `sin errores en la página (${errores.join(" | ")})`);
  return { pasos, fallos };
}
