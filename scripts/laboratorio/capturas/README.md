# Las capturas de la web y de los README

Las veinte capturas de `web/assets/screens/es` y `/en` salen de aquí (más `board.png` y `swarm.png`,
recortadas de `canvas.png` con las cajas que imprime `fotos.mjs` por dos: `crop=922:486:814:574` y
`crop=534:632:3096:500` con las de hoy). Son **la app de verdad**
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
  Y lo que hablaría de la máquina de quien hace la foto (el Pulso, los modelos locales, la versión).
- **Tu uso** (el del inicio y el del Perfil) también es de ejemplo: doscientos días de Sam que
  inventa `historiaDeSam` en `escena.mjs`, con semilla, para que inglés y español pinten lo mismo.
  Con sus pocas sesiones grabadas el año saldría con una casilla.
- **Las notas de la Memoria** son la bóveda de Sam (`P:\notes`), que escribe `casa.mjs`.
- **Las sesiones de relleno** de la barra, la agenda, las decisiones y las notas: datos del taller
  inventado, en `textos.mjs` y `preparar-sesiones.mjs`.

## Cómo se repiten

Con `cargo build` hecho (`C:\ct\debug\adeorq.exe`) y `pnpm dev` en marcha (el binario de desarrollo
carga de `localhost:1420`):

> **Si otra sesión tiene el 1420 o cambios a medias en `src/`** (lo normal aquí), todo sale de un
> worktree con su propio binario y su propio puerto, para que en las fotos no entre nada a medias:
>
> ```bash
> git worktree add --detach <scratchpad>/wt origin/main   # y CI=true pnpm install --frozen-lockfile dentro
> TAURI_CONFIG='{"build":{"devUrl":"http://127.0.0.1:1495"}}' CARGO_TARGET_DIR='C:\ct\demo-web' \
>   cargo build --manifest-path <wt>/src-tauri/Cargo.toml        # 3 min, aparte de C:\ct\debug
> node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1495 --strictPort   # desde <wt>
> export ADEORQ_EXE='C:\ct\demo-web\debug\adeorq.exe' ADEORQ_URL=127.0.0.1:1495
> ```
>
> `ADEORQ_EXE` lo leen `abrir.ps1`, `cerrar.ps1` y la grabadora (`motor.mjs`); `ADEORQ_URL`, la
> conexión a la ventana (`cdp.mjs`). **Ojo con `P:`**: apunta DENTRO del worktree, así que un
> `git -C P:/projects/<nombre>` con el nombre vacío sube hasta el worktree y un `reset --hard` se
> lleva tus cambios sin commitear (pasó el 2026-10-18). Comprueba que `P:/projects/<nombre>/.git`
> existe antes de reponer un proyecto.

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
   de partida (`git checkout`), o el agente no tiene nada que arreglar. Una sesión de Claude solo se
   regraba borrando antes su transcript (`~/.claude/projects/P--projects-<proyecto>/<sesion>.jsonl`):
   con el mismo `--session-id` Claude se niega a arrancar y la grabación sale vacía.
   **Después, `node avisos.mjs`**: con la cuenta justa, Claude Code pinta «You've used 98% of your
   session limit» encima del prompt y sale en la web; la que lo lleve se regraba. Codex dice al
   arrancar «You have 1 usage limit reset available», que sube con el scroll antes del corte: ese
   solo importa si se ve en la foto.
2. **Cortar** las dos que salen a mitad de trabajo: `node cortar.mjs en-landing` enseña la línea del
   tiempo; `node cortar.mjs en-landing 34950 en-landing-mid` corta. El mismo instante va en
   `preparar-sesiones.mjs`, que corta el transcript por ahí para que el estado cuadre. En las de
   Codex, corta antes de que ejecute Python: el de la máquina que graba vive en su carpeta de
   usuario, y la ruta saldría en la terminal (`hacer-demo.mjs` se pararía al verla).
3. **Sesiones**: `node preparar-sesiones.mjs en` (y `es`). Pone en `PANELES` de `textos.mjs` los
   títulos que imprime. Guarda además el transcript entero de cada grabada en `respaldo/<idioma>/`,
   y de ahí los saca cuando el hogar ya está limpio (paso 6): se puede relanzar otro día. Si le
   falta una fuente no toca lo que había preparado, lo dice y sale con error.
4. **Abrir** la app apartada de las pantallas: `powershell -File abrir.ps1`.
5. **Fotos**: `node fotos.mjs en` y `node fotos.mjs es` (o solo unas: `node fotos.mjs en canvas files`).
   Salen en `salida/<idioma>/` a 3840x2160.
6. **Cerrar** (`cerrar.ps1`), `subst P: /D` desde PowerShell, y borrar de `~/.claude/projects` las
   carpetas `P--projects-*` y de `~/.codex/sessions` los rollouts de `P:\projects\…` que dejó grabar.

A la web van con `ffmpeg -i salida/en/x.png -compression_level 9 -pred mixed web/assets/screens/en/x.png`.
El vídeo de `promo/` las coge de ahí con `pnpm capturas`.

