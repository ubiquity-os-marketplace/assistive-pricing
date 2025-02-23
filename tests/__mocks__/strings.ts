import { CONFIG_FULL_PATH } from "@ubiquity-os/plugin-sdk/constants";

export const STRINGS = {
  CONFIG_PATH: CONFIG_FULL_PATH,
  UBIQUITY: "ubiquity",
  USER_2: "user2",
  TEST_REPO: "test-repo",
  SHA_1: "1234",
  EMAIL: "ubiquity@dao",
  CONFIG_CHANGED_IN_COMMIT: `${CONFIG_FULL_PATH} was modified or added in the commits`,
  CREATED_NEW_LABEL: "Created new price label",
  UPDATING_ISSUE_1_IN_TEST_REPO: "Updating pricing labels in https://github.com/repos/ubiquity/test-repo",
  UPDATING_ISSUE_2_IN_TEST_REPO: "Updating pricing labels in https://github.com/repos/ubiquity/test-repo",
  UPDATING_ISSUE_3_IN_TEST_REPO: "Updating pricing labels in https://github.com/repos/ubiquity/test-repo",
  UPDATING_FROM_1_TO_5: "Updating base rate from 1 to 5",
  CREATING_MISSING_LABELS: "Creating missing labels done",
  DELETING_LABELS: "Removing all labels in issue",
  PUSHER_NOT_AUTHED: "Pusher is not an admin or billing manager",
  SENDER_NOT_AUTHED: "Sender is not an admin or billing manager",
  NO_RECOGNIZED_LABELS: "No recognized labels to calculate price",
  NEEDS_TRIGGERED_BY_ADMIN_OR_BILLING_MANAGER: "Changes should be pushed and triggered by an admin or billing manager.",
};
