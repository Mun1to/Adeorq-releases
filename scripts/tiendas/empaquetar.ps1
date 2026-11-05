# Monta el paquete .msix de Adeorq para la Microsoft Store a partir de un build de release.
#
# Es la receta de `C:\proyectos\VoCript\tools\msix\empaquetar.ps1` adaptada a Adeorq. Cada paso
# es una de las cosas que hay que acordarse de hacer, y el script se niega a empaquetar si falta
# alguna (en VoCript, olvidar una costo un rechazo de la Tienda). Capitulo: `docs/contexto/tiendas.md`.
#
#   .\scripts\tiendas\empaquetar.ps1 -Salida C:\temp\adeorq-msix
#   .\scripts\tiendas\empaquetar.ps1 -Salida ... -Nombre X -Editor "CN=Y" -VersionTienda 1.9.242.0
#   .\scripts\tiendas\empaquetar.ps1 -Salida ... -Pfx p.pfx -ClavePfx clave   # firma una prueba
#
# SIN firmar es lo que se sube a Partner Center (la Tienda firma ella). Firmado con un certificado
# propio solo sirve para instalarlo en un Windows de pruebas.
#
# Sin tildes a proposito: Windows PowerShell 5.1 lee un .ps1 sin BOM como ANSI y las tildes salen rotas.
#
# NOMBRE Y EDITOR SON MARCADORES: 'Adeorq' no esta reservado en Partner Center (E24), y el editor es
# el de la cuenta de VoCript. Cuando se reserve, se pasan los de verdad. LA VERSION DE LA TIENDA
# TAMBIEN: la Tienda no admite un numero que empiece por 0 (la 0.9.242 no se puede subir) y
# `{mayor+1}.{menor}.{parche}.0` es una PROPUESTA; la decision es de Munir y no se deshace.

[CmdletBinding()]
param(
    # Carpeta con el build de release. Por defecto la de esta maquina: CARGO_TARGET_DIR esta en C:\ct.
    # Es una carpeta COMPARTIDA con otros proyectos: de aqui solo se copia `adeorq.exe`.
    [string]$Release = 'C:\ct\release',
    [Parameter(Mandatory)] [string]$Salida,
    [string]$Nombre = 'Munito.AdeorqPrueba',
    [string]$Editor = 'CN=AF5AFDE8-6E9C-4644-9F84-DC0C5CAF743A',
    [string]$VersionTienda,
    [string]$Pfx,
    [string]$ClavePfx,
    # Saltarse el arranque de prueba desde la carpeta del paquete (en un runner no hay quien lo mire).
    [switch]$SinProbar
)
$ErrorActionPreference = 'Stop'

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$conf = Join-Path $raiz 'src-tauri\tauri.conf.json'
$plantilla = Join-Path $PSScriptRoot 'AppxManifest.plantilla.xml'
function Paso($n, $texto) { Write-Host "[$n] $texto" -ForegroundColor Cyan }
function Mal($texto) { Write-Host "  $texto" -ForegroundColor Red }
function Bien($texto) { Write-Host "  $texto" -ForegroundColor Green }
function Falla($texto) { Mal $texto; exit 1 }

# --- 1. Versiones ---------------------------------------------------------------------------
Paso 1 'Versiones'
$tauri = Get-Content $conf -Raw | ConvertFrom-Json
$versionApp = $tauri.version
if ($versionApp -notmatch '^(\d+)\.(\d+)\.(\d+)$') { Falla "La version de la app no es mayor.menor.parche: $versionApp" }
$propuesta = '{0}.{1}.{2}.0' -f ([int]$Matches[1] + 1), $Matches[2], $Matches[3]
if (-not $VersionTienda) {
    $VersionTienda = $propuesta
    Write-Host "  AVISO: version de la tienda $VersionTienda es la PROPUESTA de tiendas.md (1.5), no una decision." -ForegroundColor Yellow
}
if ($VersionTienda -notmatch '^[1-9]\d{0,4}\.\d{1,5}\.\d{1,5}\.0$') {
    Falla "La version de la tienda ($VersionTienda) no vale: cuatro numeros, el primero no puede ser 0 y el ultimo tiene que ser 0."
}
Bien "app $versionApp, paquete $VersionTienda"

# --- 2. El build tiene que existir y ser el de esta version ----------------------------------------
Paso 2 'Comprobando el build de release'
$exeOrigen = Join-Path $Release 'adeorq.exe'
if (-not (Test-Path $exeOrigen)) { Falla "No encuentro $exeOrigen. Lanza antes: pnpm tauri build --no-bundle" }
$edad = (New-TimeSpan -Start (Get-Item $exeOrigen).LastWriteTime).TotalHours
Bien ('adeorq.exe de hace {0:N1} h' -f $edad)
$versionExe = (Get-Item $exeOrigen).VersionInfo.FileVersion
if ($versionExe -ne $versionApp) { Falla "Ese adeorq.exe dice ser la $versionExe y estamos empaquetando la $versionApp." }
Bien "el exe se declara $versionExe"

