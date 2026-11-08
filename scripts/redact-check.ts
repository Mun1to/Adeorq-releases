// Lo que tapa el Modo Espejo antes de pintar (`lib/redact.ts`).
//
// Nació por un fallo medido el 2026-10-31: la regla de las cadenas de conexión
// tapaba la contraseña buscándola DENTRO de lo que había casado, y la primera
// vez que salía no tenía por qué ser la suya. Con la cadena más corriente que
// existe, `postgres://postgres:postgres@localhost`, tapaba la palabra del
// esquema y la contraseña seguía a la vista.
//
//   pnpm bancos redact

import { redact } from "../src/lib/redact";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = sale === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale «${String(sale)}», se esperaba «${String(esperado)}»`}`);
}

const tapa = (s: string) => redact(s).text;

es(
  "usuario y contraseña iguales: se tapa la contraseña, no el esquema",
  tapa("postgresql://postgres:postgres@localhost:5432/app"),
  "postgresql://postgres:●●●●●●●●@localhost:5432/app",
);
es(
  "la contraseña es parte del usuario: se tapa la contraseña",
  tapa("mysql://admin2:admin@db"),
  "mysql://admin2:●●●●●@db",
);
es(
  "una contraseña de una letra que sale antes en el esquema",
  tapa("redis://u:s@cache"),
  "redis://u:●@cache",
);
es(
  "la de siempre sigue igual",
  tapa("mongodb+srv://ana:Xk29zQ@cluster0.example.net"),
  "mongodb+srv://ana:●●●●●●@cluster0.example.net",
);
es(
  "dos cadenas en el mismo texto, las dos tapadas",
  tapa("a postgres://a:b1@x y postgres://c:d2@y"),
  "a postgres://a:●●@x y postgres://c:●●@y",
);
es("el aviso dice que era grave", redact("redis://u:s@cache").severe, true);
es(
  "la variable con secreto conserva el nombre",
  tapa("API_KEY=abcdef123456"),
  "API_KEY=●●●●●●●●●●●●",
);
es(
  "la ruta con tu usuario de Windows",
  tapa("C:\\Users\\Muni\\proyectos"),
  "C:\\Users\\●●●●\\proyectos",
);
es("la ruta con tu usuario de Linux", tapa("cd /home/munir/proyectos"), "cd /home/●●●●●/proyectos");
es("la ruta con tu usuario de Mac", tapa("/Users/munir/Library/x"), "/Users/●●●●●/Library/x");
es("también al final de la ruta y entre comillas", tapa('cwd="/home/munir"'), 'cwd="/home/●●●●●"');
es("también por debajo de otra carpeta", tapa("/var/home/munir/x y /mnt/c/Users/Muni/y"), "/var/home/●●●●●/x y /mnt/c/Users/●●●●/y");
es("también en una dirección de archivo", tapa("file:///home/munir/a.txt"), "file:///home/●●●●●/a.txt");
es("en passwd, solo el nombre", tapa("/home/munir:/bin/bash"), "/home/●●●●●:/bin/bash");
es("una web con esa carpeta no es una ruta tuya", tapa("https://ejemplo.com/home/portada y https://ejemplo.com/Users/lista"), "https://ejemplo.com/home/portada y https://ejemplo.com/Users/lista");
es("ni otra carpeta que se le parece", tapa("/homes/munir y src/home/portada"), "/homes/munir y src/home/portada");
es("la de Windows con barras al revés no se tapa dos veces", tapa("C:/Users/Muni/x"), "C:/Users/●●●●/x");
// Como la manda el escudo, normalizada en minúsculas: se escapaba en emisión (2026-11-08).
es("la de Windows en minúsculas también", tapa("c:/users/muni/appdata/x"), "c:/users/●●●●/appdata/x");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
