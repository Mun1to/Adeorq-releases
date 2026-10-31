// La cuenta atrás avisa a su hora aunque la ventana esté oculta o minimizada.
//
// Medido el 2026-10-31 (`CanvasWidgets.tsx`): el reloj se repintaba con
// `latido`, que salta los turnos con la ventana oculta, y el aviso (sonido,
// notificación, móvil) se decidía AL PINTAR. Con la ventana minimizada nadie
// pintaba, así que el pomodoro y la cuenta atrás no sonaban hasta volver a
// ella, que es justo cuando ya no hacen falta.
//
// Usa el reloj falso de Playwright para no esperar un minuto de verdad. Se
// cuenta cuántas veces suena la alarma (`alarm` crea seis osciladores por
// aviso; se espían en `AudioContext`).
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/reloj-ventana-oculta.js" })
async (page) => {
  const vista = (nombre) =>
    page.locator(`.topbar button[data-tip="${nombre}"], .tabs button:has-text("${nombre}")`).first().click();
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), JSON.stringify({
    kind: "adeorq-lienzo", v: 1, flechas: [], trazos: [],
    nodos: [
      { tipo: "widget", id: "w1", x: 200, y: 160, w: 260, h: 260, kind: "cuenta" },
      { tipo: "widget", id: "w2", x: 520, y: 160, w: 260, h: 260, kind: "pomodoro" },
    ],
  }));
  await page.clock.install();
  await page.addInitScript(() => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      window.__osc++;
      return orig.call(this);
    };
  });
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  await vista("Lienzo");
  await page.waitForTimeout(2500);
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);
  const avisos = () => page.evaluate(() => Math.floor(window.__osc / 6));

  // La cuenta atrás a 1 minuto y el pomodoro (25), los dos corriendo.
  const cuenta = page.locator(".wdg-pomo[data-fase=cuenta]");
  await cuenta.locator(".mini", { hasText: /^1$/ }).first().click();
  await cuenta.locator(".np-btn").first().click();
  await page.locator(".wdg-pomo[data-fase=foco] .np-btn").first().click();
  await page.waitForTimeout(300);
  // La ventana pasa a oculta (minimizada): `document.hidden` y su evento.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(61_000);
  await page.waitForTimeout(800);
  ok("con la ventana oculta, la cuenta atrás avisa a su hora", (await avisos()) === 1, `avisos: ${await avisos()}`);
  await page.clock.fastForward(24 * 60_000);
  await page.waitForTimeout(800);
  ok("y el pomodoro también", (await avisos()) === 2, `avisos: ${await avisos()}`);
  // Control: al volver la ventana el reloj está en cero y el aviso salió UNA vez
  // (si el reloj no corriera, aquí tampoco habría ninguno).
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(1_000);
  await page.waitForTimeout(500);
  ok("al volver no suena otra vez", (await avisos()) === 2, `avisos: ${await avisos()}`);
  ok("y la cuenta atrás marca cero", (await cuenta.locator(".wdg-big").innerText()) === "00:00");
  return r.join("\n");
}
