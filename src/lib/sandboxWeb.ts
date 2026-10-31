/**
 * El `sandbox` de los iframes donde Adeorq pinta una web (`CanvasWeb.tsx` y,
 * en Linux, las pestañas de `Navegador.tsx`).
 *
 * Sin él, una web cualquiera abierta en el lienzo podía llevarse la ventana
 * ENTERA de Adeorq a otra dirección con un clic (`top.location`): medido el
 * 2026-10-31 con `scripts/laboratorio/csp-ventana.mjs`, la ventana cargó la
 * página de la web y dejó de ser Adeorq. Por eso falta `allow-top-navigation`,
 * y también su variante «con gesto».
 *
 * Lo demás se le deja a la web, y el laboratorio lo comprueba con clics de
 * verdad: sus scripts y su almacenamiento (`allow-same-origin`, que en otro
 * origen que Adeorq no le da nada de Adeorq), formularios, descargas, ventanas
 * emergentes que se abren sin heredar la jaula, `alert` y `confirm`, pantalla
 * completa de un vídeo y bloqueo del ratón de un juego.
 */
export const SANDBOX_WEB = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-downloads",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-presentation",
  "allow-pointer-lock",
].join(" ");
