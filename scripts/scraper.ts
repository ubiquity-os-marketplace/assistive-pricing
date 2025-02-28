/* eslint-disable sonarjs/os-command */
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";

// Repository configuration
interface RepoConfig {
  owner: string;
  repos: string[];
}

const repositories: RepoConfig[] = [
  {
    owner: "ubiquity-os-marketplace",
    repos: [
      "text-conversation-rewards",
      "command-start-stop",
      "text-vector-embeddings",
      "command-wallet",
      "daemon-pricing",
      "daemon-disqualifier",
      "command-query",
      "command-ask",
    ],
  },
  {
    owner: "ubiquity-os",
    repos: ["plugin-sdk", "ubiquity-os-plugin-installer", "ubiquity-os-kernel"],
  },
  {
    owner: "ubiquity-os",
    repos: ["pay.ubq.fi", "work.ubq.fi", "ubiquity-dollar"],
  },
];

// Ensure data directory exists
const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
}

const trainOutputPath = join(dataDir, "fine_tuning_train.jsonl");
const validationOutputPath = join(dataDir, "fine_tuning_validation.jsonl");
const TRAIN_SPLIT = 0.8; // 80% training, 20% validation

// Valid time labels
const VALID_TIME_LABELS = new Set([
  "Time: <15 Minutes",
  "Time: <1 Day",
  "Time: <1 Week",
  "Time: <1 Month",
  "Time: <1 Hour",
  "Time: <2 Hours",
  "Time: <4 Hours",
]);

interface Label {
  name: string;
}

interface User {
  login: string;
  type?: string;
}

interface Issue {
  body: string;
  labels: Label[];
  created_at: string;
  closed_at: string | null;
  number: number;
  user: User;
  pull_request?: unknown;
}

