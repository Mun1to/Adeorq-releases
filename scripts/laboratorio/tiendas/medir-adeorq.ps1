# La prueba T9 de `docs/contexto/tiendas.md`: la ADEORQ DE VERDAD, compilada en el runner, dos veces.
#
#   1. NORMAL: el `adeorq.exe` recien compilado, lanzado sin paquete. Es la instalacion de siempre,
#      y lo que se mide es que no cambia nada.
#   2. EMPAQUETADA: el mismo .exe en un paquete MSIX de prueba (firmado con un certificado
#      desechable, solo en esta maquina), instalado y lanzado por su alias.
#
# Cada vuelta abre la app con su ventana depurable en el puerto 9333 y le pasa `adeorq-en-paquete.mjs`,
# que mide desde fuera. Con una SORPRESA o un ERROR sale con 1. Solo corre en un runner de GitHub:
# instala un paquete y confia un certificado en la maquina. Nunca en el equipo de trabajo de nadie.
#
#   medir-adeorq.ps1 -Release <carpeta con adeorq.exe> -Salida <carpeta>
#
# Sin tildes a proposito: Windows PowerShell 5.1 lee un .ps1 sin BOM como ANSI.

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Release,
    [Parameter(Mandatory)] [string]$Salida
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$raiz = Resolve-Path (Join-Path $aqui '..\..\..')
New-Item -ItemType Directory -Force $Salida | Out-Null
$trabajo = Join-Path $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }) 'adeorq-trabajo'
New-Item -ItemType Directory -Force $trabajo | Out-Null
$casa = $env:USERPROFILE
$exe = Join-Path $Release 'adeorq.exe'
if (-not (Test-Path $exe)) { throw "No encuentro $exe" }
$medidor = Join-Path $aqui 'adeorq-en-paquete.mjs'
$fallos = 0

function Parar-Adeorq {
    # Solo las que cuelgan de ESTE runner: es una maquina desechable. Con su arbol (las terminales).
    # Por `cmd`: con `$ErrorActionPreference = 'Stop'`, la queja de taskkill por un proceso que ya
    # no esta (se cerro entre mirar y matar) se volvia una excepcion que tumbaba el guion entero.
    foreach ($p in @(Get-Process -Name adeorq -ErrorAction SilentlyContinue)) { & cmd /c "taskkill /PID $($p.Id) /T /F >nul 2>&1" }
    Start-Sleep -Seconds 3
}

function Preparar-Datos([string]$Carpeta) {
    # El ajuste de los laboratorios: lo de fuera (un cliente que no es una terminal de Adeorq) puede mandar
    # comandos, que es lo que hace falta para mirar una terminal por el MCP. Y la carpeta de proyectos.
    New-Item -ItemType Directory -Force $Carpeta | Out-Null
    Set-Content (Join-Path $Carpeta 'mcp_clientes.json') '{"niveles":{"fuera":"auto"}}' -Encoding ASCII
    New-Item -ItemType Directory -Force (Join-Path $casa 'proyectos-ci') | Out-Null
}

function Vuelta([string]$Modo, [string]$Ejecutable, [string]$DatosAntes) {
    Write-Host "`n========== $Modo =========="
    Parar-Adeorq
    Preparar-Datos $DatosAntes
    # La ventana depurable ya va en la configuracion de esta compilacion (`config-de-prueba.mjs`).
    $env:ADEORQ_MCP_PUERTO = '3012'
    $inicio = Get-Date
    $lanzado = Start-Process -FilePath $Ejecutable -PassThru
    Start-Sleep -Seconds 10
    $vivas = @(Get-Process -Name adeorq -ErrorAction SilentlyContinue)
    Write-Host ("A los 10 s: lanzador {0}, procesos adeorq vivos: {1}" -f $(if ($lanzado.HasExited) { "terminado con codigo $($lanzado.ExitCode)" } else { 'vivo' }), $vivas.Count)
    # Por que no abre la ventana depurable: le llego el argumento al WebView2? que puertos escucha?
    $webviews = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue)
    $conDepuracion = @($webviews | Where-Object { $_.CommandLine -match 'remote-debugging-port' })
    Write-Host "webviews: $($webviews.Count), con --remote-debugging-port: $($conDepuracion.Count)"
    foreach ($w in ($webviews | Select-Object -First 1)) { Write-Host ("  un webview: " + $w.CommandLine.Substring(0, [Math]::Min(700, $w.CommandLine.Length))) }
    $pidsW = @($webviews | ForEach-Object { $_.ProcessId }) + @($vivas | ForEach-Object { $_.Id })
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $pidsW -contains $_.OwningProcess } |
        ForEach-Object { Write-Host "  escucha: $($_.LocalAddress):$($_.LocalPort) (proceso $($_.OwningProcess))" }
    # `| Out-Host`: lo que sale de `node` no puede mezclarse con el valor que devuelve esta funcion.
    & node $medidor $Modo $Ejecutable $Salida | Out-Host
    $codigo = $LASTEXITCODE
    Diagnostico $Modo $inicio
    Parar-Adeorq
    return $codigo
}

