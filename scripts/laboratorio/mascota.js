// La mascota, viva, en una página de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/mascota.js")
//
// Abre `mascota.html` (la hoja con los cinco ánimos) y mira lo que el banco de
// las reglas (`scripts/mascota-check.ts`) no puede ver, que es que SE MUEVA:
//   · En cada ánimo cambian los fotogramas con el paso del tiempo.
//   · Pulsarla la hace brincar en el acto, no cuando acabe lo que estaba haciendo.
//   · El ojo sigue al ratón a la derecha y hacia abajo, y vuelve al frente solo.
//   · Con el modo rendimiento SIGUE moviéndose. Antes se paraba, y como ese
//     modo se enciende solo con cuatro terminales, Munir no la veía moverse
//     nunca (2026-10-11).
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien. Para MIRAR los
// fotogramas uno a uno, la propia hoja los enseña debajo.
async (page) => {
  const fallos = [];
  const pasos = {};
  await page.goto("http://localhost:1420/scripts/laboratorio/mascota.html");
  await page.locator('[data-viva="quieta"] svg').first().waitFor({ timeout: 15000 });

  const ANIMOS = ["quieta", "trabaja", "espera", "lista", "dormida"];
  const firma = (a) => page.evaluate((a) => [...document.querySelector(`[data-viva="${a}"] svg`).querySelectorAll("rect")].map((r) => `${r.getAttribute("x")},${r.getAttribute("y")}${r.getAttribute("fill")}`).join(";"), a);
  /** Cuántas posturas distintas enseña cada ánimo en unos segundos. */
  const mirar = async (segundos) => {
    const vistas = Object.fromEntries(ANIMOS.map((a) => [a, new Set()]));
    for (let i = 0; i < segundos * 9; i++) {
      for (const a of ANIMOS) vistas[a].add(await firma(a));
      await page.waitForTimeout(110);
    }
    return Object.fromEntries(ANIMOS.map((a) => [a, vistas[a].size]));
  };

  // 1. Se mueven.
  pasos.posturas = await mirar(6);
  for (const a of ANIMOS) if (pasos.posturas[a] < 2) fallos.push(`«${a}» no se mueve: una sola postura en seis segundos`);

  // 2. Pulsarla: brinca ya.
  const antes = await firma("dormida");
  await page.locator("#toque").click();
  await page.waitForTimeout(120);
  pasos.brinca = (await firma("dormida")) !== antes;
  if (!pasos.brinca) fallos.push("pulsarla no la hace brincar en el acto");

  // 3. El ojo sigue al ratón. La pupila se mide DENTRO del ojo, respecto a su
  // blanco: la cabeza sube y baja con los gestos, y medida contra la hoja salía
  // en otro sitio mirando a lo mismo. Y se toma la que más sale en un segundo,
  // porque algún gesto mira a otro lado por guion.
  const pupila = () => page.evaluate(() => {
    const rs = [...document.querySelector('[data-viva="quieta"] svg').querySelectorAll("rect")];
    const ojo = rs.filter((r) => ["#0e2c47", "#f1faff"].includes(r.getAttribute("fill")));
    const p = ojo.filter((r) => r.getAttribute("fill") === "#0e2c47");
    if (p.length !== 2 || ojo.length <= 2) return null;
    const x0 = Math.min(...ojo.map((r) => +r.getAttribute("x")));
    const y0 = Math.min(...ojo.map((r) => +r.getAttribute("y")));
    return p.map((r) => `${+r.getAttribute("x") - x0},${+r.getAttribute("y") - y0}`).sort().join(" ");
  });
  const abierto = async () => {
    const vistas = {};
    for (let i = 0; i < 12; i++) {
      const p = await pupila();
      if (p) vistas[p] = (vistas[p] || 0) + 1;
      await page.waitForTimeout(80);
    }
    return Object.entries(vistas).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const caja = await page.locator('[data-viva="quieta"] svg').first().boundingBox();
  const cx = caja.x + caja.width / 2;
  const cy = caja.y + caja.height / 2;
  // El ratón se manda como evento a la ventana, que es lo que escucha Adeo, y
  // no con `page.mouse`: con el de Playwright la mirada se quedaba de frente a
  // ratos, mientras que el mismo punto mandado así la giraba a la primera
  // (2026-10-11). Dos eventos, separados más que el freno de 66 ms del componente.
  const llevar = async (x, y) => {
    for (const d of [0, 3]) {
      await page.evaluate(([x, y]) => window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y })), [x + d, y + d]);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(100);
    return abierto();
  };
  // De frente primero: el ratón encima de ella (saluda, y al acabar mira al frente).
  await page.mouse.move(cx, cy);
  pasos.frente = await llevar(cx, cy);
  // El saludo dura unos 700 ms y en él mira abajo por guion: medir antes de que
  // acabe confundía su postura con la mirada.
  await page.waitForTimeout(900);
  pasos.derecha = await llevar(cx + caja.width * 1.6, cy);
  pasos.abajo = await llevar(cx, cy + caja.height * 1.6);
  if (!pasos.derecha || pasos.derecha === pasos.abajo) fallos.push(`el ojo no distingue derecha de abajo (${pasos.derecha} / ${pasos.abajo})`);
  await page.waitForTimeout(3000);
  pasos.vuelve = await abierto();
  if (pasos.vuelve === pasos.abajo) fallos.push("con el ratón quieto el ojo no vuelve al frente");

  // 4. Modo rendimiento: sigue viva.
  await page.evaluate(() => { document.documentElement.dataset.rendimiento = "1"; });
  await page.waitForTimeout(2000);
  pasos.enRendimiento = await mirar(6);
  for (const a of ANIMOS) if (pasos.enRendimiento[a] < 2) fallos.push(`con el modo rendimiento «${a}» se queda quieta (${pasos.enRendimiento[a]} postura)`);
  await page.evaluate(() => { delete document.documentElement.dataset.rendimiento; });

  return { pasos, fallos };
}
