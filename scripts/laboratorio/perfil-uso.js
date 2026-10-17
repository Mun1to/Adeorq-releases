// Tu uso dentro del Perfil (`PerfilUso.tsx`), en la ventana de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/perfil-uso.js
//
// Rust se hace con un doble: `uso_historia` tarda dos segundos y contesta una
// historia hecha aquí con cifras redondas (o la tuya de verdad con
// `HISTORIA=<historia.json>`, que no comprueba cifras, solo que se pinta). Lo
// que fija, que la lógica suelta (`pnpm bancos usoDelPerfil`) no ve:
//   · mientras lee no se queda en blanco: sale la rueda con su frase;
//   · la cifra grande es la del mes en curso, CON la caché, y «Nuevos» debajo
//     con la frase de la caché en el globo (D3), en K, M y B;
//   · el récord de un día, que abre su tarjeta;
//   · el porfolio en una lista con pestañas (A4), con una carpeta escrita con
//     otra mayúscula junta con la suya;
//   · `uso_historia` recibe las carpetas de los proyectos del panel;
//   · el año termina hoy y el mes no lleva el número del día, solo los tokens;
//   · tocar un día con uso abre su tarjeta (`adeorq:abrir-tarjeta`), uno sin
//     uso no se puede tocar, y las flechas del mes;
//   · en inglés.
//
// Con `FOTOS=<carpeta>` en el entorno (banco-sin-mcp.mjs), deja ahí las capturas.
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const URL_APP = "http://127.0.0.1:1420/";
  const env = globalThis.process?.env ?? {};

  // Las fechas en la hora de la ventana, que es la que cuenta el componente.
  const dos = (n) => String(n).padStart(2, "0");
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  /** La hora UTC de las 12:00 de la ventana, `dias` días antes de hoy. */
  const horaDe = (dias) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias, 12);
    return d.toISOString().slice(0, 13);
  };
  const cubo = (dias, extra) => ({ hora: horaDe(dias), cli: "claude", modelo: "claude-opus-5-5", carpeta: "C:\\proyectos\\Adeorq", entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, respuestas: 1, ...extra });

  // El mes en curso es solo hoy: 2.500 M con la caché, 12 M nuevos (Adeorq
  // 2.000 M escrito de dos maneras, Orquio 500 M de Codex). Lo de antes cae
  // siempre en otro mes (40 días atrás o más), y el récord es el de 20.000 M.
  const sintetica = {
    archivos: 3,
    cubos: [
      cubo(0, { carpeta: "C:\\proyectos\\adeorq", entrada: 2e6, salida: 4e6, cacheEscrita: 6e6, cacheLeida: 944e6 }),
      cubo(0, { cacheLeida: 1044e6 }),
      cubo(0, { cli: "codex", modelo: "gpt-5.6-terra", carpeta: "C:\\proyectos\\Orquio", cacheLeida: 500e6 }),
      cubo(40, { modelo: "claude-opus-5", cacheLeida: 20000e6 }),
      cubo(60, { modelo: "claude-sonnet-5", carpeta: "C:\\proyectos\\VoCript", cacheLeida: 9000e6 }),
      cubo(70, { modelo: "claude-fable-5-1", carpeta: "C:\\proyectos\\winshotx", cacheLeida: 4000e6 }),
      cubo(80, { modelo: "claude-opus-4-8", carpeta: "C:\\proyectos\\Rolyal", cacheLeida: 2000e6 }),
      cubo(90, { modelo: "claude-fable-5", carpeta: "C:\\proyectos\\MarcaPersonal", cacheLeida: 1016e6 }),
      cubo(100, { carpeta: "C:\\proyectos\\Vibeset", cacheLeida: 1000e6 }),
    ],
  };
  const real = env.HISTORIA ? JSON.parse(globalThis.process.getBuiltinModule("node:fs").readFileSync(env.HISTORIA, "utf8")) : null;
  const historia = real ?? sintetica;

  await page.addInitScript(({ historia }) => {
    const q = new URLSearchParams(location.search);
    if (sessionStorage.getItem("banco-perfil-uso") !== q.get("vez")) {
      localStorage.clear();
      sessionStorage.setItem("banco-perfil-uso", q.get("vez") ?? "");
      localStorage.setItem("adeorq-lang", q.get("lang") ?? "es");
      localStorage.setItem("adeorq-perfil", JSON.stringify({ nombre: "Sam", arroba: "sam", sinRaiz: true, hecho: true, tour: true, clis: ["claude", "codex"] }));
    }
    const oyentes = {};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    window.__pedidosUso = [];
    window.__tarjetas = [];
    window.addEventListener("adeorq:abrir-tarjeta", (e) => window.__tarjetas.push(e.detail));
    let escucha = 1;
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "fijar_partes": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }, { name: "Orquio", path: "C:\\proyectos\\Orquio", hasGit: true }];
        case "detect_clis": return args.exes.filter(([id]) => id === "claude" || id === "codex").map(([id]) => ({ id, path: `C:\\bin\\${id}.exe` }));
        case "account_ready": return true;
        case "goals_read": return { date: args.date, path: "C:\\datos\\objetivos\\hoy.md", goals: [] };
        case "memoria_vaults": return [];
        case "list_skills": return [];
        case "usage_limits": return { lines: [], note: "", plan: "" };
        case "uso_historia":
          window.__pedidosUso.push(args);
          return new Promise((ok) => setTimeout(() => ok(historia), 2000));
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
  }, { historia });

  const pasos = {};
  const FOTOS = env.FOTOS;
  const foto = async (nombre) => { if (FOTOS) await page.locator(".pu").screenshot({ path: `${FOTOS}/${nombre}.png` }); };
  const texto = (sel) => page.$eval(sel, (x) => x.innerText.replace(/\s+/g, " ").trim());
  const cifra = () => texto(".pu-cifra > b");
  await page.setViewportSize({ width: 1600, height: 1000 });

  // 1. Mientras lee: la rueda con su frase, nunca en blanco.
  await page.goto(`${URL_APP}?vez=1`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 15000 });
  await page.click('[data-tab="perfil"]');
  await page.locator(".pu").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1300);
  pasos.leyendo = (await page.locator(".pu .espera").count()) ? await texto(".pu .espera") : "";
  debe(/Leyendo tus conversaciones/.test(pasos.leyendo), `mientras lee, la rueda con su frase (${pasos.leyendo || "nada"})`);
  await page.locator(".pu-cifra").waitFor({ timeout: 10000 });
  pasos.pedido = await page.evaluate(() => window.__pedidosUso[0]);
  debe(JSON.stringify(pasos.pedido?.proyectos) === JSON.stringify(["C:\\proyectos\\Adeorq", "C:\\proyectos\\Orquio"]), `uso_historia recibe los proyectos del panel (${JSON.stringify(pasos.pedido?.proyectos)})`);
  debe(JSON.stringify(pasos.pedido?.cuentas) === JSON.stringify([{ provider: "claude", dir: "" }, { provider: "codex", dir: "" }]), `y una vez cada cuenta que sabe leer (${JSON.stringify(pasos.pedido?.cuentas)})`);

  // 2. La cifra del mes, sin elegir periodo, y el récord.
  debe((await page.locator(".pu-pastillas").count()) === 0, "no hay pastillas de periodo: siempre el mes");
  pasos.etiqueta = await texto(".pu-cifra > em");
  debe(/^Tokens en [a-z]/.test(pasos.etiqueta), `la cifra dice de qué mes es, en minúscula de frase (${pasos.etiqueta})`);
  pasos.nuevosTip = await page.$eval(".pu-nuevos", (x) => x.dataset.tip);
  debe(/relee en cada respuesta/.test(pasos.nuevosTip ?? ""), "la frase de la caché en el globo de «Nuevos»");
  if (!real) {
    pasos.mesCifra = `${await cifra()} · ${await texto(".pu-fila")}`;
    debe(/^2,5B · Nuevos 12M Días activos 1 Récord 20B el /.test(pasos.mesCifra), `el mes en curso, con la caché, en B, y el récord (${pasos.mesCifra})`);
  }

  // 3. El porfolio: una lista con pestañas, que se abre en Proyectos.
  const lista = () => page.$$eval(".pu-lista .pu-parte", (fs) => fs.map((f) => [...f.children].map((c) => c.textContent).filter(Boolean).join(" ")));
  pasos.pestana = await texto(".pu-pestanas [aria-selected='true']");
  debe(pasos.pestana === "Proyectos", `se abre en Proyectos (${pasos.pestana})`);
  if (!real) {
    pasos.proyectos = await lista();
    debe(JSON.stringify(pasos.proyectos) === JSON.stringify(["Adeorq 2B 80 %", "Orquio 500M 20 %"]), `los proyectos del mes, con «adeorq» junto a «Adeorq» (${pasos.proyectos})`);
    await page.click(".pu-pestanas button:has-text('Proveedores')");
    pasos.proveedores = await lista();
    debe(JSON.stringify(pasos.proveedores) === JSON.stringify(["Claude Code 2B 80 %", "Codex 500M 20 %"]), `los proveedores (${pasos.proveedores})`);
    await page.click(".pu-pestanas button:has-text('Modelos')");
    pasos.modelos = await lista();
    debe(JSON.stringify(pasos.modelos) === JSON.stringify(["Opus 5.5 2B 80 %", "GPT-5.6 Terra 500M 20 %"]), `los modelos (${pasos.modelos})`);
    await page.click(".pu-pestanas button:has-text('Proyectos')");
  }
  await foto("1-mes");

  // 4. El año termina hoy; el mes, sin el número del día.
  pasos.anio = await page.$$eval(".pu-anio button", (b) => ({ n: b.length, ultimo: b[b.length - 1].dataset.hoy !== undefined }));
  debe(pasos.anio.ultimo && pasos.anio.n > 52 * 7, `el año termina hoy (${JSON.stringify(pasos.anio)})`);
  pasos.mes = await page.$$eval(".pu-mes button", (b) => b.map((x) => x.textContent));
  debe(pasos.mes.every((x) => x === "" || /^\d+(,\d)?(K|M|B)$|^\d+$/.test(x)) && pasos.mes.some((x) => /[MB]$/.test(x)), `el mes, solo con tokens (${pasos.mes.slice(0, 8)})`);

  // 5. Tocar un día con uso abre su tarjeta; uno sin uso no se toca; el récord también la abre.
  //    Mientras no exista `PerfilTarjeta.tsx` (la 0.9.219 salió antes que ella) no hay
  //    iconos de compartir ni pista, y tocar no lanza nada: se comprueba eso y se acaba aquí.
  pasos.conTarjeta = (await page.$(".pu-compartir")) !== null;
  if (!pasos.conTarjeta) {
    await page.click(".pu-mes button[data-hoy]");
    await page.click(".pu-record");
    pasos.tarjetas = await page.evaluate(() => window.__tarjetas);
    debe(!pasos.tarjetas.length, `sin tarjeta, tocar no lanza nada (${JSON.stringify(pasos.tarjetas)})`);
    debe(!(await page.$(".pu-pista")) && (await page.$$(".pu-mes-cab .pu-mover")).length === 2, "sin tarjeta, ni la pista ni el icono del mes");
    const antes = await texto(".pu-mes-cab .pu-titulo");
    await page.click(".pu-mes-cab .pu-mover >> nth=0");
    debe(antes !== (await texto(".pu-mes-cab .pu-titulo")), "la flecha cambia de mes");
    return { pasos, fallos };
  }
  await page.click(".pu-mes button[data-hoy]");
  await page.click(".pu-record");
  pasos.tarjetas = await page.evaluate(() => window.__tarjetas);
  debe(pasos.tarjetas[0]?.desde === hoy && pasos.tarjetas[0]?.hasta === hoy, `tocar hoy abre su tarjeta (${JSON.stringify(pasos.tarjetas[0])})`);
  if (!real) {
    const dia40 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 40);
    const f40 = `${dia40.getFullYear()}-${dos(dia40.getMonth() + 1)}-${dos(dia40.getDate())}`;
    debe(pasos.tarjetas[1]?.desde === f40 && pasos.tarjetas[1]?.hasta === f40, `el récord abre la tarjeta de su día (${JSON.stringify(pasos.tarjetas[1])}, ${f40})`);
    pasos.sinUso = await page.$$eval(".pu-anio button", (b) => b.filter((x) => x.dataset.n === "0").every((x) => x.disabled));
    debe(pasos.sinUso, "los días sin uso no se pueden tocar");
  }

  // 6. Compartir: el mes en curso desde los tokens; el mes que miras desde su
  //    cabecera, que se mueve con las flechas.
  const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
  const fPasado = (d) => `${mesPasado.getFullYear()}-${dos(mesPasado.getMonth() + 1)}-${dos(d)}`;
  const primeroDeEste = `${hoy.slice(0, 8)}01`;
  await page.click(".pu-compartir");
  await page.click(".pu-mes-cab .pu-mover >> nth=0");
  const antes = await texto(".pu-mes-cab .pu-titulo");
  await page.click(".pu-mes-cab .pu-mover >> nth=1");
  pasos.flecha = [antes, await texto(".pu-mes-cab .pu-titulo")];
  debe(pasos.flecha[0] !== pasos.flecha[1], `la flecha cambia de mes (${pasos.flecha})`);
  await page.click(".pu-mes-cab .pu-mover >> nth=0");
  await page.click(".pu-mes-cab .pu-mover >> nth=2");
  await page.click(".pu-mes-cab .pu-mover >> nth=2");
  pasos.futuro = await page.$eval(".pu-mes-cab .pu-mover", (b) => b.disabled);
  debe(pasos.futuro, "un mes que no ha empezado no se comparte");
  pasos.compartir = (await page.evaluate(() => window.__tarjetas)).slice(-3);
  debe(JSON.stringify(pasos.compartir[0]) === JSON.stringify({ desde: primeroDeEste, hasta: hoy }), `compartir desde los tokens: del 1 a hoy (${JSON.stringify(pasos.compartir[0])})`);
  debe(JSON.stringify(pasos.compartir[1]) === JSON.stringify({ desde: primeroDeEste, hasta: hoy }), `desde la cabecera del mes en curso, lo mismo (${JSON.stringify(pasos.compartir[1])})`);
  debe(JSON.stringify(pasos.compartir[2]) === JSON.stringify({ desde: fPasado(1), hasta: fPasado(mesPasado.getDate()) }), `del mes pasado, entero (${JSON.stringify(pasos.compartir[2])})`);

  // 7. En inglés.
  await page.goto(`${URL_APP}?vez=2&lang=en`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 15000 });
  await page.click('[data-tab="perfil"]');
  await page.locator(".pu-cifra").waitFor({ timeout: 10000 });
  pasos.ingles = `${await texto(".pu-cifra > em")} | ${await texto(".pu-fila")} | ${await texto(".pu-pestanas")}`;
  debe(/^Tokens in /.test(pasos.ingles) && /\| New /.test(pasos.ingles) && /Record .* on /.test(pasos.ingles) && /Providers Models Projects$/.test(pasos.ingles), `en inglés (${pasos.ingles})`);

  return { pasos, fallos };
}
