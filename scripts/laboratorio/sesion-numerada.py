"""Fabrica una sesion de Claude Code con la conversacion NUMERADA, para poder
medir cuanto se desplaza el renderizador fullscreen por cada golpe de rueda.

Cada turno del asistente escribe una sola linea `HITO 0001`, `HITO 0002`, ...
Asi, mirando que numeros se ven en pantalla, se sabe exactamente en que punto de
la conversacion esta la vista, y la resta antes/despues es el desplazamiento en
lineas. Sin esto habria que comparar texto y adivinar.

   python scripts/laboratorio/sesion-numerada.py <carpeta cwd> <cuantos hitos>

Y al acabar, borrar esa carpeta de ~/.claude/projects/: si se queda, la sesion
falsa sale en la lista de sesiones de Adeorq como un proyecto mas.

Deja el .jsonl en la carpeta de proyecto que Claude Code asocia a ese cwd
(`~/.claude/projects/<cwd con : y \\ cambiados por ->`) e imprime el id.
"""
import json
import os
import sys
import uuid
import datetime

cwd = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 400

sesion = str(uuid.uuid4())
carpeta = os.path.expanduser("~/.claude/projects/" + cwd.replace(":", "-").replace("\\", "-").replace("/", "-"))
os.makedirs(carpeta, exist_ok=True)
destino = os.path.join(carpeta, sesion + ".jsonl")

t0 = datetime.datetime(2026, 9, 1, 10, 0, 0, tzinfo=datetime.timezone.utc)
padre = None
lineas = []
for i in range(1, n + 1):
    for papel, texto in (("user", f"pregunta {i:04d}"), ("assistant", f"HITO {i:04d}")):
        u = str(uuid.uuid4())
        msg = {"role": papel, "content": texto if papel == "user" else [{"type": "text", "text": texto}]}
        if papel == "assistant":
            msg.update({"id": "msg_" + u[:24].replace("-", ""), "type": "message", "model": "claude-haiku-4-5-20251001",
                        "stop_reason": None, "stop_sequence": None,
                        "usage": {"input_tokens": 10, "output_tokens": 5, "service_tier": "standard"}})
        d = {"parentUuid": padre, "isSidechain": False, "userType": "external", "cwd": cwd,
             "sessionId": sesion, "version": "2.1.269", "gitBranch": "", "type": papel,
             "message": msg, "uuid": u,
             "timestamp": (t0 + datetime.timedelta(seconds=i * 2 + (1 if papel == "assistant" else 0))).strftime("%Y-%m-%dT%H:%M:%S.000Z")}
        if papel == "assistant":
            d["requestId"] = "req_" + u[:20].replace("-", "")
        lineas.append(json.dumps(d, ensure_ascii=False))
        padre = u

with open(destino, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lineas) + "\n")

print(sesion)
print(destino, os.path.getsize(destino) // 1024, "KB", n, "hitos", file=sys.stderr)
