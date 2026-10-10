// Los encargos programados en la Agenda: la cifra de la portada, la lista, el
// formulario y el freno.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página. El doble guarda la
// lista como lo haría Rust pero NO tiene reloj: aquí se mira la pantalla, y lo
// de cuándo se lanza cada uno lo prueban `cargo test --lib programados` y
// `pnpm bancos programados`.
//
//   · La portada de la Agenda tiene su cifra, y avisa cuando el freno paró uno.
//   · Sin ninguno, la pantalla lo dice y ofrece crear el primero.
//   · «Guardar» no se deja pulsar sin encargo, y dice qué falta.
//   · Uno nuevo sale en la lista con su horario dicho en palabras y su
//     próxima vez; lo que viaja a Rust es el horario elegido y nada más.
//   · Una fila cortada lo dice, con el motivo, y «Rearmar» le quita el freno.
//   · «Pausar» la apaga y deja de tener próxima vez; borrar pide dos clics.
//   · En inglés la pantalla habla inglés, también los días.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const abrirAgenda = async (lang) => {
    await page.addInitScript((l) => { try { localStorage.setItem("adeorq-lang", l); } catch { /* sin almacén */ } }, lang);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="agenda"]').waitFor({ timeout: 15000 });
    await page.locator('[data-tab="agenda"]').click();
    await page.waitForTimeout(1200);
  };
  const cifra = () => page.locator(".ag-cifra", { hasText: /encargos programados|scheduled orders/ });
  const desde = () => page.evaluate(() => { window.__desde = window.__llamadas.length; });
  const hechas = (cmd) => page.evaluate((c) => window.__llamadas.slice(window.__desde).filter(([x]) => x === c).map(([, a]) => a), cmd);

  const sembrar = (p) => page.evaluate((x) => sessionStorage.setItem("__programados", JSON.stringify(x)), p);
  const sembrado = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("__programados")));

  // 1. La portada: su cifra, a cero, y la pantalla vacía.
  await page.evaluate(() => sessionStorage.removeItem("__programados"));
  await abrirAgenda("es");
  pasos.cifraVacia = (await cifra().innerText()).replace(/\s+/g, " ").trim();
  debe(/^0 encargos programados/.test(pasos.cifraVacia), `la cifra sin ninguno: «${pasos.cifraVacia}»`);
  await cifra().click();
  await page.waitForTimeout(500);
  // `textContent`: el encabezado de la Agenda lleva `text-transform`, y
  // `innerText` devolvería lo pintado («Encargos Programados»).
  pasos.titulo = await page.locator(".ag-dia h1").textContent();
  debe(pasos.titulo === "Encargos programados", `el título de la pantalla: «${pasos.titulo}»`);
  debe((await page.locator(".prog-vacio").count()) === 1 && (await page.locator(".prog-fila").count()) === 0, "sin ninguno no dice que no hay");
  debe((await page.locator(".prog-aviso").count()) === 0, "con el reloj corriendo sale un aviso de que está parado");

  // 2. El formulario: no se guarda sin encargo, y dice qué falta.
  await page.locator("[data-nuevo]").click();
  await page.waitForTimeout(300);
  pasos.alAbrir = await page.evaluate(() => ({
    falta: document.querySelector(".prog-falta")?.textContent,
    apagado: document.querySelector("[data-guardar]")?.disabled,
    dias: [...document.querySelectorAll(".prog-dia")].map((b) => `${b.textContent}${b.dataset.on === "true" ? "*" : ""}`).join(" "),
    hora: document.querySelector(".prog-hora")?.value,
    tirador: getComputedStyle(document.querySelector(".prog-encargo-in")).resize,
  }));
  debe(pasos.alAbrir.apagado === true && /qué tiene que hacer/.test(pasos.alAbrir.falta ?? ""), `sin encargo: ${JSON.stringify(pasos.alAbrir)}`);
  debe(pasos.alAbrir.dias === "L* M X J V S D" && pasos.alAbrir.hora === "09:00", `nace en lunes a las 9: ${pasos.alAbrir.dias} ${pasos.alAbrir.hora}`);
  debe(pasos.alAbrir.tirador === "none", "el cuadro del encargo lleva el tirador de agrandar");

  // 3. Uno de lunes, miércoles y viernes a las 18:30.
  await page.locator(".prog-encargo-in").fill("Revisa las dependencias\ny dime cuáles tienen versión nueva");
  await page.locator('.prog-dia[data-dia="3"]').click();
  await page.locator('.prog-dia[data-dia="5"]').click();
  await page.locator(".prog-hora").fill("18:30");
  await page.locator(".prog-campo select").selectOption({ label: "Adeorq" });
  await desde();
  await page.locator("[data-guardar]").click();
  await page.waitForTimeout(600);
  pasos.pedido = (await hechas("programado_guardar"))[0]?.pedido;
  debe(JSON.stringify(pasos.pedido?.cuando) === JSON.stringify({ tipo: "semanal", dias: [1, 3, 5], hora: "18:30" }), `el horario que viaja: ${JSON.stringify(pasos.pedido?.cuando)}`);
  debe(pasos.pedido?.cwd === "C:\\proyectos\\Adeorq", `la carpeta que viaja: ${pasos.pedido?.cwd}`);
  pasos.fila = await page.locator(".prog-fila").first().evaluate((f) => ({
    nombre: f.querySelector(".prog-nombre")?.textContent,
    cuando: f.querySelector(".prog-cuando")?.textContent,
    proxima: f.querySelector(".prog-proxima")?.textContent,
    estado: f.dataset.estado,
  }));
  debe(pasos.fila.nombre === "Revisa las dependencias", `sin nombre, lleva el principio del encargo: «${pasos.fila.nombre}»`);
  debe(pasos.fila.cuando === "L, X y V a las 18:30", `el horario en palabras: «${pasos.fila.cuando}»`);
  debe(/^próxima vez: (hoy|mañana|el (lunes|miércoles|viernes)) a las 18:30$/.test(pasos.fila.proxima ?? ""), `la próxima vez: «${pasos.fila.proxima}»`);
  debe((await page.locator(".prog-form").count()) === 0, "al guardar no se cierra el formulario");

  // 4. Cada 6 horas, editando el mismo.
  await page.locator("[data-editar]").first().click();
  await page.locator(".prog-tipos .mini").nth(1).click();
  await page.locator(".prog-horas").fill("6");
  await page.locator("[data-guardar]").click();
  await page.waitForTimeout(600);
  pasos.cada = await page.locator(".prog-cuando").first().innerText();
  debe(pasos.cada === "Cada 6 horas", `editado a cada seis horas: «${pasos.cada}»`);
  debe((await page.locator(".prog-fila").count()) === 1, "editar crea otro en vez de cambiar el que había");

  // 5. Un error de Rust se enseña y el formulario no se pierde.
  await page.locator("[data-nuevo]").click();
  await page.locator(".prog-encargo-in").fill("otro");
  pasos.sinProyecto = await page.locator(".prog-falta").innerText();
  debe(/proyecto/.test(pasos.sinProyecto) && (await page.locator("[data-guardar]").isDisabled()), `sin proyecto elegido no se guarda: «${pasos.sinProyecto}»`);
  await page.locator(".prog-campo select").selectOption({ label: "Vidorq" });
  const lleno = await sembrado();
  await sembrar({ ...lleno, encargos: Array.from({ length: 20 }, (_, i) => ({ ...lleno.encargos[0], id: `p${i}` })) });
  await page.locator("[data-guardar]").click();
  await page.waitForTimeout(500);
  pasos.tope = await page.locator(".prog-form .np-err").innerText().catch(() => "");
  debe(/tope/.test(pasos.tope) && (await page.locator(".prog-form").count()) === 1, `al tope, lo dice y deja el formulario: «${pasos.tope}»`);

  // 6. Uno cortado por el freno, sembrado, y la cifra de la portada.
  const hace = (h) => Date.now() - h * 3_600_000;
  await page.evaluate((v) => {
    const p = { puede: true, reloj: true, encargos: [
      { id: "pa", nombre: "Dependencias", encargo: "Revisa las dependencias", cwd: "C:\\proyectos\\Adeorq", cuando: { tipo: "semanal", dias: [1, 2, 3, 4, 5, 6, 7], hora: "09:00" }, activo: true, creado: v[2], ultima: v[0], ultimoDia: "", corrida: null,
        ultimas: [{ cuando: v[0], resultado: "fallo", detalle: "no nació: la ventana de Adeorq no contestó a tiempo" }, { cuando: v[1], resultado: "fallo", detalle: "la terminal se cerró sola antes de terminar" }, { cuando: v[2], resultado: "saltado", detalle: "la vez anterior sigue trabajando" }],
        fallosSeguidos: 3, cortado: { cuando: v[0], motivo: "no nació: la ventana de Adeorq no contestó a tiempo" } },
      { id: "pb", nombre: "Copia de seguridad", encargo: "Haz la copia", cwd: "C:\\proyectos\\Vidorq", cuando: { tipo: "semanal", dias: [1], hora: "08:00" }, activo: true, creado: v[2], ultima: 0, ultimoDia: "", corrida: null, ultimas: [{ cuando: v[1], resultado: "hecho", detalle: "" }], fallosSeguidos: 0, cortado: null },
    ] };
    sessionStorage.setItem("__programados", JSON.stringify(p));
  }, [hace(2), hace(26), hace(50)]);
  await abrirAgenda("es");
  pasos.cifraCortada = (await cifra().innerText()).replace(/\s+/g, " ").trim();
  debe(/^2 encargos programados 1 parados por el freno$/.test(pasos.cifraCortada), `la cifra con uno cortado: «${pasos.cifraCortada}»`);
  debe((await cifra().getAttribute("data-viva")) === "true", "la cifra no se enciende con uno cortado");
  await cifra().click();
  await page.waitForTimeout(500);
  const cortada = page.locator('[data-programado="pa"]');
  pasos.cortada = await cortada.evaluate((f) => ({
    estado: f.dataset.estado,
    corte: f.querySelector(".prog-corte")?.textContent,
    proxima: f.querySelector(".prog-proxima")?.textContent,
    puntos: [...f.querySelectorAll(".prog-ultimas i")].map((i) => i.dataset.r).join(),
    rearmar: !!f.querySelector("[data-rearmar]"),
  }));
  debe(pasos.cortada.estado === "cortado" && /no contestó a tiempo/.test(pasos.cortada.corte ?? ""), `la fila cortada dice por qué: ${JSON.stringify(pasos.cortada)}`);
  debe(pasos.cortada.proxima === "parado por el freno" && pasos.cortada.puntos === "fallo,fallo,saltado" && pasos.cortada.rearmar, `sus puntos y su botón: ${JSON.stringify(pasos.cortada)}`);
  debe((await page.locator('[data-programado="pb"] [data-rearmar]').count()) === 0, "una fila sana ofrece rearmar");
  await page.screenshot({ path: "C:/Users/Muni/AppData/Local/Temp/claude/C--proyectos-Adeorq/572c3eb8-4cba-4c56-8923-bddd346e5626/scratchpad/programados.png" });

  // 7. Rearmar, pausar, probar y borrar.
  await cortada.locator("[data-rearmar]").click();
  await page.waitForTimeout(500);
  pasos.rearmada = await cortada.evaluate((f) => ({ estado: f.dataset.estado, corte: !!f.querySelector(".prog-corte"), proxima: f.querySelector(".prog-proxima")?.textContent }));
  debe(pasos.rearmada.estado === "activo" && !pasos.rearmada.corte && /^próxima vez: /.test(pasos.rearmada.proxima ?? ""), `rearmada: ${JSON.stringify(pasos.rearmada)}`);
  await cortada.locator("[data-pausa]").click();
  await page.waitForTimeout(500);
  pasos.pausada = await cortada.evaluate((f) => ({ estado: f.dataset.estado, proxima: f.querySelector(".prog-proxima")?.textContent, boton: f.querySelector("[data-pausa]")?.textContent }));
  debe(pasos.pausada.estado === "pausado" && pasos.pausada.proxima === "en pausa" && pasos.pausada.boton === "Reanudar", `pausada: ${JSON.stringify(pasos.pausada)}`);
  await desde();
  await page.locator('[data-programado="pb"] [data-probar]').click();
  await page.waitForTimeout(500);
  debe((await hechas("programado_probar"))[0]?.id === "pb", "«Probar ahora» no pide lanzar ese encargo");
  await page.locator('[data-programado="pb"] [data-probar]').click();
  await page.waitForTimeout(500);
  pasos.dosVeces = await page.locator(".prog > .np-err").innerText().catch(() => "");
  debe(/sigue abierta/.test(pasos.dosVeces), `probar dos veces seguidas dice por qué no: «${pasos.dosVeces}»`);
  await desde();
  await page.locator('[data-programado="pb"] [data-borrar]').click();
  await page.waitForTimeout(200);
  pasos.pregunta = await page.locator('[data-programado="pb"] [data-borrar]').innerText();
  debe(pasos.pregunta === "¿Borrarlo?" && (await hechas("programado_borrar")).length === 0, `el primer clic de borrar solo pregunta: «${pasos.pregunta}»`);
  await page.locator('[data-programado="pb"] [data-borrar]').click();
  await page.waitForTimeout(500);
  debe((await page.locator('[data-programado="pb"]').count()) === 0 && (await page.locator(".prog-fila").count()) === 1, "el segundo clic no lo borra");

  // 8. En inglés, también los días y el aviso del reloj parado.
  const fin = await sembrado();
  await sembrar({ ...fin, reloj: false, encargos: fin.encargos.map((e) => ({ ...e, activo: true })) });
  await abrirAgenda("en");
  await cifra().click();
  await page.waitForTimeout(500);
  pasos.ingles = await page.evaluate(() => ({
    titulo: document.querySelector(".ag-dia h1")?.textContent,
    cuando: document.querySelector(".prog-cuando")?.textContent,
    aviso: document.querySelector('.prog-aviso[data-aviso="reloj"]')?.textContent ?? "",
    botones: [...document.querySelectorAll(".prog-fila .mini")].map((b) => b.textContent).join("|"),
  }));
  debe(pasos.ingles.titulo === "Scheduled orders" && pasos.ingles.cuando === "Every day at 09:00", `en inglés: ${JSON.stringify(pasos.ingles)}`);
  debe(/development/.test(pasos.ingles.aviso) && pasos.ingles.botones === "Try now|Pause|Edit|Delete", `aviso y botones en inglés: ${JSON.stringify(pasos.ingles)}`);
  await page.locator("[data-nuevo]").click();
  pasos.diasEn = await page.locator(".prog-dia").evaluateAll((bs) => bs.map((b) => b.textContent).join(" "));
  debe(pasos.diasEn === "M T W T F S S", `las letras de los días en inglés: ${pasos.diasEn}`);
  await page.addInitScript(() => { try { localStorage.setItem("adeorq-lang", "es"); } catch { /* sin almacén */ } });

  return { pasos, fallos };
}
