#!/usr/bin/env python3
# Cliente del demonio de mutter: manda UNA orden al socket y escribe la respuesta. Uso: mando.py abs 800 500
import os, socket, sys
ruta = os.environ["E18_MANDO"]
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(40)
s.connect(ruta)
s.sendall((" ".join(sys.argv[1:])).encode())
print(s.recv(4096).decode().strip())
