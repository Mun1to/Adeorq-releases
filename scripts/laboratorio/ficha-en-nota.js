// Una nota vacía ofrece las fichas del proyecto, y las sesiones de un reparto
// que sale de una nota saben cuál es su casilla.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// Lo que las reglas (`scripts/fichas-check.ts`, `scripts/reparto-check.ts`) no
// pueden ver:
//   · Una nota recién puesta, en un lienzo cuyo proyecto tiene `docs/fichas`,
//     enseña sus fichas debajo de «Toca para escribir». Elegir una NO abre el
//     cuadro de escribir: rellena la nota con sus pasos, todos sin marcar.
//   · En cuanto la nota tiene texto, la lista se va.
//   · Sin carpeta de fichas no se ofrece nada, y tampoco se queja nadie.
//   · Repartir la nota abre una sesión por tarea, y el encargo de cada una
//     lleva el archivo de la nota y SU línea, no la de las otras.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const FICHAS = "C:\\proyectos\\Adeorq\\docs\\fichas";
  const sembrar = (conFichas) => page.evaluate(({ F, con }) => {
    window.__carpetas = con ? { [F]: [{ nombre: "publicar-version.md" }, { nombre: "alta-de-cliente.md" }, { nombre: "apuntes.txt" }] } : {};
    window.__archivos = {
      [`${F}\\publicar-version.md`]: "# Publicar una versión\r\n\r\nLee antes docs/contexto/publicar.md.\r\n\r\n1. Pasa las pruebas\r\n2. Sube el número\r\n- [x] Compila y firma\r\n",
    };
  }, { F: FICHAS, con: conFichas });

  const abrirLienzo = async () => {
    await page.evaluate(() => sessionStorage.removeItem("__tablero"));
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="lienzo"]').waitFor({ timeout: 15000 });
    await page.locator('[data-tab="lienzo"]').click();
    await page.waitForTimeout(1500);
  };
  const ponerNota = async () => {
    await page.locator('.cb-btn[data-tip^="Pomodoro"]').click();
    await page.getByText("Nota", { exact: true }).first().click();
    await page.locator(".wdg.note").first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(900);
    return page.locator(".wdg.note").first();
  };

  // 1. Sin carpeta de fichas: la nota vacía es la de siempre.
  await abrirLienzo();
  await sembrar(false);
  let nota = await ponerNota();
  pasos.sinCarpeta = await nota.locator("[data-ficha]").count();
  debe(pasos.sinCarpeta === 0, `sin docs/fichas se ofrecen ${pasos.sinCarpeta} fichas`);
  debe((await nota.locator(".note-empty").count()) === 1, "la nota vacía ya no dice «Toca para escribir»");

  // 2. Con carpeta: salen sus .md, por orden y con nombre legible.
  await abrirLienzo();
  await sembrar(true);
  nota = await ponerNota();
  pasos.fichas = await nota.locator("[data-ficha]").evaluateAll((bs) => bs.map((b) => b.innerText.trim()));
  debe(pasos.fichas.join() === "alta de cliente,publicar version", `las fichas que se ofrecen: ${JSON.stringify(pasos.fichas)}`);

  // 3. Elegir una rellena la nota y NO abre el cuadro de escribir.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator('[data-ficha="publicar version"]').click();
  await page.waitForTimeout(1200);
  pasos.trasFicha = await nota.evaluate((n) => ({
    titulo: n.querySelector(".note-title-txt")?.textContent?.trim(),
    tareas: [...n.querySelectorAll(".note-task-txt")].map((x) => x.textContent.trim()),
    marcadas: n.querySelectorAll(".note-task input:checked").length,
    cuenta: n.querySelector(".note-count")?.textContent?.trim(),
    escribiendo: n.querySelectorAll("textarea").length,
    fichas: n.querySelectorAll("[data-ficha]").length,
    dicho: n.querySelector(".note-dicho")?.textContent?.trim() ?? "",
    suelto: [...n.querySelectorAll(".note-line")].map((x) => x.textContent.trim()).filter(Boolean),
  }));
  debe(pasos.trasFicha.titulo === "Publicar una versión", `el título de la nota: ${pasos.trasFicha.titulo}`);
  debe(pasos.trasFicha.tareas.join("|") === "Pasa las pruebas|Sube el número|Compila y firma", `los pasos: ${JSON.stringify(pasos.trasFicha.tareas)}`);
  debe(pasos.trasFicha.marcadas === 0 && pasos.trasFicha.cuenta === "0/3", `nacen sin marcar (${pasos.trasFicha.marcadas} marcadas, cuenta ${pasos.trasFicha.cuenta})`);
  debe(pasos.trasFicha.escribiendo === 0, "elegir una ficha abre el cuadro de escribir");
  debe(pasos.trasFicha.fichas === 0, "con la nota ya escrita sigue saliendo la lista de fichas");
  debe(pasos.trasFicha.suelto.join() === "Lee antes docs/contexto/publicar.md.", `el texto suelto de la ficha: ${JSON.stringify(pasos.trasFicha.suelto)}`);
  debe(/Ficha puesta/.test(pasos.trasFicha.dicho), `no dice que la puso: «${pasos.trasFicha.dicho}»`);
  pasos.guardada = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "note_write").map(([, a]) => a.text).pop() ?? "");
  debe(pasos.guardada.startsWith("# Publicar una versión\n") && !pasos.guardada.includes("\r") && !/\[x\]/i.test(pasos.guardada), `lo que se guarda en disco: ${JSON.stringify(pasos.guardada)}`);

  // 4. Repartirla: una sesión por tarea, y cada una con SU línea.
  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await nota.locator("[data-lanzar]").click();
  await nota.locator("[data-repartir]").click();
  await page.waitForTimeout(1200);
  await page.locator(".reparto .np-btn").click();
  await page.locator(".reparto .np-btn", { hasText: /Abre 3 agentes/ }).waitFor({ timeout: 15000 });
  await page.locator(".reparto .np-btn").click();
  await page.waitForTimeout(6000);
  const rutaNota = await nota.locator(".note-where").getAttribute("data-tip");
  pasos.rutaNota = rutaNota;
  // El encargo puede viajar en el comando con que nace la terminal o escrito
  // después: se mira todo lo que salió hacia las terminales, junto.
  const salido = await page.evaluate(() => window.__llamadas.slice(window.__desde)
    .filter(([c]) => c === "pty_spawn" || c === "pty_write" || c === "pty_send")
    .map(([c, a]) => ({ c, id: a.id, texto: c === "pty_spawn" ? (a.command ?? []).join(" ") : String(a.data ?? a.text ?? "") })));
  const porPanel = {};
  for (const s of salido) porPanel[s.id] = `${porPanel[s.id] ?? ""}\n${s.texto}`;
  const encargos = Object.values(porPanel);
  pasos.sesiones = encargos.length;
  debe(encargos.length === 3, `se abrieron ${encargos.length} sesiones y había 3 tareas`);
  const LINEAS = ["Pasa las pruebas", "Sube el número", "Compila y firma"];
  pasos.casillas = LINEAS.map((l) => {
    const suyas = encargos.filter((e) => e.includes(`Tu línea es «- [ ] ${l}»`));
    return { linea: l, sesiones: suyas.length, conArchivo: suyas.every((e) => e.includes(`Archivo: ${rutaNota}`)) };
  });
  for (const c of pasos.casillas) {
    debe(c.sesiones === 1, `«${c.linea}» es la línea de ${c.sesiones} sesiones, y tiene que ser de una`);
    debe(c.conArchivo, `la sesión de «${c.linea}» no recibe el archivo de la nota`);
  }
  pasos.dicho = (await nota.locator(".note-dicho").textContent().catch(() => "")) ?? "";
  if (fallos.length) pasos.muestra = encargos[0]?.slice(0, 900) ?? "";

  return { pasos, fallos };
}
