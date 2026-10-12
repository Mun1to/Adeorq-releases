# Las capturas de la web y de los README

Las dieciocho capturas de `web/assets/screens/es` y `/en` salen de aquí. Son **la app de verdad**
(el binario de desarrollo) abierta en una casa de pruebas, con un taller inventado (Sam y sus seis
proyectos) y fotografiada **por dentro**, por el puerto de depuración del WebView: ni ratón ni
teclado en el escritorio de nadie, y nada de lo que hay encima de la ventana se cuela.

Qué es verdad y qué es de demostración en una captura, para decirlo igual en el README:

- **La app, entera.** No hay maqueta ni retoque.
- **Los agentes de las terminales** son sesiones reales de Claude Code y de Codex, grabadas en los
  proyectos de demostración y reproducidas en el panel. La casa de pruebas no tiene sesión iniciada
  en ningún CLI, así que no pueden pensar en directo.
- **Las consolas de la foto de Archivos** (`node --test`, `git diff`) son en directo.
- **Las cuentas, su plan y su cuota** son datos de ejemplo, contestados en la página (ver abajo).
- **Las sesiones de relleno** de la barra, la agenda, las decisiones y las notas: datos del taller
  inventado, en `textos.mjs` y `preparar-sesiones.mjs`.

## Cómo se repiten

Con `cargo build` hecho (`C:\ct\debug\adeorq.exe`) y `pnpm dev` en marcha (el binario de desarrollo
carga de `localhost:1420`):

```powershell
subst P: <esta carpeta>\p            # la casa de pruebas vive en P:
mkdir P:\home\AppData\Local, P:\wv2, P:\bin, P:\data\Adeorq
copy repetir.mjs P:\bin\
"P:\projects" | Set-Content P:\data\Adeorq\raiz.txt -Encoding ascii
node sembrar-proyectos.mjs P:\projects
ffmpeg -f lavfi -i color=c=black:s=1920x1080 -filter_script:v fondo.filtro -frames:v 1 -q:v 2 P:\data\Adeorq\fondo.jpg
```

1. **Grabar** (gasta unos pocos turnos cortos de tu cuenta): `node grabar.mjs guiones/en-storefront.json`,
   y así los ocho. Deja `p/rec/<nombre>.bin`. Antes de regrabar un proyecto, devuélvelo a su punto
   de partida (`git checkout`), o el agente no tiene nada que arreglar.
2. **Cortar** las dos que salen a mitad de trabajo: `node cortar.mjs en-landing` enseña la línea del
   tiempo; `node cortar.mjs en-landing 31950 en-landing-mid` corta. El mismo instante va en
   `preparar-sesiones.mjs`, que corta el transcript por ahí para que el estado cuadre.
3. **Sesiones**: `node preparar-sesiones.mjs en` (y `es`). Pone en `PANELES` de `textos.mjs` los
   títulos que imprime.
4. **Abrir** la app apartada de las pantallas: `powershell -File abrir.ps1`.
5. **Fotos**: `node fotos.mjs en` y `node fotos.mjs es` (o solo unas: `node fotos.mjs en canvas files`).
   Salen en `salida/<idioma>/` a 3840x2160.
6. **Cerrar** (`cerrar.ps1`), `subst P: /D` desde PowerShell, y borrar de `~/.claude/projects` las
   carpetas `P--projects-*` y de `~/.codex/sessions` los rollouts de `P:\projects\…` que dejó grabar.

A la web van con `ffmpeg -i salida/en/x.png -compression_level 9 -pred mixed web/assets/screens/en/x.png`.
El vídeo de `promo/` las coge de ahí con `pnpm capturas`.

## Lo que costó averiguar

**La casa de pruebas**

- La casa falsa necesita `AppData\Local` creada, o el puerto de depuración no se abre.
- **No aísla**: el Administrador de credenciales, lo que suena en el equipo, el estado de la barra
  (`adeorq-state.json`, que vive en la carpeta de la app por su identificador) ni el protocolo de
  archivos (solo sirve la carpeta de datos DE VERDAD, así que el fondo no carga). Todo eso se tapa
  en la página, en `GUARDA` de `escena.mjs`: las llamadas a Rust viajan por `fetch` a
  `ipc.localhost/<comando>` y ahí se contestan `media_now`, `secret_*`, `load_ui_state`, y las
  cuentas de demostración. El fondo se le da a la imagen como `data:`.
- La brújula de la Agenda: `fetch` a Supabase tiene que FALLAR por red, nunca contestar un error.
  Con un error HTTP la app borra la credencial guardada.

**La foto**

- Se saca a doble escala (`Emulation.setDeviceMetricsOverride`). El lienzo WebGL de xterm no se
  entera de esa escala (mide píxeles de verdad) y pinta un cuarto de la terminal: se le suelta el
  contexto (`sinWebgl`) y la terminal cae a su pintado de reserva, que es texto y sale nítido.
- La escala muere al cerrar la conexión, y con ella cambia el tamaño de los paneles. Todo lo de una
  tanda va en UNA conexión.
- Lo que se siembra en `localStorage` se pone con un guion de arranque de página
  (`recargarCon`), no antes de recargar: la app guarda su tablero cada vez que cambia y lo pisa.
  Lo mismo con `lienzo.json`: se escribe después de esperar a que la app termine de guardar.
- Un clic en un proyecto de la barra **abre una sesión nueva**, no lo despliega.
- En el Lienzo, por debajo de 0,55 de zoom las terminales salen como tarjeta con su nombre, y el
  tablero de tareas no vuelve a donde se guardó: cae centrado en el origen.

**Reproducir una sesión**

- El panel sabe de qué CLI es por la última palabra de su línea (`… repetir.mjs x.bin claude`).
  Sin el id de la sesión: con él la app cambia la línea por la de retomarla de verdad.
- La grabación es lo que escribió el ConPTY, así que solo se ve bien a las mismas filas y con al
  menos las mismas columnas. Hay que medir el panel antes de grabar (`repetir.log` lo apunta).
- Al reproducir se quitan las preguntas a la terminal (`ESC[6n`): la respuesta saldría escrita.

**Grabar**

- La grabadora es el motor de terminales de la app (`adeorq.exe --terminales`) suelto, con su canal.
  Hay que contestarle al `ESC[6n` del principio o no pinta nada.
- Claude Code se lanza con `--setting-sources project,local --strict-mcp-config`: sin los ajustes,
  los hooks ni los MCP de quien graba, y sigue con su sesión iniciada.
- El aviso de confianza de una carpeta nueva trae marcado «No, exit»: flecha abajo y luego Intro.
- El modo de permisos de fábrica puede ser el automático: para que pregunte, `--permission-mode default`.
- En Windows el agente usa la herramienta PowerShell además de Bash: las dos en `--allowedTools`.
- **Codex ofrece actualizarse al arrancar, con «Update now» marcado.** Un Intro del guion lo
  aceptó una vez y cambió la versión instalada. Va con `-c check_for_update_on_startup=false`, y
  `grabar.mjs` no teclea nada si ve ese aviso.
- Los guiones (JSON) se escriben con el editor, no desde la terminal: una barra invertida comida en
  `cwd` arrancó una sesión en la carpeta personal en vez de en el proyecto.
