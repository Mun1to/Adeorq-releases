"""Lee el localStorage de la Adeorq de Munir sin abrirla: de una COPIA de su leveldb.

Nació el 2026-10-21: «no se mueven las notas ni las capturas del lienzo» llevaba
días sin reproducirse en ningún banco, y la causa era un ajuste guardado en SU
navegador (`adeorq-lienzo-modo = dibujo`) que ninguna prueba podía ver. Las
claves antiguas van en tablas .ldb comprimidas con Snappy, así que un grep no
las encuentra; esto las descomprime a mano, sin dependencias. Solo lee las .ldb:
lo más reciente puede estar aún en el .log, que se mira con un grep -a.

    cp -r "$LOCALAPPDATA/com.orquio.adeorq/EBWebView/Default/Local Storage/leveldb" <scratchpad>/ls
    python -I scripts/laboratorio/leer-localstorage.py <scratchpad>/ls adeorq-lienzo

(El LOCK no se copia con la app abierta, y no hace falta.) Las claves de la app
instalada son las de `tauri.localhost`; las de `localhost:1420`, de la de
desarrollo. Gana la de `seq` más alta.
"""
import os
import struct
import sys


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if c < 0x80:
            return r, i
        s += 7


def snappy(b):
    n, i = varint(b, 0)
    out = bytearray()
    while i < len(b):
        tag = b[i]
        i += 1
        t = tag & 3
        if t == 0:
            ln = tag >> 2
            if ln >= 60:
                k = ln - 59
                ln = int.from_bytes(b[i:i + k], "little")
                i += k
            ln += 1
            out += b[i:i + ln]
            i += ln
            continue
        if t == 1:
            ln = ((tag >> 2) & 7) + 4
            off = ((tag >> 5) << 8) | b[i]
            i += 1
        elif t == 2:
            ln = (tag >> 2) + 1
            off = int.from_bytes(b[i:i + 2], "little")
            i += 2
        else:
            ln = (tag >> 2) + 1
            off = int.from_bytes(b[i:i + 4], "little")
            i += 4
        for _ in range(ln):
            out.append(out[-off])
    return bytes(out)


def bloque(datos, off, size):
    crudo = datos[off:off + size]
    tipo = datos[off + size]
    return snappy(crudo) if tipo == 1 else crudo


def entradas(b):
    if len(b) < 4:
        return
    nrest = struct.unpack("<I", b[-4:])[0]
    fin = len(b) - 4 - 4 * nrest
    i = 0
    clave = b""
    while i < fin:
        comp, i = varint(b, i)
        nocomp, i = varint(b, i)
        vlen, i = varint(b, i)
        clave = clave[:comp] + b[i:i + nocomp]
        i += nocomp
        valor = b[i:i + vlen]
        i += vlen
        yield clave, valor


def tabla(ruta):
    datos = open(ruta, "rb").read()
    pie = datos[-48:]
    _, i = varint(pie, 0)
    _, i = varint(pie, i)
    ioff, i = varint(pie, i)
    isize, i = varint(pie, i)
    for _, h in entradas(bloque(datos, ioff, isize)):
        off, j = varint(h, 0)
        size, _ = varint(h, j)
        yield from entradas(bloque(datos, off, size))


def texto(v):
    if not v:
        return ""
    if v[0] == 0:
        return v[1:].decode("utf-16-le", "replace")
    return v[1:].decode("latin-1", "replace")


def main():
    carpeta, filtro = sys.argv[1], sys.argv[2].encode()
    vistos = {}
    for nombre in sorted(os.listdir(carpeta)):
        if not nombre.endswith(".ldb"):
            continue
        try:
            for k, v in tabla(os.path.join(carpeta, nombre)):
                if filtro in k:
                    # Las claves internas llevan 8 bytes de secuencia y tipo al final.
                    k2 = k[:-8]
                    seq = struct.unpack("<Q", k[-8:])[0] >> 8
                    if k2 not in vistos or seq > vistos[k2][0]:
                        vistos[k2] = (seq, texto(v), nombre)
        except Exception as e:  # una tabla rara no para el resto
            print("no pude leer", nombre, e)
    for k, (seq, v, n) in sorted(vistos.items()):
        print(k[-40:], "| seq", seq, "|", n, "|", v[:120])


main()
