#!/usr/bin/env bash
# ===========================================================================
#  setup-fedora.sh
#
#  Configura un sistema Fedora 40+ para COMPILAR (no solo ejecutar) Adeorq
#  desde el código fuente.
#
#  Equivalencias Ubuntu/Debian -> Fedora (dnf) que aplica este script:
#    build-essential                  -> gcc, gcc-c++, make
#    pkg-config                       -> pkgconf-pkg-config
#    libssl-dev                       -> openssl-devel
#    libgtk-3-dev                     -> gtk3-devel
#    libwebkit2gtk-4.1-dev            -> webkit2gtk4.1-devel
#    libayatana-appindicator3-dev     -> libayatana-appindicator-gtk3-devel
#    librsvg2-dev                     -> librsvg2-devel
#    patchelf                         -> patchelf
#
#  El script es IDEMPOTENTE: puedes ejecutarlo tantas veces como quieras.
# ===========================================================================

set -euo pipefail

# ---------------------------------------------------------------- utilidades
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# `sudo` solo si no somos root (usa el sudo del usuario actual).
if [[ "$(id -u)" -ne 0 ]]; then
    SUDO="sudo"
else
    SUDO=""
fi

ok()   { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
info() { printf '\033[1;34m»\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m✖\033[0m %s\n' "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

echo "===================================================================="
echo "  Adeorq — preparación del entorno de compilación para Fedora"
echo "===================================================================="
echo ""

# ------------------------------------------------------------------ sistema
if ! command_exists dnf; then
    fail "No se encontró 'dnf'. Este script está pensado para Fedora."
fi

info "1/5  Instalando dependencias del sistema (dnf)..."
if ! $SUDO dnf install -y \
    gcc \
    gcc-c++ \
    make \
    pkgconf-pkg-config \
    openssl-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    libayatana-appindicator-gtk3-devel \
    librsvg2-devel \
    patchelf; then
    fail "Falló la instalación de dependencias del sistema."
fi
ok "Dependencias del sistema instaladas."

# ------------------------------------------------------------------- Rust
echo ""
info "2/5  Comprobando Rust (rustc/cargo)..."

install_rust() {
    # Ruta por defecto de rustup: ~/.cargo/{bin,env}
    local cargo_home="${CARGO_HOME:-$HOME/.cargo}"
    # Recargar PATH si already tenemos cargo en ~/.cargo
    if [[ -f "$cargo_home/env" ]]; then
        # shellcheck disable=SC1091
        source "$cargo_home/env"
    fi

    if command_exists rustc && command_exists cargo; then
        ok "Rust ya instalado: $(rustc --version 2>/dev/null)."
        return 0
    fi

    # 1) Preferimos el instalador oficial de rustup (recomendado por Adeorq).
    if command_exists rustup-init; then
        info "Configurando toolchain con 'rustup-init'..."
        if ! rustup-init -y --no-modify-path >/dev/null 2>&1; then
            warn "rustup-init falló; probando el instalador descargado..."
            install_rustup_init
        fi
    else
        install_rustup_init
    fi

    # Recargar PATH tras la instalación.
    if [[ -f "$cargo_home/env" ]]; then
        # shellcheck disable=SC1091
        source "$cargo_home/env"
    fi

    if command_exists rustc && command_exists cargo; then
        ok "Rust instalado: $(rustc --version 2>/dev/null)."
    else
        # Fallback: el paquete 'rust' oficial de Fedora.
        warn "rustup no disponible. Instalando el paquete 'rust' de Fedora..."
        if ! $SUDO dnf install -y rust cargo; then
            fail "No se pudo instalar Rust (ni por rustup ni por dnf)."
        fi
        ok "Rust instalado desde dnf: $(rustc --version 2>/dev/null)."
    fi
}

install_rustup_init() {
    local url="https://sh.rustup.rs"
    info "Descargando e instalando rustup desde $url ..."
    if command_exists curl; then
        if curl --proto '=https' --tlsv1.2 -sSf "$url" | sh -s -- -y >/dev/null 2>&1; then
            return 0
        fi
    elif command_exists wget; then
        if wget -qO- "$url" | sh -s -- -y >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

install_rust

# ------------------------------------------------------------------- Node
echo ""
info "3/5  Comprobando Node.js..."

if ! command_exists node; then
    info "Node.js no encontrado. Instalando el paquete 'nodejs' de Fedora..."
    if ! $SUDO dnf install -y nodejs; then
        fail "No se pudo instalar Node.js. Instálalo manualmente y vuelve a ejecutar."
    fi
    ok "Node.js instalado: $(node -v 2>/dev/null)."
else
    ok "Node.js ya presente: $(node -v 2>/dev/null)."
fi

# ------------------------------------------------------------------- pnpm
echo ""
info "4/5  Comprobando pnpm..."

if ! command_exists pnpm; then
    info "pnpm no encontrado. Instalándolo globalmente vía npm..."
    if ! command_exists npm; then
        fail "No se encontró 'npm'. Instala Node.js correctamente."
    fi
    # corepack fue deprecado en Node >=22; usar la vía universal (npm -g).
    if ! npm install -g pnpm >/dev/null 2>&1; then
        fail "No se pudo instalar pnpm vía npm."
    fi
    ok "pnpm instalado: $(pnpm -v 2>/dev/null)."
else
    ok "pnpm ya presente: $(pnpm -v 2>/dev/null)."
fi

# ------------------------------------------------------------------- pnpm install
echo ""
info "5/5  Ejecutando 'pnpm install' en $SCRIPT_DIR ..."

if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
    warn "No hay package.json aquí. ¿Estás en la raíz del repositorio Adeorq?"
    warn "Saltando 'pnpm install'. Vuelve a ejecutarlo desde la raíz cuando tengas el repo."
else
    if ( cd "$SCRIPT_DIR" && pnpm install --frozen-lockfile ); then
        ok "'pnpm install' completado correctamente."
    else
        warn "'--frozen-lockfile' falló (el lockfile puede estar desactualizado)."
        warn "Reintentando con 'pnpm install' normal..."
        ( cd "$SCRIPT_DIR" && pnpm install ) \
            || fail "No se pudo ejecutar 'pnpm install'."
        ok "'pnpm install' completado (sin lockfile congelado)."
    fi
fi

echo ""
echo "===================================================================="
ok "Entorno listo para compilar Adeorq."
echo ""
echo "  Para el modo desarrollo:      pnpm tauri dev"
echo "  Para generar el instalador:   pnpm tauri build"
echo "===================================================================="
exit 0
#!/usr/bin/env bash
# ===========================================================================
#  setup-fedora.sh
#
#  Configura un sistema Fedora 40+ para COMPILAR (no solo ejecutar) Adeorq
#  desde el código fuente.
#
#  - SE ASUME QUE YA ESTÁS DENTRO DEL REPOSITORIO (este script NO clona nada,
#    para que tú decidas dónde queda y evites sobrescribir proyectos).
#  - La raíz de proyectos NO se toca aquí: se configura desde la propia app.
#
#  Equivalencias Ubuntu/Debian -> Fedora (dnf) que aplica este script:
#    build-essential                  -> gcc, gcc-c++, make
#    pkg-config                       -> pkgconf-pkg-config
#    libssl-dev                       -> openssl-devel
#    libgtk-3-dev                     -> gtk3-devel
#    libwebkit2gtk-4.1-dev            -> webkit2gtk4.1-devel
#    libayatana-appindicator3-dev     -> libayatana-appindicator-gtk3-devel
#    librsvg2-dev                     -> librsvg2-devel
#    patchelf                         -> patchelf
#
#  Añadido para Fedora (no viene en la línea de Ubuntu de Tauri):
#    squashfs-tools  -> contiene `mksquashfs`. `pnpm tauri build` lo invoca
#                       para empaquetar el AppImage; sin él el build falla
#                       en el último paso aunque compile bien.
#
#  El script es IDEMPOTENTE: puedes ejecutarlo tantas veces como quieras.
# ===========================================================================

set -euo pipefail

# ---------------------------------------------------------------- utilidades
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# `sudo` solo si no somos root (usa el sudo del usuario actual).
if [[ "$(id -u)" -ne 0 ]]; then
    SUDO="sudo"
else
    SUDO=""
fi

ok()   { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
info() { printf '\033[1;34m»\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m✖\033[0m %s\n' "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

echo "===================================================================="
echo "  Adeorq — preparación del entorno de compilación para Fedora"
echo "===================================================================="
echo ""

# ---------------------------------------------------------- precondiciones
if ! command_exists dnf; then
    fail "No se encontró 'dnf'. Este script está pensado para Fedora."
fi

# Adeorq publica binarios x86_64 (AppImage/deb). En otra arquitectura el build
# local puede funcionar, pero mejor avisarlo desde el primer paso.
case "$(uname -m)" in
    x86_64) ok "Arquitectura: x86_64." ;;
    aarch64) warn "Arquitectura aarch64. Compilar puede funcionar, pero los binarios ofrecidos se publican como x86_64." ;;
    *) warn "Arquitectura $(uname -m). El soporte no está garantizado." ;;
esac

# ------------------------------------------------------------------ sistema
echo ""
info "1/6  Instalando dependencias del sistema (dnf)..."
if ! $SUDO dnf install -y \
    gcc \
    gcc-c++ \
    make \
    pkgconf-pkg-config \
    openssl-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    libayatana-appindicator-gtk3-devel \
    librsvg2-devel \
    patchelf \
    squashfs-tools; then
    fail "Falló la instalación de dependencias del sistema."
fi
ok "Dependencias del sistema instaladas."

# ------------------------------------------------------------------- Rust
echo ""
info "2/6  Comprobando Rust (rustc/cargo)..."

# Cargamos el env de cargo/rustup si existe. Permite que este script (y otros
# no-interactivos) encuentren cargo tras una instalación previa de rustup.
# shellcheck disable=SC1091
[[ -f "${CARGO_HOME:-$HOME/.cargo}/env" ]] && source "${CARGO_HOME:-$HOME/.cargo}/env"

install_rust() {
    # Ruta por defecto de rustup: ~/.cargo/{bin,env}
    local cargo_home="${CARGO_HOME:-$HOME/.cargo}"
    # Recargar el PATH si ya tenemos cargo en ~/.cargo
    if [[ -f "$cargo_home/env" ]]; then
        # shellcheck disable=SC1091
        source "$cargo_home/env"
    fi

    if command_exists rustc && command_exists cargo; then
        ok "Rust ya instalado: $(rustc --version 2>/dev/null)."
        return 0
    fi

    # 1) Preferimos el instalador oficial de rustup (recomendado por Adeorq).
    if command_exists rustup-init; then
        info "Configurando toolchain con 'rustup-init'..."
        if ! rustup-init -y --no-modify-path >/dev/null 2>&1; then
            warn "rustup-init falló; probando el instalador descargado..."
            install_rustup_init || true
        fi
    else
        install_rustup_init || true
    fi

    # Recargar PATH tras la instalación.
    if [[ -f "$cargo_home/env" ]]; then
        # shellcheck disable=SC1091
        source "$cargo_home/env"
    fi

    if command_exists rustc && command_exists cargo; then
        ok "Rust instalado: $(rustc --version 2>/dev/null)."
        return 0
    fi

    # 2) Fallback: el paquete 'rust' oficial de Fedora.
    warn "rustup no disponible. Instalando el paquete 'rust' de Fedora..."
    if ! $SUDO dnf install -y rust cargo; then
        fail "No se pudo instalar Rust (ni por rustup ni por dnf)."
    fi
    ok "Rust instalado desde dnf: $(rustc --version 2>/dev/null)."
}

install_rustup_init() {
    local url="https://sh.rustup.rs"
    info "Descargando e instalando rustup desde $url ..."
    if command_exists curl; then
        if curl --proto '=https' --tlsv1.2 -sSf "$url" | sh -s -- -y >/dev/null 2>&1; then
            return 0
        fi
    elif command_exists wget; then
        if wget -qO- "$url" | sh -s -- -y >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

install_rust

# Si tras la instalación cargo NO está en el PATH de ESTA sesión, lo más
# probable es que rustup usara `--no-modify-path`. Lo decimos para que el
# usuario sepa cómo activarlo en shells futuros.
if ! command_exists cargo; then
    warn "cargo no está en el PATH de esta sesión."
    warn "Ejecuta 'source \$HOME/.cargo/env' (o reabre la terminal) antes de compilar."
fi

# ------------------------------------------------------------------- Node
echo ""
info "3/6  Comprobando Node.js..."

NODE_MIN="20.19.0"   # Vite 7 exige Node >=20.19.0 o >=22.12.0

if command_exists node; then
    node_ver="$(node -v 2>/dev/null | tr -d 'v' || true)"
    ok "Node.js presente: v$node_ver."
    # Comparación semver simple con sort -V (comparador de versiones de coreutils).
    if [[ -n "$node_ver" ]] && ! [[ "$(printf '%s\n' "$node_ver" "$NODE_MIN" | sort -V | head -1)" == "$NODE_MIN" ]]; then
        warn "Node v$node_ver es anterior a v$NODE_MIN. Vite 7 (dependencia de Adeorq) puede no compilar."
        warn "Considera actualizar p. ej. con 'sudo dnf upgrade nodejs' o instalando una versión más reciente."
    fi
else
    info "Node.js no encontrado. Instalando el paquete 'nodejs' de Fedora..."
    if ! $SUDO dnf install -y nodejs; then
        fail "No se pudo instalar Node.js. Instálalo manualmente y vuelve a ejecutar."
    fi
    ok "Node.js instalado: $(node -v 2>/dev/null)."
fi

# ------------------------------------------------------------------- pnpm
echo ""
info "4/6  Comprobando pnpm..."

if ! command_exists pnpm; then
    info "pnpm no encontrado. Instalándolo globalmente vía npm..."
    if ! command_exists npm; then
        fail "No se encontró 'npm'. Instala Node.js correctamente."
    fi
    # corepack fue deprecado en Node >=22; usar la vía universal (npm -g).
    if ! npm install -g pnpm >/dev/null 2>&1; then
        fail "No se pudo instalar pnpm vía npm."
    fi
    ok "pnpm instalado: $(pnpm -v 2>/dev/null)."
else
    ok "pnpm ya presente: $(pnpm -v 2>/dev/null)."
fi

# ------------------------------------------------------------ pnpm install
echo ""
info "5/6  Ejecutando 'pnpm install' en $SCRIPT_DIR ..."

if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
    warn "No hay package.json aquí. ¿Estás en la raíz del repositorio Adeorq?"
    warn "Saltando 'pnpm install'. Vuelve a ejecutarlo desde la raíz cuando tengas el repo."
else
    if ( cd "$SCRIPT_DIR" && pnpm install --frozen-lockfile ); then
        ok "'pnpm install' completado correctamente (lockfile congelado)."
    else
        warn "'--frozen-lockfile' falló (el lockfile puede estar desactualizado)."
        warn "Reintentando con 'pnpm install' normal..."
        ( cd "$SCRIPT_DIR" && pnpm install ) \
            || fail "No se pudo ejecutar 'pnpm install'."
        ok "'pnpm install' completado (sin lockfile congelado)."
    fi
fi

# ------------------------------------------------------- verificación final
echo ""
info "6/6  Síntesis del entorno..."

# Comprobaciones "blandas": informan, no abortan.
command_exists cargo && ok "cargo: $(cargo --version 2>/dev/null)" \
                          || warn "cargo NO está en el PATH de esta sesión."
command_exists node  && ok "node: $(node -v 2>/dev/null)" \
                          || warn "node no está en PATH."
command_exists pnpm  && ok "pnpm: $(pnpm -v 2>/dev/null)" \
                          || warn "pnpm no está en PATH."
[[ -d "$SCRIPT_DIR/node_modules" ]] && ok "node_modules presente en la raíz." \
                                   || warn "node_modules todavía no existe en la raíz."

echo ""
echo "===================================================================="
ok "Entorno listo para compilar Adeorq."
echo ""
echo "  Para el modo desarrollo:      pnpm tauri dev"
echo "  Para generar el instalador:   pnpm tauri build"
echo ""
info "Ojo: si 'cargo' no se encuentra fuera de este script, ejecuta 'source \$HOME/.cargo/env'."
echo "===================================================================="
exit 0
