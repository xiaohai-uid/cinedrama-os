import fs from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { PipelineService } from "../src/services/pipeline.js";
import { ResilienceService } from "../src/services/resilience.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "../src/plugins/drama-pipeline/index.js";
import serverPlugin from "../src/plugins/server/index.js";

describe("CineDrama OS Chaos & Network Resilience Suite", () => {
  let ctx: any;
  const testDb = "./data/test-chaos-resilience.sqlite";
  const port = 8992;

  beforeEach(async () => {
    if (fs.existsSync(testDb)) {
      try {
        fs.unlinkSync(testDb);
      } catch {}
    }

    ctx = createContext();
    new DatabaseService(ctx, testDb);
    new RateLimiterService(ctx, { enabled: true, tpmLimit: 10000000, rpmLimit: 1000 });
    new ProviderRegistryService(ctx);
    new PipelineService(ctx);
    new ResilienceService(ctx);

    await ctx.plugin(bridgePlugin, { baseUrl: "http://127.0.0.1:9999", enableFallback: true });
    await ctx.plugin(dramaPipelinePlugin);
    await ctx.plugin(serverPlugin, { port, host: "127.0.0.1" });
  });

  afterEach(() => {
    ctx.events.emit("dispose");
    ctx.db.close();
    if (fs.existsSync(testDb)) {
      try {
        fs.unlinkSync(testDb);
      } catch {}
    }
  });

  it("Case 1: Exponential backoff retry should self-heal transient network 503 / timeout errors", async () => {
    const resilience: ResilienceService = ctx.resilience;
    let callCount = 0;

    const unstableNetworkCall = async () => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("503 Service Unavailable: Remote cluster temporary congested");
        err.statusCode = 503;
        throw err;
      }
      return { ok: true, data: "recovered_payload" };
    };

    const res = await resilience.executeWithRetry(unstableNetworkCall, {
      maxRetries: 3,
      baseDelayMs: 20,
      jitter: false,
    });

    expect(callCount).toBe(2);
    expect(res.attempts).toBe(2);
    expect(res.recovered).toBe(true);
    expect(res.result.data).toBe("recovered_payload");
  });

  it("Case 2: Permanent non-retryable errors (e.g. 400 Bad Request) should terminate immediately", async () => {
    const resilience: ResilienceService = ctx.resilience;
    let callCount = 0;

    const invalidRequest = async () => {
      callCount++;
      const err: any = new Error("400 Bad Request: Invalid prompt schema");
      err.statusCode = 400;
      throw err;
    };

    await expect(
      resilience.executeWithRetry(invalidRequest, { maxRetries: 3, baseDelayMs: 10 })
    ).rejects.toThrow("400 Bad Request");

    // 不应盲目重试非临时性错误
    expect(callCount).toBe(1);
  });

  it("Case 3: Job resumption from checkpoint should skip previously completed steps", async () => {
    const projectId = "proj_chaos_resume";
    ctx.db.createProject({
      id: projectId,
      title: "断点续跑测试项目",
      aspectRatio: "16:9",
    });

    const jobId = "job_interrupted_001";
    ctx.db.createJob({
      id: jobId,
      workflowId: "script-only-workflow", // 包含 step-skeleton, step-script
      projectId,
      status: "failed",
      input: { novelText: "九天仙域大劫降临...", projectId },
      output: {
        "step-skeleton": {
          skeleton: "已完成的历史故事骨架",
          coreConflict: "仙尊对抗天道",
        },
      },
    });

    // 预置第 1 步为 completed 状态
    ctx.db.createJobStep({
      id: `step_${jobId}_step-skeleton`,
      jobId,
      stepId: "step-skeleton",
      status: "completed",
      inputSnapshot: { novelText: "九天仙域" },
      outputSnapshot: {
        skeleton: "已完成的历史故事骨架",
        coreConflict: "仙尊对抗天道",
      },
      durationMs: 120,
    });

    // 触发断点续跑
    const resumeResult = await ctx.pipeline.resumeJob(jobId);

    expect(resumeResult.status).toBe("completed");
    expect(resumeResult.skippedSteps).toContain("step-skeleton");
    expect(resumeResult.executedSteps).toContain("step-script");
    expect(resumeResult.executedSteps).not.toContain("step-skeleton");

    const updatedJob = ctx.db.getJob(jobId);
    expect(updatedJob.status).toBe("completed");
    expect(updatedJob.output["step-skeleton"].skeleton).toBe("已完成的历史故事骨架");
    expect(updatedJob.output["step-script"]).toBeDefined();
  });

  it("Case 4: Resuming a job should preserve idempotent records and not duplicate artifacts", async () => {
    const projectId = "proj_idempotency_test";
    ctx.db.createProject({
      id: projectId,
      title: "幂等性测试项目",
      aspectRatio: "16:9",
    });

    const jobId = "job_idempotent_002";
    ctx.db.createJob({
      id: jobId,
      workflowId: "script-only-workflow",
      projectId,
      status: "failed",
      input: { novelText: "赛博大唐九龙城...", projectId },
      output: {},
    });

    // 连续两次触发恢复
    const firstResume = await ctx.pipeline.resumeJob(jobId);
    expect(firstResume.status).toBe("completed");

    // 再次对已完成的 Job 恢复，应该全量跳过
    const secondResume = await ctx.pipeline.resumeJob(jobId);
    expect(secondResume.status).toBe("completed");
    expect(secondResume.skippedSteps).toEqual(expect.arrayContaining(["step-skeleton", "step-script"]));
    expect(secondResume.executedSteps).toHaveLength(0);
  });

  it("Case 5: REST API POST /api/pipeline/jobs/:id/resume should resume interrupted job", async () => {
    const projectId = "proj_api_resume";
    ctx.db.createProject({
      id: projectId,
      title: "HTTP 恢复测试",
      aspectRatio: "16:9",
    });

    const jobId = "job_api_interrupted";
    ctx.db.createJob({
      id: jobId,
      workflowId: "script-only-workflow",
      projectId,
      status: "failed",
      input: { novelText: "末世空间百亿囤货...", projectId },
      output: {},
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/pipeline/jobs/${jobId}/resume`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result).toBeDefined();
    expect(body.result.jobId).toBe(jobId);
    expect(body.result.status).toBe("completed");
  });
});
