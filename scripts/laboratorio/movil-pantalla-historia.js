// La Pantalla de una terminal a pantalla completa, con historial (Munir,
// 2026-10-16: «el modo pantalla se sigue sin ver nada del historial» y «la
// parte de abajo que pone auto mode shift+tab to cycle no tiene que aparecer»).
// Lo de antes viene del transcript (`/api/historia`) y se corta donde empieza
// la pantalla viva; la barra de estado de debajo de la caja no se pinta.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-pantalla-historia.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });

  const verPantalla = async (panel) => {
    await page.goto(`${B}/?p=${panel}#terminal=${panel}@111`);
    await page.waitForSelector("#texto");
    // Una consola no tiene pestañas: ya está en su pantalla.
    if (await page.isVisible('[data-cara="pantalla"]')) await page.click('[data-cara="pantalla"]');
    await page.waitForTimeout(700);
    return page.evaluate(() => {
      const marco = document.getElementById("marco");
      const pre = document.getElementById("pantalla");
      const texto = pre.innerText;
      return {
        texto,
        nota: !document.getElementById("nota-pantalla").hidden,
        hitos: (texto.match(/HITO \d\d/g) || []).length,
        reproduzco: (texto.match(/Reproduzco el fallo antes de tocar nada/g) || []).length,
        read: (texto.match(/Read\(src\/App\.tsx\)/g) || []).length,
        ultimaFila: [...pre.children].at(-1)?.className || "",
        alFinal: marco.scrollHeight - marco.scrollTop - marco.clientHeight < 4,
        sube: marco.scrollHeight > marco.clientHeight * 2,
        negrita: pre.querySelector(".h-dice b:not(.h-punto)")?.textContent || "",
        codigo: pre.querySelector(".h-cod")?.textContent || "",
        raya: Boolean(pre.querySelector(".ahora-pc")),
        anchoPagina: document.documentElement.scrollWidth,
      };
    });
  };

  // 1. La de Claude Code trabajando: el historial entero encima y la pantalla
  //    debajo, cada cosa una sola vez, abajo del todo al entrar.
  pasos.p1 = await verPantalla(1);
  const p1 = pasos.p1;
  debe(p1.hitos === 30, `se ven los 30 hitos de antes de la pantalla (${p1.hitos})`);
  debe(p1.reproduzco === 2, `«Reproduzco…» sale dos veces: lo que dijo el agente y la línea de la pantalla, no tres (${p1.reproduzco})`);
  debe(p1.read === 1, `el Read que ya está en la pantalla no se repite (${p1.read})`);
  debe(!p1.raya, "con el corte encontrado no hace falta la raya de «ahora en la pantalla»");
  debe(!p1.nota, "con historial, fuera la nota que manda al Chat");
  debe(p1.sube && p1.alFinal, `se puede subir y entra abajo del todo (${JSON.stringify([p1.sube, p1.alFinal])})`);
  debe(p1.negrita === "medido" && p1.codigo === "movil.html", `el markdown se lee como en la terminal (${JSON.stringify([p1.negrita, p1.codigo])})`);
  debe(p1.ultimaFila === "entrada", `lo último es la caja de escribir, sin barra de estado debajo (${p1.ultimaFila})`);
  debe(p1.anchoPagina <= 412, `nada se sale por la derecha (${p1.anchoPagina})`);

  // 2. Con un modo puesto, la línea «… (shift+tab to cycle)» del pie no sale.
  await page.click("#modo");
  await page.waitForTimeout(900);
  pasos.p1modo = await page.evaluate(() => ({ texto: document.getElementById("pantalla").innerText, ultima: [...document.getElementById("pantalla").children].at(-1)?.className }));
  debe(!/shift\+tab to cycle/.test(pasos.p1modo.texto) && pasos.p1modo.ultima === "entrada", `sin la barra de estado de Claude Code (${pasos.p1modo.texto.slice(-120)})`);

  // 3. Un historial que no tiene nada de lo que se ve: todo, y una raya antes de la pantalla.
  pasos.p4 = await verPantalla(4);
  debe(/Preparo las notas/.test(pasos.p4.texto) && pasos.p4.raya, `historial entero y la raya de «ahora en la pantalla» (${JSON.stringify([pasos.p4.raya, pasos.p4.texto.slice(0, 120)])})`);

  // 4. Sin historial en el disco: la nota con el camino al Chat, como antes.
  pasos.p5 = await verPantalla(5);
  debe(pasos.p5.nota && !pasos.p5.raya, `sin historial, la nota del Chat (${JSON.stringify([pasos.p5.nota, pasos.p5.raya])})`);

  // 5. Una consola guarda su historial en xterm: ni se pide el del transcript ni hay nota.
  pasos.p3 = await verPantalla(3);
  debe(/crate-numero-0 /.test(pasos.p3.texto) && !pasos.p3.nota && !pasos.p3.raya, "una consola sigue con su propio historial");
  return { pasos: { p1: { ...p1, texto: undefined }, p4raya: pasos.p4.raya, p5nota: pasos.p5.nota }, fallos };
}
