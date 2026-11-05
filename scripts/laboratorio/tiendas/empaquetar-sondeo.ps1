# Empaqueta el sondeo (no es Adeorq) en un .msix de PRUEBA y lo firma con un certificado
# desechable. Solo se usa en el runner de GitHub (`.github/workflows/tiendas.yml`): firmar
# aqui hace falta para poder instalarlo, y el certificado se confia solo en esa maquina.
#
#   ./empaquetar-sondeo.ps1 -Binarios <carpeta con sondeo.exe y sondeo-consola.exe> `
#       -Salida <carpeta> -Nombre Adeorq.SondeoA -Alias sondeoa -Version 1.9.241.0 `
#       -Editor "CN=AdeorqSondeoCI" -Pfx <cert.pfx> -ClavePfx <clave> [-Win32App]
#
# Deja `<Salida>\<Nombre>_<Version>.msix`.

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Binarios,
    [Parameter(Mandatory)] [string]$Salida,
    [Parameter(Mandatory)] [string]$Nombre,
    [Parameter(Mandatory)] [string]$Alias,
    [Parameter(Mandatory)] [string]$Version,
    [Parameter(Mandatory)] [string]$Editor,
    [string]$Pfx,
    [string]$ClavePfx,
    # `uap10:RuntimeBehavior="win32App"` en vez de `packagedClassicApp` (prueba T1).
    [switch]$Win32App,
    # Solo empaquetar, sin firmar: para comprobar el manifiesto en una maquina donde no se
    # quiere crear ningun certificado (`makeappx` valida el esquema; instalar pide firma).
    [switch]$SinFirmar
)
$ErrorActionPreference = 'Stop'

$aqui = $PSScriptRoot
$raiz = Resolve-Path (Join-Path $aqui '..\..\..')
$kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
function Herramienta($nombre) {
    $h = Get-ChildItem $kits -Filter $nombre -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*\x64\*' } | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $h) { throw "No encuentro $nombre en ${kits}: hace falta el SDK de Windows." }
    $h.FullName
}

$stage = Join-Path $Salida "stage-$Nombre"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage 'Assets') | Out-Null
foreach ($exe in 'sondeo.exe', 'sondeo-consola.exe') {
    $origen = Join-Path $Binarios $exe
    if (-not (Test-Path $origen)) { throw "Falta $origen" }
    Copy-Item $origen $stage
}
# Los iconos son los de Adeorq que Tauri ya genera: el sondeo solo necesita unos que existan.
foreach ($png in 'StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Square71x71Logo.png') {
    Copy-Item (Join-Path $raiz "src-tauri\icons\$png") (Join-Path $stage 'Assets')
}

$plantilla = Get-Content (Join-Path $aqui 'sondeo\AppxManifest.plantilla.xml') -Raw -Encoding UTF8
$entrada = 'EntryPoint="Windows.FullTrustApplication"'
$aplicacion = ''
$minimo = '10.0.18362.0'
if ($Win32App) {
    # Con win32App la aplicacion no lleva EntryPoint, y pide Windows 10 2004 (medido en E24, M4).
    $entrada = ''
    $aplicacion = 'uap10:RuntimeBehavior="win32App" uap10:TrustLevel="mediumIL"'
    $minimo = '10.0.19041.0'
}
$manifiesto = $plantilla.
    Replace('@NOMBRE@', $Nombre).Replace('@EDITOR@', $Editor).Replace('@VERSION@', $Version).
    Replace('@ALIAS@', $Alias).Replace('@MINVERSION@', $minimo).
    Replace('@ENTRADA@', $entrada).Replace('@APLICACION@', $aplicacion)
# Sin BOM: el manifiesto es XML y makeappx lo lee igual, pero asi no hay sorpresas.
[System.IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifiesto, (New-Object System.Text.UTF8Encoding($false)))

$msix = Join-Path $Salida "${Nombre}_$Version.msix"
Remove-Item $msix -Force -ErrorAction SilentlyContinue
& (Herramienta 'makeappx.exe') pack /d $stage /p $msix /o | Out-Host
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $msix)) { throw "makeappx fallo con $LASTEXITCODE" }
if ($SinFirmar) {
    Write-Host 'Sin firmar: no se puede instalar, solo se ha validado el manifiesto.'
} else {
    if (-not $Pfx -or -not $ClavePfx) { throw 'Para firmar hacen falta -Pfx y -ClavePfx (o -SinFirmar).' }
    & (Herramienta 'signtool.exe') sign /fd SHA256 /f $Pfx /p $ClavePfx $msix | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "signtool fallo con $LASTEXITCODE" }
}
Write-Host "Paquete listo: $msix ($([math]::Round((Get-Item $msix).Length / 1KB)) KB)"
