// El enjambre del lienzo, pulsado en la interfaz de verdad con el doble.
//
// Munir, 2026-10-12: «que puedas hacer merge de varias sesiones en solo un
// chat grupal y se puedan ir añadiendo más sesiones o quitarlas». Esto abre
// tres sesiones de Claude en el lienzo y recorre lo que tiene que pasar:
//
//   crear       «Añadir > Enjambre» pone la pieza con la lista de sesiones y
//               con SU Adeo: el primer enjambre del tablero es el azul;
//   filas       cada fila dice nombre, proyecto, modelo y estado, sin Adeo
//               (el color es del enjambre), y a Rust le llega la lista con el
//               nombre de cada una;
//   repartir    lo que se escribe en la caja va a Adeo con el estado de cada
//               sesión, y a la terminal elegida le llega reescrito;
//   contestar   cuando esa sesión termina, lo que dijo entra en el hilo;
//   minimizar   las terminales dejan de verse SIN relanzarse ni cambiar de
//               tamaño, y «ir» enseña una sola;
//   sacar       una fila fuera: su terminal sigue viva y a la vista;
//   arrastrar   una terminal aguantada encima de otra las junta, y vuelve a
//               su sitio; pasada de largo, no; y sobre un enjambre basta con
//               que el PUNTERO esté dentro de la tarjeta;
//   no juntarlas la pieza recién juntada ofrece deshacerlo, y todo queda igual;
//   otros CLI   un Claude, un Codex y un Gemini juntos: del Codex se sabe si
//               acabó y su respuesta entra en el chat; del Gemini, «no se sabe»;
//   reabrir     el tablero vuelve con su enjambre y sus sesiones, que ahora
//               tienen otro número de panel;
//   deshacer    la ✕ quita la pieza y las terminales se quedan.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/enjambre.js" })
// Con `window.__soloVer = true` sembrado antes se para tras el reparto, para
// mirar la pieza con sus filas y su chat (y hacerle una foto).
async (page) => {
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  const llamadas = (cmd) => page.evaluate((c) => window.__llamadas.filter(([x]) => x === c).map(([, a]) => a), cmd);
  const cuantas = async (cmd) => (await llamadas(cmd)).length;
  const ultima = async (cmd) => (await llamadas(cmd)).pop();
  const r = {};

  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(1200);
  // Tres sesiones de Claude, por el botón de la barra, que en esta vista las
  // abre en el lienzo.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.querySelector(".view-cabina .sidebar button.mini.mini-claude").click());
    await page.waitForTimeout(900);
  }
  const terms = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".view-lienzo .react-flow__node-term")].map((n) => ({
        id: n.getAttribute("data-id"),
        oculta: getComputedStyle(n).visibility === "hidden",
        x: Math.round(n.getBoundingClientRect().x),
        y: Math.round(n.getBoundingClientRect().y),
      })),
    );
  const sids = await page.evaluate(() =>
    Object.fromEntries(
      window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => [a.id, (a.command ?? []).join(" ").match(/--session-id\s+([0-9a-f-]{8,})/i)?.[1]]),
    ),
  );
  const ids = (await terms()).map((t) => Number(t.id));
  r.abiertas = { terminales: ids.length, conSesion: ids.filter((i) => sids[i]).length };

  /* ── crear, con el botón ────────────────────────────────────────────────── */
  await page.locator(".view-lienzo button", { hasText: /Añadir|Add/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".menu button, [role=menu] button, .ctx-menu button", { hasText: /Enjambre|Swarm/ }).first().click();
  await page.waitForTimeout(900);
  const pieza = page.locator(".rf-enjambre").first();
  r.crear = {
    piezas: await page.locator(".rf-enjambre").count(),
    nombre: await pieza.locator(".enj-nombre").innerText(),
    ofrecidas: await pieza.locator(".enj-libre").count(),
    color: `${await pieza.getAttribute("data-color")} ${await pieza.locator(".enj-head .mascota rect").first().getAttribute("fill")}`,
  };
  await pieza.locator(`.enj-libre[data-panel="${ids[0]}"]`).click();
  await page.waitForTimeout(300);
  await pieza.locator(`.enj-libre[data-panel="${ids[1]}"]`).click();
  await page.waitForTimeout(1200);
  const filas = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".rf-enjambre .enj-fila")].map((f) => ({
        panel: Number(f.getAttribute("data-panel")),
        estado: f.getAttribute("data-estado"),
        texto: f.querySelector(".enj-fila-id").innerText.replace(/\n/g, " | "),
        palabra: f.querySelector(".enj-estado").innerText.trim(),
        adeo: !!f.querySelector(".mascota"),
        marca: !!f.querySelector(".enj-marca svg"),
      })),
    );
  const miembros = (await ultima("conserje_miembros"))?.miembros ?? [];
  r.filas = {
    filas: await filas(),
    quedanPorOfrecer: await pieza.locator(".enj-libre").count(),
    aRust: miembros.map((w) => `${w.panel}:${w.cli}:${w.nombre ? "con nombre" : "SIN NOMBRE"}:${w.sesion ? "con sesión" : "sin sesión"}`),
    esEnjambre: (await cuantas("conserje_enjambre")) > 0,
  };
  await pieza.locator(".enj-libres .enj-boton", { hasText: /Listo|Done/ }).click();

  /* ── repartir ───────────────────────────────────────────────────────────── */
  // La primera ha terminado y la segunda trabaja: sin nombrar a nadie, va a la
  // que ha terminado.
  await page.evaluate(([a, b]) => { window.__estadoDe = { [a]: "lista", [b]: "a_medias" }; }, [sids[ids[0]], sids[ids[1]]]);
  // El estado de un panel se relee cada veinte segundos (`lib/contexto.ts`).
  await page.waitForTimeout(21500);
  r.estadosAntes = (await filas()).map((f) => `${f.panel}:${f.estado}`);
  const antesEnvio = await cuantas("pty_send");
  await pieza.locator(".enj-in").fill("que prueben el login con dos usuarios a la vez");
  await pieza.locator(".enj-in").press("Enter");
  await page.waitForTimeout(400);
  r.pensando = await pieza.locator(".enj-pensando").count();
  await page.waitForTimeout(2200);
  const envio = await ultima("conserje_enviar");
  const escritos = (await llamadas("pty_send")).slice(antesEnvio);
  const hilo = () =>
    page.evaluate(() => [...document.querySelectorAll(".rf-enjambre .enj-turno")].map((t) => `${t.getAttribute("data-rol")}${t.querySelector(".enj-turno-quien") ? ` (${t.querySelector(".enj-turno-quien").innerText.trim()})` : ""}: ${t.querySelector(".enj-burbuja").innerText.trim().slice(0, 70)}`));
  r.repartir = {
    estadosParaAdeo: envio?.estados,
    escritos: escritos.map((a) => `${a.id}: ${a.texto} [intro ${a.enviar}]`),
    aQuien: escritos.length === 1 && escritos[0].id === ids[0] ? "a la que había terminado" : "A OTRA",
    hilo: await hilo(),
  };
  if (await page.evaluate(() => window.__soloVer === true)) return r;

  /* ── contestar ──────────────────────────────────────────────────────────── */
  // EL CASO QUE SE PERDÍA: contesta en menos de lo que tarda en releerse su
  // panel, así que su fila no llega a decir «trabajando». Su respuesta tiene
  // que entrar igual, porque a las que Adeo acaba de escribir se las mira de
  // cerca.
  await page.evaluate((sid) => { window.__respuestaDe = { [sid]: "Probado con dos usuarios: el segundo ya entra. Era el cerrojo de la sesión." }; }, sids[ids[0]]);
  await page.waitForTimeout(6500);
  r.contestar = {
    estados: (await filas()).map((f) => `${f.panel}:${f.palabra}`),
    dijo: (await llamadas("conserje_dijo")).map((a) => `${a.panel}: ${a.texto.slice(0, 40)}`),
    hilo: (await hilo()).slice(-1),
  };

  /* ── minimizar, y enseñar una ───────────────────────────────────────────── */
  const antesMin = { spawn: await cuantas("pty_spawn"), kill: await cuantas("pty_kill"), resize: await cuantas("pty_resize") };
  await pieza.locator(".enj-head .enj-mini").first().click();
  await page.waitForTimeout(900);
  const trasMin = await terms();
  r.minimizar = {
    ocultas: trasMin.filter((t) => t.oculta).map((t) => Number(t.id)).sort(),
    aLaVista: trasMin.filter((t) => !t.oculta).map((t) => Number(t.id)),
    relanzadas: (await cuantas("pty_spawn")) - antesMin.spawn,
    matadas: (await cuantas("pty_kill")) - antesMin.kill,
    cambiosDeTamano: (await cuantas("pty_resize")) - antesMin.resize,
  };
  await pieza.locator(`.enj-fila[data-panel="${ids[1]}"] .enj-fila-id`).click();
  await page.waitForTimeout(1200);
  r.irAUna = { ocultas: (await terms()).filter((t) => t.oculta).map((t) => Number(t.id)) };
  await page.locator(".rf-enjambre .enj-head .enj-mini").first().click();
  await page.waitForTimeout(900);
  r.ensenar = { ocultas: (await terms()).filter((t) => t.oculta).length, cambiosDeTamano: (await cuantas("pty_resize")) - antesMin.resize };

  /* ── sacar una ──────────────────────────────────────────────────────────── */
  await page.locator(`.rf-enjambre .enj-fila[data-panel="${ids[1]}"]`).hover();
  await page.locator(`.rf-enjambre .enj-fila[data-panel="${ids[1]}"] .enj-mini`).last().click();
  await page.waitForTimeout(1200);
  r.sacar = {
    filas: (await filas()).map((f) => f.panel),
    aRust: ((await ultima("conserje_miembros"))?.miembros ?? []).map((w) => w.panel),
    suTerminal: (await terms()).find((t) => Number(t.id) === ids[1])?.oculta === false ? "viva y a la vista" : "NO SE VE",
    matadas: (await cuantas("pty_kill")) - antesMin.kill,
  };

  /* ── arrastrar una terminal sobre otra ──────────────────────────────────── */
  await page.evaluate(() => document.querySelector(".react-flow__controls-fitview, .react-flow__controls button[title*='fit' i]")?.click());
  await page.waitForTimeout(900);
  const cabecera = async (id) => {
    const c = await page.locator(`.react-flow__node-term[data-id="${id}"] .pane-head`).first().boundingBox();
    return { x: c.x + 60, y: c.y + c.height / 2 };
  };
  const cuerpo = async (id) => {
    const c = await page.locator(`.react-flow__node-term[data-id="${id}"]`).first().boundingBox();
    return { x: c.x + 60, y: c.y + 14 };
  };
  const arrastrar = async (de, a, aguantar) => {
    const desde = await cabecera(de);
    const hasta = await cuerpo(a);
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(desde.x + 12, desde.y + 12, { steps: 3 });
    await page.mouse.move(hasta.x, hasta.y, { steps: 12 });
    if (aguantar) await page.waitForTimeout(aguantar);
    const encendida = await page.locator(".react-flow__node.enj-diana").count();
    await page.mouse.up();
    await page.waitForTimeout(900);
    return encendida;
  };
  // Sobre un ENJAMBRE manda el puntero, no cuánto se tapa: soltada con el ratón
  // en el borde de abajo de la tarjeta, la terminal casi no la toca, y entra.
  // (Cogida por una punta de la cabecera era lo normal y no entraba.) Luego
  // sale otra vez, para seguir como estaba.
  await page.evaluate(() => document.querySelector(".react-flow__controls-fitview, .react-flow__controls button[title*='fit' i]")?.click());
  await page.waitForTimeout(900);
  {
    const desde = await cabecera(ids[1]);
    const tarjeta = await page.locator(".rf-enjambre").first().boundingBox();
    const destino = { x: tarjeta.x + tarjeta.width / 2, y: tarjeta.y + tarjeta.height - 12 };
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(desde.x + 8, desde.y + 8, { steps: 3 });
    await page.mouse.move(destino.x, destino.y, { steps: 12 });
    await page.waitForTimeout(900);
    const encendido = await page.locator(".react-flow__node-enjambre.enj-diana").count();
    await page.mouse.up();
    await page.waitForTimeout(900);
    r.punteroEnLaTarjeta = { encendido, filas: (await filas()).map((f) => f.panel).sort() };
    await page.evaluate((p) => document.querySelector(`.rf-enjambre .enj-fila[data-panel="${p}"] .enj-mini:last-child`)?.click(), ids[1]);
    await page.waitForTimeout(900);
    r.punteroEnLaTarjeta.trasSacarla = (await filas()).map((f) => f.panel);
  }
  // Pasada de largo y soltada sin esperar: no junta nada, solo se mueve.
  const antesPaso = await page.locator(".rf-enjambre").count();
  const sitio2 = (await terms()).find((t) => Number(t.id) === ids[2]);
  const encendidaDePaso = await arrastrar(ids[2], ids[1], 0);
  r.dePaso = { encendida: encendidaDePaso, enjambres: (await page.locator(".rf-enjambre").count()) - antesPaso };

  // La devuelvo a un sitio despejado para repetir el gesto aguantando.
  await page.evaluate(() => document.querySelector(".react-flow__controls-fitview, .react-flow__controls button[title*='fit' i]")?.click());
  await page.waitForTimeout(900);
  const antes2 = (await terms()).find((t) => Number(t.id) === ids[2]);
  const encendida = await arrastrar(ids[2], ids[1], 900);
  const tras2 = (await terms()).find((t) => Number(t.id) === ids[2]);
  const piezas = await page.evaluate(() =>
    [...document.querySelectorAll(".rf-enjambre")].map((e) => ({
      nombre: e.querySelector(".enj-nombre")?.innerText,
      color: `${e.getAttribute("data-color")} ${e.querySelector(".enj-head .mascota rect")?.getAttribute("fill")}`,
      filas: [...e.querySelectorAll(".enj-fila")].map((f) => Number(f.getAttribute("data-panel"))),
      pregunta: !!e.querySelector(".enj-elige"),
    })),
  );
  r.arrastrar = {
    encendida,
    enjambres: piezas,
    vuelveASuSitio: Math.abs(tras2.x - antes2.x) < 3 && Math.abs(tras2.y - antes2.y) < 3,
    seMovioDePaso: !!sitio2,
  };
  // El enjambre recién juntado pregunta qué hacer con sus terminales, y la
  // tercera salida es no haberlas juntado: la pieza se va y todo queda como
  // estaba. (No es Ctrl+Z: en el lienzo ese atajo es de la terminal.)
  const antesDeNo = (await terms()).map((t) => `${t.id}:${t.x},${t.y}:${t.oculta}`).join(" ");
  await page.evaluate(() => document.querySelector(".rf-enjambre .enj-elige .enj-no")?.click());
  await page.waitForTimeout(900);
  r.noJuntarlas = {
    enjambres: await page.locator(".rf-enjambre").count(),
    terminalesIgual: (await terms()).map((t) => `${t.id}:${t.x},${t.y}:${t.oculta}`).join(" ") === antesDeNo,
    matadas: (await cuantas("pty_kill")) - antesMin.kill,
    olvidada: (await cuantas("conserje_olvidar")) === 1,
  };
  // Y otra vez el gesto, ahora para quedárselo.
  await arrastrar(ids[2], ids[1], 900);
  await page.locator(".rf-enjambre .enj-elige .enj-boton", { hasText: /Minimizarlas|Minimize them/ }).first().click();
  await page.waitForTimeout(900);
  r.elegir = { ocultas: (await terms()).filter((t) => t.oculta).map((t) => Number(t.id)).sort(), pregunta: await page.locator(".rf-enjambre .enj-elige").count() };

  /* ── reabrir el tablero ─────────────────────────────────────────────────── */
  await page.waitForTimeout(2500);
  const guardado = JSON.parse((await page.evaluate(() => sessionStorage.getItem("__tablero"))) ?? "{}");
  r.guardado = (guardado.nodos ?? []).filter((n) => n.tipo === "enjambre").map((n) => ({ nombre: n.nombre, color: n.color, miembros: n.miembros.map((m) => m.nodo), plegadas: n.plegadas }));
  await page.reload();
  await page.waitForTimeout(5000);
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(2500);
  const renacidas = (await terms()).map((t) => Number(t.id));
  r.reabrir = {
    terminales: renacidas.length,
    enjambres: await page.evaluate(() =>
      [...document.querySelectorAll(".rf-enjambre")].map((e) => ({
        nombre: e.querySelector(".enj-nombre")?.innerText,
        color: `${e.getAttribute("data-color")} ${e.querySelector(".enj-head .mascota rect")?.getAttribute("fill")}`,
        filas: [...e.querySelectorAll(".enj-fila")].map((f) => Number(f.getAttribute("data-panel"))),
      })),
    ),
    ocultas: (await terms()).filter((t) => t.oculta).length,
    aRust: (await llamadas("conserje_miembros")).map((a) => a.miembros.map((w) => w.panel).join("+")).slice(-2),
  };

  /* ── deshacer ───────────────────────────────────────────────────────────── */
  const antesX = { piezas: await page.locator(".rf-enjambre").count(), kill: await cuantas("pty_kill") };
  // Por el DOM: dos tarjetas pueden haber quedado una encima de otra, y la de
  // arriba se llevaría el clic de la ✕ de la de abajo.
  for (let i = 0; i < antesX.piezas; i++) {
    await page.evaluate(() => document.querySelector(".rf-enjambre .enj-x").click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector(".rf-enjambre .enj-x[data-armada]")?.click());
    await page.waitForTimeout(700);
  }
  const alFinal = await terms();
  r.deshacer = {
    habia: antesX.piezas,
    quedan: await page.locator(".rf-enjambre").count(),
    terminales: alFinal.length,
    ocultas: alFinal.filter((t) => t.oculta).length,
    matadas: (await cuantas("pty_kill")) - antesX.kill,
    olvidadas: await cuantas("conserje_olvidar"),
  };

  /* ── otros CLI: un Claude, un Codex y un Gemini en el mismo enjambre ────── */
  // Se mezcla todo (decisión F1), pero no de todos se sabe lo mismo: de Codex,
  // si trabaja o acabó (cuando su panel aprende su sesión del disco, a los
  // treinta segundos); de Gemini, nada. Y solo la respuesta de un Claude Code
  // se puede traer al chat.
  // Con el doble la barra no ofrece esos CLI (no los ve instalados), así que
  // entran por el tablero guardado: dos consolas con su comando dentro, que es
  // como se guarda una terminal de cualquier CLI que no sea Claude.
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const tablero = JSON.parse(sessionStorage.getItem("__tablero"));
    const consola = (id, x, cli) => ({ tipo: "term", id, x, y: 900, w: 640, h: 420, kind: "shell", proyecto: "Adeorq", ruta: "C:\\proyectos\\Adeorq", cmd: ["powershell.exe", "-NoLogo", "-NoExit", "-Command", cli] });
    tablero.nodos.push(consola("cx", 0, "codex"), consola("gm", 700, "gemini"));
    sessionStorage.setItem("__tablero", JSON.stringify(tablero));
    location.reload();
  });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.__estadoCodex = "lista"; });
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(2500);
  const lanzadas = await llamadas("pty_spawn");
  const panelDe = (cli) => lanzadas.find((a) => new RegExp(`\\b${cli}\\b`).test((a.command ?? []).join(" ")))?.id;
  const otras = [panelDe("codex"), panelDe("gemini")];
  const unClaude = lanzadas.find((a) => /claude/.test((a.command ?? []).join(" ")))?.id;
  await page.locator(".view-lienzo button", { hasText: /Añadir|Add/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".menu button, [role=menu] button, .ctx-menu button", { hasText: /Enjambre|Swarm/ }).first().click();
  await page.waitForTimeout(900);
  for (const panel of [unClaude, ...otras]) {
    await page.evaluate((p) => document.querySelector(`.rf-enjambre .enj-libre[data-panel="${p}"]`)?.click(), panel);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);
  const mezcla = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".rf-enjambre .enj-fila")].map((f) => `${f.querySelector(".enj-fila-id strong").innerText.split(" · ").pop()}: ${f.getAttribute("data-estado")}${f.querySelector(".enj-marca svg") ? "" : " SIN LOGO"}`),
    );
  const alEntrar = await mezcla();
  const antesTodas = await cuantas("pty_send");
  const dijoAntes = await cuantas("conserje_dijo");
  await page.locator(".rf-enjambre .enj-in").fill("a todas: decidme en qué estáis");
  await page.locator(".rf-enjambre .enj-in").press("Enter");
  await page.waitForTimeout(3000);
  const paraAdeo = (await ultima("conserje_enviar"))?.estados ?? {};
  // El panel de Codex aprende su sesión a la segunda pregunta (cada 15 s) y
  // entonces lee su estado.
  const aTodasLesLlega = (await cuantas("pty_send")) - antesTodas;
  await page.waitForTimeout(36000);
  const despues = await mezcla();
  // Ya con su sesión sabida, otro encargo para todas, y el Codex contesta: lo
  // que dice entra en el chat, leído de su rollout (`codex_last_reply`). Lo
  // que diga el Gemini no tiene de dónde salir.
  await page.locator(".rf-enjambre .enj-in").fill("a todas: y ahora qué os falta");
  await page.locator(".rf-enjambre .enj-in").press("Enter");
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__respuestaCodex = "Me falta el test del login."; });
  await page.waitForTimeout(6500);
  r.otrosCli = {
    alEntrar,
    paraAdeo: Object.values(paraAdeo).map((e) => e.replace(/, contexto.*/, "")).sort(),
    aRust: ((await ultima("conserje_miembros"))?.miembros ?? []).map((w) => w.cli),
    aTodasLesLlega,
    despues,
    palabraDeGemini: await page.evaluate(() => [...document.querySelectorAll('.rf-enjambre .enj-fila[data-estado="nosesabe"] .enj-estado')].map((e) => e.innerText.trim()).join()),
    respuestasQueEntran: (await llamadas("conserje_dijo")).slice(dijoAntes).map((a) => `${a.panel === otras[0] ? "codex" : "OTRA"}: ${a.texto}`),
    firmaEnElHilo: await page.evaluate(() => {
      const t = [...document.querySelectorAll('.rf-enjambre .enj-turno[data-rol="sesion"]')].pop();
      return t ? `${t.querySelector(".enj-turno-quien .enj-marca svg") ? "con logo" : "SIN LOGO"} · ${t.querySelector(".enj-burbuja").innerText.trim()}` : null;
    }),
  };
  return r;
}
