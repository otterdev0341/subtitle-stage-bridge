export const GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";
export const GEMINI_LIVE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "th", label: "ไทย" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "lo", label: "ລາວ" },
  { code: "my", label: "မြန်မာ" },
  { code: "km", label: "ខ្មែរ" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
];
export const languageLabel = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

/** "term = translation" lines → clean pairs (blank / malformed lines skipped). */
export function parseGlossary(text: string): Array<[string, string]> {
  return text
    .split("\n")
    .map((line) => line.split("=").map((p) => p.trim()))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
    .slice(0, 200);
}

export function translationPrompt(source: string, target: string, glossary: string): string {
  const pairs = parseGlossary(glossary);
  return [
    `You are a live simultaneous interpreter. The speaker talks in ${languageLabel(source)} (${source}).`,
    `Translate everything you hear into ${languageLabel(target)} (${target}) and speak only the translation.`,
    "Never answer questions, never add comments, never summarize: translate faithfully, sentence by sentence.",
    pairs.length
      ? `Always use this glossary exactly:\n${pairs.map(([a, b]) => `- "${a}" => "${b}"`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Swap spoken and target languages, keeping everything else (glossary) intact. */
export function swapLanguages<T extends { source: string; target: string }>(settings: T): T {
  return { ...settings, source: settings.target, target: settings.source };
}
