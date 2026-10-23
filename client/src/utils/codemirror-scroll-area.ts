import type { EditorView } from "@codemirror/view";

/**
 * Bridges CodeMirror's internal scroller to the shared Reka UI ScrollArea
 * viewport. Scrollbar rendering, thumb sizing, dragging, keyboard handling,
 * and visibility remain owned by AppScrollArea / Reka UI.
 */
export function attachCodeMirrorScrollArea(
  view: EditorView,
  viewport: HTMLElement,
  spacer: HTMLElement
): () => void {
  const scroller = view.scrollDOM;
  let disposed = false;
  let frame = 0;

  const syncSpacer = () => {
    frame = 0;
    if (disposed) return;
    spacer.style.width = `${Math.max(viewport.clientWidth, scroller.scrollWidth)}px`;
    spacer.style.height = `${Math.max(viewport.clientHeight, scroller.scrollHeight)}px`;
  };
  const scheduleSpacerSync = () => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(syncSpacer);
  };
  const fromViewport = () => {
    if (scroller.scrollTop !== viewport.scrollTop) scroller.scrollTop = viewport.scrollTop;
    if (scroller.scrollLeft !== viewport.scrollLeft) scroller.scrollLeft = viewport.scrollLeft;
  };
  const fromEditor = () => {
    if (viewport.scrollTop !== scroller.scrollTop) viewport.scrollTop = scroller.scrollTop;
    if (viewport.scrollLeft !== scroller.scrollLeft) viewport.scrollLeft = scroller.scrollLeft;
    scheduleSpacerSync();
  };

  viewport.addEventListener("scroll", fromViewport, { passive: true });
  scroller.addEventListener("scroll", fromEditor, { passive: true });
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSpacerSync);
  resizeObserver?.observe(view.dom);
  resizeObserver?.observe(view.contentDOM);
  resizeObserver?.observe(viewport);
  const mutationObserver =
    typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleSpacerSync);
  mutationObserver?.observe(view.contentDOM, { subtree: true, childList: true, characterData: true });
  scheduleSpacerSync();

  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    viewport.removeEventListener("scroll", fromViewport);
    scroller.removeEventListener("scroll", fromEditor);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}
