#!/bin/bash
# La pasada de linux-de-verdad.mjs dentro del compositor que monta rig.sh. Uso (lo llama el rig):
#   pasada.sh <nombre-de-salida> <binario> [origen x,y,ancho,alto]
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOMBRE=$1; BIN=$2; ORIGEN=${3:-0,69,1600,931}
SAL=${E18_SALIDA:-/root/e18}/$NOMBRE; rm -rf $SAL; mkdir -p $SAL
[ -n "$WAYLAND_DISPLAY" ] && [ -z "$(echo $XDG_RUNTIME_DIR | grep -E '^/(mnt|run)')" ] || { echo "entorno no aislado"; exit 3; }
EXTRA=""
if [ -n "$E18_MANDO" ]; then EXTRA="LAB_ENTRADA=$AQUI/entrada-mutter.sh LAB_FOTO=$AQUI/foto-mutter.sh"; fi
env $EXTRA LAB_WAYLAND=$WAYLAND_DISPLAY LAB_ORIGEN=$ORIGEN ADEORQ_BIN=$BIN timeout 400 node $AQUI/../linux-de-verdad.mjs $SAL 2>&1 | tee $SAL/pasada.txt
echo "codigo: ${PIPESTATUS[0]}"
