// Banco de la interfaz del conserje: la app de verdad (Vite) con un doble de
// Tauri que contesta como `conserje.rs`, para pulsarla en un navegador sin tocar
// el Adeorq de Munir.
//
//   1. `pnpm dev` (solo Vite, no compila Rust ni toca `C:\ct`)
//   2. copiar una foto a `.playwright-mcp/fondo.png` (ahí la sirve el doble)
//   3. desde una sesión con el MCP de Playwright:
//        browser_run_code_unsafe con filename = esta ruta
//      Arranca en español, con esa foto de fondo, sin paneles, y ya en el Chat.
//      Tema: `window.__tema` antes de cargar no existe; se cambia con
//      `localStorage.setItem("adeorq-theme","claro")` y recargando.
//
// Lo que ensaya, según lo que se escriba al conserje:
//   · normal                 dos sesiones: una de juicio y una de oficio
//   · contiene «error»       el conserje falla (sin cuota): nota con Reintentar
//   · contiene «fuera»       la reja tira una carpeta: nota de lo descartado
//   · contiene «pregunta»    contesta con una pregunta y no abre nada
// Y trae sembradas ocho conversaciones viejas (para «Ver todas») y una con una
// pestaña de otro arranque en el panel 1 (para la ✕, la sesión cerrada y que
// el panel 1 de ESTA prueba no se tome por suyo).
//
// Cada comando queda en `window.__llamadas` para afirmar qué se invocó. Lo que
// no dobla lo rechaza, y la app ya lo aguanta.
//
// ⚠ Cargarlo DOS veces en la misma página suma los dos guiones de arranque y el
// segundo no puede redefinir `__TAURI_INTERNALS__`: se mide con el viejo sin
// saberlo. Cerrar la página (browser_close) antes de volver a lanzarlo.
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/__fondo/**", (r) => r.fulfill({ path: "C:/proyectos/Adeorq/.playwright-mcp/fondo.png", contentType: "image/png" }));
  await page.addInitScript(() => {
    // Una casa limpia en cada carga: español, bienvenida hecha, sin paneles.
    const tema = localStorage.getItem("adeorq-theme");
    localStorage.clear();
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ hecho: true, clis: ["claude", "codex", "agy", "gemini"] }));
    if (tema) localStorage.setItem("adeorq-theme", tema);

    const convs = {};
    // Segundos, como `conserje.rs`: la primera de hace una hora, y cada una un
    // día y medio más vieja, para ver «hace 1 h», «hace 2 d» y una fecha.
    const ahora = Math.floor(Date.now() / 1000);
    const vieja = (i, titulo, trabajos = []) => ({
      id: `vieja${i}`, titulo, turnos: [
        { n: 1, rol: "tu", texto: titulo, resumen: titulo, cuando: ahora - 3600 - i * 129600 },
        { n: 2, rol: "conserje", texto: "Hecho.", resumen: "hecho", cuando: ahora - 3600 - i * 129600 },
      ], trabajos, router: true, creada: ahora - 3600 - i * 129600,
    });
    const titulos = ["Revisar el contraste de la web", "Migrar el lector de sesiones", "El encuadre de la portada",
      "La guía de uso", "Probar Linux en WSL", "Subir la versión", "Los avisos de cuota"];
    titulos.forEach((t, i) => { convs[`vieja${i}`] = vieja(i, t); });
    // Panel 1 y de otro arranque (el 0): el primer panel que abra esta prueba
    // también será el 1. Si la pestaña vieja deja de decir «cerrada» al abrir
    // uno, ha vuelto el fallo de los números de panel que se repiten.
    convs.vieja7 = vieja(7, "La semana pasada: el radar", [{
      panel: 1, cli: "claude", modelo: "sonnet", cuenta: "", carpeta: "C:\\proyectos\\crypto\\radar-bot",
      encargo: "Medir las caídas del radar", abierto: 0, eligio: "router", porque: "Es oficio.", turno: 2, sesion: "",
      arranque: 0, soltado: false,
    }]);
    const ARRANQUE = Date.now();
    const movil = {
      encendido: false, sirviendo: false, despierto: false, avisos: 1, puerto: 3013, codigo: null,
      dispositivos: [{ id: "a1b2c3d4", nombre: "Android", creado: ahora - 86400, visto: ahora - 600 }],
    };

    const llamadas = [];
    window.__llamadas = llamadas;
    window.__sesiones = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    let escucha = 1;
    // Los eventos que emite Rust, a mano. `window.__emitir("pty-data", { id: 1,
    // data: "\x07" })` hace sonar la campana del panel 1, que es como la app se
    // entera de que su CLI acabó el turno.
    const oyentes = {};
    window.__emitir = (evento, payload) => {
      for (const h of oyentes[evento] ?? []) window[`_${h}`]?.({ event: evento, id: h, payload });
    };
    const nueva = (id) => (convs[id] ??= { id, titulo: "", turnos: [], trabajos: [], router: true, creada: Math.floor(Date.now() / 1000) });
    const tarde = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
    // Como `titulo_de` de Rust: con cabecera y lista, se titula con la lista.
    const corto = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
    const tituloDe = (texto) => {
      const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lineas.length > 1 && lineas[0].endsWith(":")) {
        const puntos = lineas.slice(1).filter((l) => /^(\d+[.)]|[-*•])/.test(l))
          .map((l) => l.replace(/^(\d+[.)]|[-*•])\s*/, "").replace(/\.$/, "")).filter(Boolean);
        if (puntos.length) return corto(puntos.join(" · "), 60);
      }
      return corto(texto.split(/[\n.?!]/).map((s) => s.trim()).find(Boolean) ?? texto, 60);
    };
    const contestar = (cmd, args) => {
      llamadas.push([cmd, args]);
      switch (cmd) {
        case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
        case "plugin:event|unlisten": return null;
        case "get_fondo": return "C:\\fondo.png";
        // Proyectos, para que el lienzo pueda abrir terminales (sin ninguno sus
        // botones de abrir van apagados). Tres, y no por adorno: Adeorq y Vidorq eran el mismo azul con el color
        // de la casa (196° y 195°), que es lo que el lienzo tiene que separar.
        case "list_projects":
          return [
            { name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true },
            { name: "Vidorq", path: "C:\\proyectos\\Vidorq", hasGit: true },
            { name: "VoCript", path: "C:\\proyectos\\VoCript", hasGit: true },
          ];
        // El tablero del lienzo, como `save_board`/`read_board`: en
        // `sessionStorage`, que aguanta una recarga de la pestaña (el
        // `localStorage` se vacía arriba en cada carga). Así se prueba la vuelta
        // entera: montar, recargar y ver que todo sigue en su sitio.
        case "save_board": sessionStorage.setItem("__tablero", args.content); return null;
        case "read_board": return sessionStorage.getItem("__tablero") ?? "";
        // El logo del proyecto (la foto del banco sirve): la marca de agua y la
        // tapa de las terminales del lienzo lo enseñan en vez de las iniciales.
        case "project_icons": return { "C:\\proyectos\\Adeorq": "http://localhost:1420/__fondo/logo.png" };
        // Como `codex_session_since`: el primer turno tarda, así que la primera
        // pregunta no trae nada y la segunda ya trae el hilo.
        case "codex_session_since":
          return llamadas.filter(([c]) => c === "codex_session_since").length >= 2 ? "01a0cafe-0d0b-7201-b479-050ab2e5bde8" : null;
        case "conserje_lista":
          return Object.values(convs)
            .filter((c) => c.turnos.length)
            .map((c) => ({ c, ultimo: c.turnos.length ? c.turnos[c.turnos.length - 1].cuando : c.creada })).sort((a, b) => b.ultimo - a.ultimo)
            .map(({ c, ultimo }) => ({ id: c.id, titulo: c.titulo, cuando: ultimo, trabajos: c.trabajos.length }));
        case "conserje_leer": return JSON.parse(JSON.stringify(nueva(args.id)));
        case "conserje_router": nueva(args.id).router = args.encendido; return null;
        case "conserje_cerebro": nueva(args.id).cerebro = args.cerebro; return null;
        case "conserje_fijo": nueva(args.id).fijo = args.modelo; return null;
        case "conserje_mejorar":
          return tarde(500, "Dos encargos, por orden:\n1. El radar se cae cada dos horas: busca la causa.\n2. El scroll de las terminales: mira qué pasa.");
        case "conserje_enviar": {
          const c = nueva(args.id);
          const ultimo = c.turnos[c.turnos.length - 1];
          // Como Rust: un reintento no apunta tu mensaje dos veces.
          if (!(ultimo && ultimo.rol === "tu" && ultimo.texto === args.texto)) {
            c.turnos.push({ n: c.turnos.length + 1, rol: "tu", texto: args.texto, resumen: args.texto.slice(0, 60), cuando: Math.floor(Date.now() / 1000) });
          }
          if (!c.titulo) c.titulo = tituloDe(args.texto);
          const responder = (texto, acciones, descartes = []) => {
            c.turnos.push({ n: c.turnos.length + 1, rol: "conserje", texto, resumen: "", cuando: Math.floor(Date.now() / 1000) });
            return { texto, acciones, descartes };
          };
          const t = args.texto.toLowerCase();
          if (t.includes("error") && !window.__yaFallo) {
            window.__yaFallo = true;
            return tarde(1500, null).then(() => { throw "claude devolvió error: te has quedado sin cuota de esta semana"; });
          }
          if (t.includes("fuera")) {
            return tarde(1500, responder("He abierto la de Adeorq. La otra no, porque me diste una carpeta que no es de tus proyectos.", [
              { tipo: "abrir", encargo: "Revisar el scroll", carpeta: "C:\\proyectos\\Adeorq", clase: "oficio", consecuencia: "alta", largo: false, trabajo: "codigo" },
            ], ["«C:\\Windows\\System32» no es una carpeta de tus proyectos"]));
          }
          if (t.includes("pregunta")) {
            return tarde(1500, responder("¿Cuál de los dos radares? Tienes **radar-bot** y **launlab**, y los dos se caen. Dime cuál y lo abro.", []));
          }
          return tarde(2500, responder(
            "Son dos trabajos distintos, así que abro dos sesiones: una en **Adeorq** para el scroll y otra en **radar-bot** para las caídas. Te aviso cuando alguna te pregunte algo.",
            [
              { tipo: "abrir", encargo: "Que el scroll de las terminales no salte al cambiar el ancho", carpeta: "C:\\proyectos\\Adeorq", clase: "juicio", consecuencia: "alta", largo: false, trabajo: "codigo" },
              { tipo: "abrir", encargo: "Encontrar por qué el radar se cae cada dos horas, sin tocar el bot en marcha", carpeta: "C:\\proyectos\\crypto\\radar-bot", clase: "oficio", consecuencia: "baja", largo: false, trabajo: "lectura" },
            ],
          ));
        }
        // Como `apuntar_trabajo`, `apuntar_sesion` y `soltar` de Rust.
        case "conserje_arranque": return ARRANQUE;
        case "conserje_trabajo": {
          const c = nueva(args.id);
          const w = { ...args.trabajo, arranque: ARRANQUE, soltado: false };
          const i = c.trabajos.findIndex((x) => x.panel === w.panel && x.arranque === w.arranque);
          if (i >= 0) c.trabajos[i] = w;
          else c.trabajos.push(w);
          return null;
        }
        case "conserje_sesion": {
          const c = nueva(args.id);
          for (const w of c.trabajos) if (w.panel === args.panel && w.arranque === args.arranque) w.sesion = args.sesion;
          return null;
        }
        case "conserje_soltar": {
          const c = nueva(args.id);
          for (const w of c.trabajos) if (w.panel === args.panel && w.arranque === args.arranque) w.soltado = true;
          return null;
        }
        case "pty_spawn": {
          const linea = (args.command ?? []).join(" ");
          const sid = linea.match(/--session-id\s+([0-9a-f-]{8,})/i)?.[1];
          if (sid) window.__sesiones.push({ id: sid, cwd: args.cwd, title: "Sesión abierta por el conserje", project: args.cwd.split("\\").pop() });
          return null;
        }
        // Ajustes > Móvil, como `movil.rs`. Lo que diga Tailscale se elige con
        // `window.__ts` antes de abrir la sección: "falta", "sin-sesion",
        // "ajeno" (otra cosa en su puerto), "denegado" (Linux sin operador) o nada:
        // conectado; la primera vez que se lleva pide activar HTTPS y no pone
        // nada, y la segunda ya queda puesto.
        case "movil_estado": return JSON.parse(JSON.stringify(movil));
        case "movil_encender": movil.encendido = movil.sirviendo = movil.despierto = args.encendido; return JSON.parse(JSON.stringify(movil));
        case "movil_emparejar": movil.codigo = { valor: "482913", quedan: 600 }; return movil.codigo;
        case "movil_avisar": return movil.avisos;
        case "movil_olvidar": movil.dispositivos = movil.dispositivos.filter((d) => d.id !== args.id); return JSON.parse(JSON.stringify(movil));
        case "movil_tailscale": {
          const base = { instalado: true, conectado: true, llevado: false, direccion: "https://portatil-munito.tail4c2e1.ts.net:8443", ajeno: null, denegado: false, salida: "" };
          if (window.__ts === "falta") return { ...base, instalado: false, conectado: false, direccion: null };
          if (window.__ts === "sin-sesion") return { ...base, conectado: false, direccion: null };
          if (window.__ts === "ajeno") return tarde(700, { ...base, ajeno: "/ → http://127.0.0.1:5173" });
          if (window.__ts === "denegado") return tarde(700, { ...base, denegado: args.conectar, salida: args.conectar ? "sending serve config: Access denied: serve config denied" : "" });
          if (window.__tsPuesto) return tarde(300, { ...base, llevado: true });
          if (!args.conectar) return tarde(300, base);
          if (!window.__tsYaPidio) {
            window.__tsYaPidio = true;
            return tarde(700, { ...base, salida: "Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=nXk3pQ7CNTRL" });
          }
          window.__tsPuesto = true;
          return tarde(700, { ...base, llevado: true });
        }
        case "sacar_panel":
        case "conserje_parar":
        case "pty_write":
        case "pty_send":
        case "pty_kill":
        case "pty_resize":
        case "save_encargo":
          return null;
        // Las sembradas a mano pueden traer `estado`, `live`, `hours` y `mtime`
        // (para la barra: el orden por quién te reclama y el círculo hueco).
        case "scan_sessions":
          return window.__sesiones.map((s) => ({
            id: s.id, title: s.title, state: s.estado ?? "a_medias", fresh: "activa", hours: s.hours ?? 0, ago: s.ago ?? "ahora",
            mtime: s.mtime, cwd: s.cwd, resumeCwd: s.cwd, project: s.project, folder: s.cwd, live: s.live ?? true, sizeKb: 3,
            agentsLive: 0, agentsTotal: 0, fuente: "claude",
          }));
        case "session_messages":
          return [
            { rol: "tu", texto: "Que el scroll de las terminales no salte al cambiar el ancho", hora: "", herramientas: [] },
            { rol: "agente", texto: "Lo reproduzco antes de tocar nada: con el panel a 180 columnas y bajándolo a 73, la distancia al final pasa de 0 a 332.", hora: "", herramientas: ["Read", "Grep"] },
            // Una respuesta larga, para ver la pregunta pegada arriba al bajar.
            { rol: "tu", texto: "Y de paso mira por qué el radar se cae cada dos horas", hora: "", herramientas: [] },
            { rol: "agente", texto: Array.from({ length: 40 }, (_, i) => `Paso ${i + 1}: miro el registro de las ${i}:00 y anoto lo que pasó justo antes de la caída.`).join("\n\n"), hora: "", herramientas: ["Read"] },
          ];
        // Lo último que contestó el agente de un panel: lo que una flecha del
        // lienzo le entrega al siguiente. Se siembra en `window.__respuesta`.
        case "last_reply": return window.__respuesta ?? "";
        // Las reglas del router que habría en la memoria de la casa: se siembran
        // en `window.__reglas` como líneas crudas, igual que las da Rust.
        case "memoria_reglas_router": return (window.__reglas ?? []).map((linea) => ({ linea, nota: "Nota de prueba", proyecto: "C:\\proyectos\\Adeorq" }));
        // El porcentaje de contexto se siembra con `window.__ctxPercent`, para
        // ver el aviso de sesión cargada y su botón de compactar.
        case "session_context":
          // Y el estado del panel con `window.__estadoPanel` («a_medias» si no
          // se dice), para ver a la tarjeta de actualizar esperando a un agente.
          return { model: "opus", used: Math.round((window.__ctxPercent ?? 4) * 10000), window: 1000000, percent: window.__ctxPercent ?? 4, agentsLive: 0, agentsTotal: 0, sessionId: args.sessionId, folder: args.cwd, state: window.__estadoPanel ?? "a_medias" };
        // La actualización (decisión C3): con `window.__actualizacion = "9.9.9"`
        // el comprobador dice que hay una; instalar y reiniciar solo quedan
        // apuntados en `__llamadas`, que es lo que se mira.
        case "plugin:updater|check":
          return window.__actualizacion
            ? { rid: 7, available: true, currentVersion: "0.9.164", version: window.__actualizacion, date: null, body: "", rawJson: {} }
            : null;
        case "plugin:updater|download_and_install": return null;
        case "plugin:process|restart": return null;
        case "plugin:resources|close": return null;
        // La Memoria, con una bóveda de tres notas enlazadas: lo justo para que
        // el Cerebro pinte su bola (hay que sembrar `adeorq-boveda` en
        // localStorage DESPUÉS de este guion, que lo vacía al cargar).
        case "memoria_vaults": return [{ path: "C:\\proyectos\\memoria", name: "memoria", docs: 3, abierta: false }];
        case "memoria_scan": return { root: args.root, vistos: 3, obsidian: false, docs: [
          // Tres carpetas distintas: con una sola, el Cerebro no enseña su panel de mandos.
          { id: "radar", title: "El radar", folder: "radar-bot", stamp: 1, words: 120, links: ["scroll"] },
          { id: "scroll", title: "El scroll", folder: "Adeorq", stamp: 1, words: 80, links: ["radar", "movil"] },
          { id: "movil", title: "El móvil", folder: "Vidorq", stamp: 1, words: 60, links: [] },
        ] };
        case "memoria_read": return { id: args.id, text: `# ${args.id}\n\nUna nota de prueba.`, stamp: 1, path: `C:\\proyectos\\memoria\\${args.id}.md`, origen: null };
        case "memoria_write": return { id: args.id, text: args.text, stamp: args.stamp + 1, path: `C:\\proyectos\\memoria\\${args.id}.md`, origen: null };
        case "memoria_search": return [];
        // Las skills de ~/.claude/skills, sembradas en `window.__skills` (con
        // `{ folder: "fin" }` el traspaso antes de compactar manda `/fin`).
        case "list_skills": return JSON.parse(JSON.stringify(window.__skills ?? []));
        // El plan del Capataz, sembrado en `window.__planCapataz` como el objeto
        // `{ resumen, acciones }` que escribe el modelo: así se ve la lista
        // revisada (y sus cerebros) sin gastar una llamada a `claude -p`.
        case "foreman_plan": return JSON.stringify(window.__planCapataz ?? { resumen: "", acciones: [] });
        // ¿Contesta ese puerto? Los de `window.__puertosVivos` sí (ninguno si no
        // se dice), para ver la pregunta de abrir la web al levantar un servidor.
        case "puerto_escucha": return (window.__puertosVivos ?? []).includes(args.puerto);
        // Los clientes del MCP y su escalón (decisión D1), sembrados en
        // `window.__clientesMcp` con la forma que devuelve Rust.
        case "mcp_clientes_leer": return JSON.parse(JSON.stringify(window.__clientesMcp ?? []));
        case "mcp_clientes_poner": {
          const lista = window.__clientesMcp ?? [];
          for (const c of lista) {
            if (c.nombre !== args.nombre) continue;
            c.nivel = args.nivel ?? (c.nombre.toLowerCase().includes("claude") ? "auto" : "plan");
            c.fabrica = args.nivel == null;
          }
          return JSON.parse(JSON.stringify(lista));
        }
        default:
          throw new Error(`sin doble: ${cmd}`);
      }
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: (cmd, args) => Promise.resolve().then(() => contestar(cmd, args)),
        transformCallback: (cb) => {
          const id = Math.floor(Math.random() * 1e9);
          window[`_${id}`] = cb;
          return id;
        },
        convertFileSrc: (ruta) => `http://localhost:1420/__fondo/${encodeURIComponent(ruta)}`,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      },
    });
  });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(2000);
  const chat = page.locator('button:has-text("beta")').first();
  if (await chat.count()) await chat.click();
  await page.waitForTimeout(800);
  return await page.title();
}
