# La X de la ventana, con un Adeorq de desarrollo PROPIO: que pregunte a la
# ventana, que la esconda en la bandeja, que vuelva y que cierre. Es la mitad de
# Rust (`cierre.rs`) del aviso al cerrar; la de la ventana la prueba
# `al-cerrar.js` con un doble.
#
#   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
#   2. Copiar ese .exe a otro sitio (el siguiente build lo pisa) y, desde PowerShell:
#      scripts\laboratorio\al-cerrar-de-verdad.ps1 -Exe <ruta del .exe copiado>
#
# Necesita el puerto 1420 libre: ahi sirve una pagina que hace de ventana solo
# para el cierre (`cierre-pagina-que-contesta.mjs`) y contesta segun el caso.
# Solo el build de DESARROLLO convive con el Adeorq instalado. Comparten
# `%LOCALAPPDATA%\Adeorq`, asi que las lineas de esta prueba SE APUNTAN en su
# rastro.log («la ventana no contesto», «pasa a segundo plano»): decirlo donde
# toque. Solo toca procesos que lanza el, y por su PID.
#
# Los seis casos:
#   mudo            la ventana no contesta: el seguro cierra a los 1,5 s
#   cancelar        contesta y no hace nada: la app sigue abierta y a la vista
#   salir           contesta «cerrar todo»: sale con 0, y sin esperar al seguro
#   fondo-y-vuelve  se esconde (proceso vivo, ventana oculta) y a los 4 s vuelve
#   fondo           escondida, y el instalador la cierra igual (Restart Manager)
#   instalador      a la vista, el instalador la cierra sin pasar por el aviso
#
# Sin tildes en las cadenas de abajo: PowerShell 5.1 lee este fichero como ANSI.
param(
  [Parameter(Mandatory = $true)][string]$Exe
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlCerrar {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmShutdown(uint pSessionHandle, uint lActionFlags, IntPtr fnStatus);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@

function Cerrar-ComoElInstalador([System.Diagnostics.Process]$p) {
  $bytes = [BitConverter]::GetBytes([int64]$p.StartTime.ToFileTime())
  $u = New-Object AlCerrar+RM_UNIQUE_PROCESS
  $u.dwProcessId = $p.Id
  $u.ProcessStartTime.dwLowDateTime = [BitConverter]::ToInt32($bytes, 0)
  $u.ProcessStartTime.dwHighDateTime = [BitConverter]::ToInt32($bytes, 4)
  $sesion = [uint32]0
  $r = [AlCerrar]::RmStartSession([ref]$sesion, 0, [guid]::NewGuid().ToString("N"))
  if ($r -ne 0) { throw "RmStartSession: $r" }
  try {
    $r = [AlCerrar]::RmRegisterResources($sesion, 0, $null, 1, @($u), 0, $null)
    if ($r -ne 0) { throw "RmRegisterResources: $r" }
    [void][AlCerrar]::RmShutdown($sesion, 0, [IntPtr]::Zero)
  } finally {
    [void][AlCerrar]::RmEndSession($sesion)
  }
}

if (Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue) {
  throw "El puerto 1420 esta ocupado (un Vite?): la app cargaria la interfaz de verdad."
}
$rastro = Join-Path $env:LOCALAPPDATA "Adeorq\rastro.log"
function Cuenta([string]$patron) { (Select-String -Path $rastro -Pattern $patron -Encoding utf8).Count }

$fallos = 0
$casos = "mudo", "cancelar", "salir", "fondo-y-vuelve", "fondo", "instalador"
foreach ($caso in $casos) {
  # «instalador» no pasa por el aviso: da igual lo que conteste la pagina.
  $modo = if ($caso -eq "instalador") { "mudo" } else { $caso }
  $pagina = Start-Process -FilePath node -ArgumentList "`"$(Join-Path $PSScriptRoot 'cierre-pagina-que-contesta.mjs')`"", $modo -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 1
  $panicos = Cuenta "NICO en el hilo"
  $seguros = Cuenta "pedido de cierre"
  $escondidas = Cuenta "pasa a segundo plano"
  $p = Start-Process -FilePath $Exe -PassThru
  try {
    for ($i = 0; $i -lt 60 -and $p.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $p.Refresh() }
    $ventana = $p.MainWindowHandle
    Start-Sleep -Seconds 4
    $visto = @()
    $bien = $true
    if ($caso -eq "instalador") { Cerrar-ComoElInstalador $p } else { [void][AlCerrar]::PostMessage($ventana, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }

    switch ($caso) {
      "mudo" {
        $sale = $p.WaitForExit(8000)
        $visto += "sale=$sale codigo=$(if ($sale) { $p.ExitCode })"
        $bien = $sale -and $p.ExitCode -eq 0 -and ((Cuenta "pedido de cierre") - $seguros) -eq 1
      }
      "salir" {
        $sale = $p.WaitForExit(8000)
        $visto += "sale=$sale codigo=$(if ($sale) { $p.ExitCode })"
        # Si lo hubiera cerrado el seguro, lo habria apuntado.
        $bien = $sale -and $p.ExitCode -eq 0 -and ((Cuenta "pedido de cierre") - $seguros) -eq 0
      }
      "instalador" {
        $sale = $p.WaitForExit(25000)
        $visto += "sale=$sale codigo=$(if ($sale) { $p.ExitCode })"
        $bien = $sale -and $p.ExitCode -eq 0 -and ((Cuenta "pedido de cierre") - $seguros) -eq 0
      }
      "cancelar" {
        Start-Sleep -Seconds 4
        $p.Refresh()
        $visible = [AlCerrar]::IsWindowVisible($ventana)
        $visto += "viva=$(-not $p.HasExited) visible=$visible"
        $bien = (-not $p.HasExited) -and $visible -and ((Cuenta "pedido de cierre") - $seguros) -eq 0
      }
      "fondo-y-vuelve" {
        Start-Sleep -Milliseconds 2500
        $p.Refresh()
        $oculta = -not [AlCerrar]::IsWindowVisible($ventana)
        $apuntado = ((Cuenta "pasa a segundo plano") - $escondidas) -eq 1
        Start-Sleep -Seconds 5
        $p.Refresh()
        $vuelve = [AlCerrar]::IsWindowVisible($ventana)
        $visto += "viva=$(-not $p.HasExited) oculta=$oculta apuntado=$apuntado vuelve=$vuelve"
        $bien = (-not $p.HasExited) -and $oculta -and $apuntado -and $vuelve
      }
      "fondo" {
        Start-Sleep -Milliseconds 2500
        $p.Refresh()
        $oculta = -not [AlCerrar]::IsWindowVisible($ventana)
        Cerrar-ComoElInstalador $p
        $sale = $p.WaitForExit(25000)
        $visto += "oculta=$oculta sale=$sale codigo=$(if ($sale) { $p.ExitCode })"
        $bien = $oculta -and $sale -and $p.ExitCode -eq 0
      }
    }
    Start-Sleep -Milliseconds 500
    $nuevos = (Cuenta "NICO en el hilo") - $panicos
    if ($nuevos -ne 0) { $bien = $false }
    if (-not $bien) { $fallos++ }
    "{0,-15} PID {1,-6} {2}  panicos nuevos {3}  {4}" -f $caso, $p.Id, ($visto -join " "), $nuevos, $(if ($bien) { "OK" } else { "FALLA" })
  } finally {
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Confirm:$false -ErrorAction SilentlyContinue }
    Stop-Process -Id $pagina.Id -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
  }
}
if ($fallos) { "$fallos de $($casos.Count) casos fallan"; exit 1 } else { "los $($casos.Count) casos van bien" }
