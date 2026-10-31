// Una sesión abierta en el Lienzo no se vuelve a abrir desde la Cabina, ni al revés.
//
// Medido el 2026-10-31: retomar desde la barra solo buscaba en su propia vista.
// La Cabina miraba sus paneles y el Lienzo los suyos, y lo que estaba en la
// otra solo se salvaba si el escaneo ya la daba por viva (pasa cada 45 s). En
// ese hueco se abría un segundo `--resume` de la misma conversación, que es lo
// que cuelga las dos (ver la memoria «una sesión abierta dos veces se cuelga»).
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/retomar-sin-duplicar.js" })
async (page) => {
  const A = "aaaa1111-2222-4333-8444-000000000001";
  const B = "aaaa1111-2222-4333-8444-000000000002";
  await page.addInitScript(([a, b]) => {
    for (const [id, title] of [[a, "Abierta en el lienzo"], [b, "Abierta en la cabina"]])
      window.__sesiones.push({ id, cwd: "C:\\proyectos\\Vidorq", title, project: "Vidorq", live: false, estado: "lista", hours: 1 });
  }, [A, B]);
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(4000);
  const abiertas = (sid) =>
    page.evaluate((s) => window.__llamadas.filter(([c, a]) => c === "pty_spawn" && (a.command ?? []).join(" ").includes(s)).length, sid);
  const vista = async (v) => {
    await page.locator(`[data-tab="${v}"]`).first().click();
    await page.waitForTimeout(1200);
  };
  const retomar = async (sid) => {
    if (!(await page.locator(`[data-sesion="${sid}"]`).count())) {
      await page.locator(".view-cabina .sidebar .project-main", { hasText: "Vidorq" }).first().click();
      await page.waitForTimeout(600);
    }
    await page.locator(`[data-sesion="${sid}"] button.session`).first().click();
    await page.waitForTimeout(1500);
  };
  const enVista = () => page.evaluate(() => document.querySelector("[data-tab][aria-selected='true'], [data-tab].on, [data-tab][data-on='true']")?.getAttribute("data-tab") ?? "");
  const r = [];
  const ok = (n, c, d = "") => r.push(`${c ? "ok  " : "FALLA"} ${n}${c || !d ? "" : ` — ${d}`}`);

  await vista("lienzo");
  await retomar(A);
  ok("A se abre en el lienzo", (await abiertas(A)) === 1, `abiertas: ${await abiertas(A)}`);
  await vista("cabina");
  await retomar(A);
  ok("desde la Cabina, A no se abre otra vez", (await abiertas(A)) === 1, `abiertas: ${await abiertas(A)}`);

  await vista("cabina");
  await retomar(B);
  ok("B se abre en la Cabina", (await abiertas(B)) === 1, `abiertas: ${await abiertas(B)}`);
  await vista("lienzo");
  await retomar(B);
  ok("desde el Lienzo, B no se abre otra vez", (await abiertas(B)) === 1, `abiertas: ${await abiertas(B)}`);
  r.push(`(vista al final: ${await enVista()})`);
  return r.join("\n");
}