# Lo que cuenta la maquina de una vuelta: el rastro de Adeorq, que procesos quedan y lo que Windows apunto.
function Diagnostico([string]$Modo, [datetime]$Desde) {
    Write-Host "`n-- Diagnostico de $Modo"
    foreach ($r in (Join-Path $env:LOCALAPPDATA 'Adeorq\rastro.log'), (Join-Path $casa '.adeorq\rastro.log')) {
        if (Test-Path $r) {
            Write-Host "rastro: $r"
            Get-Content $r -Tail 25 | ForEach-Object { Write-Host "   $_" }
            Copy-Item $r (Join-Path $Salida ("rastro-diag-$Modo-" + (Split-Path (Split-Path $r) -Leaf) + '.log')) -Force
        }
    }
    Write-Host ("procesos adeorq: " + ((Get-Process -Name adeorq -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -join ', '))
    Write-Host ("procesos msedgewebview2: " + @(Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue).Count)
    try {
        Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $Desde } -ErrorAction Stop |
            Where-Object { $_.Message -match 'adeorq|WebView2|msedgewebview2' } | Select-Object -First 6 |
            ForEach-Object { Write-Host ("evento {0} {1} {2}: {3}" -f $_.TimeCreated.ToString('HH:mm:ss'), $_.Id, $_.ProviderName, ($_.Message -replace '\s+', ' ').Substring(0, [Math]::Min(280, $_.Message.Length))) }
    } catch { Write-Host "(sin eventos de Application para adeorq: $($_.Exception.Message))" }
}

# -- 1. La instalacion de siempre --------------------------------------------------------------
$c = Vuelta 'normal' $exe (Join-Path $env:LOCALAPPDATA 'Adeorq')
if ($c -ne 0) { $fallos++ }

# -- 2. El paquete -------------------------------------------------------------------------------
Write-Host "`n== Montaje del paquete"
$editor = 'CN=AdeorqSondeoCI'
$clave = [guid]::NewGuid().ToString('N')
$cert = New-SelfSignedCertificate -Type Custom -Subject $editor -KeyUsage DigitalSignature -FriendlyName 'Adeorq CI' `
    -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
$pfx = Join-Path $trabajo 'adeorq.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $clave -AsPlainText -Force) | Out-Null
$cer = Join-Path $trabajo 'adeorq.cer'
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null

$paquete = Join-Path $Salida 'paquete'
& (Join-Path $raiz 'scripts\tiendas\empaquetar.ps1') -Release $Release -Salida $paquete -Nombre 'Adeorq.PruebaCI' -Editor $editor -Pfx $pfx -ClavePfx $clave -SinProbar
if ($LASTEXITCODE -ne 0) { throw "empaquetar.ps1 salio con $LASTEXITCODE" }
Add-AppxPackage -Path (Join-Path $paquete 'Adeorq.msix')
Write-Host (Get-AppxPackage -Name 'Adeorq.PruebaCI' | ForEach-Object { "$($_.Name) $($_.Version) $($_.InstallLocation)" })
$alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\adeorq.exe'
$visto = $false
for ($i = 0; $i -lt 60 -and -not $visto; $i++) { $visto = Test-Path $alias; if (-not $visto) { Start-Sleep -Milliseconds 500 } }
if (-not $visto) { throw "El alias $alias no aparece tras instalar" }

try {
    $c = Vuelta 'empaquetada' $alias (Join-Path $casa '.adeorq')
    if ($c -ne 0) { $fallos++ }
} finally {
    Parar-Adeorq
    Get-AppxPackage -Name 'Adeorq.PruebaCI' | Remove-AppxPackage
}

# -- Informe -------------------------------------------------------------------------------------------
$md = ''
foreach ($f in 'resumen-normal.md', 'resumen-empaquetada.md') {
    $ruta = Join-Path $Salida $f
    if (Test-Path $ruta) { $md += "`n### $f`n`n" + (Get-Content $ruta -Raw) }
}
if ($env:GITHUB_STEP_SUMMARY -and $md) { Add-Content $env:GITHUB_STEP_SUMMARY $md -Encoding UTF8 }
Write-Host "`nVueltas con sorpresas o errores: $fallos"
if ($fallos -gt 0) { exit 1 }
