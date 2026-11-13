// «Tus aparatos» en los Ajustes de la página del móvil (2026-11-13). Munir
// emparejó el PC de clase con un código del móvil y para quitarlo tenía que
// acordarse de hacerlo EN ese PC; desde el móvil no veía ni quitaba nada, y en
// la lista seguían tres viejos de octubre. Aquí:
//   · la lista sale en Ajustes, con el de ahora marcado «este aparato» y sin «Quitar»;
//   · los demás, del último que se vio al primero, con «visto hace…»;
//   · «Quitar» va a dos toques, y el quitado se queda fuera al momento;
//   · el aparato que entra con el código de esta página sale en la lista solo,
//     y el código, que ya no vale, deja de contar;
//   · «por un rato»: el que entra con el código de aquí se olvida solo a las
//     8 h y la lista dice a qué hora; con «Para siempre» marcada, no; cambiarla
//     con un código a la vista saca otro; y al acabarse el rato su llave da 401
//     y sale de la lista;
//   · a 390 y a 1440 (el PC de clase), en oscuro y en claro, nada se sale y
//     «Quitar» se lee.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-aparatos.js
//   (o `node scripts/laboratorio/bancos-movil.mjs aparatos`)
//
// Con `FOTOS=<carpeta>` deja las fotos de cada ancho y tema. Devuelve
// { pasos, fallos }. Cambia el estado del doble: va contra uno recién arrancado.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const CLAVE = "clave-de-mentira";
  const FOTOS = typeof process !== "undefined" ? process.env.FOTOS : null;
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const alDoble = (ruta, cuerpo, clave = CLAVE) =>
    fetch(`${B}${ruta}`, {
      method: cuerpo ? "POST" : "GET",
      headers: { ...(clave ? { Authorization: `Bearer ${clave}` } : {}), "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(async (r) => ({ estado: r.status, v: await r.json().catch(() => ({})) }));
  const foto = async (nombre) => {
    if (FOTOS) await page.screenshot({ path: `${FOTOS}/${nombre}.png` });
  };

  // Cómo está pintada la lista, medido en la página.
  const lista = () => page.evaluate(() => {
    const g = document.getElementById("aparatos");
    const lum = (s) => { const [r, gr, b] = s.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * gr + 0.0722 * b; };
    const fondo = getComputedStyle(document.documentElement).getPropertyValue("--fondo").trim().replace(/^#(..)(..)(..)$/, (_, a, b, c) => `rgb(${parseInt(a, 16)},${parseInt(b, 16)},${parseInt(c, 16)})`);
    const contraste = (el) => { const [a, b] = [lum(getComputedStyle(el).color), lum(fondo)]; return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10; };
    const cuerpo = document.querySelector(".cuerpo");
    const rg = g?.getBoundingClientRect();
    return {
      hay: !!g,
      secciones: [...document.querySelectorAll("#ajustes .seccion")].map((s) => s.textContent.trim()),
      seSale: cuerpo.scrollWidth > cuerpo.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      grupo: rg ? { x: Math.round(rg.left), d: Math.round(rg.right), w: Math.round(rg.width) } : null,
      filas: [...(g?.querySelectorAll(".aparato") || [])].map((f) => {
        const b = f.querySelector("button");
        const rb = b?.getBoundingClientRect();
        const rf = f.getBoundingClientRect();
        return {
          nombre: f.querySelector("span").firstChild.textContent.trim(),
          debajo: f.querySelector("small").textContent.trim(),
          este: f.hasAttribute("data-este"),
          boton: b?.textContent.trim() ?? null,
          peligro: !!b?.classList.contains("peligro"),
          alto: rb ? Math.round(rb.height) : 0,
          dentro: rb ? rb.right <= rf.right + 0.5 && rb.left >= rf.left - 0.5 : true,
          contraste: b ? contraste(b) : null,
        };
      }),
      siempre: (() => { const c = document.getElementById("para-siempre"); const l = c?.closest("label"); return c ? { marcada: c.checked, texto: `${l.querySelector("span").firstChild.textContent.trim()} | ${l.querySelector("small").textContent.trim()}` } : null; })(),
      // La hora a la que se olvidaría uno que entra ahora «por un rato», con el reloj de la página.
      horaRato: new Date(Date.now() + 8 * 3600 * 1000).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
      codigo: document.querySelector(".codigo-otro strong")?.textContent ?? null,
      donde: document.querySelector("#otro-aparato .otro-donde")?.textContent.trim() ?? null,
    };
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${B}/`);
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", c); }, CLAVE);

  // 1. Sin clave no se ve ni se quita nada (en Rust lo fija `cargo test --lib movil`).
  pasos.sinClave = [(await alDoble("/api/aparatos", null, null)).estado, (await alDoble("/api/aparatos/quitar", { id: "0123456789ab" }, null)).estado];
  debe(pasos.sinClave.join() === "401,401", `sin clave, 401 (${pasos.sinClave})`);

  // Los dos viejos de octubre de Munir, sin usar desde hace semanas.
  await alDoble("/api/sembrar-aparatos", { aparatos: [{ nombre: "Móvil", dias: 25 }, { nombre: "PC", dias: 30 }] });

  const entrar = async (ancho) => {
    await page.goto(`${B}/?v=${ancho}${Date.now()}`);
    await page.waitForSelector("#portada-term", { state: "attached" });
    if (!(await page.$eval("#cajon", (c) => !c.inert))) await page.click("#abrir-cajon");
    await page.click("#cajon .a-ajustes");
    await page.waitForSelector("#aparatos .aparato", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };

  // 2. La lista, a 390 en oscuro: este primero y sin «Quitar», luego por el último visto.
  await entrar(390);
  const a = (pasos.inicio = await lista());
  debe(a.hay, "Ajustes tiene «Tus aparatos»");
  if (!a.hay) return { pasos, fallos };
  debe(a.secciones.indexOf("Tus aparatos") >= 0 && a.secciones.indexOf("Tus aparatos") === a.secciones.length - 2, `«Tus aparatos» va justo antes de la última sección (${a.secciones})`);
  debe(a.filas.map((f) => f.nombre).join("|") === "Android|Móvil|PC", `este primero y luego del último visto al primero (${a.filas.map((f) => f.nombre)})`);
  debe(a.filas[0]?.este && a.filas[0].debajo === "este aparato" && a.filas[0].boton === null, `el de ahora va marcado «este aparato» y sin «Quitar» (${JSON.stringify(a.filas[0])})`);
  debe(a.filas.slice(1).every((f) => f.boton === "Quitar" && /^visto hace \d+ d$|^visto \d+ \w+\.?$/.test(f.debajo)), `los otros, con «Quitar» y cuándo se vieron (${JSON.stringify(a.filas.slice(1))})`);
  debe(a.siempre && !a.siempre.marcada && a.siempre.texto === "Para siempre | si no, se olvida solo a las 8 horas de entrar", `la casilla «Para siempre», desmarcada de entrada (${JSON.stringify(a.siempre)})`);
  debe(!a.seSale, "a 390 nada se sale de lado");
  debe(a.filas.every((f) => f.dentro && (f.boton === null || f.alto >= 36)), `«Quitar» cabe en su fila y se pulsa bien (${a.filas.map((f) => f.alto)})`);
  debe(a.filas.every((f) => f.contraste === null || f.contraste >= 4.5), `«Quitar» se lee en oscuro (${a.filas.map((f) => f.contraste)})`);
  await page.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await foto("aparatos-390-oscuro");

  // 3. «Quitar» a dos toques: el primero avisa, el segundo quita.
  const quitarA = (nombre) => page.locator("#aparatos .aparato", { hasText: nombre }).locator("button");
  await quitarA("PC").click();
  await page.waitForTimeout(200);
  const armado = (await lista()).filas.find((f) => f.nombre === "PC");
  pasos.armado = armado;
  debe(armado?.boton === "Toca otra vez" && armado.peligro && /emparejarse de nuevo/.test(armado.debajo), `el primer toque solo avisa (${JSON.stringify(armado)})`);
  debe((await alDoble("/api/aparatos")).v.aparatos.length === 3, "y no ha quitado nada");
  await page.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await foto("aparatos-390-oscuro-quitar");
  await quitarA("PC").click();
  await page.waitForFunction(() => ![...document.querySelectorAll("#aparatos .aparato")].some((f) => f.textContent.includes("PC")), null, { timeout: 4000 }).catch(() => {});
  pasos.trasQuitar = (await lista()).filas.map((f) => f.nombre);
  debe(pasos.trasQuitar.join("|") === "Android|Móvil", `el segundo lo quita de la lista (${pasos.trasQuitar})`);
  debe((await alDoble("/api/aparatos")).v.aparatos.every((d) => d.nombre !== "PC"), "y del PC");

  // 4. El aparato que entra con el código de esta página sale solo en la lista.
  await page.click("#pedir-codigo");
  await page.waitForSelector(".codigo-otro strong");
  const cifras = (await lista()).codigo.replace(" ", "");
  const entra = await alDoble("/api/emparejar", { codigo: cifras, nombre: "Windows · Chrome" }, null);
  debe(entra.estado === 200, `el PC de clase entra con el código (${entra.estado})`);
  await page.waitForFunction(() => [...document.querySelectorAll("#aparatos .aparato")].some((f) => f.textContent.includes("Windows · Chrome")), null, { timeout: 6000 }).catch(() => {});
  const tras = (pasos.trasEntrar = await lista());
  debe(tras.filas.map((f) => f.nombre).join("|") === "Android|Windows · Chrome|Móvil", `sale en la lista sin volver a entrar en Ajustes (${tras.filas.map((f) => f.nombre)})`);
  debe(!tras.codigo && /Windows · Chrome.*ya ha entrado/.test(tras.donde || ""), `y el código deja de contar: dice que entró (${tras.codigo} · ${tras.donde})`);
  const claveClase = entra.v.clave;
  // Sin marcar la casilla, «por un rato»: la lista dice a qué hora se olvida.
  const fila = tras.filas.find((f) => f.nombre === "Windows · Chrome");
  const hora = /se olvida a las (\d\d:\d\d)$/.exec(fila?.debajo || "")?.[1];
  pasos.rato = { debajo: fila?.debajo, esperada: tras.horaRato };
  const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  debe(hora && Math.abs(minutos(hora) - minutos(tras.horaRato)) <= 1, `el que entra por un rato dice a qué hora se olvida, dentro de 8 h (${JSON.stringify(pasos.rato)})`);
  const enElPc = (await alDoble("/api/aparatos")).v.aparatos.find((d) => d.nombre === "Windows · Chrome");
  debe(enElPc?.hasta && Math.abs(enElPc.hasta - (Date.now() / 1000 + 8 * 3600)) < 90, `y el PC lo guarda con su hora (${enElPc?.hasta})`);
  await page.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await foto("aparatos-390-oscuro-por-un-rato");

  // 4b. «Para siempre»: marcada, el que entra no se olvida. Cambiarla con un
  //     código a la vista saca otro, y el de antes deja de valer.
  await page.waitForTimeout(1100);
  await page.click("#para-siempre");
  await page.click("#pedir-codigo");
  await page.waitForSelector(".codigo-otro strong");
  const primero = (await lista()).codigo;
  await page.click("#para-siempre");
  await page.waitForFunction((antes) => document.querySelector(".codigo-otro strong")?.textContent !== antes, primero, { timeout: 4000 }).catch(() => {});
  await page.click("#para-siempre");
  await page.waitForTimeout(600);
  const otraVez = (pasos.siempre = await lista());
  debe(otraVez.siempre?.marcada && otraVez.codigo && otraVez.codigo !== primero, `cambiar la casilla con un código a la vista saca otro (${primero} → ${otraVez.codigo})`);
  pasos.elDeAntes = (await alDoble("/api/emparejar", { codigo: primero.replace(" ", ""), nombre: "Viejo" }, null)).estado;
  debe(pasos.elDeAntes === 403, `el código de antes ya no vale (${pasos.elDeAntes})`);
  const mac = await alDoble("/api/emparejar", { codigo: otraVez.codigo.replace(" ", ""), nombre: "Mac · Safari" }, null);
  debe(mac.estado === 200, `entra con el código de «Para siempre» (${mac.estado})`);
  await page.waitForFunction(() => [...document.querySelectorAll("#aparatos .aparato")].some((f) => f.textContent.includes("Mac")), null, { timeout: 6000 }).catch(() => {});
  const conMac = (pasos.conMac = await lista());
  debe(conMac.filas.map((f) => f.nombre).join("|") === "Android|Mac · Safari|Windows · Chrome|Móvil", `los cuatro, por el último visto (${conMac.filas.map((f) => f.nombre)})`);
  debe(/^visto ahora mismo$/.test(conMac.filas.find((f) => f.nombre === "Mac · Safari")?.debajo || ""), `el de para siempre no dice que se olvide (${conMac.filas.find((f) => f.nombre === "Mac · Safari")?.debajo})`);
  debe(!(await alDoble("/api/aparatos")).v.aparatos.find((d) => d.nombre === "Mac · Safari")?.hasta, "y el PC lo guarda sin hora");
  const claveMac = mac.v.clave;

  // 5. En claro, a 390.
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  const c = (pasos.claro390 = await lista());
  debe(c.filas.every((f) => f.contraste === null || f.contraste >= 4.5), `«Quitar» se lee en claro (${c.filas.map((f) => f.contraste)})`);
  await page.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
  await foto("aparatos-390-claro");

  // 6. A 1440, el PC de clase: en la columna centrada, nada de lado a lado.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const tema of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: tema });
    await entrar(1440);
    const p = (pasos[`pc-${tema}`] = await lista());
    debe(p.hay && !p.seSale, `a 1440 en ${tema}, sin salirse`);
    debe(p.grupo && p.grupo.w <= 780 && p.grupo.w >= 600, `a 1440 la lista va en la columna, no de lado a lado (${JSON.stringify(p.grupo)})`);
    debe(p.filas.every((f) => f.dentro), "«Quitar» dentro de su fila");
    debe(p.filas.every((f) => f.contraste === null || f.contraste >= 4.5), `«Quitar» se lee a 1440 en ${tema} (${p.filas.map((f) => f.contraste)})`);
    await page.$eval("#aparatos", (g) => g.scrollIntoView({ block: "center" }));
    await foto(`aparatos-1440-${tema === "dark" ? "oscuro" : "claro"}`);
  }

  // 7. Quitar al Mac lo deja fuera: su clave ya no abre.
  await quitarA("Mac · Safari").click();
  await page.waitForTimeout(150);
  await quitarA("Mac · Safari").click();
  await page.waitForFunction(() => ![...document.querySelectorAll("#aparatos .aparato")].some((f) => f.textContent.includes("Mac")), null, { timeout: 4000 }).catch(() => {});
  pasos.macFuera = (await alDoble("/api/yo", null, claveMac)).estado;
  debe(pasos.macFuera === 401, `el quitado desde aquí se queda fuera (${pasos.macFuera})`);

  // 8. Al PC de clase se le acaba el rato (el doble lo adelanta a 2 s): su llave
  //    da 401 y sale de la lista.
  pasos.antesDeAcabar = (await alDoble("/api/yo", null, claveClase)).estado;
  await alDoble("/api/sembrar-caduca", { nombre: "Windows · Chrome", segundos: 2 });
  await page.waitForTimeout(2600);
  pasos.claseFuera = (await alDoble("/api/yo", null, claveClase)).estado;
  debe(pasos.antesDeAcabar === 200 && pasos.claseFuera === 401, `al acabarse el rato, su llave ya no abre (${pasos.antesDeAcabar} → ${pasos.claseFuera})`);
  await entrar(1440);
  pasos.final = (await lista()).filas.map((f) => f.nombre);
  debe(pasos.final.join("|") === "Android|Móvil", `y sale de la lista (${pasos.final})`);

  debe(!errores.length, `sin errores en la página (${errores.join(" | ")})`);
  return { pasos, fallos };
}