# --- 2b. Y tiene que llevar la interfaz DENTRO ---------------------------------------------------------
# Tauri decide en compilacion de donde carga la interfaz: `pnpm tauri build` la empotra en el binario y
# `cargo build --release` NO, y ese exe abre `localhost refused to connect` (rechazo de VoCript, 2026-08-21).
# C:\ct\release lo comparten varios proyectos: hay que mirar el archivo que se va a copiar.
Paso '2b' 'Comprobando que el exe lleva la interfaz dentro'
$texto = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($exeOrigen))
$incrustados = ([regex]::Matches($texto, '/assets/[A-Za-z0-9_-]+\.(js|css)') | ForEach-Object { $_.Value } | Sort-Object -Unique).Count
$texto = $null
if ($incrustados -eq 0) { Falla "Ese exe NO lleva la interfaz dentro: es un binario de desarrollo. Recompila con 'pnpm tauri build --no-bundle'." }
$dist = Join-Path $raiz 'dist\assets'
if (Test-Path $dist) {
    $enDisco = (Get-ChildItem $dist -Include *.js, *.css -Recurse).Count
    if ($incrustados -lt $enDisco) { Falla "El exe lleva $incrustados assets y en dist hay ${enDisco}: ese build es de otra version del frontend." }
}
Bien "$incrustados assets empotrados en el binario"

# --- 3. Copiar lo que de verdad se distribuye ---------------------------------------------------------
# El instalador real lleva, ademas del exe, lo declarado en `bundle.resources`. De la fuente (el repo),
# no de la carpeta de release.
Paso 3 'Copiando el ejecutable y los recursos'
$stage = Join-Path $Salida 'stage'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage 'Assets') | Out-Null
Copy-Item $exeOrigen $stage
$recursos = $tauri.bundle.resources
$nombres = @($recursos.PSObject.Properties.Name)
if ($nombres.Count -lt 5) { Falla "tauri.conf.json declara solo $($nombres.Count) recursos y deberian ser 5." }
foreach ($origen in $nombres) {
    $destino = $recursos.$origen
    $fuente = Join-Path (Join-Path $raiz 'src-tauri') $origen
    if (-not (Test-Path $fuente)) { Falla "Falta el recurso $fuente" }
    $dentro = Join-Path $stage $destino
    New-Item -ItemType Directory -Force (Split-Path $dentro) | Out-Null
    Copy-Item $fuente $dentro
}
Bien "adeorq.exe y $($nombres.Count) recursos copiados"
foreach ($png in 'StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Square71x71Logo.png') {
    $icono = Join-Path $raiz "src-tauri\icons\$png"
    if (-not (Test-Path $icono)) { Falla "Falta el icono $icono" }
    Copy-Item $icono (Join-Path $stage 'Assets')
}
Bien 'iconos copiados'

# --- 4. El manifiesto -----------------------------------------------------------------------------------
Paso 4 'Manifiesto'
$manifiesto = (Get-Content $plantilla -Raw -Encoding UTF8).Replace('@NOMBRE@', $Nombre).Replace('@EDITOR@', $Editor).Replace('@VERSION@', $VersionTienda)
if ($manifiesto -match '@[A-Z]+@') { Falla "Quedan marcadores sin rellenar en el manifiesto: $($Matches[0])" }
[System.IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifiesto, (New-Object System.Text.UTF8Encoding($false)))
Bien "$Nombre $VersionTienda ($Editor)"

# --- 5. Que arranque desde ahi --------------------------------------------------------------------------
if (-not $SinProbar) {
    Paso 5 'Arrancando la app desde la carpeta del paquete (dejara una ventana unos segundos)'
    if (Get-Process -Name adeorq -ErrorAction SilentlyContinue) { Falla 'Hay una Adeorq abierta; cierrala antes (es de instancia unica y la prueba no valdria).' }
    $proc = Start-Process (Join-Path $stage 'adeorq.exe') -PassThru
    Start-Sleep -Seconds 15
    if ($proc.HasExited) { Falla "La app se cerro sola con codigo $($proc.ExitCode). Falta algo en la carpeta." }
    Bien 'sigue viva a los 15 s'
    Stop-Process -Id $proc.Id -Force
    $limite = (Get-Date).AddSeconds(30)
    while ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite) { Start-Sleep -Milliseconds 500 }
    Start-Sleep -Seconds 2
} else {
    Write-Host '[5] Arranque de prueba SALTADO (-SinProbar)' -ForegroundColor Yellow
}

# --- 6. Empaquetar --------------------------------------------------------------------------------------
Paso 6 'Empaquetando'
$kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
function Herramienta($nombre) {
    $h = Get-ChildItem $kits -Filter $nombre -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*\x64\*' } | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $h) { Falla "No encuentro $nombre en ${kits}: hace falta el SDK de Windows." }
    $h.FullName
}
$msix = Join-Path $Salida 'Adeorq.msix'
# El paquete anterior se borra ANTES: si makeappx falla, mejor no tener paquete que el de la version pasada.
Remove-Item $msix -Force -ErrorAction SilentlyContinue
& (Herramienta 'makeappx.exe') pack /d $stage /p $msix /o | Out-Host
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $msix)) { Falla "makeappx fallo con codigo $LASTEXITCODE y no hay paquete." }
if ($Pfx) {
    if (-not $ClavePfx) { Falla 'Para firmar hacen falta -Pfx y -ClavePfx.' }
    & (Herramienta 'signtool.exe') sign /fd SHA256 /f $Pfx /p $ClavePfx $msix | Out-Host
    if ($LASTEXITCODE -ne 0) { Falla "signtool fallo con codigo $LASTEXITCODE" }
    Bien 'firmado con el certificado de pruebas (NO es lo que se sube a la Tienda)'
}
$mb = [math]::Round((Get-Item $msix).Length / 1MB, 1)
Bien "$msix ($mb MB)"
if ($mb -lt 5) { Falla "Ese tamano es sospechoso para un exe de unos 28 MB: faltan cosas." }

Write-Host ''
Write-Host "Paquete $VersionTienda listo (marcadores: $Nombre / $Editor)." -ForegroundColor Green
