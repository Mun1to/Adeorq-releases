#!/bin/bash
# Prueba una release de Adeorq en el Fedora de WSL, sin tocar nada de Windows:
# instala el rpm de la release con dnf, mira que no le falte ninguna librería,
# arranca la app y comprueba que sigue viva a los 15 s y que coge el MCP en el
# 3012; después hace lo mismo con el AppImage. Para cada uno dice si hay pánicos
# en el log (los avisos de EGL, Vulkan, dzn y Zink son de WSLg y se ignoran).
#
# Se lanza desde Git Bash así (sin MSYS_NO_PATHCONV, Git Bash reescribe la ruta
# /mnt/c/... a C:/.../Git/mnt/c/... y bash no encuentra el guion):
#
#   MSYS_NO_PATHCONV=1 wsl -d FedoraLinux-44 --user root -- \
#     bash /mnt/c/proyectos/Adeorq/scripts/laboratorio/probar-linux-wsl.sh 0.9.166
#
# Lo que NO prueba: que la ventana pinte (para eso hay que traerla al frente en
# el escritorio de Munir, ver la memoria vm_linux_para_probar), el .deb (Fedora
# no lo instala) ni los fallos de aceleración gráfica de un equipo real.
# Hecho a mano con la 0.9.136, la 0.9.163 y la 0.9.166: a la tercera, guion.
v="$1"
[ -n "$v" ] || { echo "Dime la versión: probar-linux-wsl.sh 0.9.166"; exit 1; }
base="https://github.com/Mun1to/Adeorq-releases/releases/download/v$v"
cd /tmp || exit 1

echo "== rpm $v"
curl -fsSLo adeorq.rpm "$base/Adeorq-$v-1.x86_64.rpm" || { echo "descarga del rpm FALLA"; exit 1; }
dnf install -y ./adeorq.rpm > /tmp/dnf.log 2>&1
echo "dnf salida: $?"; tail -1 /tmp/dnf.log
rpm -q adeorq
bin=$(command -v adeorq); echo "binario: $bin"
echo "librerías que faltan: $(ldd "$bin" | grep -c 'not found')"

probar() {
  local nombre="$1"; shift
  "$@" > "/tmp/$nombre.log" 2>&1 &
  local pid=$!
  sleep 15
  if kill -0 "$pid" 2>/dev/null; then echo "$nombre: vivo a los 15 s"; else echo "$nombre: MUERTO a los 15 s"; fi
  ss -ltn 2>/dev/null | grep -q ':3012 ' && echo "$nombre: MCP escuchando en 3012" || echo "$nombre: sin MCP en 3012"
  echo "$nombre: pánicos en el log: $(grep -ci panic "/tmp/$nombre.log")"
  grep -iv 'egl\|vulkan\|dzn\|zink\|mesa' "/tmp/$nombre.log" | grep -v '^\s*$' | head -5
  pkill -x adeorq; kill "$pid" 2>/dev/null; sleep 2
}

probar rpm "$bin"

echo "== AppImage $v"
curl -fsSLo adeorq.AppImage "$base/Adeorq_${v}_amd64.AppImage" || { echo "descarga del AppImage FALLA"; exit 1; }
chmod +x adeorq.AppImage
# Sin FUSE en WSL: el AppImage se desempaqueta y corre desde /tmp.
probar appimage ./adeorq.AppImage --appimage-extract-and-run
rm -f adeorq.AppImage adeorq.rpm
pgrep -a adeorq && echo "OJO: queda un adeorq vivo" || echo "nada vivo al acabar"
