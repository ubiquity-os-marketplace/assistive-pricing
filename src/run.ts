import { globalLabelUpdate } from "./handlers/global-config-update";
import { onLabelChangeSetPricing } from "./handlers/pricing-label";
import { syncPriceLabelsToConfig } from "./handlers/sync-labels-to-config";
import { Context } from "./types/context";
import { isIssueLabelEvent } from "./types/typeguards";

export function isLocalEnvironment() {
  return process.env.NODE_ENV === "local";
}

export function isGithubOrLocalEnvironment() {
  return isLocalEnvironment() || !!process.env.GITHUB_ACTIONS;
}

export function isWorkerOrLocalEnvironment() {
  return isLocalEnvironment() || !process.env.GITHUB_ACTIONS;
}

export async function run(context: Context) {
  const { eventName, logger } = context;

  switch (eventName) {
    case "issues.opened":
    case "repository.created":
      if (isGithubOrLocalEnvironment()) {
        await syncPriceLabelsToConfig(context);
      }
      break;
    case "issues.labeled":
    case "issues.unlabeled":
      if (isIssueLabelEvent(context) && isWorkerOrLocalEnvironment()) {
        await onLabelChangeSetPricing(context);
      }
      break;
    case "push":
      if (isGithubOrLocalEnvironment()) {
        await globalLabelUpdate(context);
      }
      break;
    default:
      logger.error(`Event ${eventName} is not supported`);
  }
  return { message: "OK" };
}
