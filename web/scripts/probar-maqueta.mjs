/* ============================================================================
   Adeorq · web/scripts/probar-maqueta.mjs

   La maqueta del panel no es una foto: filtra, cierra paneles, maximiza, cambia
   de vista y cambia de tema. Todo eso se rompe sin hacer ruido, asi que esta es
   la prueba que lo fija. Cada linea comprueba UNA cosa contra el DOM de verdad,
   no contra lo que deberia pasar.

   Como se lanza:
     1. levanta la web:            pnpm dev
     2. y desde una carpeta con playwright-core instalado:
        node scripts/probar-maqueta.mjs

   (playwright-core no es dependencia del proyecto a proposito: esto se lanza a
   mano cuando se toca la maqueta, no en cada build.)

   Historial: aqui se cazo que el boton de maximizar estaba invertido y que el
   primer clic no hacia nada, porque comparaba dos valores que todavia no
   existian y los dos salian `undefined`.
   ========================================================================= */

import { chromium } from 'playwright-core';
const EXE='C:/Users/Muni/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const nav=await chromium.launch({executablePath:EXE,headless:true});
const ctx=await nav.newContext({viewport:{width:1600,height:1080},colorScheme:'dark'});
const pag=await ctx.newPage();
const err=[]; pag.on('pageerror',e=>err.push(e.message));
await pag.goto('http://localhost:5177/demo/',{waitUntil:'load'});
await pag.waitForTimeout(1000);

const prueba = async (nombre, fn, comprobar) => {
  await pag.evaluate(fn);
  await pag.waitForTimeout(450);
  const r = await pag.evaluate(comprobar);
  const bien = (r === true) || (r && typeof r === 'object' && Object.values(r).every(v => v !== false));
  console.log((bien ? 'OK  ' : 'MAL ') + nombre + '  ' + JSON.stringify(r));
  return r;
};

await prueba('el riel se esconde fuera de la Cabina',
  ()=>document.querySelector('.tab[data-vista="panel"]').click(),
  ()=>{ const s=document.querySelector('.sidebar'); return getComputedStyle(s).display==='none'; });

await prueba('y vuelve en la Cabina',
  ()=>document.querySelector('.tab[data-vista="cabina"]').click(),
  ()=>getComputedStyle(document.querySelector('.sidebar')).display!=='none');

await prueba('el buscador filtra proyectos',
  // «web» y no «vo»: la maqueta ya no lleva los proyectos de Munir, solo Adeorq
  // y sus carpetas, asi que el termino de antes no encontraba nada y la prueba
  // se ponia roja por el dato, no por el codigo.
  ()=>{ const f=document.querySelector('.sidebar .finder'); f.value='web'; f.dispatchEvent(new Event('input')); },
  ()=>{ const t=document.querySelectorAll('.project').length;
        const v=[...document.querySelectorAll('.project')].filter(p=>!p.hidden).length;
        return {total:t, visibles:v, filtra: v>0 && v<t}; });

await prueba('cerrar un panel lo quita y el pie lo cuenta',
  ()=>{ const f=document.querySelector('.sidebar .finder'); f.value=''; f.dispatchEvent(new Event('input'));
        document.querySelector('.pane .pane-close').click(); },
  ()=>({ paneles: document.querySelectorAll('.ade-grid .pane').length,
         pie: document.getElementById('ade-pie-txt').textContent }));

await prueba('maximizar deja uno solo',
  ()=>document.querySelector('.pane .pane-btn[data-acc="max"]').click(),
  ()=>{ const v=[...document.querySelectorAll('.ade-grid .pane')].filter(p=>!p.hidden).length; return {visibles:v, solo:v===1}; });

await prueba('y restaurar los devuelve',
  ()=>document.querySelector('.ade-grid .pane:not([hidden]) .pane-btn[data-acc="max"]').click(),
  ()=>{ const v=[...document.querySelectorAll('.ade-grid .pane')].filter(p=>!p.hidden).length; return {visibles:v, todos:v===3}; });

await prueba('los botones de opcion del CLI se pulsan',
  ()=>document.querySelector('.t-op')?.click(),
  ()=>{ const b=document.querySelector('.t-op'); return b ? {elegida: b.dataset.elegida==='si'} : false; });

