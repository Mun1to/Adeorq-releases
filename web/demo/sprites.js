/* ============================================================================
   Adeorq · demo/sprites.js
   PEGA LOS DIBUJOS EN LA PAGINA.

   Los iconos y las marcas de CLI viven en dos sprites generados desde `src/`.
   Los iconos pueden usarse como fichero externo (`iconos.svg#i-panel`) porque
   son trazos y nada mas, pero las MARCAS no:

     Codex, Copilot y Qwen se dibujan con una <mask>, y `mask="url(#pm-codex)"`
     se resuelve siempre contra el documento que esta pintando. Desde otro
     fichero no encuentra la mascara, no recorta nada, y lo que sale es el
     rectangulo entero: un cuadrado azul en vez de la nube de Codex.

   Asi que el sprite de marcas se trae y se pega dentro de la pagina. Los
   `<use href="#m-codex">` que ya estan puestos se resuelven solos en cuanto el
   simbolo aparece en el documento, sin repintar nada.
   ========================================================================= */

/* Ruta absoluta del sitio y no `new URL('.', import.meta.url)`: Vite reescribe
   esa forma en su transformación y la deja apuntando a la raíz, así que pedía
   `/marcas.svg` y se llevaba un 404. La maqueta vive siempre en `/demo/`. */
const AQUI = '/demo/';

async function pegar(fichero) {
  const donde = AQUI + fichero;
  try {
    const res = await fetch(donde);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' en ' + donde);
    const caja = document.createElement('div');
    caja.hidden = false;                 // `hidden` esconde, pero tambien anula
    caja.setAttribute('aria-hidden', 'true');
    caja.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    caja.innerHTML = await res.text();
    document.body.prepend(caja);
  } catch (e) {
    console.error('sprites: no se ha podido pegar ' + fichero, e);
  }
}

await pegar('marcas.svg');
