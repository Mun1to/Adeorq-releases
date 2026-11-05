# Las pruebas T1 a T8 de `docs/contexto/tiendas.md`, en un Windows limpio de GitHub.
#
# Empaqueta el sondeo (no es Adeorq) en dos paquetes de prueba con el mismo tipo de manifiesto
# que el de Adeorq (A: `packagedClassicApp`; B: `win32App`), los instala con un certificado
# desechable y mide, desde FUERA del paquete, lo que el programa hace desde DENTRO.
#
#   medir.ps1 -Binarios <carpeta con sondeo.exe y sondeo-consola.exe> -Salida <carpeta>
#
# Cada medida lleva su veredicto:
#   ESPERADO  salio lo que el plano daba por deducido
#   SORPRESA  salio otra cosa: el plano estaba mal en ese punto, y el trabajo se pone en rojo
#   MEDIDO    no habia nada deducido; es el dato
# Una excepcion del propio guion es ERROR. Con una SORPRESA o un ERROR sale con 1.
#
# Solo corre en un runner: instala paquetes y confia un certificado en la maquina. Nunca en
# el equipo de trabajo de nadie. Windows PowerShell 5.1: los cmdlets de Appx no van en pwsh 7.

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Binarios,
    [Parameter(Mandatory)] [string]$Salida
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
New-Item -ItemType Directory -Force $Salida | Out-Null
$trabajo = Join-Path $env:RUNNER_TEMP 'sondeo-trabajo'
if (-not $env:RUNNER_TEMP) { $trabajo = Join-Path $env:TEMP 'sondeo-trabajo' }
New-Item -ItemType Directory -Force $trabajo | Out-Null

$casa = $env:USERPROFILE
$resultados = Join-Path $casa '.sondeo'
$alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
$medidas = New-Object System.Collections.Generic.List[object]

function Medida([string]$Id, [string]$Que, $Obtenido, $Esperado = $null, [string]$Nota = '') {
    $veredicto = 'MEDIDO'
    if ($null -ne $Esperado) {
        $veredicto = 'SORPRESA'
        if ("$Obtenido" -eq "$Esperado") { $veredicto = 'ESPERADO' }
    }
    $m = [pscustomobject]@{ Id = $Id; Que = $Que; Obtenido = "$Obtenido"; Esperado = $(if ($null -ne $Esperado) { "$Esperado" } else { '' }); Veredicto = $veredicto; Nota = $Nota }
    $medidas.Add($m)
    $marca = @{ ESPERADO = 'OK      '; SORPRESA = 'SORPRESA'; MEDIDO = 'MEDIDO  '; ERROR = 'ERROR   ' }[$veredicto]
    Write-Host ("{0} {1,-9} {2} = {3}{4}" -f $marca, $Id, $Que, $Obtenido, $(if ($Nota) { "   ($Nota)" } else { '' }))
}

