// El panel de la derecha, en la ventana de verdad (Munir, 2026-10-17, «A1 B1»):
// el Uso con su propia pestaña, la primera, y una batería por cuenta; y Skills
// y Archivos ordenados sin quitar nada. La cara «Actividad» se fue el
// 2026-10-18 (Munir: Archivos ya enseña lo que toca el agente).
//
//   1. `pnpm dev` (solo Vite)
//   2. node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/panel-derecho.js
//
// Rust se hace con un doble: tres cuentas que publican su gasto (dos de Claude
// y la de Codex) y Copilot sin instalar. Lo que fija:
//   · la franja: Uso, Skills, Archivos, y la web aparte;
//   · todas las cuentas a la vez, con su nombre entero y su plan, la más
//     gastada arriba y en rojo, una barra por ventana con cuándo se renueva;
//     lo que no está instalado no sale;
//   · Skills sin el Uso debajo, cada una con una línea de lo que hace;
//   · nada se sale por la derecha;
//   · quien tenía guardada la cara «actividad» vuelve con la franja sola, y
//     el primer clic abre lo que pulsa.
// Deja una foto de cada cara en la carpeta que diga FOTOS (si se pasa).
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("banco-panel-derecho")) {
      localStorage.clear();
      sessionStorage.setItem("banco-panel-derecho", "1");
    }
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ nombre: "Sam", sinRaiz: true, hecho: true, clis: ["claude", "codex"] }));
    localStorage.setItem("adeorq-lateral", sessionStorage.getItem("banco-cara") ?? "uso");
    localStorage.setItem("adeorq-accounts", JSON.stringify({ accounts: [{ id: "kylo", label: "MunirKylo", dir: "C:\\cuentas\\kylo", provider: "claude" }] }));
    localStorage.setItem("adeorq-layout", JSON.stringify({
      panes: [{ name: "storefront-api · Fallo en prueba del descuento cuando el carrito tiene dos cupones", cwd: "C:\\proyectos\\Adeorq", command: ["claude", "--session-id", "0b9f6a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b"] }],
      cols: [{ w: 1, hs: [1], idx: [0] }],
    }));
    const ahora = Date.now();
    const hora = 3600_000;
    const ventanas = (sesion, semana, hs, ds) => [
      { label: "Current session", percent: sesion, resets: "", resetsAt: ahora + hs * hora + 60_000 },
      { label: "Current week (all models)", percent: semana, resets: "", resetsAt: ahora + ds * 24 * hora },
    ];
    const oyentes = {};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    let escucha = 1;
    const contestar = (cmd, args) => {
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "pty_spawn": return null;
        case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }];
        case "detect_clis": return [{ id: "claude", path: "C:\\bin\\claude.exe" }, { id: "codex", path: "C:\\bin\\codex.ps1" }];
        case "account_ready": return true;
        case "usage_limits": return { lines: args.configDir ? ventanas(12, 34, 3, 5) : ventanas(41, 97, 2, 4), note: "", plan: "" };
        case "usage_of": return { lines: ventanas(22, 61, 4, 3), note: "", plan: "" };
        case "plan_info": return { subscription: args.configDir ? "Pro" : "Max", tier: "" };
        case "usage_report":
          return { updated: "", week: [40, 65, 30, 90, 100, 70, 55].map((p, i) => ({ date: `2026-10-${11 + i}`, tokens: p * 34_000, sessions: 2 })),
            weekTokens: 3_400_000, weekSessions: 12, weekMessages: 140, byModel: [{ model: "Opus 5.5", tokens: 2_100_000 }, { model: "Fable 5.1", tokens: 900_000 }], totalSessions: 80, totalMessages: 900 };
        case "list_skills":
          return [
            { name: "review-pr", description: "Revisa el PR abierto y deja un comentario en cada archivo que cambió", invocation: "/review-pr", folder: "review-pr" },
            { name: "write-tests", description: "Escribe las pruebas de lo que cambiaste", invocation: "/write-tests", folder: "write-tests" },
            { name: "ship", description: "Prueba, commit y sube", invocation: "/ship", folder: "ship" },
          ];
        default: throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_${id}`] = cb; return id; },
        convertFileSrc: (ruta) => ruta,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });
  const pasos = {};
  const FOTOS = globalThis.process?.env?.FOTOS;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.locator(".lateral .bat").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const foto = async (nombre) => {
    if (!FOTOS) return;
    const caja = await page.locator(".lateral-zona").first().boundingBox();
    await page.screenshot({ path: `${FOTOS}/${nombre}.png`, clip: { x: caja.x - 8, y: caja.y, width: caja.width + 16, height: Math.min(caja.height, 760) } });
  };
  const seSale = () => page.evaluate(() => {
    const l = document.querySelector(".lateral");
    return [...l.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > l.getBoundingClientRect().right + 1).map((el) => el.className).slice(0, 5);
  });

  // 1. La franja.
  pasos.franja = await page.$$eval("nav.franja .franja-btn", (b) => b.map((x) => x.getAttribute("data-tip")));
  debe(JSON.stringify(pasos.franja) === JSON.stringify(["Ocultar panel", "Skills", "Archivos", "Ver la web en un panel (localhost)"]), `la franja: Uso (abierta), Skills, Archivos y la web (${JSON.stringify(pasos.franja)})`);
  pasos.titulo = await page.textContent(".lateral-title");
  // El borde encendido y las cajas con halo (Munir, 2026-10-18, «2 y 3»), con
  // la barra por encima de la terminal enfocada (z 2) para que el halo se vea.
  await page.locator(".lateral .bat").first().waitFor({ timeout: 15000 });
  pasos.glow = await page.evaluate(() => ({
    lateral: getComputedStyle(document.querySelector(".lateral")).boxShadow,
    franja: getComputedStyle(document.querySelector(".franja")).boxShadow,
    z: getComputedStyle(document.querySelector(".lateral-zona")).zIndex,
    caja: getComputedStyle(document.querySelector(".lateral .bat")).boxShadow,
  }));
  const g = pasos.glow;
  debe(/-14px 0px 40px -10px/.test(g.lateral) && /-14px 0px 40px -10px/.test(g.franja) && Number(g.z) > 3 && /0px 10px 28px/.test(g.caja), `el glow: borde encendido, por encima de las terminales, y las cajas con halo (${JSON.stringify(g)})`);

  // 2. El Uso: todas a la vez.
  pasos.uso = await page.$$eval(".lateral .bat", (bs) => bs.map((b) => ({
    nombre: b.querySelector(".bat-cab b")?.firstChild?.textContent,
    sub: b.querySelector(".bat-cab small")?.textContent,
    cifra: b.querySelector(".bat-cifra")?.textContent,
    tono: b.dataset.tono,
    ventanas: [...b.querySelectorAll(".bat-v small")].map((s) => s.innerText.replace(/\s+/g, " ")),
  })));
  const u = pasos.uso;
  debe(u.map((x) => `${x.nombre}|${x.sub}|${x.cifra}`).join(" / ") === "Principal|Claude Code · Max|97 % / Principal|Codex|61 % / MunirKylo|Claude Code · Pro|34 %", `las tres, enteras y la más gastada arriba (${JSON.stringify(u)})`);
  debe(u[0]?.tono === "mal" && u[2]?.tono === "bien", `la de arriba en rojo (${u.map((x) => x.tono)})`);
  debe(/^las 5 horas · 41 % en 2 h$/.test(u[0]?.ventanas[0] ?? "") && /^la semana · 97 % /.test(u[0]?.ventanas[1] ?? ""), `una barra por ventana, con cuándo se renueva (${JSON.stringify(u[0]?.ventanas)})`);
  pasos.sinInstalar = await page.locator(".lateral .uso-sin").count();
  debe(pasos.sinInstalar === 0, "Copilot, sin instalar, no sale");
  pasos.trabajo = await page.textContent(".lateral .usage-block-head span").catch(() => "");
  debe(/Trabajo de la semana · Principal/.test(pasos.trabajo), `el trabajo de la semana, diciendo de qué cuenta (${pasos.trabajo})`);
  pasos.seSaleUso = await seSale();
  debe(!pasos.seSaleUso.length, `nada se sale en el Uso (${pasos.seSaleUso})`);
  await foto("uso");

  // 3. Skills: sin el Uso, con lo que hace cada una.
  await page.locator("nav.franja .franja-btn").nth(1).click();
  await page.locator(".lateral .skill").first().waitFor({ timeout: 5000 });
  pasos.skills = await page.$$eval(".lateral .skill", (s) => s.map((x) => `${x.querySelector(".skill-name").textContent}|${x.querySelector(".skill-desc")?.textContent ?? ""}`));
  pasos.usoEnSkills = await page.locator(".lateral .bat, .lateral .uso").count();
  debe(pasos.skills[0] === "/review-pr|Revisa el PR abierto y deja un comentario en cada archivo que cambió" && pasos.usoEnSkills === 0, `cada skill con lo que hace, y sin el Uso debajo (${JSON.stringify(pasos.skills)}, ${pasos.usoEnSkills})`);
  pasos.unaLinea = await page.$eval(".lateral .skill-desc", (d) => getComputedStyle(d).whiteSpace);
  debe(pasos.unaLinea === "nowrap", "la descripción, en una línea");
  pasos.seSaleSkills = await seSale();
  debe(!pasos.seSaleSkills.length, `nada se sale en Skills (${pasos.seSaleSkills})`);
  await foto("skills");

  // 4. Quien tenía guardada la cara «actividad» (hasta el 2026-10-18): la
  // franja sola y nada encendido.
  await page.evaluate(() => sessionStorage.setItem("banco-cara", "actividad"));
  await page.reload();
  await page.locator('[data-tab="cabina"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="cabina"]').click();
  await page.locator("nav.franja .franja-btn").first().waitFor({ timeout: 15000 });
  pasos.vieja = await page.evaluate(() => ({
    abiertas: document.querySelectorAll(".lateral").length,
    encendidas: document.querySelectorAll('nav.franja .franja-btn[data-on="true"]').length,
  }));
  debe(pasos.vieja.abiertas === 0 && pasos.vieja.encendidas === 0, `la cara «actividad» guardada cae en ninguna (${JSON.stringify(pasos.vieja)})`);
  await page.locator("nav.franja .franja-btn").nth(2).click();
  await page.locator(".lateral").first().waitFor({ timeout: 5000 });
  pasos.trasClic = await page.evaluate(() => ({
    titulo: document.querySelector(".lateral-title")?.textContent?.trim(),
    guardada: localStorage.getItem("adeorq-lateral"),
  }));
  debe(pasos.trasClic.titulo === "Archivos" && pasos.trasClic.guardada === "archivos", `y el primer clic abre lo que pulsa (${JSON.stringify(pasos.trasClic)})`);
  return { pasos, fallos };
}
