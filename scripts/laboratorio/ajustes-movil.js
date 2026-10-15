// Ajustes > Móvil dice si tu móvil está conectado a Tailscale. El 2026-10-15
// Munir abrió la dirección en su móvil y no cargaba: el PC servía bien, pero su
// Android llevaba tres días fuera de la red de Tailscale, y ni la app ni la
// página se lo decían.
//
// Con el doble (`window.__tsMovil`): conectado, apagado (visto hace tres días)
// y ningún móvil en la red. Se lanza con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ajustes-movil.js
// (carga el doble él mismo). Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });

  const mirar = async (caso) => {
    await page.addInitScript((c) => {
      try {
        localStorage.setItem("adeorq-lang", "es");
        localStorage.setItem("adeorq-ajustes-seccion", "movil");
      } catch { /* sin almacén */ }
      window.__tsPuesto = true;
      window.__tsMovil = c;
    }, caso);
    await page.goto("http://localhost:1420/");
    await page.locator('[data-tab="cabina"]').waitFor({ state: "attached", timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-tab="ajustes"]').click());
    // El doble arranca con el conserje del móvil apagado: se enciende.
    const interruptor = page.locator(".panel-card", { hasText: "El conserje en el móvil" }).locator('input[type="checkbox"]').first();
    await interruptor.waitFor({ state: "attached", timeout: 10000 });
    if (!(await interruptor.isChecked())) await interruptor.evaluate((e) => e.click());
    await page.waitForTimeout(900);
    // Las tres filas del estado (la forma que eligió Munir): qué dicen y si
    // están en «falta», que es la que se pinta en ámbar con su ayuda.
    return page.evaluate(() =>
      [...document.querySelectorAll(".movil-estado .movil-fila")].map((f) => ({
        que: f.querySelector(".movil-fila-que")?.textContent.trim(),
        texto: f.textContent.replace(/\s+/g, " ").trim(),
        falta: f.classList.contains("falta"),
        punto: f.querySelector(".movil-punto")?.className.replace("movil-punto", "").trim(),
      })),
    );
  };
  const fila = (filas, que) => filas.find((f) => f.que === que) ?? {};

  pasos.conectado = await mirar("");
  debe(pasos.conectado.length === 3, `conectado: tendría que haber tres filas y hay ${pasos.conectado.length}`);
  debe(fila(pasos.conectado, "Tu móvil").punto === "ok" && fila(pasos.conectado, "Tu móvil").texto.includes("Pixel de Munito, conectado"), "conectado: no dice que el móvil está en la red");
  debe(fila(pasos.conectado, "Tailscale").punto === "ok", "conectado: la fila de Tailscale no está en verde");

  pasos.apagado = await mirar("apagado");
  const apagado = fila(pasos.apagado, "Tu móvil");
  debe(
    apagado.falta && apagado.texto.includes("fuera de Tailscale (visto hace 3 d)") && apagado.texto.includes("enciéndelo") && apagado.texto.includes("Volver a mirar"),
    "apagado: no avisa de que el móvil está fuera de la red, con cuándo se vio, qué hacer y el botón de volver a mirar",
  );

  pasos.ninguno = await mirar("ninguno");
  debe(fila(pasos.ninguno, "Tu móvil").falta && fila(pasos.ninguno, "Tu móvil").texto.includes("No hay ningún móvil en tu red"), "ninguno: no dice que falta el móvil en la red");

  // Emparejar: el QR con la dirección al lado, y el código al pedirlo.
  await page.locator(".movil-emparejar button", { hasText: "Emparejar un móvil" }).click();
  await page.waitForTimeout(400);
  pasos.emparejar = await page.evaluate(() => ({
    qr: !!document.querySelector(".movil-emparejar .movil-qr"),
    direccion: document.querySelector(".movil-direccion code")?.textContent,
    codigo: document.querySelector(".movil-codigo strong")?.textContent,
  }));
  debe(pasos.emparejar.qr && /^https:\/\/.+\.ts\.net:8443$/.test(pasos.emparejar.direccion ?? ""), "emparejar: falta el QR o la dirección al lado");
  debe(pasos.emparejar.codigo === "482 913", `emparejar: el código sale como ${pasos.emparejar.codigo}`);

  return { pasos, fallos };
}
