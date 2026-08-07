// Un `setInterval` que no trabaja mientras no miras.
//
// Adeorq pregunta cosas a Rust sin parar: qué suena (4 s), qué CPU gasta cada
// terminal (5 s), cuánta memoria (8 s), qué sesiones hay (60 s)... Cada
// pregunta cruza el puente al proceso nativo, vuelve, y repinta un trozo de una
// interfaz que son treinta capas de cristal sobre una foto. Con la ventana
// minimizada eso es trabajo que no ve nadie, y en un panel que se deja abierto
// todo el día son miles de vueltas para nada.
//
// El navegador ya frena las ANIMACIONES de una pestaña oculta él solo, pero no
// frena esto: un `setInterval` que llama a Rust sigue saliendo igual.
//
// Al volver se pregunta EN EL ACTO, sin esperar al siguiente turno: lo que no
// puede pasar es que destapes la ventana y veas datos de hace media hora.

/**
 * Como `setInterval`, pero salta los turnos que caen con la ventana oculta y se
 * pone al día en cuanto vuelve. Devuelve la función para pararlo.
 *
 * `alVolver` por defecto es `true`. Ponlo a `false` cuando el trabajo sea caro
 * de verdad (lanzar un proceso, por ejemplo) y puedas esperar al turno normal.
 */
export function latido(fn: () => void, ms: number, alVolver = true): () => void {
  let ultimo = Date.now();

  const tick = () => {
    if (document.hidden) return;
    ultimo = Date.now();
    fn();
  };

  const id = window.setInterval(tick, ms);

  const alCambiar = () => {
    if (document.hidden || !alVolver) return;
    // Solo si de verdad se ha perdido un turno: destapar la ventana un segundo
    // después de un tick no tiene por qué disparar otro.
    if (Date.now() - ultimo >= ms) tick();
  };
  document.addEventListener("visibilitychange", alCambiar);

  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", alCambiar);
  };
}
