#!/usr/bin/env bash
# Un commit con un índice PROPIO: HEAD de ahora + tus archivos, sin tocar el
# índice compartido ni el árbol de trabajo.
#
#   scripts/commit-propio.sh -m "mensaje" <ruta>[=<archivo-fuente>] ...
#   scripts/commit-propio.sh -F mensaje.txt <ruta>[=<archivo-fuente>] ...
#
# Para qué: aquí trabajan varias sesiones a la vez en el mismo árbol (regla AM).
# Cuando otra tiene cosas PREPARADAS en el índice (`M ` o `MM` en `git status`),
# ni `git add` + `git commit` (te llevas lo suyo) ni `update-index` en el índice
# compartido (le pisas lo suyo) valen. Es el tercer guion suelto que se escribía a
# mano para esto (memoria «commit parcial sin tocar el árbol», 2026-10-17, 21 y
# 30): a la tercera, aquí (regla W).
#
# Qué hace:
#   1. Un índice aparte (`.git/commit-propio.idx`) con el `HEAD` de ahora.
#   2. En él, cada ruta con el contenido de `<archivo-fuente>`; si solo das la
#      ruta, el del árbol de trabajo (ENTERO: si otra sesión tiene cambios sin
#      preparar en ese mismo archivo, se van contigo. Para llevarte solo tu trozo,
#      prepara una copia con solo tus cambios y pásala como fuente).
#   3. `git commit` con ese índice, así que los hooks de la casa corren (el
#      `commit-msg` que prohíbe las firmas de agente, el `pre-commit` de los
#      caracteres invisibles).
#   4. En el índice compartido, SOLO las entradas de tus rutas, puestas a lo que
#      acaba de entrar en `HEAD`: si no, saldrían como «preparadas para deshacer»
#      tu commit y la otra sesión te lo revertiría al commitear lo suyo.
#
# Se niega (sin tocar nada) si `HEAD` se mueve mientras prepara, si una ruta ya
# tiene cambios PREPARADOS por otra sesión en el índice compartido (los pisaría),
# o si un archivo no existe. Empuja nadie: el push se pregunta.
set -euo pipefail

mensaje=()
while getopts "m:F:" o; do
  case "$o" in
    m) mensaje=(-m "$OPTARG") ;;
    F) mensaje=(-F "$OPTARG") ;;
    *) echo "uso: commit-propio.sh (-m mensaje | -F archivo) ruta[=fuente] ..." >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ "${#mensaje[@]}" -eq 0 ] || [ "$#" -eq 0 ]; then
  echo "uso: commit-propio.sh (-m mensaje | -F archivo) ruta[=fuente] ..." >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
IDX="$(git rev-parse --git-dir)/commit-propio.idx"
trap 'rm -f "$IDX"' EXIT
rm -f "$IDX"

# Antes de preparar nada: que ninguna ruta tenga ya algo preparado por otra sesión.
for par in "$@"; do
  ruta="${par%%=*}"
  if ! git diff --cached --quiet -- "$ruta"; then
    echo "«$ruta» ya tiene cambios preparados en el índice compartido (de otra sesión): no los piso." >&2
    exit 1
  fi
done

antes=$(git rev-parse HEAD)
GIT_INDEX_FILE="$IDX" git read-tree HEAD
rutas=()
modos=()
for par in "$@"; do
  ruta="${par%%=*}"
  fuente="$ruta"
  [[ "$par" == *=* ]] && fuente="${par#*=}"
  [ -f "$fuente" ] || { echo "no existe «$fuente»" >&2; exit 1; }
  # El modo que ya tenía en HEAD (un script ejecutable lo sigue siendo); nuevo, 100644.
  modo=$(git ls-tree HEAD -- "$ruta" | awk '{print $1}')
  modo="${modo:-100644}"
  blob=$(git hash-object -w --path "$ruta" "$fuente")
  GIT_INDEX_FILE="$IDX" git update-index --add --cacheinfo "$modo,$blob,$ruta"
  rutas+=("$ruta")
  modos+=("$modo")
done

[ "$(git rev-parse HEAD)" = "$antes" ] || { echo "HEAD se movió mientras preparaba: no commiteo." >&2; exit 1; }
GIT_INDEX_FILE="$IDX" git commit -q "${mensaje[@]}"

for i in "${!rutas[@]}"; do
  git update-index --add --cacheinfo "${modos[$i]},$(git rev-parse "HEAD:${rutas[$i]}"),${rutas[$i]}"
done
git show --stat --format='%h %s' HEAD | cat
