# Dentro de Windows Sandbox, al iniciar sesión (`LogonCommand` del `.wsb`): lanza arranque.ps1,
# cuenta cómo fue por la carpeta del proyecto y apaga la caja. Sin `wsb exec` no hay otro
# camino para sacar un resultado. Plano en docs/contexto/cajas.md, «Windows Sandbox».
$sale = 'C:\work\MiProyecto'
$tope = (Get-Date).AddMinutes(7)
$codigo = -1
$fallo = ''

try {
    $p = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\entrada\arranque.ps1' -PassThru -WindowStyle Hidden
    # Sin pedir el asa antes, ExitCode sale vacío en un proceso lanzado sin -Wait.
    $null = $p.Handle
    # Con tope: una descarga colgada no puede dejar la caja encendida para siempre.
    if ($p.WaitForExit(300000)) {
        $codigo = $p.ExitCode
    } else {
        $p.Kill()
        $codigo = -2
        $fallo = 'arranque.ps1 no acabó en 5 minutos'
    }
} catch {
    $fallo = "$_"
}

Copy-Item 'C:\arranque.log' (Join-Path $sale 'arranque.log') -ErrorAction SilentlyContinue

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1).IPAddress
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = (New-Object Security.Principal.WindowsPrincipal($identidad)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Se escribe aparte y se mueve, para que el PC nunca lea el archivo a medias.
$estado = @{ codigo = $codigo; ip = $ip; quien = $identidad.Name; admin = $admin; fallo = $fallo } | ConvertTo-Json
$temporal = Join-Path $sale 'estado.tmp'
Set-Content -Path $temporal -Value $estado -Encoding Ascii
Move-Item -Force $temporal (Join-Path $sale 'estado.json')

while ((Get-Date) -lt $tope -and -not (Test-Path (Join-Path $sale 'apagar.txt'))) {
    Start-Sleep -Seconds 2
}
shutdown /s /t 0 /f
