import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Manifest } from "@ubiquity-os/plugin-sdk/manifest";
import { LOG_LEVEL, LogLevel } from "@ubiquity-os/ubiquity-os-logger";
import type { ExecutionContext } from "hono";
import manifest from "../manifest.json";
import { isLocalEnvironment, run } from "./run";
import { Context, SupportedEvents } from "./types/context";
import { Env, envSchema } from "./types/env";
import { AssistivePricingSettings, pluginSettingsSchema } from "./types/plugin-input";

async function startAction(context: Context, inputs: Record<string, unknown>) {
  const { payload, logger, env } = context;

  if (!payload.repository.owner) {
    throw logger.fatal("Owner is missing from payload", { payload });
  }

  if (!env.ACTION_REF) {
    throw logger.fatal("ACTION_REF is missing from the environment");
  }

  const regex = /^([\w-]+)\/([\w.-]+)@([\w./-]+)$/;

  const match = RegExp(regex).exec(env.ACTION_REF);

  if (!match) {
    throw logger.fatal("The ACTION_REF is not in the proper format (owner/repo@ref)");
  }

  const [, owner, repo, ref] = match;

  logger.info(`Will try to dispatch a workflow at ${owner}/${repo}@${ref}`);

  const appOctokit = new customOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId: context.env.APP_ID,
      privateKey: context.env.APP_PRIVATE_KEY,
    },
  });

  let authOctokit;
  if (!env.APP_ID || !env.APP_PRIVATE_KEY) {
    logger.debug("APP_ID or APP_PRIVATE_KEY are missing from the env, will use the default Octokit instance.");
    authOctokit = context.octokit;
  } else {
    const installation = await appOctokit.rest.apps.getRepoInstallation({
      owner,
      repo,
    });
    authOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: context.env.APP_ID,
        privateKey: context.env.APP_PRIVATE_KEY,
        installationId: installation.data.id,
      },
    });
  }
  await authOctokit.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    inputs,
    ref,
    workflow_id: "compute.yml",
  });
}

export default {
  async fetch(request: Request, env: Record<string, string>, executionCtx?: ExecutionContext) {
    // It is important to clone the request because the body is read within createPlugin as well
    const responseClone = request.clone();

    return createPlugin<AssistivePricingSettings, Env, null, SupportedEvents>(
      async (context) => {
        switch (context.eventName) {
          case "issues.opened":
          case "repository.created":
          case "push": {
            if (isLocalEnvironment()) {
              return run(context);
            } else {
              const text = (await responseClone.json()) as Record<string, unknown>;
              return startAction(context, text);
            }
          }
          case "issues.labeled":
          case "issues.unlabeled": {
            return run(context);
          }
          default: {
            return run(context);
          }
        }
      },
      manifest as Manifest,
      {
        envSchema: envSchema,
        postCommentOnError: true,
        settingsSchema: pluginSettingsSchema,
        logLevel: (env.LOG_LEVEL as LogLevel) || LOG_LEVEL.INFO,
        kernelPublicKey: env.KERNEL_PUBLIC_KEY,
        bypassSignatureVerification: env.NODE_ENV === "local",
      }
    ).fetch(request, env, executionCtx);
  },
};