interface TrainingExample {
  messages: Array<{
    role: string;
    content: string;
  }>;
  timeLabel: string;
  source: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeInput(input: string): string {
  // Remove any characters that could be used for command injection
  return input.replace(/[;&|`$(){}[\]<>\\]/g, "");
}

async function fetchIssuesForState(owner: string, repo: string, state: "open" | "closed"): Promise<Issue[]> {
  let allIssues: Issue[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const sanitizedOwner = sanitizeInput(owner);
      const sanitizedRepo = sanitizeInput(repo);

      const cmd = `gh api "/repos/${sanitizedOwner}/${sanitizedRepo}/issues?state=${state}&per_page=${perPage}&page=${page}&sort=created&direction=asc"`;
      console.log(`Fetching ${state} issues page ${page} from ${owner}/${repo}...`);

      //@eslint-disable
      const response = execSync(cmd, {
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024,
      });

      const issues = JSON.parse(response) as Issue[];

      if (issues.length === 0) {
        console.log(`No more ${state} issues found for ${owner}/${repo}`);
        break;
      }

      const filteredIssues = issues.filter((issue) => !issue.pull_request);
      console.log(`Found ${filteredIssues.length} ${state} issues on page ${page}`);

      allIssues = allIssues.concat(filteredIssues);
      page++;

      await sleep(1000);
    } catch (error) {
      console.error(`Error fetching ${state} issues page ${page} for ${owner}/${repo}:`, error);
      if (error instanceof Error && error.message.includes("rate limit")) {
        console.log("Rate limit hit, waiting for 60 seconds...");
        await sleep(60000);
        continue;
      }
      break;
    }
  }

  return allIssues;
}

async function fetchAllIssues(owner: string, repo: string): Promise<Issue[]> {
  console.log(`\nFetching all issues for ${owner}/${repo}...`);

  const openIssues = await fetchIssuesForState(owner, repo, "open");
  console.log(`Found ${openIssues.length} open issues`);

  const closedIssues = await fetchIssuesForState(owner, repo, "closed");
  console.log(`Found ${closedIssues.length} closed issues`);

  const allIssues = [...openIssues, ...closedIssues];
  console.log(`Total issues found for ${owner}/${repo}: ${allIssues.length}\n`);

  return allIssues;
}

function calculateTimeToComplete(createdAt: string, closedAt: string | null): string {
  if (!closedAt) return "Not completed";

  const diffMs = new Date(closedAt).getTime() - new Date(createdAt).getTime();

  const units = [
    { value: 60, unit: "minute" },
    { value: 24, unit: "hour" },
    { value: 7, unit: "day" },
    { value: 4, unit: "week" },
    { value: Infinity, unit: "month" },
  ];

  let time = Math.round(diffMs / (1000 * 60));
  let unitIndex = 0;

  while (unitIndex < units.length - 1 && time >= units[unitIndex].value) {
    time = Math.round(time / units[unitIndex].value);
    unitIndex++;
  }

  const unit = units[unitIndex].unit;
  return `${time} ${time === 1 ? unit : unit + "s"}`;
}

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    // Generate cryptographically secure random number
    const randomBytes = crypto.randomBytes(4);
    const j = Math.floor((randomBytes.readUInt32BE(0) / 0x100000000) * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function formatContent(issue: Issue, metadata: string): string {
  return [
    "### Issue Description",
    `[${new Date(issue.created_at).toISOString()}] [${issue.user.login}]:\n${issue.body || ""}`,
    "",
    "### Issue Details",
    metadata,
    "",
    "### Valid Time Labels",
    Array.from(VALID_TIME_LABELS).join("\n"),
  ].join("\n");
}

function balanceDataset(examples: TrainingExample[]): TrainingExample[] {
  // Group examples by time label
  const groupedExamples = new Map<string, TrainingExample[]>();
  for (const example of examples) {
    const currentGroup = groupedExamples.get(example.timeLabel) || [];
    currentGroup.push(example);
    groupedExamples.set(example.timeLabel, currentGroup);
  }

  // Find minimum count across all labels
  let minCount = Infinity;
  for (const [label, group] of groupedExamples.entries()) {
    console.log(`Found ${group.length} examples for ${label}`);
    minCount = Math.min(minCount, group.length);
  }
  console.log(`\nBalancing dataset to ${minCount} examples per label`);
  const balancedExamples: TrainingExample[] = [];
  for (const [label, group] of groupedExamples.entries()) {
    const shuffled = shuffleArray(group);
    const selected = shuffled.slice(0, minCount);
    balancedExamples.push(...selected);
    console.log(`Selected ${selected.length} examples for ${label}`);
  }
  return shuffleArray(balancedExamples);
}

async function getClosedIssues(): Promise<void> {
  try {
    const allExamples: TrainingExample[] = [];
    const sourceStats = new Map<string, number>();

    for (const config of repositories) {
      for (const repo of config.repos) {
        console.log(`Processing ${config.owner}/${repo}...`);
        const issues = await fetchAllIssues(config.owner, repo);
        const repoPath = `${config.owner}/${repo}`;

        let processedCount = 0;
        for (const issue of issues) {
          const timeLabels = issue.labels.filter((label) => VALID_TIME_LABELS.has(label.name)).map((label) => label.name);

          if (timeLabels.length > 0) {
            const completionTime = calculateTimeToComplete(issue.created_at, issue.closed_at);

            const metadata = [`Repository: ${repoPath}`, `Issue Number: #${issue.number}`, `Time to Complete: ${completionTime}`].join("\n");

            const systemPrompt = [
              "Given the issue content and actual completion time, assign the most appropriate Time Label.",
              "Consider the task complexity and actual completion time to select from the available time labels.",
              "Ensure your selection reflects the real time investment needed for the task.",
            ].join("\n");

            const content = formatContent(issue, metadata);
            const timeLabel = timeLabels[0];
            sourceStats.set(repoPath, (sourceStats.get(repoPath) || 0) + 1);

            const messages = [
              { role: "system", content: systemPrompt },
              { role: "user", content },
              { role: "assistant", content: timeLabel },
            ];

            allExamples.push({ messages, timeLabel, source: repoPath });
            processedCount++;
          }
        }
        console.log(`Processed ${processedCount} labeled issues from ${repoPath}`);
      }
    }

    console.log("\nInitial Source Distribution:");
    for (const [source, count] of sourceStats.entries()) {
      console.log(`${source}: ${count} issues`);
    }

    if (allExamples.length === 0) {
      throw new Error("No valid training data found!");
    }

    // Balance the dataset
    console.log("\nBalancing dataset...");
    const balancedExamples = balanceDataset(allExamples);
    console.log(`\nFinal balanced dataset size: ${balancedExamples.length}`);

    // Shuffle and split the balanced data
    const trainSize = Math.floor(balancedExamples.length * TRAIN_SPLIT);
    const trainData = balancedExamples.slice(0, trainSize);
    const validationData = balancedExamples.slice(trainSize);

    // Write training data
    const trainJsonlData = trainData.map((data) => JSON.stringify({ messages: data.messages })).join("\n");
    writeFileSync(trainOutputPath, trainJsonlData);
    console.log(`\nTraining data (${trainData.length} examples) written to ${trainOutputPath}`);

    // Write validation data
    const validationJsonlData = validationData.map((data) => JSON.stringify({ messages: data.messages })).join("\n");
    writeFileSync(validationOutputPath, validationJsonlData);
    console.log(`\nValidation data (${validationData.length} examples) written to ${validationOutputPath}`);

    // Log final counts
    const labelCounts = new Map<string, number>();
    for (const example of balancedExamples) {
      labelCounts.set(example.timeLabel, (labelCounts.get(example.timeLabel) || 0) + 1);
    }

    console.log("\nFinal Label Distribution:");
    for (const [label, count] of labelCounts.entries()) {
      console.log(`${label}: ${count} examples`);
    }

    console.log(`\nTotal balanced examples: ${balancedExamples.length}`);
    console.log(`Training examples: ${trainData.length}`);
    console.log(`Validation examples: ${validationData.length}`);
  } catch (error) {
    console.error("Error processing issues:", error);
    process.exit(1);
  }
}

// Check if gh cli is installed and authenticated
try {
  // Use full path to gh binary for security
  execSync("/usr/bin/gh auth status", { stdio: "ignore" });
} catch (error) {
  if (error instanceof Error) {
    console.error("Error: GitHub CLI is not installed or not authenticated.");
    console.error('Please install GitHub CLI and run "gh auth login" to authenticate.');
    process.exit(1);
  }
}

// Use proper Promise handling
void getClosedIssues().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
