#!/bin/bash
# ¿Funciona `adeorq` tecleado en una terminal del AppImage, en un Linux sin WebKitGTK? Se lanza como root en el
# Fedora de WSL, desde Git Bash:
#
#   MSYS_NO_PATHCONV=1 wsl -d FedoraLinux-44 --user root -- \
#     bash /mnt/c/proyectos/Adeorq/scripts/laboratorio/shell-del-appimage.sh [AppImage]
#
# Sin ventana: no arranca ningun servidor grafico ni toca WSLg ni /mnt. El AppImage se extrae (sin ejecutarlo),
# se mete en un Debian 13 minimo (debootstrap) al que solo se le pone lo que TODO escritorio trae y el AppImage no
# empaqueta, y se mide con el `/etc/profile` de verdad de ese Debian. Mide dos cosas:
#
#  1. Que el `adeorq` de dentro del AppImage arranca con el entorno de una terminal (sin LD_LIBRARY_PATH) en un
#     Linux sin GTK ni WebKitGTK: si, porque el binario lleva `RUNPATH $ORIGIN/../lib` (lo pone el empaquetador).
#  2. Que la shell de login de Debian reescribe el PATH (la de Ubuntu 24.04 no) y pierde la carpeta del
#     AppImage, y que la primera etapa de `pty.rs` (ARRANQUE_CON_LA_CARPETA) la recupera.
#
# Termina con el numero de fallos. La primera vez crea el Debian (1-2 minutos); despues reutiliza lo que hay.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGEN="${1:-/root/Adeorq.AppImage}"
BASE=/root/adeorq-fedora/appimage-terminal
RAIZ="$BASE/chroot"

# Nada de WSLg ni de las carpetas de Windows: esto no abre ninguna ventana.
unset DISPLAY WAYLAND_DISPLAY WAYLAND_SOCKET PULSE_SERVER XAUTHORITY
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd:)"
export PATH
[ -f "$IMAGEN" ] || { echo "no encuentro el AppImage: $IMAGEN"; exit 2; }

ARRANQUE="$(tr -d '\r' < "$AQUI/../../src-tauri/src/pty.rs" | sed -n 's/^const ARRANQUE_CON_LA_CARPETA: &str = r#"\(.*\)"#;$/\1/p')"
[ -n "$ARRANQUE" ] || { echo "no encuentro ARRANQUE_CON_LA_CARPETA en src-tauri/src/pty.rs"; exit 2; }
echo "primera etapa de la shell (de pty.rs): $ARRANQUE"

command -v debootstrap > /dev/null || dnf install -y -q debootstrap debian-keyring binutils > /dev/null
command -v readelf > /dev/null || dnf install -y -q binutils > /dev/null
mkdir -p "$BASE"

echo "== el AppImage, extraido (sin ejecutarlo)"
MARCA="$(stat -c '%s-%Y' "$IMAGEN")"
if [ "$(cat "$BASE/imagen.marca" 2> /dev/null)" != "$MARCA" ]; then
  rm -rf "$BASE/appdir"
  mkdir -p "$BASE/extraer"
  (cd "$BASE/extraer" && rm -rf squashfs-root && "$IMAGEN" --appimage-extract > /dev/null 2>&1)
  mv "$BASE/extraer/squashfs-root" "$BASE/appdir"
  # Montado de verdad, un AppImage lo puede leer cualquiera; extraido es solo de quien lo extrae.
  chmod -R a+rX "$BASE/appdir"
  echo "$MARCA" > "$BASE/imagen.marca"
fi
RUNPATH="$(readelf -d "$BASE/appdir/usr/bin/adeorq" | sed -n 's/.*Library runpath: \[\(.*\)\]/\1/p')"
echo "RUNPATH de usr/bin/adeorq: ${RUNPATH:-<ninguno>}"
if [ "$RUNPATH" != '$ORIGIN/../lib' ]; then
  echo "MAL   el binario del AppImage ya no lleva RUNPATH \$ORIGIN/../lib: tecleado en una terminal sin LD_LIBRARY_PATH no encontraria sus bibliotecas"
  exit 1
fi

echo "== un Debian 13 sin GTK ni WebKitGTK"
if [ ! -x "$RAIZ/bin/sh" ]; then
  debootstrap --variant=minbase trixie "$RAIZ" http://deb.debian.org/debian > "$BASE/debootstrap.log" 2>&1 || { tail -5 "$BASE/debootstrap.log"; exit 2; }
fi

# En un espacio de montajes propio: lo que se monta aqui no sale de este guion.
unshare -m bash -c '
  set -eu
  RAIZ="$1"; IMAGEN_DIR="$2"; AQUI="$3"; ARRANQUE="$4"
  mount -t proc proc "$RAIZ/proc"; mount --rbind /dev "$RAIZ/dev"
  cp /etc/resolv.conf "$RAIZ/etc/resolv.conf"
  # Lo que todo escritorio trae y el AppImage no empaqueta a proposito (la excludelist de linuxdeploy), mas zsh
  # para ver que un perfil que ya conservaba el PATH no empeora. SIN GTK y SIN WebKitGTK.
  chroot "$RAIZ" env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin DEBIAN_FRONTEND=noninteractive \
    apt-get install -y -qq --no-install-recommends zsh libegl1 libgl1 libx11-xcb1 libx11-6 libcom-err2 libdrm2 libexpat1 \
      libfontconfig1 libfreetype6 libfribidi0 libgbm1 libgpg-error0 libharfbuzz0b libwayland-client0 libxcb1 > /dev/null 2>&1
  mount -t tmpfs tmpfs "$RAIZ/tmp"
  mkdir -p "$RAIZ/tmp/.mount_AdeorqLab"; mount --bind "$IMAGEN_DIR" "$RAIZ/tmp/.mount_AdeorqLab"
  cp "$AQUI/shell-del-appimage-dentro.sh" "$RAIZ/tmp/dentro.sh"
  exec chroot "$RAIZ" env -i HOME=/root PATH=/usr/sbin:/usr/bin:/sbin:/bin ARRANQUE="$ARRANQUE" CON_ZSH=1 /bin/bash /tmp/dentro.sh
' _ "$RAIZ" "$BASE/appdir" "$AQUI" "$ARRANQUE"
