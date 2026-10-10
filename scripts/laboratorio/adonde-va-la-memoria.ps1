# A donde va la memoria que «devuelve» un proceso cuando se le pide
# (EmptyWorkingSet), que era la forma barata de «dormir» una terminal quieta.
#
#   scripts\laboratorio\adonde-va-la-memoria.ps1
#
# Lanza un node PROPIO con 400 MB de datos que no se comprimen, le pide la
# memoria y mira las listas de Windows durante dos minutos. No toca ningun
# otro proceso.
#
# Medido el 2026-10-10 en la maquina de Munir (32 GB, 13 libres): el proceso
# pasa de 449 MB a 0, pero la memoria libre del equipo solo sube unos 40. El
# resto no sale de la RAM: 220 MB van al almacen de compresion y 176 a la lista
# de paginas modificadas, que Windows no escribe a disco hasta que le aprieta.
# Con un Claude de verdad pasa lo mismo: su arbol baja de 506 MB a 83 y
# despierta en 5 ms, y el equipo gana 43 MB.
#
# Conclusion: bajar ese numero NO es ahorrar memoria mientras al equipo le
# sobre, y cuando le falta Windows ya hace esto solo. Por eso «hibernar lo que
# duerme» no se construyo asi (docs/MEJORAS.md): lo unico que libera de verdad
# es cerrar el agente y retomarlo con su sesion.
#
# Sin tildes en las cadenas de abajo: PowerShell 5.1 lee este fichero como ANSI.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Mem {
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);
}
'@
function Foto {
  $m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory
  [pscustomobject]@{
    libre      = [math]::Round($m.AvailableBytes / 1MB)
    modificada = [math]::Round($m.ModifiedPageListBytes / 1MB)
    enEspera   = [math]::Round(($m.StandbyCacheNormalPriorityBytes + $m.StandbyCacheReserveBytes + $m.StandbyCacheCoreBytes) / 1MB)
  }
}
function Linea([string]$cuando, $p) {
  $p.Refresh()
  $comp = Get-Process -Name "Memory Compression" -ErrorAction SilentlyContinue
  $f = Foto
  "{0,-10} node {1,4} MB   libre {2,6}   modificada {3,5}   en espera {4,6}   compresion {5,5}" -f $cuando, [math]::Round($p.WorkingSet64 / 1MB), $f.libre, $f.modificada, $f.enEspera, $(if ($comp) { [math]::Round($comp.WorkingSet64 / 1MB) })
}
$codigo = "const c=require('crypto');const a=[];for(let i=0;i<40;i++){const b=Buffer.alloc(10*1024*1024);c.randomFillSync(b);a.push(b)};setInterval(()=>{},1e9)"
$p = Start-Process -FilePath node -ArgumentList "-e", "`"$codigo`"" -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 6
  Linea "antes" $p
  [void][Mem]::EmptyWorkingSet($p.Handle)
  $llevo = 0
  foreach ($s in 1, 5, 15, 30, 60, 120) {
    Start-Sleep -Seconds ($s - $llevo)
    $llevo = $s
    Linea "a los $s s" $p
  }
} finally {
  Stop-Process -Id $p.Id -Confirm:$false -ErrorAction SilentlyContinue
}
