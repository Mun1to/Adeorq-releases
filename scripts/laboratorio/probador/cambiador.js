// El cambiador del probador (probador.mjs lo mete en la cabeza de la app):
// pone encima la hoja de la dirección elegida (0 = como hoy) y deja cambiarla
// con un clic o con las teclas 0-9. Vive en un shadow DOM para que ninguna
// dirección le cambie la cara.
(function () {
  var q = new URLSearchParams(location.search).get("opcion");
  var guardada = null;
  try { guardada = sessionStorage.getItem("probador-opcion"); } catch (e) {}
  var actual = Number(q != null ? q : guardada != null ? guardada : 0) || 0;
  var lista = [{ n: 0, nombre: "Como hoy" }];

  var hoja = document.createElement("link");
  hoja.rel = "stylesheet";
  hoja.id = "probador-variante";

  function ponerHoja() {
    if (actual === 0) { hoja.remove(); return; }
    hoja.href = "/__probador/variante/" + actual + ".css?t=" + Date.now();
    document.head.appendChild(hoja);
  }
  ponerHoja();
  // Las hojas que la app carga después (trozos perezosos) irían detrás y
  // ganarían: la de la variante se vuelve a poner la última.
  new MutationObserver(function () {
    if (actual !== 0 && document.head.lastElementChild !== hoja) document.head.appendChild(hoja);
  }).observe(document.head, { childList: true });

  // La letra: la hoja tiene cientos de tamaños escritos a mano, así que una
  // dirección no puede subirlos todos con CSS. Cada una dice en su .json
  // { letra: { suelo, suma, tope } }: todo tamaño en px por debajo de `tope`
  // pasa a max(suelo, px + suma). Se guarda el original para poder volver.
  var original = new WeakMap();
  var letras = {};
  function recorrer(reglas, fn) {
    for (var i = 0; i < reglas.length; i++) {
      var r = reglas[i];
      if (r.style && r.style.fontSize) fn(r);
      if (r.cssRules) recorrer(r.cssRules, fn);
    }
  }
  function aplicarLetra() {
    var l = letras[actual] || null;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var s = document.styleSheets[i];
      if (s.ownerNode === hoja) continue;
      var reglas;
      try { reglas = s.cssRules; } catch (e) { continue; }
      recorrer(reglas, function (r) {
        var o = original.get(r);
        if (o === undefined) { if (!l) return; o = r.style.fontSize; original.set(r, o); }
        var m = /^([\d.]+)px$/.exec(o);
        var nuevo = o;
        if (m && l) {
          var px = parseFloat(m[1]);
          if (px < (l.tope || 16)) nuevo = Math.max(l.suelo || 0, Math.round((px + (l.suma || 0)) * 2) / 2) + "px";
        }
        if (r.style.fontSize !== nuevo) r.style.setProperty("font-size", nuevo, r.style.getPropertyPriority("font-size"));
      });
    }
  }
  new MutationObserver(function (cambios) {
    cambios.forEach(function (c) {
      c.addedNodes.forEach(function (n) {
        if (n !== hoja && (n.tagName === "LINK" || n.tagName === "STYLE")) {
          n.addEventListener("load", aplicarLetra);
          setTimeout(aplicarLetra, 0);
        }
      });
    });
  }).observe(document.head, { childList: true });
  window.addEventListener("load", aplicarLetra);

  function elegir(n) {
    if (!lista.some(function (o) { return o.n === n; })) return;
    actual = n;
    try { sessionStorage.setItem("probador-opcion", String(n)); } catch (e) {}
    var u = new URL(location.href);
    u.searchParams.set("opcion", String(n));
    history.replaceState(history.state, "", u);
    ponerHoja();
    aplicarLetra();
    pintar();
  }

  var raiz, caja;
  function pintar() {
    if (!caja) return;
    caja.innerHTML = "";
    lista.forEach(function (o) {
      var b = document.createElement("button");
      b.className = "op" + (o.n === actual ? " si" : "");
      b.innerHTML = '<span class="num">' + o.n + '</span><span class="nom"></span>';
      b.querySelector(".nom").textContent = o.nombre;
      b.title = o.frase || o.nombre;
      b.addEventListener("click", function () { elegir(o.n); });
      caja.appendChild(b);
    });
    var elegida = lista.find(function (o) { return o.n === actual; });
    raiz.querySelector(".frase").textContent = elegida && elegida.frase ? elegida.frase : "La app tal cual está hoy.";
  }

  function montar() {
    var anfitrion = document.createElement("div");
    anfitrion.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483647;";
    document.documentElement.appendChild(anfitrion);
    raiz = anfitrion.attachShadow({ mode: "open" });
    raiz.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".barra{font:500 14px/1.3 'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;color:#e6edfa;" +
      "background:#101624;border:1px solid rgba(160,190,240,.35);border-radius:16px;padding:10px 12px 9px;" +
      "box-shadow:0 18px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:7px;align-items:center}" +
      ".ops{display:flex;gap:8px}" +
      ".op{all:unset;cursor:pointer;display:flex;align-items:center;gap:9px;padding:7px 14px 7px 8px;border-radius:11px;" +
      "background:#1b2436;border:1px solid rgba(160,190,240,.28)}" +
      ".op:hover{background:#243149}" +
      ".op.si{background:#4d9fff;border-color:#4d9fff;color:#06101f}" +
      ".num{font-size:20px;font-weight:700;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;" +
      "background:rgba(255,255,255,.08)}" +
      ".op.si .num{background:rgba(6,16,31,.18)}" +
      ".nom{font-size:14px;font-weight:600;white-space:nowrap}" +
      ".frase{font-size:13px;color:#c9d5ea;max-width:760px;text-align:center}" +
      ".ayuda{font-size:12px;color:#93a4c2}" +
      ".plegar{all:unset;cursor:pointer;position:absolute;top:6px;right:9px;font-size:13px;color:#93a4c2;padding:2px 6px;border-radius:6px}" +
      ".plegar:hover{background:#243149;color:#e6edfa}" +
      ".barra{position:relative}" +
      ".mini .ops,.mini .frase,.mini .ayuda{display:none}" +
      ".mini{padding:6px 34px 6px 12px}" +
      ".mini .chico{display:block}.chico{display:none;font-weight:700}" +
      "</style>" +
      '<div class="barra"><button class="plegar" title="Plegar o desplegar">–</button>' +
      '<div class="chico"></div><div class="ops"></div><div class="frase"></div>' +
      '<div class="ayuda">Pulsa un número para cambiar el diseño al momento, y mueve la app como siempre: Panel, Cabina, Chat, Decisiones, Perfil, Ajustes. Fuera de una terminal también valen las teclas de los números.</div></div>';
    caja = raiz.querySelector(".ops");
    var barra = raiz.querySelector(".barra");
    raiz.querySelector(".plegar").addEventListener("click", function () {
      barra.classList.toggle("mini");
      raiz.querySelector(".chico").textContent = "Diseño " + actual;
    });
    pintar();
    fetch("/__probador/variantes.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (vs) {
        lista = [{ n: 0, nombre: "Como hoy", frase: "La app tal cual está hoy." }];
        vs.forEach(function (v) { lista.push(v); letras[v.n] = v.letra || null; });
        if (!lista.some(function (o) { return o.n === actual; })) elegir(0);
        aplicarLetra();
        pintar();
      });
  }

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.closest && (t.closest("input,textarea,select,[contenteditable=''],[contenteditable=true],.xterm")))) return;
    if (/^[0-9]$/.test(e.key)) { elegir(Number(e.key)); }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
  window.__probador = { elegir: elegir };
})();
