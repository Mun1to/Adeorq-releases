#!/bin/bash
# LAB_FOTO de linux-de-verdad.mjs con mutter headless: una foto de la pantalla virtual en la ruta dada.
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 $AQUI/mando.py shot "$1"
