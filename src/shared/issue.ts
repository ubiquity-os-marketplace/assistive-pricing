import { Context } from "../types/context";

async function checkIfIsAdmin(context: Context, username: string) {
  const owner = context.payload.repository.owner?.login;
  if (!owner) throw context.logger.error("No owner found in the repository!");
  const response = await context.octokit.rest.repos.getCollaboratorPermissionLevel({
    owner,
    repo: context.payload.repository.name,
    username,
  });
  return response.data.permission === "admin";
}

async function checkIfIsBillingManager(context: Context, username: string) {
  if (!context.payload.organization) throw context.logger.error(`No organization found in payload!`);

  try {
    await context.octokit.rest.orgs.checkMembershipForUser({
      org: context.payload.organization.login,
      username,
    });
  } catch {
    return false;
  }

  const { data: membership } = await context.octokit.rest.orgs.getMembershipForUser({
    org: context.payload.organization.login,
    username,
  });
  return membership.role === "billing_manager";
}

export async function isUserAdminOrBillingManager(context: Context, username?: string): Promise<"admin" | "billing_manager" | false> {
  if (!username) return false;
  const isAdmin = await checkIfIsAdmin(context, username);
  if (isAdmin) return "admin";

  const isBillingManager = await checkIfIsBillingManager(context, username);
  if (isBillingManager) return "billing_manager";

  return false;
}

export async function listOrgRepos(context: Context) {
  const org = context.payload.organization?.login;
  if (!org) throw context.logger.error("No organization found in payload!", { payload: context.payload });

  try {
    const response = await context.octokit.rest.repos.listForOrg({
      org,
    });
    return response.data.filter((repo) => !repo.archived && !repo.disabled && !context.config.globalConfigUpdate?.excludeRepos.includes(repo.name));
  } catch (err) {
    throw context.logger.error("Listing org repos failed!", { err });
  }
}

export async function listRepoIssues(context: Context, owner: string, repo: string) {
  try {
    return await context.octokit.paginate(context.octokit.rest.issues.listForRepo, {
      owner,
      repo,
    });
  } catch (err) {
    throw context.logger.error("Listing repo issues failed!", { err });
  }
}
