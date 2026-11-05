#!/usr/bin/env python3
# Demonio de E18: una sesion de RemoteDesktop + ScreenCast de mutter (headless) que recibe ordenes por un
# socket unix y las convierte en teclas, ratón y fotos de la pantalla virtual. No toca nada fuera del bus
# de sesion propio (dbus-run-session) ni del XDG_RUNTIME_DIR propio.
#   mutter-mando.py <ruta del socket>      ordenes: abs x y | move dx dy | btn N 1|0 | click x y [N] |
#                                          key CODIGO 1|0 | combo ctrl+shift+v | shot ruta.png | nodo | quit
import os, socket, subprocess, sys, threading, time
import gi
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib

RUTA = sys.argv[1]
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

def llamar(destino, ruta, interfaz, metodo, params=None, tipo=None):
    return bus.call_sync(destino, ruta, interfaz, metodo, params, GLib.VariantType(tipo) if tipo else None, Gio.DBusCallFlags.NONE, 15000, None)

RD = "org.gnome.Mutter.RemoteDesktop"
SC = "org.gnome.Mutter.ScreenCast"
rd_ruta = llamar(RD, "/org/gnome/Mutter/RemoteDesktop", RD, "CreateSession", None, "(o)").unpack()[0]
sid = llamar(RD, rd_ruta, "org.freedesktop.DBus.Properties", "Get", GLib.Variant("(ss)", (RD + ".Session", "SessionId")), "(v)").unpack()[0]
sc_ruta = llamar(SC, "/org/gnome/Mutter/ScreenCast", SC, "CreateSession", GLib.Variant("(a{sv})", ({"remote-desktop-session-id": GLib.Variant("s", sid)},)), "(o)").unpack()[0]
# cursor-mode 1 = el cursor va dentro de la imagen: asi se ve donde esta en las fotos.
flujo = llamar(SC, sc_ruta, SC + ".Session", "RecordMonitor", GLib.Variant("(sa{sv})", ("Meta-0", {"cursor-mode": GLib.Variant("u", 1)})), "(o)").unpack()[0]

nodo = {"id": None}
def al_flujo(conn, remitente, ruta, interfaz, senal, params, datos):
    nodo["id"] = params.unpack()[0]
bus.signal_subscribe(SC, SC + ".Stream", "PipeWireStreamAdded", flujo, None, Gio.DBusSignalFlags.NONE, al_flujo, None)
loop = GLib.MainLoop()
threading.Thread(target=loop.run, daemon=True).start()
llamar(RD, rd_ruta, RD + ".Session", "Start")
for _ in range(100):
    if nodo["id"] is not None:
        break
    time.sleep(0.1)
print(f"sesion lista: rd={rd_ruta} flujo={flujo} nodo={nodo['id']}", flush=True)

S = RD + ".Session"
def abs_(x, y):
    llamar(RD, rd_ruta, S, "NotifyPointerMotionAbsolute", GLib.Variant("(sdd)", (flujo, float(x), float(y))))
def rel(dx, dy):
    llamar(RD, rd_ruta, S, "NotifyPointerMotionRelative", GLib.Variant("(dd)", (float(dx), float(dy))))
def btn(n, estado):
    llamar(RD, rd_ruta, S, "NotifyPointerButton", GLib.Variant("(ib)", (int(n), bool(estado))))
def key(codigo, estado):
    llamar(RD, rd_ruta, S, "NotifyKeyboardKeycode", GLib.Variant("(ub)", (int(codigo), bool(estado))))

TECLAS = {"ctrl": 29, "shift": 42, "alt": 56, "insert": 110, "return": 28, "escape": 1, "tab": 15, "delete": 111, "space": 57}
for i, c in enumerate("qwertyuiop"): TECLAS[c] = 16 + i
for i, c in enumerate("asdfghjkl"): TECLAS[c] = 30 + i
for i, c in enumerate("zxcvbnm"): TECLAS[c] = 44 + i
BOTON = {1: 272, 2: 274, 3: 273}   # BTN_LEFT, BTN_MIDDLE, BTN_RIGHT segun el numero de xdotool

def combo(texto):
    partes = [TECLAS[p.lower()] for p in texto.split("+")]
    for k in partes: key(k, 1); time.sleep(0.05)
    time.sleep(0.1)
    for k in reversed(partes): key(k, 0); time.sleep(0.05)

def foto(ruta):
    r = subprocess.run(["gst-launch-1.0", "-q", "pipewiresrc", f"path={nodo['id']}", "num-buffers=2", "always-copy=true", "!", "videoconvert", "!", "pngenc", "snapshot=false", "!", "multifilesink", f"location={ruta}.%d"], capture_output=True, text=True, timeout=30)
    # el segundo cuadro es el que ya lleva todo pintado
    for n in (1, 0):
        if os.path.exists(f"{ruta}.{n}"):
            os.replace(f"{ruta}.{n}", ruta)
            break
    for n in (0, 1):
        try: os.remove(f"{ruta}.{n}")
        except FileNotFoundError: pass
    return "ok" if os.path.exists(ruta) else f"sin foto: {r.stderr.strip()[:200]}"

def orden(linea):
    p = linea.split()
    if not p: return "vacio"
    c = p[0]
    if c == "abs": abs_(p[1], p[2])
    elif c == "move": rel(p[1], p[2])
    elif c == "btn": btn(p[1], p[2] == "1")
    elif c == "click":
        # Un movimiento de verdad antes de pulsar: sin el, el clic se pierde (medido: abs + clic seguido no llegaba).
        abs_(p[1], p[2]); time.sleep(0.3)
        rel(1, 0); rel(-1, 0); time.sleep(0.25)
        b = BOTON.get(int(p[3]) if len(p) > 3 else 1, 272)
        btn(b, 1); time.sleep(0.1); btn(b, 0)
    elif c == "key": key(p[1], p[2] == "1")
    elif c == "combo": combo(p[1])
    elif c == "shot": return foto(p[1])
    elif c == "nodo": return str(nodo["id"])
    elif c == "quit":
        os._exit(0)
    else: return f"orden desconocida: {c}"
    return "ok"

try: os.remove(RUTA)
except FileNotFoundError: pass
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(RUTA); srv.listen(4)
print("escuchando", RUTA, flush=True)
while True:
    cli, _ = srv.accept()
    datos = cli.recv(4096).decode().strip()
    try: r = orden(datos)
    except Exception as e: r = f"error: {e}"
    cli.sendall((r + "\n").encode()); cli.close()
