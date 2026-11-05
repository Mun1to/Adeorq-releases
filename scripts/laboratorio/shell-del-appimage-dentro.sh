#!/bin/bash
# Lo lanza shell-del-appimage.sh DENTRO de un Debian sin GTK ni WebKitGTK, con `env -i`. Mide, con el
# AppImage extraido en /tmp/.mount_AdeorqLab, lo que ve una terminal de Adeorq que se abre en un Linux asi.
# Recibe por el entorno ARRANQUE (el guion de la primera etapa de pty.rs) y CON_ZSH (1 si zsh esta instalado).
APPDIR=/tmp/.mount_AdeorqLab
fallos=0
bien() { echo "BIEN  $1"; }
mal() { echo "MAL   $1"; fallos=$((fallos + 1)); }
debe() { if [ "$1" = si ]; then bien "$2"; else mal "$2"; fi; }
tiene() { case "$1" in *"$2"*) echo si ;; *) echo no ;; esac; }

# El PATH de una terminal del AppImage cuando nace (lo que deja pty.rs): sin nada del AppImage salvo
# su usr/bin delante, y sin LD_LIBRARY_PATH ni PYTHONHOME.
PATH_NACIDA="$APPDIR/usr/bin:/usr/local/bin:/usr/bin:/bin"

echo "== 1. Un Linux sin WebKitGTK"
n=$(ls /usr/lib/x86_64-linux-gnu | grep -ci 'gtk\|webkit\|soup')
debe "$([ "$n" = 0 ] && echo si || echo no)" "el sistema no trae GTK, WebKitGTK ni libsoup ($n archivos)"

echo "== 2. El adeorq de dentro arranca con el entorno de la terminal (sin LD_LIBRARY_PATH)"
faltan=$(env -i ldd "$APPDIR/usr/bin/adeorq" 2>&1 | grep -c 'not found')
dentro=$(env -i ldd "$APPDIR/usr/bin/adeorq" 2>&1 | grep -c "$APPDIR/usr/bin/../lib")
debe "$([ "$faltan" = 0 ] && echo si || echo no)" "ldd no deja ninguna biblioteca sin encontrar ($faltan)"
debe "$([ "$dentro" -gt 50 ] && echo si || echo no)" "WebKitGTK, GTK y el resto salen del AppImage por su RUNPATH ($dentro bibliotecas de dentro)"
salida=$(env -i PATH="$PATH_NACIDA" HOME=/root timeout 20 adeorq preguntar get_projects '{}' 2>&1)
rc=$?
echo "      salida=$rc: $salida"
debe "$([ "$rc" = 1 ] && [ "$(tiene "$salida" 'no está abierta')" = si ] && echo si || echo no)" "adeorq arranca y contesta que Adeorq no esta abierta (no 127: no le falta nada)"

# Una terminal: la shell de login con la que `pty.rs` abre un panel, y lo que se teclea en ella.
# `setsid` suelta la terminal de control de quien lance esto, y la entrada va por una tuberia.
TECLEADO='command -v adeorq || echo NO_SE_ENCUENTRA; adeorq preguntar get_projects "{}" 2>&1; echo PANEL=$ADEORQ_PANE_ID; exit'
terminal() { # usuario casa shell argumentos...
  local usuario="$1" casa="$2"; shift 2
  local quien=()
  [ "$usuario" != root ] && quien=(setpriv --reuid="$usuario" --regid="$usuario" --clear-groups)
  printf '%s\n' "$TECLEADO" | setsid "${quien[@]}" env -i HOME="$casa" PATH="$PATH_NACIDA" ADEORQ_PANE_ID=7 TERM=dumb "$@" 2>/dev/null
}
useradd -m -s /bin/bash prueba 2>/dev/null
: > /home/prueba/.zshrc
: > /root/.zshrc
chown prueba /home/prueba/.zshrc 2>/dev/null

prueba() { # etiqueta usuario casa shell
  local etiqueta="$1" usuario="$2" casa="$3" shell="$4"
  echo "== $etiqueta"
  local antes ahora
  antes=$(terminal "$usuario" "$casa" "$shell" -l)
  ahora=$(terminal "$usuario" "$casa" "$shell" -l -c "$ARRANQUE" "$shell" "$APPDIR/usr/bin")
  echo "      antes (-l):      $(echo "$antes" | tr '\n' ' ' | cut -c1-150)"
  echo "      ahora (2 etapas): $(echo "$ahora" | tr '\n' ' ' | cut -c1-150)"
  case "$etiqueta" in
    *"reescribe"*) debe "$(tiene "$antes" NO_SE_ENCUENTRA)" "ROJO de antes: con -l el PATH se reescribe y adeorq no se encuentra" ;;
    *) debe "$([ "$(tiene "$antes" NO_SE_ENCUENTRA)" = no ] && echo si || echo no)" "antes tambien se encontraba (este perfil conserva el PATH)" ;;
  esac
  debe "$([ "$(tiene "$ahora" NO_SE_ENCUENTRA)" = no ] && [ "$(tiene "$ahora" "$APPDIR/usr/bin/adeorq")" = si ] && echo si || echo no)" "VERDE: ahora adeorq esta en el PATH de la terminal"
  debe "$(tiene "$ahora" 'no está abierta')" "y teclearlo arranca (contesta que Adeorq no esta abierta)"
  debe "$(tiene "$ahora" 'PANEL=7')" "y lo que traia la terminal (ADEORQ_PANE_ID) sigue ahi"
}

prueba "bash de login como root (el /etc/profile de Debian reescribe el PATH)" root /root /bin/bash
prueba "bash de login como usuario normal (la otra rama de /etc/profile reescribe el PATH)" prueba /home/prueba /bin/bash
prueba "sh (dash) de login (su /etc/profile reescribe el PATH)" root /root /bin/sh
if [ "${CON_ZSH:-0}" = 1 ]; then
  prueba "zsh de login (el de Debian conserva el PATH: no debe cambiar nada para peor)" root /root /usr/bin/zsh
fi

echo
[ "$fallos" = 0 ] && echo "TODO BIEN" || echo "$fallos FALLOS"
exit "$fallos"
