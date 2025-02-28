import { Context } from "../../src/types/context";
import { AUTHED_USER, BILLING_MANAGER, UNAUTHED_USER, PRICE_LABELS, TIME_LABELS, PRIORITY_LABELS } from "./constants";
import { db } from "./db";
import issueTemplate from "./issue-template";
import { STRINGS } from "./strings";
import usersGet from "./users-get.json";

export function getBaseRateChanges(changeAmt: number, withChanges = true, withPlugin = false) {
  return `
  diff--git a /.github /.ubiquity-os - config.yml b /.github /.ubiquity-os - config.yml
  index f7f8053..cad1340 100644
  --- a /.github /.ubiquity-os - config.yml
  +++ b /.github /.ubiquity-os - config.yml
  @@ - 7, 7 + 7, 7 @@features:
          setLabel: true
       fundExternalClosedIssue: true
  ${
    withChanges
      ? `
  payments: 
  -  basePriceMultiplier: 1
  +  basePriceMultiplier: ${changeAmt}`
      : ""
  }
      timers:
      reviewDelayTolerance: 86400000
      taskStaleTimeoutDuration: 2419200000
  ${
    withPlugin
      ? `
    with: 
      labels:
        time: []
@ -40,115 +36,124 @@
          setLabel: true
        assistivePricing: true
  `
      : ""
  }
      `;
}

export function getAuthor(isAuthed: boolean, isBilling: boolean) {
  if (isAuthed) {
    return AUTHED_USER;
  }

  if (isBilling) {
    return BILLING_MANAGER;
  }

  return UNAUTHED_USER;
}

export function inMemoryCommits(id: string, isAuthed = true, withBaseRateChanges = true, isBilling = false): Context<"push">["payload"]["commits"] {
  return [
    {
      author: getAuthor(isAuthed, isBilling),
      committer: getAuthor(isAuthed, isBilling),
      id: id,
      message: "chore: update base rate",
      timestamp: new Date().toISOString(),
      tree_id: id,
      url: "",
      added: [],
      modified: withBaseRateChanges ? [STRINGS.CONFIG_PATH] : [],
      removed: [],
      distinct: true,
    },
  ];
}

export function createCommit({
  owner,
  repo,
  sha,
  modified,
  added,
  withBaseRateChanges,
  withPlugin,
  amount,
}: {
  owner: string;
  repo: string;
  sha: string;
  modified: string[];
  added: string[];
  withBaseRateChanges: boolean;
  withPlugin: boolean;
  amount: number;
}) {
  if (db.commit.findFirst({ where: { sha: { equals: sha } } })) {
    db.commit.delete({ where: { sha: { equals: sha } } });
  }
  db.commit.create({
    id: 1,
    owner: {
      login: owner,
    },
    repo,
    sha,
    modified,
    added,
    data: getBaseRateChanges(amount, withBaseRateChanges, withPlugin),
  });
}

export async function setupTests() {
  for (const item of usersGet) {
    db.users.create(item);
  }

  db.repo.create({
    id: 1,
    html_url: `https://github.com/repos/${STRINGS.UBIQUITY}/${STRINGS.TEST_REPO}`,
    name: STRINGS.TEST_REPO,
    owner: {
      login: STRINGS.UBIQUITY,
      id: 1,
    },
    issues: [],
    labels: [...PRICE_LABELS, ...TIME_LABELS, ...PRIORITY_LABELS],
  });

  db.issue.create({
    ...issueTemplate,
  });

  db.issue.create({
    ...issueTemplate,
    id: 2,
    number: 2,
    labels: [],
  });

  db.issue.create({
    ...issueTemplate,
    id: 3,
    number: 3,
    labels: [
      {
        name: "Time: <1 Hour",
      },
      {
        name: "Priority: 1 (Normal)",
      },
    ],
  });
}
