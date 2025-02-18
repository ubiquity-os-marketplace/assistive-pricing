import { COLORS, createLabel, listLabelsForRepo } from "../shared/label";
import { calculateLabelValue, calculateTaskPrice } from "../shared/pricing";
import { Context } from "../types/context";
import { Label } from "../types/github";

// This just checks all the labels in the config have been set in gh issue
// If there's something missing, they will be added

const NO_OWNER_FOUND = "No owner found in the repository!";

export async function syncPriceLabelsToConfig(context: Context): Promise<void> {
  const { config, logger } = context;

  const priceLabels: { name: string }[] = [];
  for (const timeLabel of config.labels.time) {
    for (const priorityLabel of config.labels.priority) {
      const timeValue = calculateLabelValue(timeLabel.name);
      const priorityValue = calculateLabelValue(priorityLabel.name);
      if (timeValue === null || priorityValue === null) {
        logger.info("Time or Priority label is not defined, skipping.", { timeLabel, priorityLabel });
        continue;
      }
      const targetPrice = calculateTaskPrice(context, timeValue, priorityValue, config.basePriceMultiplier);
      const targetPriceLabel = `Price: ${targetPrice} USD`;
      if (!priceLabels.some((o) => o.name === targetPrice)) {
        priceLabels.push({ name: targetPriceLabel });
      }
    }
  }

  const pricingLabels = [...priceLabels, ...config.labels.time, ...config.labels.priority];

  // List all the labels for a repository
  const allLabels = await listLabelsForRepo(context);

  const incorrectPriceLabels = allLabels.filter((label) => label.name.startsWith("Price: ") && !priceLabels.some((o) => o.name === label.name));

  if (incorrectPriceLabels.length > 0 && config.globalConfigUpdate) {
    await handleGlobalUpdate(context, logger, incorrectPriceLabels);
  }

  const incorrectColorPriceLabels = allLabels.filter((label) => label.name.startsWith("Price: ") && label.color !== COLORS.price);

  // Update incorrect color labels
  if (incorrectColorPriceLabels.length > 0) {
    logger.info("Incorrect color labels found, updating them", { incorrectColorPriceLabels: incorrectColorPriceLabels.map((label) => label.name) });
    const owner = context.payload.repository.owner?.login;
    if (!owner) {
      throw logger.error(NO_OWNER_FOUND);
    }
    await Promise.allSettled(
      incorrectColorPriceLabels.map((label) =>
        context.octokit.rest.issues.updateLabel({
          owner,
          repo: context.payload.repository.name,
          name: label.name,
          color: COLORS.price,
        })
      )
    );
    logger.info(`Updating incorrect color labels done`);
  }

  // Get the missing labels
  const missingLabels = [...new Set(pricingLabels.filter((label) => !allLabels.map((i) => i.name).includes(label.name)))];

  // Create missing labels
  if (missingLabels.length > 0) {
    logger.info("Missing labels found, creating them", { missingLabels });
    await Promise.allSettled(missingLabels.map((label) => createLabel(context, label.name, "default")));
    logger.info(`Creating missing labels done`);
  }
}

async function handleGlobalUpdate(context: Context, logger: Context["logger"], incorrectPriceLabels: Label[]) {
  logger.info("Incorrect price labels found, removing them", { incorrectPriceLabels: incorrectPriceLabels.map((label) => label.name) });
  const owner = context.payload.repository.owner?.login;
  if (!owner) {
    throw logger.error("No owner found in the repository!");
  }

  for (const label of incorrectPriceLabels) {
    logger.info(`Removing incorrect price label ${label.name}`);
    try {
      await context.octokit.rest.issues.deleteLabel({
        owner,
        repo: context.payload.repository.name,
        name: label.name,
      });
    } catch (er) {
      logger.error("Error deleting label", { er });
    }
  }
  logger.info(`Removing incorrect price labels done`);
}
