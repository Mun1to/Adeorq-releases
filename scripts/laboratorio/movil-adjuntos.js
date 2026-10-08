// Los adjuntos del móvil y la página dentro del panel de Munir, a 390 px,
// contra el doble (`node scripts/laboratorio/doble-movil.mjs`, en el 4390):
//
//   browser_run_code_unsafe(filename = "scripts/laboratorio/movil-adjuntos.js")
//
// 1. Una foto de 3000 px y una nota a una terminal: la foto se achica antes de
//    subir, las dos suben a trozos y la terminal recibe el texto con sus rutas.
// 2. Al conserje, un adjunto sin texto: se manda solo la ruta.
// 3. Dentro del panel: un panel de mentira en https://munito-panel.pages.dev y
//    la página en una dirección de Tailscale de mentira, las dos servidas por
//    Playwright (el doble va por http y un marco http no entra en una https).
//    Sin clave, empareja y el panel la guarda; al volver, el panel se la da y
//    entra sin emparejar; con una clave mala, el panel la olvida.
async (page) => {
  const DOBLE = "http://127.0.0.1:4390";
  const TS = "https://pc-de-prueba.tail0000.ts.net:8443";
  const PANEL = "https://munito-panel.pages.dev";

  await page.goto(`${DOBLE}/`);
  await page.setViewportSize({ width: 780, height: 1600 });
  const k = 780 / (await page.evaluate(() => innerWidth));
  await page.setViewportSize({ width: Math.round(390 * k), height: Math.round(800 * k) });
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));

  // Elige archivos en el clip como lo haría el móvil.
  const adjuntar = (selector) => page.evaluate(async (sel) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 3000; lienzo.height = 2000;
    const g = lienzo.getContext("2d");
    for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${i * 7} 70% 50%)`; g.fillRect((i * 97) % 3000, (i * 53) % 2000, 120, 90); }
    const png = await new Promise((r) => lienzo.toBlob(r, "image/png"));
    const dt = new DataTransfer();
    if (sel.foto) dt.items.add(new File([png], "Captura de pantalla.png", { type: "image/png" }));
    dt.items.add(new File(["hola desde el móvil\n".repeat(4000)], "nota.txt", { type: "text/plain" }));
    const input = document.querySelector('.caja input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
    return { png: png.size };
  }, selector);
  const esperarListos = () => page.waitForFunction(() => {
    const a = [...document.querySelectorAll(".adjunto")];
    return a.length && a.every((x) => x.dataset.estado !== "subiendo");
  }, null, { timeout: 30000 });

  // 1. A la terminal 1.
  await page.goto(`${DOBLE}/?p=1#terminal=1`);
  await page.waitForTimeout(1000);
  const { png } = await adjuntar({ foto: true });
  await esperarListos();
  const bandeja = await page.evaluate(() => ({
    chips: [...document.querySelectorAll(".adjunto")].map((a) => `${a.dataset.estado}: ${a.querySelector(".que").textContent}`),
    miniatura: !!document.querySelector(".adjunto img"),
    enviarListo: !document.getElementById("enviar").disabled,
  }));
  await page.screenshot({ path: "C:/Users/Muni/AppData/Local/Temp/claude/C--proyectos-Adeorq/572c3eb8-4cba-4c56-8923-bddd346e5626/scratchpad/movil-adjuntos.png" });
  const subidos = await page.evaluate(async () => (await fetch("/api/adjuntos", { headers: { Authorization: "Bearer clave-de-mentira" } })).json());
  await page.fill("#texto", "mira esto");
  await page.click("#enviar");
  await page.waitForTimeout(500);
  const terminal = await page.evaluate(async () => ({
    escrito: (await (await fetch("/api/escrito?panel=1", { headers: { Authorization: "Bearer clave-de-mentira" } })).json()).texto,
    bandejaVacia: document.querySelector(".adjuntos").hidden,
  }));

  // 2. Al conserje, solo un adjunto.
  await page.goto(`${DOBLE}/?p=x#conv=nueva-con-adjunto`);
  await page.waitForTimeout(800);
  await adjuntar({ foto: false });
  await esperarListos();
  await page.click("#enviar");
  await page.waitForTimeout(800);
  const conserje = await page.evaluate(() => [...document.querySelectorAll('.turno[data-rol="tu"] .burbuja')].map((b) => b.innerText).at(-1));

  // 3. Dentro del panel.
  await page.route(`${TS}/**`, async (route) => {
    const u = new URL(route.request().url());
    const r = await route.fetch({ url: `${DOBLE}${u.pathname}${u.search}` });
    await route.fulfill({ response: r });
  });
  await page.route(`${PANEL}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8"><body style="margin:0">
      <iframe id="m" src="${TS}/" allow="local-network; local-network-access; clipboard-read; clipboard-write" style="border:0;width:100%;height:100vh"></iframe>
      <script>
        window.__mensajes = [];
        const m = document.getElementById("m");
        addEventListener("message", (ev) => {
          if (ev.origin !== "${TS}" || ev.source !== m.contentWindow) return;
          window.__mensajes.push(ev.data.tipo);
          if (ev.data.tipo === "adeorq:clave?") m.contentWindow.postMessage({ tipo: "adeorq:clave", clave: localStorage.getItem("adeorq-clave") }, "${TS}");
          if (ev.data.tipo === "adeorq:clave-nueva") localStorage.setItem("adeorq-clave", ev.data.clave);
          if (ev.data.tipo === "adeorq:olvidar") localStorage.removeItem("adeorq-clave");
        });
      </script>`,
  }));
  const marco = () => page.frames().find((f) => f.url().startsWith(TS));
  await page.goto(`${PANEL}/prueba`);
  await page.waitForTimeout(2200);
  const sinClave = await marco()?.evaluate(() => document.querySelector(".emparejar h1")?.textContent ?? document.body.innerText.slice(0, 60));
  await marco().fill("#codigo", "123456");
  await marco().click("#entrar");
  await page.waitForTimeout(1200);
  const tras = { mensajes: await page.evaluate(() => window.__mensajes), guardada: await page.evaluate(() => localStorage.getItem("adeorq-clave")), vista: await marco().evaluate(() => document.querySelector(".barra h1")?.textContent) };
  // Otra visita, con el almacén del marco vacío (lo que hace Brave al cerrar).
  await marco().evaluate(() => localStorage.clear());
  await page.goto(`${PANEL}/prueba`);
  await page.waitForTimeout(1500);
  const vuelta = await marco().evaluate(() => document.querySelector(".barra h1")?.textContent ?? document.body.innerText.slice(0, 60));
  const avisosEnMarco = await marco().evaluate(() => { const b = document.getElementById("avisos"); return b ? !b.hidden : null; });
  // Una clave que el PC ya no acepta: el panel la olvida.
  await page.evaluate(() => localStorage.setItem("adeorq-clave", "una-clave-que-ya-no-vale-0000"));
  await marco().evaluate(() => localStorage.clear());
  await page.goto(`${PANEL}/prueba`);
  await page.waitForTimeout(2500);
  const malaOlvidada = await page.evaluate(() => localStorage.getItem("adeorq-clave"));
  // Y una web que no es el panel ni oye la petición de la clave ni consigue
  // colar una suya (de verdad, además, `frame-ancestors` ni la deja meterla).
  const OTRA = "https://otra-web.example";
  await page.route(`${OTRA}/**`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><body style="margin:0"><iframe id="m" src="${TS}/" style="border:0;width:100%;height:100vh"></iframe>
      <script>
        window.__oido = [];
        addEventListener("message", (ev) => window.__oido.push(ev.data && ev.data.tipo));
        const m = document.getElementById("m");
        m.addEventListener("load", () => m.contentWindow.postMessage({ tipo: "adeorq:clave", clave: "clave-de-mentira" }, "*"));
      </script>`,
  }));
  await page.goto(`${OTRA}/`);
  await page.waitForTimeout(2200);
  const otra = {
    oido: await page.evaluate(() => window.__oido),
    vista: await marco().evaluate(() => (document.querySelector(".emparejar") ? "emparejar" : document.body.innerText.slice(0, 40))),
  };
  await page.unrouteAll({ behavior: "ignoreErrors" });
  return { png, bandeja, subidos, terminal, conserje, panel: { sinClave, tras, vuelta, avisosEnMarco, malaOlvidada, otra } };
}
