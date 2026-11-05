#!/bin/bash
# El adaptador que linux-de-verdad.mjs llama como LAB_ENTRADA con mutter headless:
#   entrada-mutter.sh clic X Y [BOTON] | tecla COMBINACION | arrastrar X1 Y1 X2 Y2
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M="python3 $AQUI/mando.py"
case $1 in
  clic) $M click $2 $3 ${4:-1} ;;
  tecla) $M combo "$(echo "$2" | tr 'A-Z' 'a-z')" ;;
  arrastrar)
    $M abs $2 $3; sleep 0.3; $M move 1 0; $M move -1 0; sleep 0.2
    $M btn 272 1; sleep 0.2
    for i in 1 2 3 4 5 6; do $M abs $(( $2 + ($4 - $2) * i / 6 )) $(( $3 + ($5 - $3) * i / 6 )); sleep 0.05; done
    sleep 0.2; $M btn 272 0 ;;
  *) echo "orden desconocida $1"; exit 2 ;;
esac
