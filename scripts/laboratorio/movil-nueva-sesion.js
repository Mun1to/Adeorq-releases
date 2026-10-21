// Abrir una sesión en el PC desde el móvil (Munir, 2026-10-21: «que desde el
// móvil puedas abrir sesiones en el ordenador»): tus proyectos con el que
// trabajó hace menos primero, el programa, un primer mensaje si quieres, y al
// abrirla el móvil entra en esa terminal. Contra el doble recién arrancado:
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-nueva-sesion.js
//
// Lo que se pidió se mira en el doble (`/api/abiertas`), no en la pantalla: que
// el móvil diga «abierta» no prueba que el PC recibiera el proyecto y el texto.
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });
  const entrar = async () => {
    await page.goto(`${B}/?vez=${Math.random()}`);
    await page.waitForSelector("#filas, #decir", { state: "attached" });
    await page.evaluate(() => ir({ vista: "nueva" }));
    await page.waitForSelector("#n-abrir");
    await page.waitForTimeout(300);
  };
  const leer = () => page.evaluate(() => ({
    proyectos: [...document.querySelectorAll("#n-proyectos [data-carpeta]")].map((b) => `${b.querySelector("b").textContent}${b.getAttribute("aria-checked") === "true" ? "*" : ""}`),
    mas: document.getElementById("n-mas")?.textContent.trim() || null,
    programas: [...document.querySelectorAll("#n-programa button")].map((b) => `${b.textContent}${b.getAttribute("aria-checked") === "true" ? "*" : ""}`),
    ancho: document.documentElement.scrollWidth,
    texto: document.getElementById("n-texto").value,
  }));
  const abiertas = async () => (await (await fetch(`${B}/api/abiertas`, { headers: AUT })).json()).abiertas;

  // 1. De entrada: los cinco que trabajaron hace menos, el primero elegido, y Claude.
  await entrar();
  pasos.entrada = await leer();
  debe(pasos.entrada.proyectos.join("|") === "Adeorq*|crypto|Orquio|Webs|VoCript", `los cinco de hace menos, el primero elegido: ${pasos.entrada.proyectos.join(" | ")}`);
  debe(/9/.test(pasos.entrada.mas || ""), `y el botón para ver los 9 (${pasos.entrada.mas})`);
  debe(pasos.entrada.programas.join("|") === "Claude*|Codex|Antigravity", `los programas del PC, Claude de entrada: ${pasos.entrada.programas.join(" | ")}`);
  debe(pasos.entrada.ancho <= 390, `nada se sale de lado (${pasos.entrada.ancho} px)`);
  await page.screenshot({ path: ".playwright-mcp/movil-nueva-1.png" });

  // 2. Ver todos: el del nombre larguísimo cabe sin estirar la página.
  await page.click("#n-mas");
  pasos.todos = await leer();
  debe(pasos.todos.proyectos.length === 9 && !pasos.todos.mas, `salen los 9 y el botón se va (${pasos.todos.proyectos.length}, ${pasos.todos.mas})`);
  debe(pasos.todos.ancho <= 390, `con el nombre larguísimo tampoco se sale (${pasos.todos.ancho} px)`);

  // 3. Elegir crypto y Codex, escribir y salir sin abrir: al volver sigue todo.
  await page.click('#n-proyectos [data-carpeta="C:\\\\proyectos\\\\crypto"]');
  await page.click('#n-programa [data-cli="codex"]');
  await page.fill("#n-texto", "Mira por qué se cae el radar");
  await entrar();
  pasos.vuelta = await leer();
  debe(pasos.vuelta.programas.includes("Codex*"), `el programa elegido se recuerda (${pasos.vuelta.programas.join(" | ")})`);
  debe(pasos.vuelta.texto === "Mira por qué se cae el radar", `lo escrito sigue ahí (${JSON.stringify(pasos.vuelta.texto)})`);
  debe(pasos.vuelta.proyectos[0] === "Adeorq*", "el proyecto vuelve al de hace menos: es lo que se abre más");

  // 4. Si el PC dice que no, se lee por qué y se puede volver a intentar.
  await page.click('#n-proyectos [data-carpeta="C:\\\\proyectos\\\\crypto"]');
  await page.route("**/api/abrir", (r) => r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Esa carpeta no es uno de tus proyectos." }) }));
  await page.click("#n-abrir");
  await page.waitForSelector("#n-fallo:not([hidden])");
  pasos.fallo = await page.evaluate(() => ({ nota: document.getElementById("n-fallo").textContent, boton: !document.getElementById("n-abrir").disabled, texto: document.getElementById("n-texto").value }));
  debe(/no es uno de tus proyectos/.test(pasos.fallo.nota) && pasos.fallo.boton && pasos.fallo.texto, `el fallo se lee, el botón vuelve y el texto no se pierde (${JSON.stringify(pasos.fallo)})`);
  await page.unroute("**/api/abrir");

  // 5. Abrir: el PC recibe proyecto, programa y texto, y el móvil entra en ella.
  const antes = (await abiertas()).length;
  await page.click("#n-abrir");
  await page.waitForFunction(() => e.vista === "terminal", null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const lista = await abiertas();
  pasos.pedido = lista.slice(antes);
  debe(pasos.pedido.length === 1 && pasos.pedido[0].cli === "codex" && pasos.pedido[0].carpeta === "C:\\proyectos\\crypto" && pasos.pedido[0].texto === "Mira por qué se cae el radar", `al PC le llega lo elegido (${JSON.stringify(pasos.pedido)})`);
  pasos.dentro = await page.evaluate(() => ({ vista: e.vista, panel: e.panel, titulo: document.querySelector(".barra h1")?.textContent || "" }));
  debe(pasos.dentro.vista === "terminal" && pasos.dentro.panel === pasos.pedido[0]?.panel, `el móvil entra en la terminal nueva (${JSON.stringify(pasos.dentro)})`);
  await page.screenshot({ path: ".playwright-mcp/movil-nueva-2.png" });

  // 6. Y el borrador se fue con lo mandado.
  await entrar();
  pasos.despues = (await leer()).texto;
  debe(pasos.despues === "", `después de abrirla, la caja sale vacía (${JSON.stringify(pasos.despues)})`);

  return { pasos, fallos };
}
