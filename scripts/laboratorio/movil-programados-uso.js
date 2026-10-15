// Programados y Uso, en el cajón del móvil: dos pantallas que solo se leen.
// Programados va por «Activos» y «Parados», con cuándo se lanza cada uno, la
// que se está lanzando con el hilo azul y la que paró el freno con su motivo.
// Uso dice lo gastado de cada cuenta con su raya, y lo que no se sabe lo dice.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-programados-uso.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"));
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term");

  const ir = async (a, esperar) => {
    await page.click("#abrir-cajon");
    await page.click(`#cajon .fila[data-ir="${a}"]`);
    await page.waitForSelector(esperar);
    await page.waitForTimeout(400);
  };
  const leer = () =>
    page.evaluate(() => ({
      ancho: document.querySelector(".cuerpo").scrollWidth <= document.querySelector(".cuerpo").clientWidth + 1,
      apartados: [...document.querySelectorAll(".cuerpo .seccion")].map((s) => ({
        titulo: s.textContent.trim(),
        filas: [...s.nextElementSibling.querySelectorAll(".fila-term")].map((f) => ({
          nombre: f.querySelector("b").textContent,
          debajo: f.querySelector("small").textContent,
          mal: f.querySelector("small").hasAttribute("data-mal"),
          hilo: f.classList.contains("hilo"),
          tono: f.querySelector(".punto")?.dataset.tono ?? null,
          barra: f.querySelector(".uso-barra")?.style.getPropertyValue("--p") ?? null,
          alto: f.querySelector(".uso-barra")?.hasAttribute("data-alto") ?? false,
          cifra: f.querySelector(".uso-cifra")?.textContent ?? null,
        })),
      })),
    }));

  await ir("programados", "#programados .fila-term");
  pasos.programados = await leer();
  const p = pasos.programados;
  const de = (titulo) => p.apartados.find((a) => a.titulo === titulo)?.filas ?? [];
  debe(p.ancho, "Programados no se sale de la pantalla");
  debe(JSON.stringify(p.apartados.map((a) => a.titulo)) === JSON.stringify(["Activos", "Parados"]), `Programados va por Activos y Parados (${p.apartados.map((a) => a.titulo)})`);
  const repaso = de("Activos").find((f) => f.nombre === "Repaso de la mañana");
  debe(repaso && /De lunes a viernes a las 09:00/.test(repaso.debajo) && /Adeorq/.test(repaso.debajo) && repaso.tono === "hecho", `el que salió bien dice cuándo y dónde (${JSON.stringify(repaso)})`);
  const cuota = de("Activos").find((f) => f.nombre === "Mirar la cuota");
  debe(cuota && /Cada 6 horas/.test(cuota.debajo) && cuota.hilo && cuota.tono === "trabajando", `el que se lanza ahora lleva el hilo (${JSON.stringify(cuota)})`);
  const fotos = de("Parados").find((f) => f.nombre === "Subir las fotos");
  debe(fotos && fotos.mal && /tres fallos seguidos/.test(fotos.debajo) && fotos.tono === "mal", `el que paró el freno dice por qué (${JSON.stringify(fotos)})`);
  const limpiar = de("Parados").find((f) => f.nombre === "Limpiar el scratchpad");
  debe(limpiar && /apagado/.test(limpiar.debajo) && !limpiar.mal, `el apagado sale como apagado (${JSON.stringify(limpiar)})`);

  await ir("uso", "#uso .fila-term");
  pasos.uso = await leer();
  const u = pasos.uso.apartados[0]?.filas ?? [];
  const c = (n) => u.find((f) => f.nombre === n);
  debe(pasos.uso.ancho, "Uso no se sale de la pantalla");
  debe(c("Principal")?.barra === "37%" && c("Principal")?.cifra === "37 %" && !c("Principal")?.alto, `la que dice su gasto lleva su raya y su cifra (${JSON.stringify(c("Principal"))})`);
  debe(c("CCC")?.alto, "la que va por encima del 78 % sale en naranja");
  debe(c("Codex") && !c("Codex").barra && /no dice cuánto lleva/.test(c("Codex").debajo), `la que no dice su gasto no se lo inventa (${JSON.stringify(c("Codex"))})`);
  debe(c("Gemini")?.mal && /sin sesión/.test(c("Gemini").debajo) && !c("Gemini").barra, `la que no tiene sesión lo dice (${JSON.stringify(c("Gemini"))})`);
  return { pasos, fallos };
}