function Prueba([string]$Id, [scriptblock]$Cuerpo) {
    Write-Host "`n== $Id"
    try { & $Cuerpo } catch {
        $medidas.Add([pscustomobject]@{ Id = $Id; Que = 'el guion fallo'; Obtenido = "$($_.Exception.Message)"; Esperado = ''; Veredicto = 'ERROR'; Nota = "$($_.ScriptStackTrace)" })
        Write-Host "ERROR    $Id : $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Esperar([scriptblock]$Hasta, [int]$Segundos = 30) {
    $fin = (Get-Date).AddSeconds($Segundos)
    while ((Get-Date) -lt $fin) {
        if (& $Hasta) { return $true }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

# Una linea `clave=valor` por renglon, a un diccionario.
function Leer-Claves([string]$Ruta) {
    $h = @{}
    if (Test-Path $Ruta) {
        foreach ($l in (Get-Content $Ruta)) { $i = $l.IndexOf('='); if ($i -gt 0) { $h[$l.Substring(0, $i)] = $l.Substring($i + 1) } }
    }
    return $h
}

# Lanza un programa por su ruta (el alias), con las tuberias de entrada y salida redirigidas,
# como lo haria Claude Code con `adeorq.exe --mcp`.
function Ejecutar([string]$Exe, [string[]]$Argumentos, [string]$Entrada = $null, [hashtable]$Entorno = @{}, [int]$Espera = 30) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = ($Argumentos -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    foreach ($k in $Entorno.Keys) { $psi.EnvironmentVariables[$k] = $Entorno[$k] }
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    try { [void]$p.Start() } catch { return [pscustomobject]@{ Arranco = $false; Termino = $false; Codigo = $null; Salida = ''; Error = "$($_.Exception.Message)" } }
    $o = $p.StandardOutput.ReadToEndAsync()
    $e = $p.StandardError.ReadToEndAsync()
    if ($null -ne $Entrada) {
        # La entrada estandar de .NET (Windows PowerShell 5.1) ya ha escrito una marca BOM al
        # arrancar el proceso (`AutoFlush` escribe el preambulo): el programa de fuera la lee
        # como parte de la primera linea. No la quita nadie desde aqui; las comprobaciones de
        # `eco:` la toleran (`\uFEFF?`) porque lo que se mide es que la linea LLEGA.
        $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes("$Entrada`n")
        $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $p.StandardInput.BaseStream.Flush()
    }
    try { $p.StandardInput.Close() } catch {}
    $termino = $p.WaitForExit($Espera * 1000)
    if (-not $termino) { try { $p.Kill() } catch {} }
    $salida = ''
    if ($o.Wait(3000)) { $salida = $o.Result }
    $err = ''
    if ($e.Wait(3000)) { $err = $e.Result }
    [pscustomobject]@{ Arranco = $true; Termino = $termino; Codigo = $(if ($termino) { $p.ExitCode } else { $null }); Salida = $salida; Error = $err }
}

function Limpiar-Rastros {
    foreach ($d in "$env:LOCALAPPDATA\SondeoT1", "$env:APPDATA\SondeoT1", "$casa\AppData\LocalLow\SondeoT1", "$casa\.sondeo-datos", "$env:LOCALAPPDATA\SondeoT2", "$env:LOCALAPPDATA\SondeoFuera", $resultados) {
        Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name SondeoT1 -ErrorAction SilentlyContinue
}

# -- Montaje: certificado desechable, tres paquetes, instalacion ---------------------------
Write-Host "== Montaje"
$editor = 'CN=AdeorqSondeoCI'
$clave = [guid]::NewGuid().ToString('N')
$cert = New-SelfSignedCertificate -Type Custom -Subject $editor -KeyUsage DigitalSignature -FriendlyName 'Adeorq sondeo CI' `
    -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
$pfx = Join-Path $trabajo 'sondeo.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $clave -AsPlainText -Force) | Out-Null
$cer = Join-Path $trabajo 'sondeo.cer'
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null

$paquetes = Join-Path $Salida 'paquetes'
New-Item -ItemType Directory -Force $paquetes | Out-Null
$empaquetar = Join-Path $aqui 'empaquetar-sondeo.ps1'
& $empaquetar -Binarios $Binarios -Salida $paquetes -Nombre 'Adeorq.SondeoA' -Alias 'sondeoa' -Version '1.9.241.0' -Editor $editor -Pfx $pfx -ClavePfx $clave
& $empaquetar -Binarios $Binarios -Salida $paquetes -Nombre 'Adeorq.SondeoA' -Alias 'sondeoa' -Version '1.9.242.0' -Editor $editor -Pfx $pfx -ClavePfx $clave
& $empaquetar -Binarios $Binarios -Salida $paquetes -Nombre 'Adeorq.SondeoB' -Alias 'sondeob' -Version '1.9.241.0' -Editor $editor -Pfx $pfx -ClavePfx $clave -Win32App
$a1 = Join-Path $paquetes 'Adeorq.SondeoA_1.9.241.0.msix'
$a2 = Join-Path $paquetes 'Adeorq.SondeoA_1.9.242.0.msix'
$b1 = Join-Path $paquetes 'Adeorq.SondeoB_1.9.241.0.msix'
# Los .msix se suben con las medidas; las claves no: el .pfx vive en la carpeta de trabajo.
Add-AppxPackage -Path $a1
Add-AppxPackage -Path $b1
$instalados = Get-AppxPackage -Name 'Adeorq.Sondeo*' | ForEach-Object { "$($_.Name) $($_.Version) $($_.PackageFamilyName) $($_.InstallLocation)" }
Write-Host ($instalados -join "`n")
$ok = Esperar { (Test-Path (Join-Path $alias 'sondeoa.exe')) -and (Test-Path (Join-Path $alias 'sondeob.exe')) } 30
Medida 'T0.alias' 'los alias aparecen tras instalar' $ok $true
$aliasA = Join-Path $alias 'sondeoa.exe'
$aliasAc = Join-Path $alias 'sondeoa-consola.exe'
$aliasB = Join-Path $alias 'sondeob.exe'

# -- T1: lo que la app crea, lo ve un proceso de fuera? -----------------------------------
foreach ($v in @(
        @{ Etiqueta = 'A (packagedClassicApp)'; Alias = $aliasA; Prefijo = 'T1.A'; Deducido = $true },
        @{ Etiqueta = 'B (win32App)'; Alias = $aliasB; Prefijo = 'T1.B'; Deducido = $false })) {
    Prueba "T1 $($v.Etiqueta)" {
        Limpiar-Rastros
        New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\SondeoFuera" | Out-Null
        Set-Content "$env:LOCALAPPDATA\SondeoFuera\previo.txt" 'creado-fuera'
        $r = Ejecutar $v.Alias @('crear')
        $listo = Esperar { Test-Path "$resultados\t1.txt" } 20
        Medida "$($v.Prefijo).arranco" 'el sondeo arranco y dejo su informe' $listo $true "salida: $($r.Salida) $($r.Error)"
        $dentro = Leer-Claves "$resultados\t1.txt"
        $vis = { param($ruta) Test-Path $ruta }
        $espLocal = $null; $espCasa = $null; $espReg = $null
        if ($v.Deducido) { $espLocal = $false; $espCasa = $true; $espReg = $false }
        Medida "$($v.Prefijo).local" 'fuera VE lo creado en %LOCALAPPDATA%' (& $vis "$env:LOCALAPPDATA\SondeoT1\hecho-por-la-app.txt") $espLocal "dentro escribio: $($dentro['escribe_local'])"
        Medida "$($v.Prefijo).roaming" 'fuera VE lo creado en %APPDATA%' (& $vis "$env:APPDATA\SondeoT1\hecho-por-la-app.txt") $espLocal "dentro escribio: $($dentro['escribe_roaming'])"
        Medida "$($v.Prefijo).locallow" 'fuera VE lo creado en AppData\LocalLow' (& $vis "$casa\AppData\LocalLow\SondeoT1\hecho-por-la-app.txt") $null "dentro escribio: $($dentro['escribe_locallow'])"
        Medida "$($v.Prefijo).casa" 'fuera VE lo creado en %USERPROFILE%\.sondeo-datos' (& $vis "$casa\.sondeo-datos\hecho-por-la-app.txt") $espCasa "dentro escribio: $($dentro['escribe_casa'])"
        Medida "$($v.Prefijo).ve_previo" 'dentro VE lo que ya habia fuera en AppData' $dentro['ve_lo_previo_de_fuera'].ToLower() $(if ($v.Deducido) { 'true' } else { $null })
        Medida "$($v.Prefijo).modifica_previo" 'dentro MODIFICA lo que ya habia fuera, y fuera lo ve modificado' ((Get-Content "$env:LOCALAPPDATA\SondeoFuera\previo.txt" -ErrorAction SilentlyContinue) -contains 'modificado-por-la-app') $(if ($v.Deducido) { $true } else { $null }) "dentro dijo: $($dentro['modifica_lo_previo'])"
        $reg = $null -ne (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name SondeoT1 -ErrorAction SilentlyContinue)
        Medida "$($v.Prefijo).registro_run" 'fuera VE lo escrito en HKCU\...\Run (el arranque con Windows)' $reg $espReg "dentro escribio con codigo: $($dentro['registro_run']) (0 = escrito)"
    }
}

# -- T2: los hijos del paquete -------------------------------------------------------------
Prueba 'T2 hijos' {
    Limpiar-Rastros
    $id = Ejecutar $aliasA @('identidad')
    Medida 'T2.identidad' 'el proceso lanzado por el alias tiene identidad de paquete' ($id.Salida.Trim().StartsWith('Adeorq.SondeoA_1.9.241.0')) $true $id.Salida.Trim()
    $r = Ejecutar $aliasA @('hijos') $null @{} 60
    $listo = Esperar { Test-Path "$resultados\t2-hijo-ps.txt" } 30
    Medida 'T2.arranco' 'los hijos corrieron' $listo $true "salida: $($r.Salida) $($r.Error)"
    Medida 'T2.cmd_en_appdata' 'un hijo `cmd` escribe en el %LOCALAPPDATA% REAL' (Test-Path "$env:LOCALAPPDATA\SondeoT2\hijo-cmd.txt") $true
    Medida 'T2.ps_en_appdata' 'un hijo `powershell` escribe en el %LOCALAPPDATA% REAL' (Test-Path "$env:LOCALAPPDATA\SondeoT2\hijo-ps.txt") $true
    $ps = ''
    if (Test-Path "$resultados\t2-hijo-ps.txt") { $ps = (Get-Content "$resultados\t2-hijo-ps.txt" -Raw).Trim() }
    Medida 'T2.ps_sin_identidad' 'un hijo `powershell` NO tiene identidad de paquete (codigo 15700)' ($ps -like 'codigo=15700*') $true $ps
}

# -- T3: el alias con las tuberias, ventana y consola -----------------------------------------
Prueba 'T3 alias' {
    Limpiar-Rastros
    $env77 = @{ ADEORQ_PANE_ID = '77' }
    Medida 'T3.test_path' 'Test-Path ve el alias de ventana' (Test-Path $aliasA) $true
    $c = Ejecutar $aliasAc @('eco', 'uno', 'dos') 'hola-consola' $env77
    Medida 'T3.consola_eco' 'alias de CONSOLA: la entrada llega y la salida vuelve' ($c.Salida -match 'eco:\uFEFF?hola-consola') $true "salida: $($c.Salida.Trim()) | error: $($c.Error.Trim()) | termino: $($c.Termino)"
    Medida 'T3.consola_entorno' 'alias de CONSOLA: pasa el entorno (ADEORQ_PANE_ID)' ($c.Salida -like '*pane=77*') $true
    Medida 'T3.consola_args' 'alias de CONSOLA: pasa los argumentos' ($c.Salida -like '*args=uno dos*') $true
    Medida 'T3.consola_identidad' 'alias de CONSOLA: arranca CON identidad' ($c.Salida -like '*paquete=Adeorq.SondeoA_1.9.241.0*') $true
    Medida 'T3.consola_stderr' 'alias de CONSOLA: la salida de error vuelve' ($c.Error -like '*error-estandar-ok*') $true
    $g = Ejecutar $aliasA @('eco', 'uno', 'dos') 'hola-ventana' $env77
    Medida 'T3.ventana_eco' 'alias de VENTANA (como adeorq.exe): la entrada llega y la salida vuelve' ($g.Salida -match 'eco:\uFEFF?hola-ventana') $null "salida: $($g.Salida.Trim()) | error: $($g.Error.Trim()) | termino: $($g.Termino) | arranco: $($g.Arranco)"
    Medida 'T3.ventana_entorno' 'alias de VENTANA: pasa el entorno' ($g.Salida -like '*pane=77*') $null
    Medida 'T3.ventana_args' 'alias de VENTANA: pasa los argumentos' ($g.Salida -like '*args=uno dos*') $null
    Medida 'T3.cwd' 'el directorio de trabajo con el que se lanzo' (($c.Salida -split '\|' | Where-Object { $_ -like 'cwd=*' }) -join '') $null "se lanzo desde: $((Get-Location).Path)"
    # Lo que haria el Capataz o el conserje con `current_exe()` si no se pasara por el alias.
    $loc = (Get-AppxPackage -Name 'Adeorq.SondeoA').InstallLocation
    $d = Ejecutar (Join-Path $loc 'sondeo-consola.exe') @('eco') 'directo'
    Medida 'T3.ruta_real' 'se puede lanzar el .exe por su ruta REAL del paquete desde fuera' ($d.Arranco -and $d.Salida -match 'eco:\uFEFF?directo') $null "arranco: $($d.Arranco) | error: $($d.Error.Trim()) | salida: $($d.Salida.Trim())"
    Medida 'T3.ruta_real_identidad' 'y arranca CON identidad de paquete por esa ruta' ($d.Salida -like '*paquete=Adeorq.SondeoA_1.9.241.0*') $null 'el usuario del runner es administrador: en un equipo normal puede cambiar'
    Medida 'T3.path_con_alias' 'la carpeta de los alias esta en el PATH de este proceso' (($env:PATH -split ';') -contains $alias) $null 'lo que ve una terminal heredando este PATH'
}

# -- T6: el puerto en 127.0.0.1 ----------------------------------------------------------------
Prueba 'T6 puerto' {
    Limpiar-Rastros
    Start-Process -FilePath $aliasA -ArgumentList 'servir', '3012' | Out-Null
    $escucha = Esperar { Test-Path "$resultados\t6-escucha.txt" } 20
    Medida 'T6.escucha' 'el paquete abre 127.0.0.1:3012' $escucha $true
    $contesta = ''
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', 3012)
        $s = $tcp.GetStream()
        $w = New-Object System.IO.StreamWriter($s); $w.AutoFlush = $true
        $w.WriteLine('ping-de-fuera')
        $s.ReadTimeout = 5000
        $contesta = (New-Object System.IO.StreamReader($s)).ReadLine()
        $tcp.Close()
    } catch { $contesta = "ERROR $($_.Exception.Message)" }
    Medida 'T6.conecta' 'un proceso de fuera conecta y recibe contestacion' ($contesta -eq 'eco:ping-de-fuera') $true $contesta
}

# -- T7: una sola instancia --------------------------------------------------------------------
Prueba 'T7 instancia unica' {
    Limpiar-Rastros
    $pfn = (Get-AppxPackage -Name 'Adeorq.SondeoA').PackageFamilyName
    $aumid = "shell:AppsFolder\$pfn!Sondeo"
    Start-Process explorer.exe $aumid
    Start-Sleep -Seconds 4
    Start-Process explorer.exe $aumid
    $hecho = Esperar { (Get-ChildItem $resultados -Filter 'unica-*.txt' -ErrorAction SilentlyContinue | Measure-Object).Count -ge 2 } 20
    $archivos = @(Get-ChildItem $resultados -Filter 'unica-*.txt' -ErrorAction SilentlyContinue)
    $dicen = ($archivos | ForEach-Object { (Get-Content $_.FullName -TotalCount 1) }) -join ','
    Medida 'T7.lanzamientos' 'los dos lanzamientos por AppsFolder arrancaron el programa' $hecho $true "ficheros: $($archivos.Count), dicen: $dicen"
    $primeras = @($archivos | Where-Object { (Get-Content $_.FullName -TotalCount 1) -eq 'primera' }).Count
    $segundas = @($archivos | Where-Object { (Get-Content $_.FullName -TotalCount 1) -eq 'segunda' }).Count
    Medida 'T7.una_primera' 'solo uno es la primera instancia' $primeras 1
    Medida 'T7.una_segunda' 'el otro ve que ya hay una' $segundas 1
    Start-Sleep -Seconds 2
    Medida 'T7.procesos' 'procesos `sondeo` vivos a los pocos segundos' @(Get-Process -Name sondeo -ErrorAction SilentlyContinue).Count 1
}

# -- Arranque con Windows: la misma llamada que `autostart.rs` ---------------------------------
Prueba 'T10p tarea de arranque' {
    Limpiar-Rastros
    # El de T7 aun vive (25 s): espera a que acabe para no mezclar.
    Esperar { @(Get-Process -Name sondeo -ErrorAction SilentlyContinue).Count -eq 0 } 40 | Out-Null
    $r = Ejecutar $aliasA @('arranque') $null @{} 40
    $listo = Esperar { Test-Path "$resultados\arranque.txt" } 15
    $a = Leer-Claves "$resultados\arranque.txt"
    Medida 'T10p.getasync' 'StartupTask::GetAsync responde desde el paquete' ($listo -and -not $a.ContainsKey('GetAsync')) $true "salida: $($a.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })"
    Medida 'T10p.estado_inicial' 'la tarea nace apagada (Enabled="false" del manifiesto)' $a['estado_inicial'] 'Disabled'
    Medida 'T10p.encender' 'RequestEnableAsync desde un proceso sin ventana a la vista' $a['RequestEnable'] $null "estado tras encender: $($a['estado_tras_encender']) | Disable: $($a['Disable']) | final: $($a['estado_final'])"
}

# -- T4 y T5: el proceso aparte y la actualizacion encima --------------------------------------
Prueba 'T4 proceso aparte' {
    Limpiar-Rastros
    $r = Ejecutar $aliasA @('motor') $null @{} 40
    $listo = Esperar { Test-Path "$resultados\t4-hijo.txt" } 20
    $padre = Leer-Claves "$resultados\t4-padre.txt"
    Medida 'T4.lanza' 'el paquete lanza una copia suya desde AppData, aparte' $listo $true "padre: $($padre.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })"
    $h = Leer-Claves "$resultados\t4-hijo.txt"
    Medida 'T4.hijo_identidad' 'la copia lanzada aparte tiene identidad de paquete' $h['paquete'] $null 'el motor de Adeorq se lanzaria asi'
    Medida 'T4.ve_clave' 'la copia ve el fichero que el padre dejo en la misma carpeta de AppData' $h['ve_la_clave_del_padre'] $null
    $t1 = $null; $t2 = $null
    if (Test-Path "$resultados\latido.txt") { $t1 = (Get-Content "$resultados\latido.txt" -Raw).Trim() }
    Start-Sleep -Seconds 2
    if (Test-Path "$resultados\latido.txt") { $t2 = (Get-Content "$resultados\latido.txt" -Raw).Trim() }
    Medida 'T4.vive' 'la copia sigue viva (su latido avanza)' (($null -ne $t1) -and ($t1 -ne $t2)) $true "$t1 -> $t2"
    Medida 'T4.proceso' 'se ve el proceso `motor` desde fuera' @(Get-Process -Name motor -ErrorAction SilentlyContinue).Count $null
    Medida 'T4.copia_visible' 'fuera VE la copia que el paquete dejo en %LOCALAPPDATA%\SondeoMotor' (Test-Path "$env:LOCALAPPDATA\SondeoMotor\motor.exe") $null
}

Prueba 'T5 actualizar con el proceso aparte vivo' {
    $antes = @(Get-Process -Name motor -ErrorAction SilentlyContinue).Count
    $mensaje = 'sin error'
    try { Add-AppxPackage -Path $a2 } catch { $mensaje = "$($_.Exception.Message)" }
    Start-Sleep -Seconds 3
    $version = (Get-AppxPackage -Name 'Adeorq.SondeoA').Version
    Medida 'T5.actualiza' 'Add-AppxPackage de la 1.9.242.0 con el proceso aparte vivo' $version '1.9.242.0' "mensaje: $mensaje"
    $t1 = $null; $t2 = $null
    if (Test-Path "$resultados\latido.txt") { $t1 = (Get-Content "$resultados\latido.txt" -Raw).Trim() }
    Start-Sleep -Seconds 2
    if (Test-Path "$resultados\latido.txt") { $t2 = (Get-Content "$resultados\latido.txt" -Raw).Trim() }
    Medida 'T5.sigue_vivo' 'el proceso aparte sigue vivo tras actualizar' (($null -ne $t1) -and ($t1 -ne $t2)) $null "procesos antes: $antes, despues: $(@(Get-Process -Name motor -ErrorAction SilentlyContinue).Count)"
    # T3 tras actualizar: la misma ruta vale?
    Ejecutar $aliasAc @('identidad') | Out-Null
    $c = Ejecutar $aliasAc @('eco') 'tras-actualizar'
    Medida 'T3.v2_misma_ruta' 'el MISMO alias contesta tras actualizar' ($c.Salida -match 'eco:\uFEFF?tras-actualizar') $true $c.Salida.Trim()
    Medida 'T3.v2_version' 'y es la version nueva' ($c.Salida -like '*paquete=Adeorq.SondeoA_1.9.242.0*') $true
    # Y parar el proceso aparte.
    New-Item -ItemType Directory -Force $resultados | Out-Null
    Set-Content "$resultados\parar" 'x'
    Start-Sleep -Seconds 2
}

# -- T8: lo que queda al desinstalar -----------------------------------------------------------
Prueba 'T8 desinstalar' {
    # Lo creado en las pruebas de antes se borro al empezar cada una: se vuelve a crear JUSTO
    # antes de desinstalar, para que lo que se mire despues sea de esto y no de aquello.
    Limpiar-Rastros
    New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\SondeoFuera" | Out-Null
    Set-Content "$env:LOCALAPPDATA\SondeoFuera\previo.txt" 'creado-fuera'
    Ejecutar $aliasA @('crear') | Out-Null
    Ejecutar $aliasA @('hijos') $null @{} 60 | Out-Null
    Esperar { Test-Path "$resultados\t2-hijo-ps.txt" } 30 | Out-Null
    Medida 'T8.casa_antes' 'antes de desinstalar existe lo creado en %USERPROFILE%\.sondeo-datos' (Test-Path "$casa\.sondeo-datos") $true
    Medida 'T8.hijo_antes' 'antes de desinstalar existe lo que un hijo escribio en AppData' (Test-Path "$env:LOCALAPPDATA\SondeoT2") $true
    Remove-AppxPackage -Package (Get-AppxPackage -Name 'Adeorq.SondeoA').PackageFullName
    Remove-AppxPackage -Package (Get-AppxPackage -Name 'Adeorq.SondeoB').PackageFullName
    Start-Sleep -Seconds 3
    Medida 'T8.paquetes' 'quedan paquetes del sondeo instalados' @(Get-AppxPackage -Name 'Adeorq.Sondeo*').Count 0
    Medida 'T8.alias' 'el alias sigue existiendo' (Test-Path $aliasA) $false
    Medida 'T8.casa' 'sigue lo creado fuera de AppData (%USERPROFILE%\.sondeo-datos)' (Test-Path "$casa\.sondeo-datos") $true
    Medida 'T8.hijo_real' 'siguen los ficheros que un hijo escribio en el AppData REAL' (Test-Path "$env:LOCALAPPDATA\SondeoT2") $true
    Medida 'T8.motor_aparte' 'queda el proceso aparte vivo (ya parado a peticion)' @(Get-Process -Name motor -ErrorAction SilentlyContinue).Count $null
    Medida 'T8.carpeta_privada' 'fuera se ve algo de lo que el paquete creo en AppData\Local' (Test-Path "$env:LOCALAPPDATA\SondeoMotor") $null
}

# -- Informe -----------------------------------------------------------------------------------
Copy-Item $resultados (Join-Path $Salida 'sondeo-crudo') -Recurse -Force -ErrorAction SilentlyContinue
$medidas | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $Salida 'resultados.json') -Encoding UTF8
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('| Prueba | Que | Obtenido | Esperado | Veredicto |')
[void]$md.AppendLine('|---|---|---|---|---|')
foreach ($m in $medidas) {
    $obt = ($m.Obtenido -replace '\|', '/' -replace "`r?`n", ' ')
    if ($obt.Length -gt 140) { $obt = $obt.Substring(0, 140) + '...' }
    [void]$md.AppendLine("| $($m.Id) | $($m.Que -replace '\|', '/') | $obt | $($m.Esperado) | **$($m.Veredicto)** |")
}
Set-Content (Join-Path $Salida 'resumen.md') $md.ToString() -Encoding UTF8
if ($env:GITHUB_STEP_SUMMARY) { Add-Content $env:GITHUB_STEP_SUMMARY $md.ToString() -Encoding UTF8 }

$sorpresas = @($medidas | Where-Object { $_.Veredicto -in 'SORPRESA', 'ERROR' })
Write-Host "`n$($medidas.Count) medidas: $(@($medidas | Where-Object Veredicto -eq 'ESPERADO').Count) esperadas, $(@($medidas | Where-Object Veredicto -eq 'MEDIDO').Count) medidas sin deduccion, $($sorpresas.Count) sorpresas o errores."
if ($sorpresas.Count -gt 0) {
    foreach ($s in $sorpresas) { Write-Host "  $($s.Veredicto) $($s.Id): $($s.Que) -> $($s.Obtenido)" -ForegroundColor Yellow }
    exit 1
}
