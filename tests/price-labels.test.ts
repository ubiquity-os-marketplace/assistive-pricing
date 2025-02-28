import { jest } from "@jest/globals";
import { syncPriceLabelsToConfig } from "../src/handlers/sync-labels-to-config";
import { calculateLabelValue } from "../src/shared/pricing";
import { Context } from "../src/types/context";

interface Label {
  name: string;
  description: string | undefined;
}

jest.unstable_mockModule("../src/shared/label", () => ({
  listLabelsForRepo: jest.fn(),
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockOctokit = {
  rest: {
    issues: {
      updateLabel: jest.fn(),
    },
  },
  paginate: jest.fn(),
};

const mockContext: Context = {
  config: {
    labels: {
      time: [],
      priority: [],
    },
    basePriceMultiplier: 1,
    globalConfigUpdate: { excludeRepos: [] },
  },
  logger: mockLogger,
  payload: {
    repository: {
      owner: { login: "owner" },
      name: "repo",
    },
  },
  octokit: mockOctokit,
} as unknown as Context;

describe("syncPriceLabelsToConfig function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should not update labels if descriptions match the collaboratorOnly criteria", async () => {
    const allLabels: Label[] = [
      { name: "Label1", description: "" },
      { name: "Label2", description: "" },
      { name: "Label3", description: "" },
    ];

    const pricingLabels = [{ name: "Label1" }, { name: "Label2" }, { name: "Label3" }];
    const { listLabelsForRepo } = await import("../src/shared/label");
    (listLabelsForRepo as unknown as jest.Mock<() => Promise<typeof allLabels>>).mockResolvedValue(allLabels);
    (mockOctokit.paginate as unknown as jest.Mock<() => Promise<typeof allLabels>>).mockResolvedValue(allLabels);

    mockContext.config.labels.time = pricingLabels;
    mockContext.config.labels.priority = [];

    await syncPriceLabelsToConfig(mockContext);

    expect(mockOctokit.rest.issues.updateLabel).not.toHaveBeenCalled();
  }, 15000);

  it("Should properly handled 0 priority label", () => {
    let labelValue = calculateLabelValue("Priority: 0 (Regression)");
    expect(labelValue).toEqual(0);
    labelValue = calculateLabelValue("Priority: - (Regression)");
    expect(labelValue).toEqual(null);
    labelValue = calculateLabelValue("Time: 0 Hours");
    expect(labelValue).toEqual(0);
    labelValue = calculateLabelValue("Time: some Hours");
    expect(labelValue).toEqual(null);
  });
});
