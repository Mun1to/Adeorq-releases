import { useEffect, useState } from "react";
import { marked } from "marked";
import { readGuide } from "../lib/pty";
import { useT } from "../lib/i18n";

export default function GuideView() {
  const { lang, t } = useT();
  const [html, setHtml] = useState("");

  // Reloads when the language changes: the guide has its own English file.
  useEffect(() => {
    setHtml(`<p>${t("Cargando la guía…")}</p>`);
    readGuide(lang)
      .then((text) => setHtml(marked.parse(text) as string))
      .catch((e) => setHtml(`<p>${t("No pude leer la guía")}: ${String(e)}</p>`));
  }, [lang]);

  return (
    <div className="guide-wrap">
      <article className="guide" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
