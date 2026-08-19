// La forma de las terminales: pegadas, con las esquinas suaves, o sueltas.
//
// Adeorq nació con las terminales como un mosaico pegado, sin esquinas, y eso
// era una decisión razonable: cada píxel de una terminal es texto que se lee.
// Pero Munir trajo una referencia el 2026-08-19 (BridgeMind) donde cada panel es
// una tarjeta con su hueco y su sombra, y al verlo eligió eso. Así que ahora es
// un ajuste y no una decisión: las dos formas tienen razón según el día, y esto
// no cambia lo que Adeorq hace, solo cómo se ve.
//
// ── EL HUECO SE COME POR DENTRO, Y NO ES UN CAPRICHO ──────────────────────
//
// Los paneles se colocan con `position: absolute` y las cuatro medidas en
// PORCENTAJES, y esas medidas las escribe `App.tsx` en el `style` del elemento.
// Un estilo en línea gana a cualquier hoja de estilos, así que desde el CSS no
// se puede encoger un panel para dejar hueco entre dos.
//
// La salida es un BORDE TRANSPARENTE. Con `box-sizing: border-box` (que en esta
// app es global) el borde se come del tamaño del propio panel en vez de
// sumarse, así que el panel sigue ocupando su celda exacta y el hueco sale por
// dentro. Medido en un navegador de verdad antes de ofrecerlo: el panel mide
// los mismos 176 px con y sin hueco, y a tamaño real cuesta entre el 2,6 % y el
// 4,3 % del área de terminal.
//
// El `background-clip: padding-box` que lo acompaña es lo que hace que el
// fondo no se meta por debajo del borde transparente. Sin él el hueco se pinta
// del color del panel y no se ve ninguno.

const CLAVE = "adeorq-forma-paneles";

export type FormaPanel = "pegadas" | "suaves" | "tarjetas";

/** Lo elegido, o lo de siempre. */
export function prefForma(): FormaPanel {
  const v = localStorage.getItem(CLAVE);
  return v === "suaves" || v === "tarjetas" ? v : "pegadas";
}

/**
 * Se marca en `<html>`, igual que el modo rendimiento y por lo mismo: así lo ve
 * el CSS entero de una vez, sin que ningún componente tenga que enterarse ni
 * repintarse. La forma de un panel no es estado de React, es un tema.
 */
export function aplicarForma(f: FormaPanel): void {
  if (f === "pegadas") delete document.documentElement.dataset.panes;
  else document.documentElement.dataset.panes = f;
}

export function guardarForma(f: FormaPanel): void {
  localStorage.setItem(CLAVE, f);
  aplicarForma(f);
}
