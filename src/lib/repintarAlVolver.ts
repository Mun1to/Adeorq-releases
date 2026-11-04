// Una terminal que vuelve a verse tiene que pintar otra vez.
//
// WebKitGTK no enseña un lienzo que estuvo en `display:none` hasta que alguien dibuje
// en él, y da igual que sea WebGL o 2D: medido con una página de dos lienzos pintados
// una vez, en WebKitGTK 2.52.5 sobre Xvfb y sobre un Weston sin pantalla (Chromium en
// la misma Xvfb y el WebView2 de Windows conservan el último fotograma). xterm solo
// repinta al volver si algo cambió mientras estaba escondida, así que una terminal
// quieta se quedaba en blanco hasta el primer clic. La que tenía el foco se salvaba
// por el parpadeo de su cursor. Se ve en `scripts/laboratorio/linux-de-verdad.mjs`.
//
// La señal es que su caja pase de medir cero a medir algo, porque cubre las tres formas
// que hay de esconderla: la vista entera, `.pane-hidden` y el panel a tamaño cero.

/** Lo que hay que llamar cada vez que la caja cambia de tamaño: llama a `pintar` solo
 *  cuando vuelve de medir cero. */
export function repintarAlVolver(caja: { clientWidth: number; clientHeight: number }, pintar: () => void): () => void {
  const seVe = () => caja.clientWidth > 0 && caja.clientHeight > 0;
  let seVeia = seVe();
  return () => {
    const ahora = seVe();
    if (ahora && !seVeia) pintar();
    seVeia = ahora;
  };
}
