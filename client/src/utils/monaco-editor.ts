import "monaco-editor/esm/vs/editor/editor.main.css";
let pending: Promise<typeof import("monaco-editor/esm/vs/editor/editor.api")> | undefined;
export function loadMonaco() {
  pending ??= (async () => {
    const [ew, jw] = await Promise.all([import("monaco-editor/esm/vs/editor/editor.worker?worker"), import("monaco-editor/esm/vs/language/json/json.worker?worker")]);
    (globalThis as typeof globalThis & { MonacoEnvironment?: { getWorker: (_id: string, label: string) => Worker } }).MonacoEnvironment = {
      getWorker: (_id, label) => label === "json" ? new jw.default() : new ew.default(),
    };
    const m = await import("monaco-editor/esm/vs/editor/editor.api");
    await import("monaco-editor/esm/vs/language/json/monaco.contribution");
    m.editor.defineTheme("pacpilot-light", { base: "vs", inherit: true, rules: [], colors: {
      "editor.background": "#ffffff00", "editor.foreground": "#20242b", "editorLineNumber.foreground": "#858b96",
      "editorLineNumber.activeForeground": "#343a46", "editor.selectionBackground": "#3478f633",
      "editorCursor.foreground": "#3478f6", "scrollbarSlider.background": "#7b84945c",
      "scrollbarSlider.hoverBackground": "#69738699", "scrollbarSlider.activeBackground": "#586174bd",
    }});
    m.editor.defineTheme("pacpilot-dark", { base: "vs-dark", inherit: true, rules: [], colors: {
      "editor.background": "#00000000", "editor.foreground": "#e5e7eb", "editorLineNumber.foreground": "#8b93a2",
      "editorLineNumber.activeForeground": "#e5e7eb", "editor.selectionBackground": "#7aa2f733",
      "editorCursor.foreground": "#9bbcff", "scrollbarSlider.background": "#a6adbb66",
      "scrollbarSlider.hoverBackground": "#c0c6d399", "scrollbarSlider.activeBackground": "#d6dbe6bf",
    }});
    return m;
  })();
  return pending;
}
export const isDarkTheme = () => document.documentElement.classList.contains("theme-dark");
