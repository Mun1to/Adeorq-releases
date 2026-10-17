// Las cajas de un MP4 y la cabecera de un PNG, leídas a mano en Node: lo justo
// para comprobar lo que sale de `lib/exportarTarjeta.ts` sin fiarse de la
// librería que lo escribió. Lo usan `tarjeta-exportar.mjs` (navegador sin
// ventana) y `tarjeta-de-verdad.mjs` (la app).

function cajas(buf, desde = 0, hasta = buf.length) {
  const lista = [];
  for (let p = desde; p + 8 <= hasta; ) {
    let tam = buf.readUInt32BE(p);
    const tipo = buf.toString("latin1", p + 4, p + 8);
    let cab = 8;
    if (tam === 1) {
      tam = Number(buf.readBigUInt64BE(p + 8));
      cab = 16;
    } else if (tam === 0) tam = hasta - p;
    if (tam < cab || p + tam > hasta) break;
    lista.push({ tipo, cuerpo: p + cab, fin: p + tam });
    p += tam;
  }
  return lista;
}
const hijo = (buf, caja, tipo) => caja && cajas(buf, caja.cuerpo, caja.fin).find((c) => c.tipo === tipo);

/** Lo de arriba (`ftyp moov mdat`), la duración, el tamaño, el códec y cuántos fotogramas. */
export function leerMp4(buf) {
  const arriba = cajas(buf);
  const moov = arriba.find((c) => c.tipo === "moov");
  const mvhd = hijo(buf, moov, "mvhd");
  const trak = hijo(buf, moov, "trak");
  const tkhd = hijo(buf, trak, "tkhd");
  const stbl = hijo(buf, hijo(buf, hijo(buf, trak, "mdia"), "minf"), "stbl");
  const stsd = hijo(buf, stbl, "stsd");
  const stsz = hijo(buf, stbl, "stsz");
  const stss = hijo(buf, stbl, "stss");
  if (!mvhd || !tkhd || !stsd || !stsz) return { arriba: arriba.map((c) => c.tipo) };
  const v = buf[mvhd.cuerpo];
  const escala = buf.readUInt32BE(mvhd.cuerpo + (v ? 20 : 12));
  const dur = v ? Number(buf.readBigUInt64BE(mvhd.cuerpo + 24)) : buf.readUInt32BE(mvhd.cuerpo + 16);
  return {
    arriba: arriba.map((c) => c.tipo),
    segundos: dur / escala,
    // El ancho y el alto son las dos últimas palabras del tkhd, en 16.16.
    ancho: buf.readUInt32BE(tkhd.fin - 8) / 65536,
    alto: buf.readUInt32BE(tkhd.fin - 4) / 65536,
    codec: buf.toString("latin1", stsd.cuerpo + 12, stsd.cuerpo + 16),
    muestras: buf.readUInt32BE(stsz.cuerpo + 8),
    claves: stss ? buf.readUInt32BE(stss.cuerpo + 4) : null,
  };
}

/** La firma y el tamaño del IHDR. */
export function leerPng(buf) {
  const firma = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { firma, ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
}
