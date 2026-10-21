// Las pestañas de arriba del Chat y las tarjetas de sus sesiones en el hilo,
// sueltas como la barra de arriba de la app (Munir, 2026-10-21: eran tarjetas
// con borde, fondo y franja de color, «slop»; eligió la forma de `.tab` entre
// tres caminos puestos sobre la vista de verdad).
//
// Lo que comprueba, en reposo y midiendo lo pintado:
//   · la tira mide 42 px y ninguna pestaña lleva borde, fondo ni sombra;
//   · la elegida lleva la raya de acento debajo y las demás no; al pulsar otra,
//     la raya se va con ella;
//   · cada sesión lleva el punto de su estado, y una cerrada va sin punto,
//     apagada y con su ✕ al lado;
//   · las tarjetas del hilo, sin borde, sin fondo y sin la franja.
// Y deja fotos en `.playwright-mcp/pestanas-chat-*.png`: la tira, con el ratón
// encima de una pestaña (el cristal de la casa), la cerrada y el hilo.
//
//   pnpm dev   (solo Vite)
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/doble-conserje.js scripts/laboratorio/pestanas-chat.js
async (page) => {
  const DIR = "C:/proyectos/Adeorq/.playwright-mcp/";
  const fallos = [];
  const fotos = [];
  const ok = (que, si) => {
    if (!si) fallos.push(que);
  };
  const foto = async (nombre, sel) => {
    const ruta = `${DIR}pestanas-chat-${nombre}.png`;
    await page.locator(sel).first().screenshot({ path: ruta });
    fotos.push(ruta);
  };
  /** Lo pintado de cada pestaña, y de su raya (`::after`), en reposo. */
  const medirTira = () =>
    page.evaluate(() => {
      const tira = document.querySelector(".cj-pestanas");
      const pestanas = [...tira.querySelectorAll(".cj-pestana")].map((b) => {
        const s = getComputedStyle(b);
        const raya = getComputedStyle(b, "::after");
        return {
          texto: b.textContent.trim(),
          estado: b.dataset.estado,
          on: b.dataset.on === "true",
          borde: s.borderTopWidth,
          fondo: s.backgroundColor,
          imagen: s.backgroundImage,
          sombra: s.boxShadow,
          raya: raya.content !== "none" && raya.content !== "" ? raya.backgroundColor : null,
          punto: !!b.querySelector(".cj-punto"),
          opacidad: s.opacity,
          quitar: !!b.parentElement.querySelector(".cj-pestana-quitar"),
        };
      });
      return { alto: Math.round(tira.getBoundingClientRect().height), pestanas };
    });
  const transparente = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";

  await page.locator('[data-tab="chat"]').click();
  await page.waitForTimeout(700);
  await page.locator(".cj-nueva").click();
  await page.waitForTimeout(500);
  await page.locator(".chat-input").fill("Arregla el scroll de las terminales y mira por qué se cae el radar");
  await page.keyboard.press("Enter");
  await page.locator(".cj-trabajo").nth(1).waitFor({ timeout: 8000 });
  await page.mouse.move(5, 890);
  await page.waitForTimeout(400);

  let m = await medirTira();
  ok(`la tira mide 42 px, no ${m.alto}`, m.alto === 42);
  ok(`tres pestañas (el conserje y dos sesiones), no ${m.pestanas.length}`, m.pestanas.length === 3);
  for (const p of m.pestanas) {
    ok(`«${p.texto}» sin borde (${p.borde})`, p.borde === "0px");
    ok(`«${p.texto}» sin fondo (${p.fondo} ${p.imagen})`, transparente(p.fondo) && p.imagen === "none");
    ok(`«${p.texto}» sin sombra ni franja (${p.sombra})`, p.sombra === "none");
  }
  ok("el conserje es la elegida y lleva la raya", m.pestanas[0].on && !!m.pestanas[0].raya);
  ok("las demás, sin raya", m.pestanas.slice(1).every((p) => !p.raya));
  ok("cada sesión viva lleva su punto", m.pestanas.slice(1).every((p) => p.punto));
  ok("el conserje se llama así, sin resumen detrás", m.pestanas[0].texto === "Conserje");
  await foto("tira", ".cj-pestanas");

  const segunda = page.locator(".cj-pestanas .cj-pestana").nth(1);
  await segunda.hover();
  await page.waitForTimeout(300);
  const alPasar = await segunda.evaluate((b) => getComputedStyle(b).backgroundImage);
  ok("al pasar el ratón, el cristal de la casa", alPasar.includes("gradient"));
  await foto("al-pasar", ".cj-pestanas");

  await segunda.click();
  await page.waitForTimeout(500);
  await page.mouse.move(5, 890);
  m = await medirTira();
  ok("al pulsar una sesión, la raya se va con ella", m.pestanas[1].on && !!m.pestanas[1].raya && !m.pestanas[0].raya);
  await page.locator(".cj-pestanas .cj-pestana").first().click();
  await page.mouse.move(5, 890);
  await page.waitForTimeout(500);

  const tarjetas = await page.evaluate(() =>
    [...document.querySelectorAll(".cj-trabajo")].map((b) => {
      const s = getComputedStyle(b);
      return { borde: s.borderTopWidth, fondo: s.backgroundColor, imagen: s.backgroundImage, sombra: s.boxShadow };
    }),
  );
  ok("dos tarjetas en el hilo", tarjetas.length === 2);
  for (const t of tarjetas) {
    ok(`tarjeta sin borde (${t.borde})`, t.borde === "0px");
    ok(`tarjeta sin fondo (${t.fondo})`, transparente(t.fondo) && t.imagen === "none");
    ok(`tarjeta sin franja (${t.sombra})`, t.sombra === "none");
  }
  await foto("hilo", ".chat-hilo");
  await page.locator(".cj-trabajo").first().hover();
  await page.waitForTimeout(300);
  await foto("tarjeta-al-pasar", ".chat-hilo");
  await page.mouse.move(5, 890);

  // La de la semana pasada: su sesión es de otro arranque, así que está cerrada.
  await page.locator(".cj-ver-todas").click();
  await page.waitForTimeout(300);
  await page.locator(".chat-fila", { hasText: "La semana pasada: el radar" }).click();
  await page.waitForTimeout(900);
  m = await medirTira();
  const cerrada = m.pestanas.find((p) => p.estado === "cerrada");
  ok("la de otro arranque sale cerrada", !!cerrada);
  if (cerrada) {
    ok("una cerrada va sin punto", !cerrada.punto);
    ok(`una cerrada va apagada (${cerrada.opacidad})`, Number(cerrada.opacidad) < 1);
    ok("una cerrada lleva su ✕", cerrada.quitar);
  }
  await foto("cerrada", ".cj-pestanas");

  return { fallos, fotos };
}
