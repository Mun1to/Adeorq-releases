#!/bin/bash
# Se hace `source` al principio de cada prueba de E18. Deja el entorno SIN nada de WSLg
# (que comparte ventanas y portapapeles con el Windows de Munir) y se NIEGA a seguir si
# queda algo que apunte a el. Uso:  source aislar.sh   (devuelve 1 si no esta aislado)

# El bus de sesion se conserva solo si es uno que acaba de crear `dbus-run-session` (abstract en /tmp/dbus-...).
case "$DBUS_SESSION_BUS_ADDRESS" in unix:abstract=/tmp/dbus-*|unix:path=/tmp/dbus-*) ;; *) unset DBUS_SESSION_BUS_ADDRESS;; esac
unset DISPLAY WAYLAND_DISPLAY WAYLAND_SOCKET PULSE_SERVER XAUTHORITY
export XDG_RUNTIME_DIR="$(mktemp -d /tmp/e18-xdg.XXXXXX)"
chmod 700 "$XDG_RUNTIME_DIR"
# Sin las carpetas de Windows en el PATH: ni cmd.exe, ni clip.exe, ni el copilot de Munir.
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd:)"

aislado_o_morir() {
  local mal=0
  [ -n "$DISPLAY" ] && [ "$DISPLAY" != ":77" ] && [ "$DISPLAY" != ":78" ] && { echo "NO AISLADO: DISPLAY=$DISPLAY"; mal=1; }
  [ "$DISPLAY" = ":0" ] && { echo "NO AISLADO: DISPLAY=:0 es el de WSLg"; mal=1; }
  [ "$WAYLAND_DISPLAY" = "wayland-0" ] && { echo "NO AISLADO: WAYLAND_DISPLAY=wayland-0 es el de WSLg"; mal=1; }
  case "$XDG_RUNTIME_DIR" in /mnt/*|/run/user/*) echo "NO AISLADO: XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"; mal=1;; esac
  [ -e "$XDG_RUNTIME_DIR/wayland-0" ] && { echo "NO AISLADO: hay un wayland-0 en $XDG_RUNTIME_DIR"; mal=1; }
  # Si hay un socket de Wayland, tiene que ser UNO PROPIO dentro del runtime propio, nunca el de WSLg.
  if [ -n "$WAYLAND_DISPLAY" ]; then
    [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || { echo "NO AISLADO: no hay socket $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"; mal=1; }
    case "$(readlink -f "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY")" in /mnt/*|/run/*) echo "NO AISLADO: el socket cae en $(readlink -f "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY")"; mal=1;; esac
  fi
  # Ningun enlace del runtime propio puede llevar a /mnt/wslg
  if find "$XDG_RUNTIME_DIR" -maxdepth 1 -type l -lname '/mnt/wslg*' 2>/dev/null | grep -q .; then echo "NO AISLADO: enlace a /mnt/wslg"; mal=1; fi
  [ "$mal" = 1 ] && { echo "Me niego a seguir."; return 1; }
  echo "aislado: DISPLAY=${DISPLAY:-<vacio>} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-<vacio>} XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
  return 0
}
