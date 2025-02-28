import { Label } from "../types/github";
import { Context } from "../types/context";

// cspell:disable
export const COLORS = { default: "ededed", price: "1f883d" };
// cspell:enable

const NO_REPO_OWNER = "No owner found in the repository!";

export async function listLabelsForRepo(context: Context): Promise<Label[]> {
  const { payload, octokit } = context;

  const owner = payload.repository.owner?.login;
  if (!owner) {
    throw context.logger.error(NO_REPO_OWNER);
  }
  // we need to paginate because the devpool has hundreds of labels
  const res = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo: payload.repository.name,
    per_page: 100,
  });
  context.logger.debug(`Fetching labels for repository ${payload.repository.html_url}`, {
    owner,
    repo: payload.repository.name,
    labels: res.map((o) => o.name),
  });
  if (res.length > 0) {
    // we'll hit a secondary rate limit if using the runner token
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return res;
  }

  return [];
}

export async function createLabel(context: Context, name: string, labelType = "default" as keyof typeof COLORS, description?: string): Promise<void> {
  const payload = context.payload;

  const color = name.startsWith("Price: ") ? COLORS.price : COLORS[labelType];
  const owner = payload.repository.owner?.login;
  if (!owner) {
    throw context.logger.error(NO_REPO_OWNER);
  }

  try {
    const createLabelsOptions = {
      owner,
      repo: payload.repository.name,
      name,
      color,
      description,
    };
    context.logger.debug("Trying to create label", { createLabelsOptions });
    await context.octokit.rest.issues.createLabel(createLabelsOptions);
  } catch (err) {
    context.logger.error("Creating a label failed!", { err });
  }
}

export async function clearAllPriceLabelsOnIssue(context: Context) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  const labels = payload.issue.labels;
  if (!labels) return;
  const issuePriceLabels = labels.filter((label) => label.name.toString().startsWith("Price: ") || label.name.toString().startsWith("Pricing: "));
  if (!issuePriceLabels.length) return;

  for (const label of issuePriceLabels) {
    try {
      await context.octokit.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        name: label.name,
      });
    } catch (err) {
      // Sometimes labels are out of sync or the price was manually added, which is safe to ignore since we are
      // updating all the labels.
      if (err && typeof err === "object" && "status" in err && err.status === 404) {
        context.logger.error(`Label [${label.name}] not found on issue ${payload.issue.html_url}, ignoring.`, { err });
      } else {
        throw context.logger.error(`Removing label on issue ${payload.issue.html_url} failed!`, { label, err });
      }
    }
  }
}
export async function addLabelToIssue(context: Context, labelName: string) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  try {
    await context.octokit.rest.issues.addLabels({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      labels: [labelName],
    });
  } catch (err: unknown) {
    throw context.logger.error("Adding a label to issue failed!", { err });
  }
}

export async function removeLabelFromIssue(context: Context, labelName: string) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  try {
    await context.octokit.rest.issues.removeLabel({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      name: labelName,
    });
  } catch (err: unknown) {
    throw context.logger.error("Removing a label from an issue failed!", { err });
  }
}
