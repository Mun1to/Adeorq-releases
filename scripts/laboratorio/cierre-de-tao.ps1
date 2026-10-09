# ¿Revienta Adeorq al cerrarse? El pánico de tao «cannot move state from
# Destroyed» (runner.rs) salió 13 veces en el rastro de Munir entre septiembre y
# octubre de 2026, y el 2026-10-10 se cazó el porqué: el instalador de Tauri
# cierra la app con el Restart Manager de Windows (tauri#14479), que le manda
# WM_QUERYENDSESSION y WM_ENDSESSION, y tao hasta la 0.37 no salía al recibirlo
# (tao#1157). O sea, cada actualización instalada encima rompía la vieja al
# cerrarla. Este guion lo reproduce con un Adeorq de desarrollo PROPIO:
#
#   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
#   2. Copiar ese .exe a otro sitio (el siguiente build lo pisa) y, desde PowerShell:
#      scripts\laboratorio\cierre-de-tao.ps1 -Exe <ruta del .exe copiado>
#
# Necesita el puerto 1420 libre (para el Vite de `pnpm dev`): ahí sirve una página
# en blanco (`cierre-pagina-en-blanco.mjs`) para que la app arranque sin su
# interfaz y no restaure paneles ni lance agentes. Solo el build de DESARROLLO
# convive con el Adeorq instalado; el de release tiene instancia única y le
# pasaría el arranque al de Munir. Comparten `%LOCALAPPDATA%\Adeorq`, así que un
# pánico de esta prueba SE APUNTA en su rastro.log: decirlo donde toque.
#
# Medido el 2026-10-10: tao 0.35.3 sale con código 101 y el pánico en el rastro
# las dos veces; tao 0.37.1 sale con 0 y sin pánico, al cierre del instalador y
# al de la X (WM_CLOSE). Solo toca procesos que lanza él, y por su PID.
# Sin tildes en las cadenas de abajo: PowerShell 5.1 lee este fichero como ANSI.
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [int]$Veces = 2
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CierreDeTao {
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
}
'@

# Lo que hace el instalador: una sesion del Restart Manager con este proceso
# dentro, y RmShutdown sin forzar.
function Cerrar-ComoElInstalador([System.Diagnostics.Process]$p) {
  $bytes = [BitConverter]::GetBytes([int64]$p.StartTime.ToFileTime())
  $u = New-Object CierreDeTao+RM_UNIQUE_PROCESS
  $u.dwProcessId = $p.Id
  $u.ProcessStartTime.dwLowDateTime = [BitConverter]::ToInt32($bytes, 0)
  $u.ProcessStartTime.dwHighDateTime = [BitConverter]::ToInt32($bytes, 4)
  $sesion = [uint32]0
  $r = [CierreDeTao]::RmStartSession([ref]$sesion, 0, [guid]::NewGuid().ToString("N"))
  if ($r -ne 0) { throw "RmStartSession: $r" }
  try {
    $r = [CierreDeTao]::RmRegisterResources($sesion, 0, $null, 1, @($u), 0, $null)
    if ($r -ne 0) { throw "RmRegisterResources: $r" }
    "RmShutdown = $([CierreDeTao]::RmShutdown($sesion, 0, [IntPtr]::Zero))"
  } finally {
    [void][CierreDeTao]::RmEndSession($sesion)
  }
}

# Lo que hace la X.
function Cerrar-ComoLaX([System.Diagnostics.Process]$p) {
  "WM_CLOSE = $([CierreDeTao]::PostMessage($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero))"
}

if (Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue) {
  throw "El puerto 1420 esta ocupado (un Vite?): la app cargaria la interfaz de verdad."
}
$rastro = Join-Path $env:LOCALAPPDATA "Adeorq\rastro.log"
$patron = "NICO en el hilo"
$pagina = Start-Process -FilePath node -ArgumentList "`"$(Join-Path $PSScriptRoot 'cierre-pagina-en-blanco.mjs')`"" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 1
$fallos = 0
try {
  $pruebas = @()
  for ($i = 0; $i -lt $Veces; $i++) { $pruebas += "instalador" }
  $pruebas += "x"
  foreach ($como in $pruebas) {
    $antes = (Select-String -Path $rastro -Pattern $patron -Encoding utf8).Count
    $p = Start-Process -FilePath $Exe -PassThru
    for ($i = 0; $i -lt 60 -and $p.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $p.Refresh() }
    Start-Sleep -Seconds 2
    if ($como -eq "x") { Cerrar-ComoLaX $p } else { Cerrar-ComoElInstalador $p }
    if ($p.WaitForExit(25000)) { $codigo = $p.ExitCode } else { $codigo = "colgado"; Stop-Process -Id $p.Id -Confirm:$false }
    Start-Sleep -Milliseconds 500
    $panicos = (Select-String -Path $rastro -Pattern $patron -Encoding utf8).Count - $antes
    $bien = ($codigo -eq 0 -and $panicos -eq 0)
    if (-not $bien) { $fallos++ }
    "{0,-10} PID {1,-6} codigo {2,-8} panicos nuevos {3}  {4}" -f $como, $p.Id, $codigo, $panicos, $(if ($bien) { "OK" } else { "FALLA" })
  }
} finally {
  Stop-Process -Id $pagina.Id -Confirm:$false -ErrorAction SilentlyContinue
}
if ($fallos) { "$fallos de $($pruebas.Count) cierres revientan"; exit 1 } else { "los $($pruebas.Count) cierres salen limpios" }
