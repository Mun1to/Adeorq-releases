// La pestaña Perfil (`PerfilView.tsx`), en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/perfil.js
//
// Rust se hace con un doble que contesta lo que leen los cuatro resúmenes. Lo
// que fija (Munir, 2026-10-17: A3, F1 y «lo que no se rompe»), que la lógica
// suelta (`cabecera-check.ts`, `partes-check.ts`) no ve:
//   · la cabecera queda en siete, con el Perfil encendido también dentro de
//     sus cuatro secciones;
//   · el Perfil enseña tu nombre y tu @, se cambian ahí mismo y la foto se
//     guarda reducida;
//   · un resumen abre la pantalla de siempre con la vuelta al Perfil encima;
//   · Ctrl+K sigue abriendo la Memoria directamente;
//   · con la Memoria apagada su resumen no sale y la paleta no la ofrece;
//   · un orden de la cabecera guardado antes del Perfil pone al Perfil en el
//     sitio de la primera de las cuatro;
//   · el recorrido de la bienvenida para en el Perfil;
//   · tu nombre y tus secciones van en la misma fila (la 4), y no hay ninguna
//     cárcel en la pestaña (el detector `carceles.js`, pedido a Vite).
//
// Con `FOTOS=<carpeta>` en el entorno (banco-sin-mcp.mjs), deja ahí las capturas.
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  // Con `URL_APP` va contra otro Vite del repo: el :1420 suele ser de otra sesión.
  const URL_APP = globalThis.process?.env?.URL_APP ?? "http://127.0.0.1:1420/";
  await page.addInitScript(() => {
    const q = new URLSearchParams(location.search);
    if (sessionStorage.getItem("banco-perfil") !== q.get("vez")) {
      localStorage.clear();
      sessionStorage.setItem("banco-perfil", q.get("vez") ?? "");
      localStorage.setItem("adeorq-lang", "es");
      localStorage.setItem("adeorq-perfil", JSON.stringify({ nombre: "Sam", arroba: "sam", sinRaiz: true, hecho: true, tour: true, clis: ["claude"] }));
      if (q.get("partes")) localStorage.setItem("adeorq-partes", JSON.stringify(q.get("partes").split(",")));
      if (q.get("cabecera")) localStorage.setItem("adeorq-cabecera", q.get("cabecera"));
    }
    const oyentes = {};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    let escucha = 1;
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "fijar_partes": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        // Instalados Claude y Codex, los dos con sesión: Cuentas dice «2 conectadas».
        case "detect_clis": return args.exes.filter(([id]) => id === "claude" || id === "codex").map(([id]) => ({ id, path: `C:\\bin\\${id}.exe` }));
        case "account_ready": return true;
        case "goals_read":
          return { date: args.date, path: "C:\\datos\\objetivos\\hoy.md", goals: [
            { idx: 0, text: "Cerrar la pestaña Perfil", done: false },
            { idx: 1, text: "Publicar la 0.9.219", done: false },
            { idx: 2, text: "Mirar el móvil", done: true },
          ] };
        case "memoria_vaults": return [{ path: "C:\\Notas", name: "Notas", docs: 412, abierta: true }];
        case "list_skills": return ["fin", "rastro", "gresso", "diretto", "pauta"].map((n) => ({ name: n, description: n, invocation: `/${n}`, folder: n }));
        case "usage_limits": return { lines: [{ label: "semana", percent: 64, resets: "", resetsAt: 0 }, { label: "sesión", percent: 81, resets: "", resetsAt: 0 }], note: "", plan: "" };
        default: throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_${id}`] = cb; return id; },
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });
  const pasos = {};
  const FOTOS = globalThis.process?.env?.FOTOS;
  const foto = async (nombre) => { if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nombre}.png` }); };
  const pestanas = () => page.$$eval(".topbar [data-tab]", (b) => b.map((x) => x.dataset.tab));
  const encendida = () => page.$$eval(".topbar [data-tab][data-active='true']", (b) => b.map((x) => x.dataset.tab).join());
  await page.setViewportSize({ width: 1600, height: 1000 });

  // 1. La cabecera en siete, y el Perfil con lo tuyo.
  await page.goto(`${URL_APP}?vez=1`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 15000 });
  pasos.cabecera = await pestanas();
  debe(pasos.cabecera.join() === "panel,cabina,chat,decisiones,lienzo,perfil,ajustes", `la cabecera en siete (${pasos.cabecera})`);
  await page.click('[data-tab="perfil"]');
  await page.locator(".panel.perfil").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  pasos.encendida = await encendida();
  debe(pasos.encendida === "perfil", `el Perfil encendido en la cabecera (${pasos.encendida})`);
  pasos.quien = await page.$eval(".perfil-quien", (x) => x.innerText.replace(/\s+/g, " ").trim());
  debe(/^Sam @sam/.test(pasos.quien), `tu nombre y tu @ arriba (${pasos.quien})`);
  pasos.resumenes = await page.$$eval(".perfil-seccion", (s) => s.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
  const resumen = (n) => pasos.resumenes.find((x) => x.startsWith(n)) ?? "";
  debe(pasos.resumenes.length === 4, `cuatro resúmenes (${pasos.resumenes.length})`);
  debe(/^Cuentas › 2 conectadas/.test(resumen("Cuentas")) && /81 %/.test(resumen("Cuentas")), `Cuentas: las conectadas y su límite (${resumen("Cuentas")})`);
  debe(/^Agenda › 2 pendientes hoy 1 hecho Cerrar la pestaña Perfil Publicar la 0.9.219$/.test(resumen("Agenda")), `Agenda: lo de hoy (${resumen("Agenda")})`);
  // «en Notas»: el nombre de la bóveda va con su preposición desde el 2026-10-18.
  debe(/^Memoria › 412 notas en Notas$/.test(resumen("Memoria")), `Memoria: tus notas (${resumen("Memoria")})`);
  debe(/^Comandos › 5 skills tuyas \/fin/.test(resumen("Comandos")), `Comandos: los tuyos (${resumen("Comandos")})`);
  // La 4 (Munir, 2026-10-17): tu nombre y tus secciones en la misma fila, y lo demás debajo.
  pasos.orden4 = await page.evaluate(() => {
    const caja = (s) => document.querySelector(s).getBoundingClientRect();
    const tu = caja(".panel.perfil > .perfil-tu");
    const sec = caja(".panel.perfil > .perfil-secciones");
    const tercero = document.querySelector(".panel.perfil > :nth-child(3)")?.getBoundingClientRect();
    return { mismaFila: tu.top < sec.bottom && sec.top < tu.bottom, aLaDerecha: sec.left >= tu.right, debajo: !tercero || tercero.top >= sec.bottom };
  });
  debe(pasos.orden4.mismaFila && pasos.orden4.aLaDerecha && pasos.orden4.debajo, `la 4: tu nombre y tus secciones en una fila, lo demás debajo (${JSON.stringify(pasos.orden4)})`);
  // Ni una cárcel en lo de la pestaña: el detector del panel 1, pedido a Vite como texto.
  const crudo = await (await page.request.get(`${URL_APP}scripts/laboratorio/carceles.js?raw`)).text();
  const detector = (0, eval)(`(${JSON.parse(crudo.slice(crudo.indexOf('"'), crudo.lastIndexOf('"') + 1))})`);
  const carceles = async () => (await detector(page)).fallos.filter((f) => /perfil/.test(f));
  pasos.carcelesPagina = await carceles();
  debe(pasos.carcelesPagina.length === 0, `sin cárceles en el Perfil (${pasos.carcelesPagina})`);
  await foto("1-perfil");

  // 2. Tu nombre, tu @ y tu foto se cambian ahí mismo.
  await page.click(".perfil-editar");
  pasos.carcelesEditando = await carceles();
  debe(pasos.carcelesEditando.length === 0, `sin cárceles al editar (${pasos.carcelesEditando})`);
  await page.fill(".perfil-campo-nombre", "Samuel");
  await page.fill(".perfil-campo-arroba input", "@samu ");
  await page.click(".perfil-botones button[type='submit']");
  pasos.quienNuevo = await page.$eval(".perfil-quien", (x) => x.innerText.replace(/\s+/g, " ").trim());
  pasos.guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("adeorq-perfil")));
  debe(/^Samuel @samu/.test(pasos.quienNuevo) && pasos.guardado.nombre === "Samuel" && pasos.guardado.arroba === "samu" && pasos.guardado.sinRaiz === true, `cambiar el nombre y el @ sin tocar lo demás del perfil (${pasos.quienNuevo}, ${JSON.stringify(pasos.guardado)})`);
  // Una imagen de 600×300 hecha aquí mismo: sale cuadrada, de 256, en WebP.
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 600; c.height = 300;
    const x = c.getContext("2d");
    x.fillStyle = "#c33"; x.fillRect(0, 0, 600, 300);
    x.fillStyle = "#3c3"; x.fillRect(150, 0, 300, 300);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.setInputFiles(".perfil-tu input[type='file']", { name: "yo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.locator(".perfil-foto img").waitFor({ timeout: 5000 });
  pasos.foto = await page.$eval(".perfil-foto img", (i) => new Promise((ok) => {
    const mirar = () => {
      const c = document.createElement("canvas");
      c.width = i.naturalWidth; c.height = i.naturalHeight;
      const x = c.getContext("2d");
      x.drawImage(i, 0, 0);
      const [r, g] = x.getImageData(5, 128, 1, 1).data;
      ok({ ancho: i.naturalWidth, alto: i.naturalHeight, webp: i.src.startsWith("data:image/webp"), borde: r > g ? "rojo" : "verde", bytes: i.src.length });
    };
    if (i.complete) mirar(); else i.onload = mirar;
  }));
  debe(pasos.foto.ancho === 256 && pasos.foto.alto === 256 && pasos.foto.webp && pasos.foto.borde === "verde", `la foto, recortada al cuadrado del centro y reducida (${JSON.stringify(pasos.foto)})`);
  await foto("2-perfil-con-foto");

  // 3. Un resumen abre la pantalla de siempre, con la vuelta encima.
  await page.click('.perfil-seccion[data-seccion="agenda"]');
  await page.locator(".perfil-volver").waitFor({ timeout: 10000 });
  await page.locator(".panel.agenda").first().waitFor({ timeout: 10000 });
  pasos.volver = await page.$eval(".perfil-volver", (x) => x.innerText.replace(/\s+/g, " ").trim());
  pasos.enAgenda = await encendida();
  debe(pasos.volver === "‹ Perfil Agenda" && pasos.enAgenda === "perfil", `en la Agenda, la vuelta encima y el Perfil encendido (${pasos.volver}; ${pasos.enAgenda})`);
  pasos.orden = await page.evaluate(() => {
    const v = document.querySelector(".perfil-volver");
    const a = document.querySelector(".panel.agenda");
    return v.getBoundingClientRect().bottom <= a.getBoundingClientRect().top + 1;
  });
  debe(pasos.orden, "la vuelta queda ENCIMA de la pantalla de la sección");
  pasos.carcelesVuelta = await carceles();
  debe(pasos.carcelesVuelta.length === 0, `sin cárceles en la vuelta (${pasos.carcelesVuelta})`);
  await foto("3-agenda-con-vuelta");
  await page.click(".perfil-volver-btn");
  await page.locator(".panel.perfil").waitFor({ timeout: 5000 });
  debe((await page.locator(".perfil-volver").count()) === 0, "la vuelta lleva al Perfil y se va");

  // 4. Ctrl+K sigue abriendo la Memoria directamente.
  await page.keyboard.press("Control+k");
  await page.locator(".paleta-fila").first().waitFor({ timeout: 5000 });
  await page.keyboard.type("memoria");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.locator(".perfil-volver").waitFor({ timeout: 10000 });
  pasos.memoria = await page.$eval(".perfil-volver", (x) => x.innerText.replace(/\s+/g, " ").trim());
  debe(pasos.memoria === "‹ Perfil Memoria" && (await encendida()) === "perfil", `Ctrl+K abre la Memoria dentro del Perfil (${pasos.memoria})`);

  // 5. Con la Memoria apagada, ni su resumen ni la paleta.
  await page.goto(`${URL_APP}?vez=2&partes=memoria`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 15000 });
  await page.click('[data-tab="perfil"]');
  await page.locator(".perfil-seccion").first().waitFor({ timeout: 10000 });
  pasos.sinMemoria = await page.$$eval(".perfil-seccion", (s) => s.map((x) => x.dataset.seccion).join());
  debe(pasos.sinMemoria === "cuentas,agenda,comandos", `sin la Memoria, tres resúmenes (${pasos.sinMemoria})`);
  await page.keyboard.press("Control+k");
  await page.locator(".paleta-fila").first().waitFor({ timeout: 5000 });
  pasos.paleta = await page.$$eval(".paleta-fila", (f) => f.map((x) => x.textContent.trim()));
  debe(!pasos.paleta.some((x) => /^MemoriaPestaña/.test(x)) && pasos.paleta.some((x) => /^AgendaPestaña/.test(x)) && pasos.paleta.some((x) => /^PerfilPestaña/.test(x)), `la paleta sin la Memoria y con la Agenda y el Perfil (${pasos.paleta.slice(0, 14)})`);
  await page.keyboard.press("Escape");

  // 6. Un orden guardado antes del Perfil: ocupa el sitio de la primera de las cuatro.
  const viejo = JSON.stringify({ orden: ["panel", "cuentas", "cabina", "agenda", "chat", "lienzo", "memoria", "comandos", "decisiones", "ajustes"], ocultas: ["comandos"] });
  await page.goto(`${URL_APP}?vez=3&cabecera=${encodeURIComponent(viejo)}`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 15000 });
  pasos.migrada = await pestanas();
  debe(pasos.migrada.join() === "panel,perfil,cabina,chat,lienzo,decisiones,ajustes", `el orden de antes, con el Perfil en el sitio de Cuentas (${pasos.migrada})`);

  // 7. El recorrido de la bienvenida para en el Perfil.
  await page.click('[data-tab="ajustes"]');
  await page.getByText("Ayuda", { exact: true }).first().click();
  await page.getByText("Ver el recorrido", { exact: true }).click();
  await page.locator(".tour-globo").waitFor({ timeout: 5000 });
  pasos.paradas = [];
  for (let i = 0; i < 12; i++) {
    const titulo = await page.$eval(".tour-globo", (g) => g.querySelector("h3, strong, b")?.textContent ?? g.innerText.split("\n")[1]);
    if (pasos.paradas.includes(titulo)) break;
    pasos.paradas.push(titulo);
    await page.click(".tour");
    await page.waitForTimeout(250);
  }
  debe(pasos.paradas.some((x) => /Perfil/.test(x)) && !pasos.paradas.some((x) => /^(La Agenda|Tus cuentas)$/.test(x)), `el recorrido para en el Perfil (${pasos.paradas})`);

  return { pasos, fallos };
}
