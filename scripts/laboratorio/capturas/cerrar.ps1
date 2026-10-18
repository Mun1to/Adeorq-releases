# Cierra la Adeorq de pruebas, y SOLO esa: el PID sale de P:\pid.txt y antes de
# tocar nada se comprueba que su ruta es la del binario de desarrollo.
#   -Golpe : mata solo el proceso de la app, como una caida (sin arbol).
#   (nada) : mata la app con todo su arbol, como un cierre de verdad.
#   -Motor : ademas, cierra los procesos de terminales (--terminales) de pruebas.
param([switch]$Golpe, [switch]$Motor)
$exe = if ($env:ADEORQ_EXE) { $env:ADEORQ_EXE } else { "C:\ct\debug\adeorq.exe" }
$id =[int](Get-Content "P:\pid.txt" -ErrorAction SilentlyContinue)
$p = if ($id) { Get-Process -Id $id -ErrorAction SilentlyContinue }
if ($p -and $p.Path -eq $exe) {
    if ($Golpe) { Stop-Process -Id $id -Force; "caida: $id" }
    else { taskkill /PID $id /T /F | Out-Null; "cerrada con su arbol: $id" }
} else { "la app no estaba ($id)" }
if ($Motor) {
    Start-Sleep -Milliseconds 500
    Get-CimInstance Win32_Process -Filter "Name='adeorq.exe'" |
        Where-Object { $_.ExecutablePath -eq $exe -and $_.CommandLine -match '--terminales' } |
        ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null; "motor cerrado: $($_.ProcessId)" }
}
