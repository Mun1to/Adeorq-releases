# Abre la Adeorq de pruebas: el binario de desarrollo con TODAS sus carpetas en P:
# (la casa, los datos y el perfil del navegador), y el puerto de depuración para
# manejarla por dentro. No toca la Adeorq instalada ni sus datos.
# La ventana se aparta fuera de las tres pantallas en cuanto existe: las fotos
# salen de la página por dentro, no de la pantalla.
$ErrorActionPreference = "Stop"
# Con ADEORQ_EXE, otro binario de desarrollo (el que carga de otro puerto: ver el README).
$exe = if ($env:ADEORQ_EXE) { $env:ADEORQ_EXE } else { "C:\ct\debug\adeorq.exe" }
$env:LOCALAPPDATA = "P:\data"
$env:USERPROFILE = "P:\home"
$env:WEBVIEW2_USER_DATA_FOLDER = "P:\wv2"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding"
foreach ($k in @(Get-ChildItem Env: | Where-Object { ($_.Name -like "CLAUDE*" -and $_.Name -ne "CLAUDE_CODE_GIT_BASH_PATH") -or $_.Name -eq "ADEORQ_PANE_ID" })) {
    Remove-Item "Env:\$($k.Name)"
}
$p = Start-Process -FilePath $exe -WorkingDirectory "P:\projects" -PassThru
Set-Content -Path "P:\pid.txt" -Value $p.Id -Encoding ascii
"PID $($p.Id)"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Ventana {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr tras, int x, int y, int cx, int cy, uint flags);
}
"@
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    $q = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
    if (-not $q) { "el proceso se fue"; break }
    if ($q.MainWindowHandle -ne 0 -and $q.MainWindowTitle -like "Adeorq*") {
        # 0x0001 sin tamaño, 0x0004 sin orden, 0x0010 sin activar
        [void][Ventana]::SetWindowPos($q.MainWindowHandle, [IntPtr]::Zero, 6000, 0, 0, 0, 0x0015)
        "apartada: $($q.MainWindowTitle)"
        break
    }
}
