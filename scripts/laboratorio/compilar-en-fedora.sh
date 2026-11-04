#!/bin/bash
# Compila Adeorq en el Fedora de WSL, para probar un arreglo en Linux sin esperar a
# una release. Se lanza desde Git Bash (MSYS_NO_PATHCONV: sin él, Git Bash reescribe
# la ruta /mnt/c/...):
#
#   MSYS_NO_PATHCONV=1 wsl -d FedoraLinux-44 --user root -- \
#     bash /mnt/c/proyectos/Adeorq/scripts/laboratorio/compilar-en-fedora.sh [commit] [parche]
#
# Compila una FOTO de un commit (`git archive`, HEAD si no se dice otro) y no el
# árbol, porque otras terminales lo tienen a medias. Con `parche` (una ruta de WSL a
# un `git diff`), la foto lleva encima ese cambio: es lo que deja probar un arreglo
# antes de hacer su commit.
#
# Todo vive en el disco de WSL (/root/adeorq-fedora) y no en /mnt/c: por ahí cada
# archivo cuesta un viaje a Windows, y node_modules son decenas de miles. La foto se
# deja siempre en la misma carpeta, porque cargo guarda sus cachés por ruta.
#
# Al acabar, la última línea dice dónde está el binario. Se usa con
# `ADEORQ_BIN=<ruta> node scripts/laboratorio/linux-de-verdad.mjs <salida>`.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REF="${1:-HEAD}"
PARCHE="${2:-}"
BASE=/root/adeorq-fedora
FOTO="$BASE/foto"
export CARGO_TARGET_DIR="$BASE/ct"
export CI=true

# Sin las carpetas de Windows que WSL añade al PATH: el `pnpm` de allí correría sobre
# una ruta de Linux, y el `git` de allí no lee /root.
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd:)"
export PATH

# Los nombres de Fedora de lo que `.github/workflows/linux.yml` instala en Ubuntu.
# Sin `patchelf`: solo hace falta para empaquetar el AppImage, y aquí no se empaqueta.
PAQUETES=(git-core gcc gcc-c++ make pkgconf-pkg-config openssl-devel gtk3-devel
  webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel librsvg2-devel nodejs npm
  rust cargo)
if ! rpm -q --whatprovides "${PAQUETES[@]}" > /dev/null 2>&1; then
  echo "== dependencias con dnf"
  dnf install -y -q "${PAQUETES[@]}"
fi
command -v pnpm > /dev/null || npm install -g --silent pnpm@11

COMMIT="$(git -c safe.directory='*' -C "$REPO" rev-parse --short "$REF")"
echo "== foto de $COMMIT${PARCHE:+ con el parche $PARCHE}"
mkdir -p "$FOTO"
# Se vacía lo de la foto anterior menos node_modules, que tarda en bajarse.
find "$FOTO" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
git -c safe.directory='*' -C "$REPO" archive --format=tar "$REF" | tar -x -C "$FOTO"
if [ -n "$PARCHE" ]; then
  git -C "$FOTO" apply --whitespace=nowarn "$PARCHE"
fi

cd "$FOTO"
echo "== frontal"
pnpm install --frozen-lockfile --silent
pnpm build > "$BASE/frontal.log" 2>&1 || { tail -30 "$BASE/frontal.log"; exit 1; }
tail -1 "$BASE/frontal.log"

echo "== binario"
cargo build --features tauri/custom-protocol --manifest-path src-tauri/Cargo.toml -j 6

echo "$CARGO_TARGET_DIR/debug/adeorq"
