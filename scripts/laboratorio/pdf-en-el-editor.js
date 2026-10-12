// Un PDF abierto desde el árbol de Archivos se ve en el editor, con el visor
// del propio WebView (`EditorPane.tsx`, `leer_pdf` en `archivos.rs`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página. Lo que fija:
//   · el PDF sale en un marco con una dirección `blob:` que lleva SUS bytes y
//     se sirve como `application/pdf`, que es lo que hace que el visor lo coja;
//   · no se dice «Esto no es texto», no hay editor debajo ni «Ctrl+S»;
//   · la cabecera dice que es un PDF y lo que pesa;
//   · al cerrar la pestaña la dirección se suelta, y no se queda el PDF en memoria.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("adeorq-lateral", "archivos");
      localStorage.setItem("adeorq-layout", JSON.stringify({
        panes: [{ name: "Web · consola", cwd: "C:\\proyectos\\Web" }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }));
    } catch { /* sin almacenamiento */ }
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(600);
  await page.locator("[data-pane-id]").first().click({ position: { x: 60, y: 60 } });
  await page.waitForTimeout(800);
  const raiz = await page.locator(".arch-raiz").first().getAttribute("data-tip");

  // Un PDF de una página, de verdad, con su tabla de posiciones bien hecha.
  const b64 = await page.evaluate((R) => {
    const texto = "BT /F1 24 Tf 40 100 Td (Hola desde Adeorq) Tj ET";
    const objetos = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const sitios = objetos.map((o, i) => {
      const aqui = pdf.length;
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
      return aqui;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    pdf += sitios.map((s) => `${String(s).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const datos = btoa(pdf);
    window.__pdfs = { [`${R}\\informe.pdf`]: datos };
    window.__carpetas = { [R]: [{ nombre: "informe.pdf", cuando: 1, peso: pdf.length }] };
    window.__git = { git: true, cambios: [] };
    return datos;
  }, raiz);
  await page.locator('.franja-btn[data-tip="Ocultar panel"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.franja-btn[data-tip="Archivos"]').first().click();
  await page.waitForTimeout(1500);

  await page.evaluate(() => { window.__desde = window.__llamadas.length; });
  await page.locator(".arch-fila", { hasText: "informe.pdf" }).first().click();
  await page.locator(".ed-pdf").first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);

  pasos.hoja = await page.evaluate(() => {
    const hoja = document.querySelector('.ed-hoja[data-visible="true"]');
    return {
      marco: hoja?.querySelector(".ed-pdf")?.getAttribute("src") ?? "",
      nota: hoja?.querySelector(".ed-nota")?.textContent ?? "",
      cajaOculta: hoja?.querySelector(".ed-caja")?.hidden ?? null,
      atajo: !!hoja?.querySelector(".ed-atajo"),
      alto: hoja?.querySelector(".ed-pdf")?.getBoundingClientRect().height ?? 0,
    };
  });
  debe(pasos.hoja.marco.startsWith("blob:"), `el marco no lleva una dirección blob: («${pasos.hoja.marco}»)`);
  debe(!pasos.hoja.nota, `dice «${pasos.hoja.nota}» en vez de enseñarlo`);
  debe(pasos.hoja.cajaOculta === true, "el editor de texto sigue debajo");
  debe(!pasos.hoja.atajo, "ofrece Ctrl+S para guardar un PDF");
  debe(pasos.hoja.alto > 200, `el visor mide ${pasos.hoja.alto} px de alto`);

  pasos.pedido = await page.evaluate(() => window.__llamadas.slice(window.__desde).filter(([c]) => c === "leer_pdf").length);
  debe(pasos.pedido === 1, `leer_pdf se pidió ${pasos.pedido} veces`);

  pasos.blob = await page.evaluate(async (src) => {
    const r = await fetch(src);
    const b = new Uint8Array(await r.arrayBuffer());
    return { tipo: r.headers.get("content-type"), b64: btoa(String.fromCharCode(...b)) };
  }, pasos.hoja.marco).catch((e) => ({ error: String(e) }));
  debe(pasos.blob.tipo === "application/pdf", `se sirve como «${pasos.blob.tipo}»`);
  debe(pasos.blob.b64 === b64, "los bytes del marco no son los del PDF");

  const cabecera = page.locator(".pane-head", { has: page.locator(".pane-name", { hasText: "informe.pdf" }) }).first();
  pasos.chip = (await cabecera.locator(".pane-chip").textContent().catch(() => "")) ?? "";
  debe(/^PDF · /.test(pasos.chip), `la cabecera dice «${pasos.chip}»`);
  await page.screenshot({ path: ".playwright-mcp/pdf-en-el-editor.png" });

  // Cerrar el panel suelta la dirección. Con un archivo solo no hay pestañas:
  // se cierra el panel entero, que es lo que hace Munir.
  await cabecera.locator('button[data-tip="Cerrar"]').click();
  await page.waitForTimeout(800);
  pasos.trasCerrar = await page.evaluate(async (src) => {
    try { await fetch(src); return "sigue viva"; } catch { return "suelta"; }
  }, pasos.hoja.marco);
  debe(pasos.trasCerrar === "suelta", "cerrado el panel, el PDF sigue en memoria");
  pasos.hoja.marco = pasos.hoja.marco.slice(0, 12) + "…";
  pasos.blob.b64 = pasos.blob.b64 === b64 ? "los mismos bytes" : "OTROS bytes";
  return { pasos, fallos };
}
