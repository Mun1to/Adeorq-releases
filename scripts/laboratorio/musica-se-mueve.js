// Banco de lo que se mueve en la barra de arriba mientras suena música: mide el
// movimiento de verdad, no que exista una animación declarada. Toma varias
// muestras del `transform` calculado de cada barra del ecualizador y del título, y
// de los cuadros de la mascota, y cuenta cuántos valores distintos salen.
//
//   BROWSER=none node node_modules/vite/bin/vite.js --port 1420 --strictPort
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/doble-conserje.js scripts/laboratorio/musica-se-mueve.js
//
// Recorre Contraste y Azul noche, con el modo rendimiento apagado y encendido, a
// 1920 de ancho. El modo se pide por su ajuste («nunca» y «siempre»), que es el
// mismo atributo de `<html>` que pone «auto» con cuatro terminales.
async (page) => {
  const TEMAS = ["contraste", "azul"];
  const MODOS = ["nunca", "siempre"];
  const MUESTRAS = 14;
  const CADA_MS = 90;

  await page.addInitScript(() => {
    const caso = JSON.parse(sessionStorage.getItem("__caso") ?? "{}");
    if (caso.tema) localStorage.setItem("adeorq-theme", caso.tema);
    if (caso.modo) localStorage.setItem("adeorq-rendimiento", caso.modo);
    // Sin esta marca, `temaInicial` da el Azul noche guardado por el de antes de
    // Contraste y lo cambia: el banco mediría dos veces el mismo tema.
    localStorage.setItem("adeorq-tema-contraste", "1");
    const tauri = window.__TAURI_INTERNALS__;
    const invoke = tauri.invoke;
    tauri.invoke = (cmd, args) =>
      cmd === "media_now"
        ? Promise.resolve({
            title: "Pass The Dutchie, la versión larga que no cabe en la barra de arriba",
            artist: "Musical Youth",
            playing: true,
            app: "Spotify.exe",
            volume: null,
          })
        : invoke(cmd, args);
  });

  const filas = [];
  const fallos = [];
  for (const tema of TEMAS) {
    for (const modo of MODOS) {
      await page.evaluate((c) => sessionStorage.setItem("__caso", JSON.stringify(c)), { tema, modo });
      await page.goto("http://localhost:1420/");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForSelector(".np-eq[data-on='true'] i", { timeout: 15000 });
      await page.waitForTimeout(600);

      const fila = await page.evaluate(
        async ({ MUESTRAS, CADA_MS }) => {
          const barras = [...document.querySelectorAll(".np-eq i")];
          const tira = document.querySelector(".np-tira");
          const mascota = document.querySelector(".campana .mascota");
          const vistos = { barras: barras.map(() => new Set()), tira: new Set(), mascota: new Set() };
          for (let i = 0; i < MUESTRAS; i++) {
            barras.forEach((b, n) => vistos.barras[n].add(getComputedStyle(b).transform));
            if (tira) vistos.tira.add(getComputedStyle(tira).transform);
            if (mascota) vistos.mascota.add([...mascota.querySelectorAll("rect")].map((r) => `${r.getAttribute("x")},${r.getAttribute("y")}`).join(";"));
            await new Promise((r) => setTimeout(r, CADA_MS));
          }
          // El halo del panel que te espera sí se apaga con el modo rendimiento.
          const panel = document.createElement("div");
          panel.className = "pane";
          panel.dataset.done = "true";
          document.body.appendChild(panel);
          const halo = getComputedStyle(panel).animationName;
          panel.remove();
          return {
            halo,
            ritmo: barras[0] ? getComputedStyle(barras[0]).animationTimingFunction : "",
            retrasos: barras.map((b) => getComputedStyle(b).animationDelay),
            rendimiento: document.documentElement.dataset.rendimiento ?? "",
            temaPuesto: document.documentElement.dataset.theme ?? "",
            sin: document.querySelector(".topbar")?.dataset.sin ?? "",
            animacion: barras[0] ? getComputedStyle(barras[0]).animationName : "",
            barras: vistos.barras.map((s) => s.size),
            tituloLargo: !!document.querySelector(".np-text[data-largo]"),
            tituloAnimacion: tira ? getComputedStyle(tira).animationName : "",
            animo: mascota?.dataset.animo ?? "",
            mascota: vistos.mascota.size,
          };
        },
        { MUESTRAS, CADA_MS },
      );
      filas.push({ tema, modo, ...fila });
      if (fila.temaPuesto !== tema) fallos.push(`se pidió el tema ${tema} y está puesto ${fila.temaPuesto}`);
      if (fila.rendimiento !== (modo === "siempre" ? "1" : "")) fallos.push(`${tema}: el modo rendimiento no quedó en «${modo}»`);
      if (fila.barras.length !== 3 || fila.barras.some((n) => n < 4)) {
        fallos.push(`${tema} con el modo rendimiento en «${modo}»: el ecualizador no se mueve (valores distintos por barra: ${fila.barras.join(", ")}; animación: ${fila.animacion})`);
      }
      // Con el modo rendimiento va a pasos y las tres barras cambian a la vez: por
      // fotograma cuesta unas cuatro veces más en el proceso de gráficos (`19-temas.css`).
      if (modo === "siempre" && (!fila.ritmo.startsWith("steps(4") || fila.retrasos.join(" ") !== "0s 0.225s 0.45s")) {
        fallos.push(`${tema} con el modo rendimiento: el ecualizador no va a pasos (ritmo: ${fila.ritmo}; retrasos: ${fila.retrasos.join(" ")})`);
      }
      const haloEsperado = modo === "siempre" ? "none" : "pane-waiting";
      if (fila.halo !== haloEsperado) fallos.push(`${tema} con el modo rendimiento en «${modo}»: el halo del panel que te espera es «${fila.halo}» y debería ser «${haloEsperado}»`);
      if (fila.animo === "baila" && fila.mascota < 2) {
        fallos.push(`${tema} con el modo rendimiento en «${modo}»: la mascota no baila`);
      }
    }
  }
  return { fallos, filas };
}
