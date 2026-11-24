/* ============================================================================
   Adeorq · demo/logos.js
   LOS LOGOS DE LOS PROYECTOS DE SAM.

   En la app, un proyecto que tiene imagen propia (un favicon, el logo de su
   carpeta `brand/`) sale con ella en la barra, la Agenda y el Chat, y solo el
   que no tiene ninguna sale con sus iniciales (`ProjectAvatar.tsx`). Los seis
   proyectos de la demostración son inventados, así que el volcado los trae con
   iniciales («SA», «IC»…). Aquí cada uno recibe un logo dibujado a propósito
   para la demo: ninguno es la marca de nadie.

   `ponerLogos` hace lo mismo que la app con una imagen: la chapa pasa a
   `data-plate="none"` y dentro va un <img>, así que su propia hoja de estilos
   (`.pavatar img`, el hueco de cada tamaño) lo coloca igual que en la app.
   ========================================================================= */

const svg = (cuerpo) =>
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${cuerpo}</svg>`);

/** Una tienda: la bolsa, con la sonrisa de quien ha comprado. */
const TIENDA = svg(
  '<path d="M11 11.5V9.4a5 5 0 0 1 10 0v2.1" fill="none" stroke="#FDBA5C" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M6.4 11.4h19.2l-1.5 14.3a2.6 2.6 0 0 1-2.6 2.3H10.5a2.6 2.6 0 0 1-2.6-2.3Z" fill="#F29A38"/>' +
    '<path d="M12 18.6c1.2 1.6 2.5 2.4 4 2.4s2.8-.8 4-2.4" fill="none" stroke="#FFF3E0" stroke-width="2.3" stroke-linecap="round"/>',
);

/** Facturas desde la terminal: el tique con su borde roto y el aviso de una orden. */
const FACTURAS = svg(
  '<path d="M8 4.5h16a1.5 1.5 0 0 1 1.5 1.5V28l-3.17-1.9-3.17 1.9-3.17-1.9-3.17 1.9-3.17-1.9-3.15 1.9V6A1.5 1.5 0 0 1 8 4.5Z" fill="#2FB985"/>' +
    '<path d="M11 10.6l3.6 3.1-3.6 3.1" fill="none" stroke="#ECFFF6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M16.8 18.4h5" stroke="#ECFFF6" stroke-width="2.4" stroke-linecap="round"/>',
);

/** La web de la documentación: un libro abierto. */
const DOCUMENTOS = svg(
  '<path d="M16 8.6C13.2 6.7 9.6 6.1 5.4 6.4v17.4c4.2-.3 7.8.3 10.6 2.2Z" fill="#5E86F5"/>' +
    '<path d="M16 8.6c2.8-1.9 6.4-2.5 10.6-2.2v17.4c-4.2-.3-7.8.3-10.6 2.2Z" fill="#9CB5FF"/>' +
    '<path d="M8.4 11.4c2.2-.1 4 .3 5.4 1M8.4 15.4c2.2-.1 4 .3 5.4 1" fill="none" stroke="#E9EFFF" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M18.2 12.4c1.4-.7 3.2-1.1 5.4-1" fill="none" stroke="#3E63D6" stroke-width="1.8" stroke-linecap="round"/>',
);

/** Los colores y medidas del sistema de diseño: tres muestras que se mezclan. */
const MUESTRAS = svg(
  '<circle cx="12" cy="12.4" r="7" fill="#FF7B6B"/>' +
    '<circle cx="20" cy="12.4" r="7" fill="#FFC857" fill-opacity=".9"/>' +
    '<circle cx="16" cy="19.4" r="7" fill="#8C7CFF" fill-opacity=".86"/>',
);

/** La web que se lanza: un cohete. */
const COHETE = svg(
  '<path d="M9.9 16.2 6.4 20.6l1 3.8 4.1-2.9ZM22.1 16.2l3.5 4.4-1 3.8-4.1-2.9Z" fill="#1A9A8D"/>' +
    '<path d="M16 3.4c4.7 3 6.7 7.6 6.3 13.4l-2.7 3.7h-7.2l-2.7-3.7C9.3 11 11.3 6.4 16 3.4Z" fill="#2CC7B6"/>' +
    '<circle cx="16" cy="12" r="2.7" fill="#E4FFFA"/>' +
    '<path d="M13.6 22.4h4.8L16 28.6Z" fill="#FDBA5C"/>',
);

/** La app del móvil: el teléfono con su pantalla. */
const TELEFONO = svg(
  '<rect x="8.8" y="3.4" width="14.4" height="25.2" rx="3.3" fill="#A58AF8"/>' +
    '<rect x="10.9" y="6.9" width="10.2" height="16.6" rx="1.5" fill="#2A2060"/>' +
    '<path d="M13.4 11.4h5.2M13.4 15h3.6" stroke="#D8CBFF" stroke-width="1.9" stroke-linecap="round"/>' +
    '<circle cx="16" cy="26" r="1.15" fill="#EEE8FF"/>',
);

/** Por el nombre del proyecto, y por sus iniciales tal como las pinta la app
 *  (`initials` en ProjectAvatar.tsx): es lo único que trae cada chapa. */
export const LOGOS = {
  'storefront-api': TIENDA,
  'invoice-cli': FACTURAS,
  'docs-site': DOCUMENTOS,
  'design-tokens': MUESTRAS,
  'landing-web': COHETE,
  'mobile-app': TELEFONO,
};

const POR_INICIALES = {
  SA: TIENDA,
  IC: FACTURAS,
  DS: DOCUMENTOS,
  DT: MUESTRAS,
  LW: COHETE,
  MA: TELEFONO,
};

/** Cambia las iniciales por el logo en todo lo que cuelga de `desde`: la
 *  ventana y, para que lo que sale de una plantilla ya nazca con él, el
 *  contenido de cada <template>. */
export function ponerLogos(desde) {
  for (const chapa of desde.querySelectorAll('.pavatar[data-plate="tint"]')) {
    const logo = POR_INICIALES[chapa.textContent.trim()];
    if (!logo) continue;
    const img = document.createElement('img');
    img.src = logo;
    img.alt = '';
    img.draggable = false;
    chapa.replaceChildren(img);
    chapa.dataset.plate = 'none';
  }
  for (const t of desde.querySelectorAll('template')) ponerLogos(t.content);
}
