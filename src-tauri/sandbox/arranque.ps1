# Dentro de Windows Sandbox, como administrador (lo lanza envoltura.ps1): deja un servidor
# SSH esperando a la llave de ESTA caja, para que Adeorq abra la terminal con `ssh`.
# Plano en docs/contexto/cajas.md, «Windows Sandbox».
#
# Cada fallo sale con su código y lo demás queda en C:\arranque.log, dentro de la caja.
#   10 no se pudo bajar OpenSSH · 11 la huella no cuadra · 12 no se instaló el servicio
#   13 no arrancó sshd · 14 no se pudo dejar la llave
param([string]$Entrada = 'C:\entrada')

$ErrorActionPreference = 'Stop'
Start-Transcript -Path 'C:\arranque.log' | Out-Null

# Win32-OpenSSH de Microsoft, versión fijada y con su huella de la API de GitHub
# (comprobada el 2026-11-15). Se baja DENTRO de la caja: no entra nada en el PC.
$url = 'https://github.com/PowerShell/Win32-OpenSSH/releases/download/10.4.0.0p1-Preview/OpenSSH-Win64.zip'
$huella = 'B67FF8BECD203502190EC42AC7787C24C2CD3325ED7700485FE7A1C83D2A7957'
$zip = Join-Path $env:TEMP 'openssh.zip'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 240
} catch { Write-Output $_; exit 10 }
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $huella) { exit 11 }

try {
    Expand-Archive $zip -DestinationPath $env:ProgramFiles -Force
    & (Join-Path $env:ProgramFiles 'OpenSSH-Win64\install-sshd.ps1')
} catch { Write-Output $_; exit 12 }

# La primera vez que arranca, sshd crea C:\ProgramData\ssh con las llaves de la máquina.
try { Start-Service sshd } catch { Write-Output $_; exit 13 }

try {
    # WDAGUtilityAccount es administrador, y para un administrador sshd solo mira este
    # archivo, con permisos de Administradores y SYSTEM nada más (por SID: la caja
    # habla el idioma del PC, y «Administrators» no existe en un Windows en español).
    $llaves = 'C:\ProgramData\ssh\administrators_authorized_keys'
    Copy-Item (Join-Path $Entrada 'llave.pub') $llaves -Force
    icacls $llaves /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
    New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell `
        -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
    New-NetFirewallRule -Name 'adeorq-ssh' -DisplayName 'Adeorq: SSH de la caja' -Protocol TCP -LocalPort 22 -Action Allow | Out-Null
} catch { Write-Output $_; exit 14 }

exit 0
