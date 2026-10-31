// Lo último que escribes en una nota del lienzo llega a disco aunque la quites ya.
//
// Medido el 2026-10-31: la nota guarda con 600 ms de retardo y, al desmontarse,
// solo cancelaba ese retardo (el comentario decía que guardaba). Escribir y
// pulsar su ✕ antes de que pasara perdía las últimas teclas.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/nota-al-quitarla.js" })
async (page) => {
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), JSON.stringify({
    kind: "adeorq-lienzo", v: 1, flechas: [], trazos: [],
    nodos: [{ id: "n1", tipo: "nota", nota: "nota-al-quitarla", color: "#f2c14e", x: 80, y: 80, w: 320, h: 240 }],
  }));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  await page.locator('.topbar button[data-tip="Lienzo"], .tabs button:has-text("Lienzo")').first().click();
  await page.waitForTimeout(2500);
  const nota = page.locator(".react-flow__node-note").first();
  await nota.locator(".note-body").click();
  await page.keyboard.type("lo último que escribí");
  // Sin esperar al retardo: la ✕ enseguida.
  await nota.locator('.wdg-x[data-tip="Quitar"]').click();
  await page.waitForTimeout(1500);
  const enDisco = await page.evaluate(() => (window.__notas ?? {})["nota-al-quitarla"]?.text ?? null);
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  return `${enDisco?.includes("lo último que escribí") ? "ok  " : "FALLA"} lo escrito llega a disco al quitar la nota — en disco: ${JSON.stringify(enDisco)}`;
}
