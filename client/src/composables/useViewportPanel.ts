import { nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties, type Ref } from "vue";

interface ViewportPanelOptions {
  align?: "start" | "end";
  gap?: number;
  margin?: number;
  maxHeight?: number;
  matchAnchorWidth?: boolean;
  maxWidth?: number;
}

export function useViewportPanel(
  anchor: Ref<HTMLElement | null>,
  panel: Ref<HTMLElement | null>,
  open: Readonly<Ref<boolean>>,
  options: ViewportPanelOptions = {}
) {
  const style = ref<CSSProperties>({ visibility: "hidden" });
  const {
    align = "start",
    gap = 8,
    margin = 12,
    maxHeight: configuredMaxHeight = Number.POSITIVE_INFINITY,
    matchAnchorWidth = false,
    maxWidth = 320,
  } = options;

  async function updatePosition(): Promise<void> {
    const anchorElement = anchor.value;
    const panelElement = panel.value;
    if (!open.value || !anchorElement || !panelElement) return;

    const anchorRect = anchorElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const horizontalMargin = Math.min(margin, viewportWidth / 2);
    const verticalMargin = Math.min(margin, viewportHeight / 2);
    const availableWidth = Math.max(0, viewportWidth - horizontalMargin * 2);
    const width = matchAnchorWidth
      ? Math.min(anchorRect.width, availableWidth)
      : Math.min(maxWidth, availableWidth);
    const requestedLeft = align === "end" ? anchorRect.right - width : anchorRect.left;
    const left = Math.max(
      horizontalMargin,
      Math.min(requestedLeft, viewportWidth - width - horizontalMargin)
    );

    style.value = {
      position: "fixed",
      left: `${left}px`,
      top: `${verticalMargin}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(configuredMaxHeight, viewportHeight - verticalMargin * 2)}px`,
      overflowY: "auto",
      visibility: "hidden",
    };
    await nextTick();
    if (!open.value || panel.value !== panelElement) return;

    const panelHeight = Math.min(
      panelElement.scrollHeight,
      configuredMaxHeight,
      viewportHeight - verticalMargin * 2
    );
    const below = Math.max(0, viewportHeight - anchorRect.bottom - gap - verticalMargin);
    const above = Math.max(0, anchorRect.top - gap - verticalMargin);
    const placeBelow = below >= panelHeight || below >= above;
    const availableHeight = Math.min(placeBelow ? below : above, configuredMaxHeight);
    const visibleHeight = Math.min(panelHeight, availableHeight);
    const top = placeBelow ? anchorRect.bottom + gap : anchorRect.top - gap - visibleHeight;

    style.value = {
      ...style.value,
      top: `${top}px`,
      maxHeight: `${availableHeight}px`,
      visibility: "visible",
    };
  }

  function reposition(): void {
    if (open.value) void updatePosition();
  }

  let listening = false;
  function startListening(): void {
    if (listening) return;
    listening = true;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
  }
  function stopListening(): void {
    if (!listening) return;
    listening = false;
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    window.visualViewport?.removeEventListener("resize", reposition);
    window.visualViewport?.removeEventListener("scroll", reposition);
  }

  watch(
    open,
    (isOpen) => {
      if (isOpen) {
        startListening();
        void updatePosition();
      } else {
        stopListening();
        style.value = { visibility: "hidden" };
      }
    },
    { flush: "post" }
  );
  onMounted(() => {
    if (open.value) {
      startListening();
      void updatePosition();
    }
  });
  onUnmounted(stopListening);

  return { style, updatePosition };
}
