import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { PipelineService } from "../src/services/pipeline.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "../src/plugins/drama-pipeline/index.js";
import fs from "node:fs";

describe("CineDrama OS DAG Pipeline Engine", () => {
  const testDb = "./data/test_pipeline.sqlite";
  let ctx: any;

  beforeEach(async () => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    ctx = createContext();
    new DatabaseService(ctx, testDb);
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    new PipelineService(ctx);

    await ctx.plugin(bridgePlugin, { enableFallback: true });
    await ctx.plugin(dramaPipelinePlugin);
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

  it("should register 7 standard drama steps and 5 workflows", () => {
    const steps = ctx.pipeline.listSteps();
    expect(steps.length).toBe(7);

    const stepIds = steps.map((s: any) => s.id);
    expect(stepIds).toContain("step-skeleton");
    expect(stepIds).toContain("step-script");
    expect(stepIds).toContain("step-assets");
    expect(stepIds).toContain("step-storyboard");
    expect(stepIds).toContain("step-render-images");
    expect(stepIds).toContain("step-dubbing-tts");
    expect(stepIds).toContain("step-render-videos");

    const workflows = ctx.pipeline.listWorkflows();
    expect(workflows.length).toBe(5);
    const fullWf = ctx.pipeline.getWorkflow("full-drama-workflow");
    expect(fullWf).toBeDefined();
    expect(fullWf?.stepIds.length).toBe(5);
    const avWf = ctx.pipeline.getWorkflow("audiovisual-drama-workflow");
    expect(avWf).toBeDefined();
    expect(avWf?.stepIds.length).toBe(7);
  });

  it("should perform topological sorting in proper dependency order", () => {
    const sorted = ctx.pipeline.topologicalSort([
      "step-render-images",
      "step-storyboard",
      "step-assets",
      "step-script",
      "step-skeleton",
    ]);

    const sortedIds = sorted.map((s: any) => s.id);
    expect(sortedIds.indexOf("step-skeleton")).toBeLessThan(sortedIds.indexOf("step-script"));
    expect(sortedIds.indexOf("step-script")).toBeLessThan(sortedIds.indexOf("step-assets"));
    expect(sortedIds.indexOf("step-assets")).toBeLessThan(sortedIds.indexOf("step-storyboard"));
    expect(sortedIds.indexOf("step-storyboard")).toBeLessThan(sortedIds.indexOf("step-render-images"));
  });

  it("should detect circular dependencies and throw error", () => {
    ctx.pipeline.registerStep({
      id: "cycle-a",
      name: "环形节点 A",
      dependsOn: ["cycle-b"],
      execute: async () => ({}),
    });
    ctx.pipeline.registerStep({
      id: "cycle-b",
      name: "环形节点 B",
      dependsOn: ["cycle-a"],
      execute: async () => ({}),
    });

    expect(() => ctx.pipeline.topologicalSort(["cycle-a", "cycle-b"])).toThrow(/循环依赖/);
  });

  it("should allow replacing a default step with a custom step", () => {
    let customExecuted = false;
    ctx.pipeline.registerStep({
      id: "step-render-images",
      name: "自定义 ComfyUI 生图节点",
      dependsOn: ["step-storyboard"],
      execute: async () => {
        customExecuted = true;
        return { customRenderer: "comfyui", count: 99 };
      },
    });

    const step = ctx.pipeline.getStep("step-render-images");
    expect(step?.name).toBe("自定义 ComfyUI 生图节点");
  });

  it("should execute a full drama workflow end-to-end and persist shots", async () => {
    // 1. 创建测试项目
    const proj = ctx.db.createProject({
      id: "p_drama_1",
      title: "修仙短剧全流程测试",
      aspectRatio: "16:9",
    });

    // 2. 监听步骤生命周期事件
    const stepEvents: string[] = [];
    ctx.events.on("pipeline/step/completed", (evt: any) => {
      stepEvents.push(evt.stepId);
    });

    // 3. 运行全流程工作流
    const job = await ctx.pipeline.createAndRunJob({
      projectId: proj.id,
      workflowId: "full-drama-workflow",
      input: {
        novelText: "大荒深处，少年石云于石村中觉醒荒古圣体，逆乱乾坤！",
        textModel: "bridge-text-mock",
        imageModel: "bridge-image",
      },
    });

    // 4. 校验任务状态
    expect(job.status).toBe("completed");
    expect(job.output).toBeDefined();
    expect(job.output["step-skeleton"]).toBeDefined();
    expect(job.output["step-script"]).toBeDefined();
    expect(job.output["step-storyboard"]).toBeDefined();
    expect(job.output["step-render-images"]).toBeDefined();

    // 校验事件完整性
    expect(stepEvents).toEqual([
      "step-skeleton",
      "step-script",
      "step-assets",
      "step-storyboard",
      "step-render-images",
    ]);

    // 5. 校验数据库中的分镜落库数据
    const shots = ctx.db.listShotsByProject(proj.id);
    expect(shots.length).toBe(3);
    expect(shots[0].status).toBe("image_ready");
    expect(shots[0].imageUrl).toBeDefined();

    // 6. 校验 Job 与 Step 记录在数据库中持久化成功
    const persistedJob = ctx.db.getJob(job.id);
    expect(persistedJob?.status).toBe("completed");
    const stepRecords = ctx.db.listJobSteps(job.id);
    expect(stepRecords.length).toBe(5);
    expect(stepRecords.every((s: any) => s.status === "completed")).toBe(true);
  });
});
