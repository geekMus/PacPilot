import { useI18n } from "vue-i18n";
import type { NotificationEventDefinition } from "@/api/client";

/** Icon names that `AppIcon` already ships; kept in a union so typos fail typecheck. */
export type DeliveryStatusIcon = "circle-check" | "clock" | "loader-circle" | "circle-alert";

/**
 * Presentation-only label helpers for the notification workspace. Mirrors the
 * `useWorkflowLabels` pattern: a lookup table mapped onto i18n keys, returned as
 * plain functions so pages and feature components can share the same wording
 * without pulling in the workspace state machine.
 */
export function useNotificationLabels() {
  const { t, locale } = useI18n();

  const eventNames: Record<string, string> = {
    "task.execution": "notifications.eventTaskExecution",
    "config.publish": "notifications.eventConfigPublish",
    "request.process": "notifications.eventRequestProcess",
    "system.error": "notifications.eventSystemError",
  };
  const phaseNames: Record<string, string> = {
    started: "notifications.phaseStarted",
    finished: "notifications.phaseFinished",
    state_changed: "notifications.phaseStateChanged",
    progress: "notifications.phaseProgress",
  };
  const outcomeNames: Record<string, string> = {
    any: "notifications.outcomeAny",
    success: "notifications.outcomeSuccess",
    failure: "notifications.outcomeFailure",
    cancelled: "notifications.outcomeCancelled",
    timeout: "notifications.outcomeTimeout",
    unknown: "notifications.outcomeUnknown",
  };
  const statusNames: Record<string, string> = {
    succeeded: "notifications.deliverySucceeded",
    pending: "notifications.deliveryPending",
    sending: "notifications.deliverySending",
    failed: "notifications.deliveryFailed",
  };
  const statusIcons: Record<string, DeliveryStatusIcon> = {
    succeeded: "circle-check",
    pending: "clock",
    sending: "loader-circle",
    failed: "circle-alert",
  };

  const evName = (value: string, catalog: NotificationEventDefinition[] = []) =>
    eventNames[value]
      ? t(eventNames[value])
      : (catalog.find((x) => x.type === value)?.label ?? value);
  const phaseName = (value: string) => (phaseNames[value] ? t(phaseNames[value]) : value);
  const outcomeName = (value?: string | null) =>
    t(outcomeNames[value ?? "any"] ?? "notifications.outcomeAny");
  const providerName = (provider: string) =>
    provider === "dingtalk"
      ? t("notifications.providerDingTalk")
      : t("notifications.providerHttp");
  const statusName = (status: string) => (statusNames[status] ? t(statusNames[status]) : status);
  const statusIcon = (status: string): DeliveryStatusIcon => statusIcons[status] ?? "clock";
  const formatDate = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  };
  const shortUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\?.*$/, "");

  return {
    evName,
    phaseName,
    outcomeName,
    providerName,
    statusName,
    statusIcon,
    formatDate,
    shortUrl,
  };
}
