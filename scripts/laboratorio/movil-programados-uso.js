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

  // Uso, en baterías (2026-10-16, «la 2»): una tarjeta por cuenta, la más
  // gastada arriba, con su cifra grande y una barra por ventana que dice
  // cuándo se renueva; las que no dicen su gasto, juntas al final.
  await ir("uso", "#uso .bat");
  pasos.uso = await page.evaluate(() => ({
    ancho: document.querySelector(".cuerpo").scrollWidth <= document.querySelector(".cuerpo").clientWidth + 1,
    baterias: [...document.querySelectorAll("#uso .bat")].map((b) => ({
      nombre: b.querySelector(".bat-cab b").firstChild.textContent,
      sub: b.querySelector(".bat-cab small").textContent,
      cifra: b.querySelector(".cifra").textContent,
      tono: b.dataset.tono,
      ventanas: [...b.querySelectorAll(".bat-v")].map((v) => ({
        barra: v.querySelector(".barra-g i").style.getPropertyValue("--p"),
        dice: v.querySelector("small span").textContent,
        renueva: v.querySelector("small span:last-child").textContent,
        tono: v.dataset.tono,
      })),
    })),
    sinDato: [...document.querySelectorAll("#uso .sin-dato li")].map((l) => ({ texto: l.textContent, mal: !!l.querySelector("[data-mal]") })),
  }));
  const u = pasos.uso;
  const b = (n) => u.baterias.find((x) => x.nombre === n);
  debe(u.ancho, "Uso no se sale de la pantalla");
  debe(JSON.stringify(u.baterias.map((x) => x.nombre)) === JSON.stringify(["CCC", "Principal"]), `la más gastada arriba (${u.baterias.map((x) => x.nombre)})`);
  const ccc = b("CCC");
  debe(ccc?.cifra === "91 %" && ccc?.tono === "mal" && ccc?.sub === "Claude Code · pro", `CCC con su cifra en rojo (${JSON.stringify(ccc)})`);
  debe(ccc?.ventanas[0]?.dice === "las 5 horas · 91 %" && /^se renueva en (39|40) min$/.test(ccc?.ventanas[0]?.renueva ?? ""), `su ventana de 5 horas dice cuándo se renueva (${JSON.stringify(ccc?.ventanas[0])})`);
  debe(ccc?.ventanas[1]?.dice === "la semana · Fable · 64 %" && /^se renueva el lunes$/.test(ccc?.ventanas[1]?.renueva ?? ""), `y la de la semana de un modelo (${JSON.stringify(ccc?.ventanas[1])})`);
  const pri = b("Principal");
  debe(pri?.cifra === "52 %" && pri?.tono === "bien" && pri?.ventanas[0]?.barra === "37%" && /^se renueva en 2 h$/.test(pri?.ventanas[0]?.renueva ?? ""), `Principal, en azul y con sus dos ventanas (${JSON.stringify(pri)})`);
  debe(u.sinDato.some((x) => /Codex/.test(x.texto) && /no dice cuánto lleva/.test(x.texto) && !x.mal), `la que no dice su gasto va al final sin inventárselo (${JSON.stringify(u.sinDato)})`);
  debe(u.sinDato.some((x) => /Gemini/.test(x.texto) && /sin sesión/.test(x.texto) && x.mal), `la que no tiene sesión lo dice (${JSON.stringify(u.sinDato)})`);
  return { pasos, fallos };
}
