import type { EditorView } from "@codemirror/view";
type Axis = "vertical" | "horizontal";
type Bar = { axis: Axis; track: HTMLDivElement; thumb: HTMLButtonElement; trackSize: number; thumbSize: number; pointerStart: number; scrollStart: number };
let sequence = 0;

/** Project-owned overlay controls that proxy CodeMirror's real scroll offsets. */
export function attachCodeMirrorOverlayScrollbars(view: EditorView): () => void {
  const scroller = view.scrollDOM;
  const editor = view.dom;
  const oldId = scroller.id;
  if (!scroller.id) scroller.id = `cm-overlay-scroll-${++sequence}`;
  const bars: Bar[] = [];
  const cleanup: Array<() => void> = [];
  let frame = 0;
  const read = (axis: Axis) => ({
    viewport: axis === "vertical" ? scroller.clientHeight : scroller.clientWidth,
    content: axis === "vertical" ? scroller.scrollHeight : scroller.scrollWidth,
    offset: axis === "vertical" ? scroller.scrollTop : scroller.scrollLeft,
  });
  const write = (axis: Axis, value: number) => {
    if (axis === "vertical") scroller.scrollTop = value;
    else scroller.scrollLeft = value;
  };
  const pointerPos = (axis: Axis, event: PointerEvent) => axis === "vertical" ? event.clientY : event.clientX;
  const sync = (bar: Bar) => {
    const { viewport, content, offset } = read(bar.axis);
    const rect = bar.track.getBoundingClientRect();
    const size = bar.axis === "vertical" ? rect.height : rect.width;
    const max = Math.max(0, content - viewport);
    bar.trackSize = size;
    bar.thumbSize = content > 0 && size > 0 ? Math.min(size, Math.max(22, size * viewport / content)) : size;
    bar.track.hidden = max <= 1 || size <= 0;
    if (bar.track.hidden) return;
    const position = Math.max(0, size - bar.thumbSize) * offset / max;
    bar.thumb.style.width = bar.axis === "vertical" ? "100%" : `${bar.thumbSize}px`;
    bar.thumb.style.height = bar.axis === "vertical" ? `${bar.thumbSize}px` : "100%";
    bar.thumb.style.transform = bar.axis === "vertical" ? `translateY(${position}px)` : `translateX(${position}px)`;
    bar.thumb.setAttribute("aria-valuemax", String(Math.round(max)));
    bar.thumb.setAttribute("aria-valuenow", String(Math.round(offset)));
  };
  const syncAll = () => { frame = 0; bars.forEach(sync); };
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(syncAll);
  };
  for (const axis of ["vertical", "horizontal"] as const) {
    const track = document.createElement("div");
    const thumb = document.createElement("button");
    track.className = `cm-overlay-scrollbar cm-overlay-scrollbar-${axis}`;
    thumb.className = "cm-overlay-scrollbar-thumb";
    thumb.type = "button";
    thumb.setAttribute("role", "scrollbar");
    thumb.setAttribute("aria-controls", scroller.id);
    thumb.setAttribute("aria-orientation", axis);
    thumb.setAttribute("aria-valuemin", "0");
    thumb.setAttribute("aria-valuemax", "0");
    thumb.setAttribute("aria-valuenow", "0");
    thumb.setAttribute("aria-label", axis === "vertical" ? "Editor vertical scroll" : "Editor horizontal scroll");
    track.append(thumb);
    editor.append(track);
    const bar: Bar = { axis, track, thumb, trackSize: 0, thumbSize: 0, pointerStart: 0, scrollStart: 0 };
    bars.push(bar);
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || track.hidden) return;
      event.preventDefault(); event.stopPropagation();
      bar.pointerStart = pointerPos(axis, event); bar.scrollStart = read(axis).offset;
      thumb.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!thumb.hasPointerCapture(event.pointerId)) return;
      const data = read(axis), max = Math.max(0, data.content - data.viewport);
      write(axis, bar.scrollStart + (pointerPos(axis, event) - bar.pointerStart) * max / Math.max(1, bar.trackSize - bar.thumbSize));
      sync(bar);
    };
    const up = (event: PointerEvent) => { if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId); };
    const trackDown = (event: PointerEvent) => {
      if (event.target === thumb || event.button !== 0 || track.hidden) return;
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      const p = pointerPos(axis, event) - (axis === "vertical" ? rect.top : rect.left);
      const thumbRect = thumb.getBoundingClientRect();
      const start = axis === "vertical" ? thumbRect.top - rect.top : thumbRect.left - rect.left;
      const data = read(axis);
      write(axis, data.offset + Math.max(40, data.viewport * .85) * (p < start ? -1 : 1));
      sync(bar);
    };
    const key = (event: KeyboardEvent) => {
      const data = read(axis), max = Math.max(0, data.content - data.viewport), page = Math.max(40, data.viewport * .85);
      let next: number | undefined;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = max;
      else if (event.key === "PageUp") next = data.offset - page;
      else if (event.key === "PageDown") next = data.offset + page;
      else if (axis === "vertical" && event.key === "ArrowUp") next = data.offset - 40;
      else if (axis === "vertical" && event.key === "ArrowDown") next = data.offset + 40;
      else if (axis === "horizontal" && event.key === "ArrowLeft") next = data.offset - 40;
      else if (axis === "horizontal" && event.key === "ArrowRight") next = data.offset + 40;
      if (next === undefined) return;
      event.preventDefault(); write(axis, Math.max(0, Math.min(max, next))); sync(bar);
    };
    thumb.addEventListener("pointerdown", down); thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up); thumb.addEventListener("pointercancel", up);
    thumb.addEventListener("keydown", key); track.addEventListener("pointerdown", trackDown);
    cleanup.push(() => {
      thumb.removeEventListener("pointerdown", down); thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", up); thumb.removeEventListener("pointercancel", up);
      thumb.removeEventListener("keydown", key); track.removeEventListener("pointerdown", trackDown); track.remove();
    });
  }
  scroller.addEventListener("scroll", schedule, { passive: true });
  cleanup.push(() => scroller.removeEventListener("scroll", schedule));
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  resize?.observe(scroller); resize?.observe(view.contentDOM); cleanup.push(() => resize?.disconnect());
  const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
  mutation?.observe(view.contentDOM, { subtree: true, childList: true, characterData: true, attributes: true });
  cleanup.push(() => mutation?.disconnect());
  schedule();
  return () => { if (frame) cancelAnimationFrame(frame); cleanup.forEach(fn => fn()); if (!oldId) scroller.removeAttribute("id"); };
}