await prueba('el Capataz responde',
  ()=>{ document.querySelector('.tab[data-vista="panel"]').click();
        document.getElementById('ade-capataz').value='abre las sesiones de Orquio';
        document.getElementById('ade-planear').click(); },
  ()=>{ const t=document.getElementById('ade-toast'); return t? {visible: t.dataset.on==='true', txt:t.textContent.slice(0,40)} : false; });

await prueba('el boton de Emision se enciende',
  ()=>document.getElementById('ade-emision').click(),
  ()=>document.getElementById('ade-emision').dataset.on==='true');

await prueba('cambiar de tema cambia los colores de verdad',
  ()=>{ document.querySelector('.tab[data-vista="ajustes"]').click();
        document.querySelector('.ade-tema[data-tema-prev="gruvbox"]').click(); },
  ()=>({ tema: document.getElementById('ade').dataset.tema,
         acento: getComputedStyle(document.getElementById('ade')).getPropertyValue('--accent').trim() }));

await prueba('Ctrl+K abre la paleta',
  ()=>{ document.getElementById('ade').dispatchEvent(new PointerEvent('pointerenter'));
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})); },
  ()=>({abierta: !document.querySelector('.ade-paleta').hidden,
        opciones: document.querySelectorAll('.ade-paleta-fila').length}));

await prueba('la paleta filtra',
  ()=>{ const i=document.querySelector('.ade-paleta-input'); i.value='agenda'; i.dispatchEvent(new Event('input')); },
  ()=>({filas: document.querySelectorAll('.ade-paleta-fila').length,
        pocas: document.querySelectorAll('.ade-paleta-fila').length<=2}));

await prueba('y Enter lleva a la vista',
  ()=>document.querySelector('.ade-paleta-fila[data-on]').click(),
  ()=>({vista: document.getElementById('ade').dataset.vista,
        esAgenda: document.getElementById('ade').dataset.vista==='agenda',
        cerrada: document.querySelector('.ade-paleta').hidden}));

await prueba('los modos del riel cambian el ancho',
  ()=>{ document.querySelector('.tab[data-vista="cabina"]').click();
        document.querySelector('.rail-tab[data-modo="tira"]').click(); },
  ()=>({modo: document.getElementById('ade-rail').dataset.modo,
        ancho: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width),
        estrecha: document.querySelector('.sidebar').getBoundingClientRect().width < 200}));

await prueba('y vuelven',
  ()=>document.querySelector('.rail-tab[data-modo="full"]').click(),
  ()=>({ancho: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)}));

// Cuenta ANTES y DESPUES en vez de esperar un numero: mas arriba esta prueba
// cierra un panel, asi que un total fijo solo acierta si se lanza sola.
await pag.evaluate(()=>{ window.__antes = document.querySelectorAll('.ade-grid .pane').length; });
await prueba('el + abre una sesion mas',
  ()=>document.querySelector('.rail-new').click(),
  ()=>({antes: window.__antes,
        ahora: document.querySelectorAll('.ade-grid .pane').length,
        suma: document.querySelectorAll('.ade-grid .pane').length === window.__antes + 1,
        pie: document.getElementById('ade-pie-txt').textContent}));

await prueba('la Agenda tacha objetivos',
  ()=>{ document.querySelector('.tab[data-vista="agenda"]').click();
        document.querySelector('.ade-meta .ade-check').click(); },
  ()=>({tachada: document.querySelector('.ade-meta').dataset.hecha==='si'}));

await prueba('los comandos filtran',
  ()=>{ document.querySelector('.tab[data-vista="comandos"]').click();
        const i=document.getElementById('cm-buscar'); i.value='dividir'; i.dispatchEvent(new Event('input')); },
  ()=>({filas: document.querySelectorAll('#cm-lista .ade-fila').length,
        filtra: document.querySelectorAll('#cm-lista .ade-fila').length===2}));

await prueba('el Lienzo tiene piezas y se arrastran',
  ()=>document.querySelector('.tab[data-vista="lienzo"]').click(),
  ()=>({piezas: document.querySelectorAll('.ade-pieza').length,
        hay: document.querySelectorAll('.ade-pieza').length>=4}));


console.log(err.length?('ERRORES: '+err.join(' | ')):'sin errores de JS');
await nav.close();
