// Adeo en la barra de la derecha (B1, Munir, 2026-11-15): «Adeo se abre en la barra de la derecha,
// como Uso, Skills y Archivos, con el mismo atajo, y las terminales siguen a la vista».
//
// Abre dos terminales en la Cabina, llama a Adeo con su bola y con Ctrl+Mayús+A, y mira que va a
// la barra sin velo, que las terminales siguen enteras, que Esc lo cierra y que la barra vuelve a
// la cara que tenía. Luego lo llama desde Inicio, donde no hay barra: ahí sigue flotando.
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/adeo-en-la-barra.js
// (carga el doble él mismo). Con FOTO=<carpeta> deja una foto con Adeo en la barra.
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const foto = globalThis.process?.env?.FOTO;

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(1500);

  const pestana = async (nombre) => {
    await page.locator(`.topbar button[data-tip="${nombre}"], .tabs button:has-text("${nombre}")`).first().click().catch(() => {});
    await page.waitForTimeout(500);
  };
  const estado = () => page.evaluate(() => {
    const lat = document.querySelector(".lateral");
    const visibles = [...document.querySelectorAll("[data-pane-id]")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 50 && r.height > 50;
    });
    return {
      velo: !!document.querySelector(".foreman-overlay"),
      cara: lat?.getAttribute("data-cara") ?? "",
      ancho: lat ? Math.round(lat.getBoundingClientRect().width) : 0,
      enBarra: !!document.querySelector(".lateral .foreman-lateral .foreman-input"),
      terminales: visibles.length,
      iconoAdeo: document.querySelectorAll(".franja .franja-btn").length,
    };
  });

  await pestana("Cabina");
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude").click());
    await page.waitForTimeout(1500);
  }
  await pestana("Cabina");
  pasos.antes = await estado();
  // Una sola puerta: en la Cabina, Adeo está en la franja y no también arriba (17-nov).
  pasos.orbeArribaEnCabina = await page.locator(".foreman-call").count();
  debe(pasos.orbeArribaEnCabina === 0, "en la Cabina sigue el orbe de Adeo en la barra de arriba, además del de la franja");

  await page.locator(".franja-btn:has(.orbe)").first().click(); // en la Cabina, Adeo se llama desde la franja
  await page.waitForTimeout(700);
  pasos.conLaBola = await estado();
  debe(!pasos.conLaBola.velo, "con la bola, en la Cabina, sale el velo que lo oscurece todo");
  debe(pasos.conLaBola.enBarra && pasos.conLaBola.cara === "adeo", "con la bola, Adeo no está en la barra de la derecha");
  debe(pasos.conLaBola.terminales === 2, `con Adeo abierto se ven ${pasos.conLaBola.terminales} terminales y no 2`);
  if (foto) await page.screenshot({ path: `${foto}/adeo-en-la-barra.png` });

  await page.locator(".foreman-lateral .foreman-input").press("Escape");
  await page.waitForTimeout(500);
  pasos.trasEsc = await estado();
  debe(!pasos.trasEsc.enBarra, "Esc no cierra a Adeo en la barra");
  debe(pasos.trasEsc.cara === pasos.antes.cara, `al cerrarlo la barra queda en «${pasos.trasEsc.cara}» y no en «${pasos.antes.cara}», la que tenía`);

  await page.keyboard.press("Control+Shift+A");
  await page.waitForTimeout(700);
  pasos.conElAtajo = await estado();
  debe(pasos.conElAtajo.enBarra && !pasos.conElAtajo.velo, "Ctrl+Mayús+A no lo abre en la barra");
  // Un plan de verdad en 380 px: la ficha con sus acciones no se sale por el borde.
  await page.evaluate(() => {
    window.__planCapataz = {
      resumen: "Dos Claude en Adeorq: uno al front y otro a las pruebas.",
      acciones: [
        { tipo: "claude_nuevo", proyecto: "Adeorq", rol: "Front", prompt: "arregla el hover de la barra" },
        { tipo: "claude_nuevo", proyecto: "Adeorq", rol: "Pruebas", prompt: "escribe los tests del router" },
      ],
    };
  });
  await page.locator(".foreman-lateral .foreman-input").fill("dos claude en adeorq, uno al front y otro a las pruebas");
  await page.locator(".foreman-lateral .foreman-row button", { hasText: /Planear/ }).first().click();
  await page.waitForTimeout(2500);
  pasos.conPlan = await page.evaluate(() => {
    const caja = document.querySelector(".foreman-lateral");
    return caja ? { ancho: caja.clientWidth, contenido: caja.scrollWidth, ejecutar: !!caja.querySelector(".foreman-row .np-btn") } : null;
  });
  debe(pasos.conPlan?.ejecutar, "el plan no llegó a la barra (no está su botón de ejecutar)");
  debe(pasos.conPlan && pasos.conPlan.contenido <= pasos.conPlan.ancho + 1, `el plan se sale de la barra: ${pasos.conPlan?.contenido} px en ${pasos.conPlan?.ancho}`);
  if (foto) await page.screenshot({ path: `${foto}/adeo-plan-en-la-barra.png` });
  await page.locator(".foreman-lateral .foreman-row button", { hasText: /Descartar/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);

  await page.keyboard.press("Control+Shift+A");
  await page.waitForTimeout(500);
  debe(!(await estado()).enBarra, "Ctrl+Mayús+A otra vez no lo cierra");

  await pestana("Panel");
  await page.locator(".foreman-call").first().click();
  await page.waitForTimeout(700);
  pasos.enInicio = await estado();
  debe(pasos.enInicio.velo, "desde Inicio, sin barra a la vista, no sale flotando");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return { pasos, fallos };
}
