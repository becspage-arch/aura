// orchestrator/src/index.ts
import { randomUUID } from "crypto";
import { ECSClient, ListTasksCommand, DescribeTasksCommand, RunTaskCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { db, checkDb } from "./db.js";
import { env, POLL_MS, SUBNETS, SECURITY_GROUPS } from "./env.js";
import { decryptJson } from "./crypto";
import { ListTaskDefinitionsCommand } from "@aws-sdk/client-ecs";

const ecs = new ECSClient({ region: env.AWS_REGION });

type DesiredAccount = {
  brokerAccountId: string;
  brokerName: string;
  clerkUserId: string;
};

async function envForWorker(a: DesiredAccount) {
  const acct = await db.brokerAccount.findUnique({
    where: { id: a.brokerAccountId },
    select: { encryptedCredentials: true },
  });

  if (!acct?.encryptedCredentials) {
    throw new Error(`Missing encryptedCredentials for ${a.brokerAccountId}`);
  }

  const creds = decryptJson(acct.encryptedCredentials as any);

  const workerName = `worker-${a.brokerAccountId}`;
  const instanceId = `ecs:${a.brokerAccountId}:${randomUUID()}`;

  return [
    { name: "AURA_CLERK_USER_ID", value: a.clerkUserId },
    { name: "AURA_BROKER_ACCOUNT_ID", value: a.brokerAccountId },
    { name: "BROKER", value: a.brokerName },
    { name: "WORKER_NAME", value: workerName },
    { name: "WORKER_INSTANCE_ID", value: instanceId },

    // Inject decrypted creds into runtime
    { name: "PROJECTX_USERNAME", value: String(creds.username || "") },
    { name: "PROJECTX_API_KEY", value: String(creds.apiKey || "") },
    { name: "PROJECTX_CONTRACT_ID", value: String(creds.contractId || "CON.F.US.MGC.J26") },
    ...(creds.externalAccountId
      ? [{ name: "PROJECTX_ACCOUNT_ID", value: String(creds.externalAccountId) }]
      : []),
  ];
}

async function fetchDesiredAccounts(): Promise<DesiredAccount[]> {
  const rows = await db.brokerAccount.findMany({
    where: { isEnabled: true },
    select: {
      id: true,
      brokerName: true,
      user: { select: { clerkUserId: true } },
    },
  });

  // Only launch workers where we can actually scope to a Clerk user
  return rows
    .map((r) => ({
      brokerAccountId: r.id,
      brokerName: r.brokerName,
      clerkUserId: (r.user?.clerkUserId || "").trim(),
    }))
    .filter((r) => r.clerkUserId.length > 0 && r.brokerName.length > 0);
}

function getBrokerAccountIdFromTask(task: any, containerName: string): string | null {
  const overrides = task?.overrides?.containerOverrides || [];
  const c = overrides.find((x: any) => x?.name === containerName) ?? overrides[0];
  const envs = c?.environment || [];
  const hit = envs.find((e: any) => e?.name === "AURA_BROKER_ACCOUNT_ID");
  const v = (hit?.value || "").trim();
  return v ? v : null;
}

async function listOrchestratorTasks(): Promise<any[]> {
  const list = await ecs.send(
    new ListTasksCommand({
      cluster: env.ECS_CLUSTER,
      desiredStatus: "RUNNING",
      startedBy: "aura-orchestrator",
    })
  );

  const arns = (list.taskArns || []).filter(Boolean);
  if (arns.length === 0) return [];

  const described = await ecs.send(
    new DescribeTasksCommand({
      cluster: env.ECS_CLUSTER,
      tasks: arns,
    })
  );

  return described.tasks || [];
}

async function getLatestWorkerTaskDefinition(): Promise<string> {
  const res = await ecs.send(
    new ListTaskDefinitionsCommand({
      familyPrefix: "aura-worker",
      status: "ACTIVE",
      sort: "DESC",
      maxResults: 1,
    })
  );

  const arn = res.taskDefinitionArns?.[0];
  if (!arn) {
    throw new Error("No ACTIVE aura-worker task definition found");
  }

  return arn;
}

async function runWorker(a: DesiredAccount) {
  await ecs.send(
    new RunTaskCommand({
      cluster: env.ECS_CLUSTER,
      startedBy: "aura-orchestrator",
      taskDefinition: await getLatestWorkerTaskDefinition(),
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: SUBNETS,
          securityGroups: SECURITY_GROUPS,
          assignPublicIp: env.ECS_ASSIGN_PUBLIC_IP,
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: env.WORKER_CONTAINER_NAME,
            environment: await envForWorker(a),
          },
        ],
      },
    })
  );

  console.log("[orchestrator] launched worker", {
    brokerAccountId: a.brokerAccountId,
    brokerName: a.brokerName,
    clerkUserId: a.clerkUserId,
  });
}

async function stopTask(taskArn: string, reason: string, brokerAccountId?: string) {
  await ecs.send(
    new StopTaskCommand({
      cluster: env.ECS_CLUSTER,
      task: taskArn,
      reason,
    })
  );

  console.log("[orchestrator] stopped task", { taskArn, reason });

  if (brokerAccountId) {
    await db.workerLease.updateMany({
      where: { brokerAccountId },
      data: { status: "STOPPED" },
    });
  }
}

