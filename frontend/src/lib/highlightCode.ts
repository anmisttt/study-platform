import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";

hljs.registerLanguage("sql", sql);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);

const LANGUAGE_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  py: "python",
  pgsql: "sql",
  postgres: "sql",
  postgresql: "sql",
  plpgsql: "sql",
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveLanguage(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

export type HighlightedCode = {
  html: string;
  language?: string;
};

export function highlightCode(text: string, language?: string): HighlightedCode {
  const resolved = resolveLanguage(language);
  if (!resolved || !hljs.getLanguage(resolved)) {
    return { html: escapeHtml(text) };
  }

  try {
    return {
      html: hljs.highlight(text, { language: resolved, ignoreIllegals: true }).value,
      language: resolved,
    };
  } catch {
    return { html: escapeHtml(text) };
  }
}
