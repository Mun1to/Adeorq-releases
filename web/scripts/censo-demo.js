/* ============================================================================
   Adeorq · web/scripts/censo-demo.js
   EL CENSO DE BOTONES MUDOS DE LA DEMOSTRACIÓN.

   Recorre las diez vistas de `web/demo/` en español y en inglés, pulsa TODOS los
   botones que se ven y apunta los que no hacen nada: ni cambian la ventana, ni
   mueven una hoja, ni sacan su aviso. En una demostración que dice «pruébalo
   aquí mismo», un botón mudo es peor que no ponerlo, y a ojo no se cazan: son
   más de trescientos setenta por idioma.

   Lo que sale en la lista y NO es un fallo: lo que ya estaba elegido (la
   pestaña abierta, la herramienta puesta) y los atajos que llevan a una
   tarjeta que ya se ve entera. Todo lo demás, sí.

   No es un script de Node: es la función que ejecuta el navegador del banco
   (el MCP de Playwright), y se lanza con el servidor de la web levantado
   (`pnpm exec vite --port 5199` en `web/`):

     browser_run_code_unsafe(filename = "web/scripts/censo-demo.js")

   Va por `demo.localhost` y no por `localhost` porque el perfil del banco tiene
   el zoom cambiado en ese origen y la ventana no mediría 1920 px.
   ========================================================================= */
async (page) => {
  const BASE = 'http://demo.localhost:5199/demo/';
  const VISTAS = ['cabina', 'panel', 'chat', 'agenda', 'decisiones', 'lienzo', 'memoria', 'cuentas', 'comandos', 'ajustes'];
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e.stack || e.message).slice(0, 400)));
  await page.setViewportSize({ width: 1920, height: 1080 });

  const salida = {};
  for (const idioma of ['es', 'en']) {
    const mudos = [];
    let pulsados = 0;
    for (const vista of VISTAS) {
      await page.goto(`${BASE}?vista=${vista}${idioma === 'en' ? '&lang=en' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.adeDemo, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      const r = await page.evaluate(async (v) => {
        const raiz = document.getElementById('root');
        const visibles = () => [...raiz.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
        // La ventana sin lo que se mueve solo (el orbe, y la marca de «enviado»
        // de un comando, que se apaga con un reloj), más por dónde va cada hoja.
        const foto = () =>
          raiz.innerHTML.replace(/<span class="orbe"[\s\S]*?<\/span>/g, '').replace(/ data-sent="[a-z]*"/g, '') +
          '|' + document.documentElement.dataset.theme +
          '|' + [...raiz.querySelectorAll('.set-hoja, .dec-doc, .dec-hoja, .mem-doc, .panel')].map((e) => e.scrollTop).join(',');
        const mudos = [];
        let n = visibles().length, pulsados = 0;
        for (let i = 0; i < n && i < 600; i++) {
          const b = visibles()[i];
          if (!b) break;
          // Las pestañas de arriba cambian de vista y el idioma recarga la página.
          if (b.matches('nav.tabs .tab') || /^(inglés|english|español|spanish)$/i.test(b.textContent.trim())) continue;
          const rotulo = (b.dataset.tip || b.getAttribute('aria-label') || b.textContent || b.className).replace(/\s+/g, ' ').trim().slice(0, 50);
          document.querySelector('.demo-aviso')?.remove();
          const antes = foto();
          b.click();
          await new Promise((ok) => setTimeout(ok, 30));
          pulsados++;
          if (foto() === antes) {
            const yaPuesto = b.dataset.on === 'true' || b.dataset.active === 'true';
            mudos.push(`${v} · ${rotulo} [${b.className.split(' ')[0]}${yaPuesto ? ', ya estaba elegido' : ''}]`);
          }
          if (window.adeDemo.estado.vista !== v) window.adeDemo.irA(v);
          n = visibles().length;
        }
        return { mudos, pulsados };
      }, vista);
      pulsados += r.pulsados;
      mudos.push(...r.mudos);
    }
    salida[idioma] = { pulsados, mudos };
  }
  return { ...salida, errores };
}