**Las dos del móvil** (`phone-home.png` y `phone-concierge.png`, la sección «En tu móvil» de la
portada) no necesitan la casa de pruebas: son la página del móvil servida por un doble con el taller
de Sam. Un comando las rehace en los dos idiomas, directas a `web/assets/screens`:

```powershell
node scripts/laboratorio/capturas/movil/fotos-movil.mjs
```

Lanza y para él mismo `movil/doble-sam.mjs` (4392 y 4393). Hay que repetirlas cada vez que
`src-tauri/src/movil.html` cambia de cara.

## La demostración de la portada sale de aquí también

La ventana que se puede tocar en la portada de adeorq.com (`web/demo/`) no es una maqueta: es el
DOM de esta misma app de pruebas, volcado vista por vista. Con la app abierta como para las fotos
(pasos de arriba hasta el 4):

```powershell
node volcar.mjs es        # deja volcado/es/*.html, volcado/hojas.css
node volcar.mjs en
node ..\..\..\web\scripts\hacer-demo.mjs   # o `pnpm demo` desde web/
```

`volcar.mjs` saca la ventana entera en la Cabina y en el Lienzo, la raíz de cada una de las otras
vistas con cada una de sus pestañas, los paneles que se abren encima o al lado (objetivos, Pulso,
paleta, los tres de la derecha, la barra en logos y en tira) y las hojas de estilo que la página
tiene cargadas. `hacer-demo.mjs` lo empaqueta y **se para si encuentra una ruta o una dirección de
la máquina que hizo el volcado**. Una parte suelta se repite con `node volcar.mjs es chat barra`.

- **El volcado sale del árbol de trabajo**, no del último commit: el binario de pruebas carga la
  página de `pnpm dev`. Si otra sesión tiene cambios a medias en `src/`, salen en la demostración.
  Se hace con el árbol limpio, o desde un worktree.
- Lo que cuenta de la MÁQUINA de quien vuelca se contesta en `GUARDA` con los datos de Sam: el
  Pulso (memoria, núcleos, procesos), los modelos locales, la versión del binario, la tarjeta de
  «hay una versión nueva», tu uso y la lista de bóvedas de Obsidian (sale del `%APPDATA%` de
  verdad, que la casa no aísla: el resumen de la Memoria del Perfil enseñaba la bóveda de quien
  hacía el volcado).
- Cuentas, Agenda, Memoria y Comandos viven dentro del Perfil desde la 0.9.220: `vista()` llega a
  ellas tocando su resumen, y `volcar.mjs` deja aparte la vuelta de encima (`x-volver-<vista>`) y la
  lista de tu uso con cada pestaña (`x-porfolio-N`).
- Las terminales se vuelcan con el pintado de reserva (`sinWebgl`), que es texto: con WebGL son un
  lienzo y no hay nada que volcar. Lo mismo el mapa de la Memoria, que por eso se vuelca con un
  documento abierto.
- La barra se vuelca con todos los proyectos desplegados (la lista de sesiones de uno plegado no
  existe en la página) y `hacer-demo.mjs` vuelve a plegar todos menos el primero.
- Después, `web/scripts/censo-demo.js` pulsa todos los botones en los dos idiomas.

## Lo que costó averiguar

**La casa de pruebas**

- La casa falsa necesita `AppData\Local` creada, o el puerto de depuración no se abre.
- **No aísla**: el Administrador de credenciales, lo que suena en el equipo, el estado de la barra
  (`adeorq-state.json`, que vive en la carpeta de la app por su identificador) ni el protocolo de
  archivos (solo sirve la carpeta de datos DE VERDAD, así que el fondo no carga). Todo eso se tapa
  en la página, en `GUARDA` de `escena.mjs`: las llamadas a Rust viajan por `fetch` a
  `ipc.localhost/<comando>` y ahí se contestan `media_now`, `secret_*`, `load_ui_state`, y las
  cuentas de demostración. El fondo se le da a la imagen como `data:`.
- **Tampoco aísla Discord**: con el Discord de quien hace las fotos abierto, la app de pruebas
  publicaba su actividad en ese perfil mientras estaba en marcha (visto el 2026-10-12). Desde el
  2026-10-13 `GUARDA` contesta `discord_set` y `discord_clear` en la página y la orden no llega a
  Rust: Ajustes > Discord sigue diciendo «Publicado en tu Discord», que es lo que diría con uno
  de verdad, y en el perfil de nadie sale nada.
- **Los transcripts de las grabadas viven en el hogar real hasta que se limpian** (paso 6).
  El 2026-10-12 se relanzó `preparar-sesiones` después de limpiar y borró lo preparado antes de
  ver que no tenía de dónde rehacerlo: las cuatro sesiones en español se perdieron y hubo que
  suplirlas a mano con lo que el volcado anterior enseñaba de ellas. Ahora guarda copia en
  `respaldo/` y arma lo nuevo aparte antes de cambiar nada.
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
- En el Lienzo, por debajo de 0,55 de zoom las terminales salen como tarjeta con su nombre. El
  tablero de tareas ya vuelve a donde se guardó y con su medida (hasta el 2026-10-13 caía centrado
  en el origen: al reabrir se creaba sin pasarle su sitio).

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
