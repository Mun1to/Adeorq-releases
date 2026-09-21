"""Quita de ~/.claude.json el `fullscreenAutoDisabled` que dejaron los bancos de
Adeorq al matar Claude Code en seco.

Claude Code marca cada arranque en fullscreen como «pendiente» y lo borra al
salir bien; un proceso matado deja esa marca huerfana, y el arranque siguiente la
cuenta como un fallo. Dos de esos y apaga el renderizador fullscreen en la
maquina entera (`fullscreenAutoDisabled`). Los bancos de `pty.rs` mataban el
proceso con taskkill, asi que los strikes eran nuestros, no suyos.

Toca UNA sola clave y deja copia al lado. No se ejecuta solo: se llama a mano.
"""
import json
import os
import shutil
import sys
import datetime

p = os.path.join(os.environ["USERPROFILE"], ".claude.json")
d = json.load(open(p, encoding="utf-8"))
f = d.get("fullscreenAutoDisabled")
if not f:
    print("no hay fullscreenAutoDisabled: nada que restaurar")
    sys.exit(0)

copia = p + ".antes-de-restaurar-fullscreen"
if not os.path.exists(copia):
    shutil.copy2(p, copia)

cuando = datetime.datetime.fromtimestamp(f.get("at", 0) / 1000).strftime("%Y-%m-%d %H:%M:%S")
del d["fullscreenAutoDisabled"]
tmp = p + ".tmp-adeorq"
with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(d, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
# Se valida ANTES de pisar el bueno: un .claude.json roto deja a Claude Code sin
# cuentas, sin proyectos y sin historial.
json.load(open(tmp, encoding="utf-8"))
os.replace(tmp, p)
print(f"quitado fullscreenAutoDisabled (strikes={f.get('strikes')}, puesto el {cuando})")
print(f"copia en {copia}")
print("claves:", len(d))
