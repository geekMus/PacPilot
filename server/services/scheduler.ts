import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { hasActivePacWorkflow, runPacWorkflow } from "./workflow";
import { runtimeLog } from "../utils/runtime-log";

let currentTask: ScheduledTask | null = null;
let currentKey = "";
let scheduledRunInFlight = false;
let overlapWarningLogged = false;

export function reschedule(database: AppDatabase, dataDir: string): void {
  const settings = getSettings(database);
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
    () => {
      if (scheduledRunInFlight || hasActivePacWorkflow(database)) {
        if (!overlapWarningLogged) {
          runtimeLog("warn", "Previous workflow is still running; skipping this scheduled trigger to avoid a backlog.");
          overlapWarningLogged = true;
        }
        return;
      }

      overlapWarningLogged = false;
      scheduledRunInFlight = true;

      void runPacWorkflow(database, dataDir, "scheduled")
        .catch((error) => runtimeLog("error", "Scheduled workflow failed: ", error))
        .finally(() => {
          scheduledRunInFlight = false;
        });
    },
    { timezone: settings.timezone }
  );

  currentKey = key;
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }
}