async function markLeaseStopped(brokerAccountId: string, reason: string) {
  await db.workerLease.updateMany({
    where: { brokerAccountId },
    data: {
      status: "STOPPED",
      meta: {
        reason,
        stoppedAt: new Date().toISOString(),
      } as any,
    },
  });
}

async function reconcileOnce() {
  const desired = await fetchDesiredAccounts();
  const desiredSet = new Set(desired.map((d) => d.brokerAccountId));

  const runningTasks = await listOrchestratorTasks();

  // Map brokerAccountId -> tasks
  const byAccount = new Map<string, any[]>();
  const unknownTasks: any[] = [];

  for (const t of runningTasks) {
    const acctId = getBrokerAccountIdFromTask(t, env.WORKER_CONTAINER_NAME);
    if (!acctId) {
      unknownTasks.push(t);
      continue;
    }
    const arr = byAccount.get(acctId) || [];
    arr.push(t);
    byAccount.set(acctId, arr);
  }

  // Stop any unknown tasks (no account id override)
  for (const t of unknownTasks) {
    if (t?.taskArn) {
      await stopTask(
        t.taskArn,
        "orchestrator:missing-brokerAccountId-override"
      );
    }
  }

  // For each desired account: ensure exactly 1 running task
  for (const acct of desired) {
    const tasks = byAccount.get(acct.brokerAccountId) || [];

    if (tasks.length === 0) {
      await runWorker(acct);
      continue;
    }

    const latestWorkerTaskDef = await getLatestWorkerTaskDefinition();

    // Exactly 1 running worker → check if outdated
    if (tasks.length === 1) {
      const task = tasks[0];
      const runningTaskDef = task.taskDefinitionArn;

      if (runningTaskDef !== latestWorkerTaskDef) {
        console.log("[orchestrator] upgrading worker", {
          brokerAccountId: acct.brokerAccountId,
          from: runningTaskDef,
          to: latestWorkerTaskDef,
        });

        if (task?.taskArn) {
          await stopTask(
            task.taskArn,
            "orchestrator:auto-upgrade",
            acct.brokerAccountId
          );
        }

        await runWorker(acct);
      }

      continue;
    }

    // More than 1 → dedupe
    if (tasks.length > 1) {
      const sorted = [...tasks].sort((a, b) => {
        const at = new Date(a?.startedAt || 0).getTime();
        const bt = new Date(b?.startedAt || 0).getTime();
        return bt - at;
      });

      const keep = sorted[0];
      const stop = sorted.slice(1);

      for (const t of stop) {
        if (t?.taskArn) {
          await stopTask(
            t.taskArn,
            `orchestrator:duplicate-for-account keep=${keep?.taskArn || "unknown"}`,
            acct.brokerAccountId
          );
        }
      }
    }
  // Stop tasks for accounts no longer enabled
  for (const [acctId, tasks] of byAccount.entries()) {
    if (!desiredSet.has(acctId)) {
      if (tasks.length === 0) {
        await markLeaseStopped(acctId, "orchestrator:account-disabled (no running task)");
        continue;
      }

      for (const t of tasks) {
        if (t?.taskArn) {
          await stopTask(t.taskArn, "orchestrator:account-disabled", acctId);
        }
      }

      // If we stopped tasks, also ensure lease gets marked STOPPED
      await markLeaseStopped(acctId, "orchestrator:account-disabled (stopped task)");
    }
  }

  // --- Lease cleanup: if no task is running, mark lease STOPPED once it goes stale ---
  const leaseTtlMs = 60_000; // must match (or exceed) worker's leaseTtlMs
  const nowMs = Date.now();

  // Find any RUNNING leases whose broker account is disabled OR not desired anymore.
  const leases = await db.workerLease.findMany({
    where: {
      status: "RUNNING",
      brokerAccount: { isEnabled: false },
    },
    select: { brokerAccountId: true, lastSeenAt: true },
  });

  for (const l of leases) {
    const hasRunningTask = (byAccount.get(l.brokerAccountId) || []).length > 0;
    if (hasRunningTask) continue;

    const ageMs = nowMs - new Date(l.lastSeenAt).getTime();
    if (ageMs < leaseTtlMs) continue;

    await db.workerLease.update({
      where: { brokerAccountId: l.brokerAccountId },
      data: { status: "STOPPED" },
    });
  }

  console.log("[orchestrator] reconcile done", {
    desiredAccounts: desired.length,
    runningTasks: runningTasks.length,
  });
}

async function main() {
  console.log("[orchestrator] boot", {
    region: env.AWS_REGION,
    cluster: env.ECS_CLUSTER,
    workerTaskDef: env.WORKER_TASK_DEFINITION,
    subnets: SUBNETS,
    securityGroups: SECURITY_GROUPS,
    pollMs: POLL_MS,
  });

  await checkDb();
  console.log("[orchestrator] DB connected");

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileOnce();
    } catch (e: any) {
      console.error("[orchestrator] reconcile error", {
        name: e?.name ?? null,
        message: e?.message ?? String(e),
      });
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(() => void tick(), POLL_MS);

  process.once("SIGINT", () => process.exit(0));
  process.once("SIGTERM", () => process.exit(0));
}

main().catch((e) => {
  console.error("[orchestrator] crash", e);
  process.exit(1);
});
