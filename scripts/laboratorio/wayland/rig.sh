#!/bin/bash
# Un compositor de Wayland de usar y tirar para probar Adeorq de verdad, SIN tocar el escritorio de nadie
# (en WSL2, WSLg comparte ventanas y portapapeles con Windows: `aislar.sh` lo deja fuera y se niega a seguir
# si algo apunta a el). Desde WSL, como root:
#
#   weston         anidado en un Xvfb :77 (weston --backend=x11). Entrada con xdotool sobre :77, fotos con
#                  `import`. No ofrece seleccion primaria a `wl-paste`.
#   mutter-headless GNOME de verdad (`mutter --headless`, sin pantalla ni X): la entrada va por D-Bus
#                  (`mutter-mando.py`: RemoteDesktop) y las fotos por ScreenCast + PipeWire. Hace falta
#                  `dnf install mutter python3-gobject pipewire-gstreamer gstreamer1-plugins-good wl-clipboard`.
#   mutter         lo mismo con su visor `mutter-devkit`: NO FUNCIONA aqui (no abre ventana en el Xvfb).
#   kwin           anidado en :77 (kwin_wayland --x11-display): NO FUNCIONA, pide DRI3 y el Xvfb no lo tiene.
#                  Sin pantalla (`--virtual`) falta un cliente de `org_kde_kwin_fake_input`.
#
# Uso: dbus-run-session -- bash rig.sh <compositor> <guion> [argumentos del guion]
# y el guion tipico es `pasada.sh <nombre> <binario> [origen]`, que lanza `../linux-de-verdad.mjs` con
# LAB_WAYLAND y los LAB_* que hagan falta. Lo medido y las trampas, en la memoria `vm_linux_para_probar`.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source $AQUI/aislar.sh
aislado_o_morir || exit 3
COMP=$1; shift
GUION=$1; shift
pgrep -x Xvfb >/dev/null && { echo "ya hay un Xvfb"; exit 4; }
ss -ltn 2>/dev/null | grep -q ':3012 ' && { echo "el 3012 esta cogido"; exit 4; }
SOCK=e18-wl
LOGS=${E18_SALIDA:-/root/e18}/logs-rig; mkdir -p $LOGS
XV=
if [ "$COMP" != mutter-headless ]; then
  Xvfb :77 -screen 0 1700x1100x24 -nolisten tcp >/dev/null 2>&1 &
  XV=$!
  sleep 1.5
  export DISPLAY=:77
fi
aislado_o_morir || { kill $XV; exit 3; }
case $COMP in
  mutter-headless)
    # GNOME sin pantalla ni visor: la entrada va por RemoteDesktop y las fotos por ScreenCast + PipeWire
    # (`mutter-mando.py`, que escucha en $E18_MANDO).
    [ -n "$DBUS_SESSION_BUS_ADDRESS" ] || { echo "mutter necesita dbus-run-session"; exit 2; }
    export LIBGL_ALWAYS_SOFTWARE=1
    pipewire > $LOGS/pipewire.log 2>&1 &
    PW=$!
    wireplumber > $LOGS/wireplumber.log 2>&1 &
    WP=$!
    sleep 2
    mutter --wayland --no-x11 --headless --virtual-monitor 1600x1000 --wayland-display=$SOCK > $LOGS/mutter.log 2>&1 &
    CP=$!
    for i in $(seq 1 60); do [ -S $XDG_RUNTIME_DIR/$SOCK ] && break; sleep 0.5; done
    export E18_MANDO=$XDG_RUNTIME_DIR/mando.sock
    python3 $AQUI/mutter-mando.py $E18_MANDO > $LOGS/mando.log 2>&1 &
    MD=$!
    for i in $(seq 1 60); do [ -S $E18_MANDO ] && break; sleep 0.5; done
    cat $LOGS/mando.log | head -5
    # Sin una primera tecla, el asiento no tiene teclado y `wl-copy` no puede coger el foco para escribir.
    python3 $AQUI/mando.py combo shift >/dev/null; sleep 1;;
  weston)
    weston --backend=x11 --socket=$SOCK --width=1600 --height=1000 --no-config > $LOGS/weston.log 2>&1 &
    CP=$!;;
  mutter)
    # GNOME. Necesita un bus de sesion (se llama dentro de `dbus-run-session`) y PipeWire: el visor
    # (`mutter-devkit`, un GTK4 que enseña el monitor virtual y reenvia la entrada) lee de ahi.
    [ -n "$DBUS_SESSION_BUS_ADDRESS" ] || { echo "mutter necesita dbus-run-session"; kill $XV; exit 2; }
    export GSK_RENDERER=cairo LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=x11
    pipewire > $LOGS/pipewire.log 2>&1 &
    PW=$!
    wireplumber > $LOGS/wireplumber.log 2>&1 &
    WP=$!
    sleep 2
    mutter --wayland --no-x11 --devkit --wayland-display=$SOCK > $LOGS/mutter.log 2>&1 &
    CP=$!;;
  kwin)
    # KDE, anidado en :77 igual que weston (kwin_wayland --x11-display), con su propio bus de sesion.
    [ -n "$DBUS_SESSION_BUS_ADDRESS" ] || { echo "kwin necesita dbus-run-session"; kill $XV; exit 2; }
    export LIBGL_ALWAYS_SOFTWARE=1 KWIN_COMPOSE=Q QT_QPA_PLATFORM=xcb
    kwin_wayland --x11-display :77 --socket $SOCK --width 1600 --height 1000 > $LOGS/kwin.log 2>&1 &
    CP=$!;;
  *) echo "compositor desconocido: $COMP"; kill $XV; exit 2;;
esac
for i in $(seq 1 60); do [ -S $XDG_RUNTIME_DIR/$SOCK ] && break; sleep 0.5; done
[ -S $XDG_RUNTIME_DIR/$SOCK ] || { echo "el compositor no abrio su socket"; tail -20 $LOGS/$COMP.log; kill $CP $XV 2>/dev/null; exit 5; }
sleep 2
export WAYLAND_DISPLAY=$SOCK
aislado_o_morir || { kill $CP $XV 2>/dev/null; exit 3; }
echo "== compositor $COMP en el socket $XDG_RUNTIME_DIR/$SOCK"
wl-paste --list-types 2>&1 | head -2
bash $GUION "$@"
RC=$?
kill $MD 2>/dev/null; kill $CP 2>/dev/null; sleep 1; kill $WP $PW 2>/dev/null; pkill -x mutter-devkit 2>/dev/null; [ -n "$XV" ] && kill $XV 2>/dev/null; pkill -x wl-copy 2>/dev/null
exit $RC
