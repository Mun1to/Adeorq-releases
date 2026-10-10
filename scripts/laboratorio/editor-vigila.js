// El editor de archivos se entera solo de que un agente cambió lo que miras, y
// enseña las imágenes.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/editor-vigila.js"),
//      con la página recién abierta (o cerrada antes con browser_close)
//
// El «disco» es el doble: `window.__disco` guarda el texto y la hora de
// `nota.md`, y cambiarlos es lo que haría un agente al reescribirlo.
//   1. Sin cambios tuyos: a los pocos segundos el editor enseña lo nuevo, EN EL
//      MISMO editor (no se monta otro, que perdería el sitio), sin marcarlo
//      como sin guardar, y lo dice en el pie.
//   2. Con cambios tuyos: no se toca tu texto; sale el aviso y decides.
//   3. «Traer lo nuevo» trae lo del disco y quita el aviso.
//   4. Una imagen se ve, con su tamaño en la cabecera.
//   5. La hoja que no se ve no pregunta al disco.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  await page.addInitScript(() => {
    const NOTA = "C:\\proyectos\\Adeorq\\nota.md";
    const FOTO = "C:\\proyectos\\Adeorq\\foto.png";
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude"] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [{ name: "nota.md", cwd: "C:\\proyectos\\Adeorq", archivos: [NOTA, FOTO], activo: NOTA }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
    }));
    window.__disco = { texto: "uno\ndos\ntres", cuando: 100 };
    window.__preguntas = { nota: 0, foto: 0 };
    // Un PNG de 2 × 1 de verdad, para que el <img> cargue y diga su tamaño.
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGN40R71P6r9xX8AF90FkVf7ouwAAAAASUVORK5CYII=";
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "leer_archivo":
          return args.ruta === NOTA
            ? { ruta: NOTA, texto: window.__disco.texto, pega: null, peso: window.__disco.texto.length, cuando: window.__disco.cuando, crlf: false }
            : { ruta: FOTO, texto: null, pega: "binario", peso: 2048, cuando: 5, crlf: false };
        case "cuando_archivo":
          if (args.ruta === NOTA) { window.__preguntas.nota++; return window.__disco.cuando; }
          window.__preguntas.foto++;
          return 5;
        case "leer_imagen": return args.ruta === FOTO ? PNG : null;
        case "guardar_archivo": {
          const pisaria = !args.forzar && args.visto != null && window.__disco.cuando > args.visto;
          if (!pisaria) window.__disco = { texto: args.texto, cuando: window.__disco.cuando + 1 };
          return { cuando: window.__disco.cuando, pisaria };
        }
        default:
          throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window[`_${id}`] = cb;
          return id;
        },
        convertFileSrc: (r) => r,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });

  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.locator(".ed-hoja[data-visible='true'] .cm-content").waitFor({ timeout: 10000 });

  const hoja = '.ed-hoja[data-visible="true"]';
  const leer = () => page.evaluate((h) => {
    const el = document.querySelector(h);
    return {
      texto: el?.querySelector(".cm-content")?.innerText.replace(/\n+$/, "") ?? null,
      aviso: el?.querySelector(".ed-aviso span")?.textContent ?? null,
      pie: el?.querySelector(".ed-pie span")?.textContent ?? null,
      sucio: document.querySelectorAll(".pane-sucio").length,
      mismoEditor: window.__cm ? window.__cm === el?.querySelector(".cm-editor") : null,
    };
  }, hoja);
  const pasos = {};
  await page.evaluate((h) => { window.__cm = document.querySelector(`${h} .cm-editor`); }, hoja);
  pasos.inicio = await leer();
  if (pasos.inicio.texto !== "uno\ndos\ntres") fallos.push(`el editor no abre con el texto del disco: ${JSON.stringify(pasos.inicio.texto)}`);

  // 1. Un agente lo reescribe y tú no habías tocado nada.
  await page.evaluate(() => { window.__disco = { texto: "uno\ndos\ntres\nCUATRO del agente", cuando: 200 }; });
  await page.waitForTimeout(3400);
  pasos.trasElAgente = await leer();
  if (!/CUATRO del agente/.test(pasos.trasElAgente.texto ?? "")) fallos.push("no se trajo solo lo que cambió el agente");
  if (pasos.trasElAgente.mismoEditor !== true) fallos.push("se montó un editor nuevo: se pierde el sitio por el que ibas");
  if (pasos.trasElAgente.sucio) fallos.push("lo que vino del disco quedó marcado como sin guardar");
  if (!/disco/.test(pasos.trasElAgente.pie ?? "")) fallos.push(`el pie no dice que se trajo del disco: «${pasos.trasElAgente.pie}»`);

  // 2. Ahora escribes tú, y el agente vuelve a cambiarlo.
  await page.locator(`${hoja} .cm-content`).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Y ESTO ES MIO");
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__disco = { texto: "todo distinto", cuando: 300 }; });
  await page.waitForTimeout(3400);
  pasos.conLoMio = await leer();
  if (!/Y ESTO ES MIO/.test(pasos.conLoMio.texto ?? "")) fallos.push("te pisó lo que estabas escribiendo");
  if (/todo distinto/.test(pasos.conLoMio.texto ?? "")) fallos.push("metió lo del disco encima de tus cambios");
  if (!pasos.conLoMio.aviso) fallos.push("no avisó de que el archivo cambió con cambios tuyos sin guardar");
  if (!pasos.conLoMio.sucio) fallos.push("tus cambios no figuran como sin guardar");

  // 3. Eliges traer lo nuevo.
  await page.getByRole("button", { name: "Traer lo nuevo" }).click();
  await page.waitForTimeout(800);
  pasos.trasTraer = await leer();
  if (pasos.trasTraer.texto !== "todo distinto") fallos.push(`«Traer lo nuevo» dejó ${JSON.stringify(pasos.trasTraer.texto)}`);
  if (pasos.trasTraer.aviso) fallos.push("el aviso sigue ahí después de traer lo nuevo");

  // 4. La imagen.
  await page.locator(".ed-pest", { hasText: "foto.png" }).click();
  await page.waitForTimeout(900);
  pasos.imagen = await page.evaluate((h) => {
    const img = document.querySelector(`${h} .ed-imagen img`);
    return {
      ancho: img?.naturalWidth ?? 0,
      chip: document.querySelector(".pane-archivo .pane-chip")?.textContent ?? null,
      nota: document.querySelector(`${h} .ed-nota`)?.textContent ?? null,
    };
  }, hoja);
  if (pasos.imagen.ancho !== 2) fallos.push(`la imagen no se ve (ancho ${pasos.imagen.ancho})`);
  if (!/2 × 1/.test(pasos.imagen.chip ?? "")) fallos.push(`la cabecera no dice el tamaño de la imagen: «${pasos.imagen.chip}»`);
  if (pasos.imagen.nota) fallos.push("sigue diciendo «esto no es texto» encima de la imagen");

  // 5. Con la nota escondida detrás de la imagen, por ella no se pregunta.
  const antes = await page.evaluate(() => window.__preguntas.nota);
  await page.waitForTimeout(5500);
  pasos.preguntas = await page.evaluate(() => window.__preguntas);
  if (pasos.preguntas.nota !== antes) fallos.push(`la hoja escondida siguió preguntando al disco (${pasos.preguntas.nota - antes} veces)`);
  if (!pasos.preguntas.foto) fallos.push("la hoja de la imagen no vigila su archivo");
  return { pasos, fallos };
}
