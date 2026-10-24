import cron, { type ScheduledTask } from "node-cron";
import type { ApplicationStorage } from "../storage/repositories";
import { hasActivePacWorkflow, runPacWorkflow } from "./workflow";
import { refreshRemoteRules } from "./pac-generator";
import { runtimeLog } from "../utils/runtime-log";

let currentTask: ScheduledTask | null = null;
let currentKey = "";
let scheduledRunInFlight = false;
let overlapWarningLogged = false;
let refreshInFlight = false;

/**
 * Runs on the user's cron expression. Besides triggering the PAC workflow it
 * refreshes the remote rule snapshot, because the scheduled job is the only
 * moment remote rules are re-fetched — there is no autonomous polling.
 */
export async function reschedule(storage: ApplicationStorage, dataDir: string): Promise<void> {
  const settings = await storage.settings.get();
  const expression = settings.cronSchedule.trim();
  const key = expression + "\n" + settings.timezone;

  if (currentTask && currentKey === key) return;

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }

  if (!expression) {
    return;
  }

  if (!cron.validate(expression)) {
    runtimeLog("error", `Invalid scheduled task expression: ${expression}`);
    return;
  }

  currentTask = cron.schedule(
    expression,
    async () => {
      // Refresh remote rules first: even if a workflow is already running, the
      // rule snapshot should still be brought up to date.
      if (await shouldRefreshRules(storage)) {
        if (refreshInFlight) {
          runtimeLog("warn", "Previous remote rule refresh is still running; skipping this one.");
        } else {
          refreshInFlight = true;
          try {
            const result = await refreshRemoteRules(storage);
            if (result.ok) runtimeLog("info", "Scheduled remote rule refresh completed.");
            else runtimeLog("warn", `Scheduled remote rule refresh failed: ${result.message}`);
          } finally {
            refreshInFlight = false;
          }
        }
      }

      if (scheduledRunInFlight || (await hasActivePacWorkflow(storage))) {
        if (!overlapWarningLogged) {
          runtimeLog(
            "warn",
            "Previous workflow is still running; skipping this scheduled trigger to avoid a backlog."
          );
          overlapWarningLogged = true;
        }
        return;
      }

      overlapWarningLogged = false;
      scheduledRunInFlight = true;

      void runPacWorkflow(storage, dataDir, "scheduled")
        .catch((error) => runtimeLog("error", "Scheduled workflow failed: ", error))
        .finally(() => {
          scheduledRunInFlight = false;
        });
    },
    { timezone: settings.timezone }
  );

  currentKey = key;
}

async function shouldRefreshRules(storage: ApplicationStorage): Promise<boolean> {
  const settings = await storage.settings.get();
  return settings.mode === "remote" && Boolean(settings.listUrl.trim());
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }
}
