import fs from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { PipelineService } from "../src/services/pipeline.js";
import { MediaIntegrityService } from "../src/services/media-integrity.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "../src/plugins/drama-pipeline/index.js";

describe("CineDrama OS Audiovisual Multi-modal Pipeline", () => {
  let ctx: any;
  const testDb = "./data/test-audiovisual.sqlite";

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
    new MediaIntegrityService(ctx);

    await ctx.plugin(bridgePlugin, { baseUrl: "http://127.0.0.1:9999", enableFallback: true });
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

  it("should synthesize deterministic and valid WAV audio via BridgeProvider", async () => {
    const res = await ctx.providers.generateTTS({
      model: "bridge-tts",
      text: "三十年河东，三十年河西，莫欺少年穷！",
      voice: "zh-CN-YunxiNeural",
    });

    expect(res).toBeDefined();
    expect(res.audioUrl).toMatch(/^data:audio\/wav;base64,/);
    expect(res.format).toBe("wav");
    expect(res.durationMs).toBeGreaterThan(1000);

    // 验证真实的 44 字节标准 WAV 头
    const base64Data = res.audioUrl.replace("data:audio/wav;base64,", "");
    const wavBuffer = Buffer.from(base64Data, "base64");
    expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wavBuffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wavBuffer.subarray(12, 16).toString("ascii")).toBe("fmt ");
    expect(wavBuffer.readUInt16LE(20)).toBe(1); // PCM
    expect(wavBuffer.readUInt16LE(22)).toBe(1); // 1 Channel (Mono)
    expect(wavBuffer.readUInt32LE(24)).toBe(16000); // 16000 Hz
    expect(wavBuffer.subarray(36, 40).toString("ascii")).toBe("data");
  });

  it("should generate video metadata with firstFrame reference via BridgeProvider", async () => {
    const res = await ctx.providers.generateVideo({
      model: "bridge-video",
      prompt: "少年剑客拔剑直指云海",
      firstFrame: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      duration: 5,
    });

    expect(res).toBeDefined();
    expect(res.videoUrl).toBeDefined();
    expect(res.duration).toBe(5);
  });

  it("should sort branched DAG correctly where dubbing and image render branch from storyboard", () => {
    const sorted = ctx.pipeline.topologicalSort([
      "step-render-videos",
      "step-dubbing-tts",
      "step-render-images",
      "step-storyboard",
      "step-assets",
      "step-script",
      "step-skeleton",
    ]);
    const sortedIds = sorted.map((s: any) => s.id);

    const skeletonIdx = sortedIds.indexOf("step-skeleton");
    const scriptIdx = sortedIds.indexOf("step-script");
    const assetsIdx = sortedIds.indexOf("step-assets");
    const storyboardIdx = sortedIds.indexOf("step-storyboard");
    const renderImagesIdx = sortedIds.indexOf("step-render-images");
    const dubbingIdx = sortedIds.indexOf("step-dubbing-tts");
    const renderVideosIdx = sortedIds.indexOf("step-render-videos");

    expect(skeletonIdx).toBeLessThan(scriptIdx);
    expect(scriptIdx).toBeLessThan(assetsIdx);
    expect(scriptIdx).toBeLessThan(storyboardIdx);
    expect(assetsIdx).toBeLessThan(storyboardIdx);
    expect(storyboardIdx).toBeLessThan(renderImagesIdx);
    expect(storyboardIdx).toBeLessThan(dubbingIdx);
    expect(renderImagesIdx).toBeLessThan(renderVideosIdx);
  });

  it("should execute the full 7-step audiovisual workflow and populate audio, image, and video in SQLite", async () => {
    const project = ctx.db.createProject({
      title: "全模态视听实战：剑破苍穹",
      aspectRatio: "16:9",
    });

    const job = await ctx.pipeline.createAndRunJob({
      projectId: project.id,
      workflowId: "audiovisual-drama-workflow",
      input: {
        novelText: "萧凡手持残破古剑，面对云岚宗数万修士，神色默然。古玉光芒大作，九霄风雷激荡！",
        title: "剑破苍穹之逆命篇",
      },
    });

    expect(job.status).toBe("completed");
    expect(job.output).toBeDefined();
    expect(job.output["step-skeleton"]).toBeDefined();
    expect(job.output["step-script"]).toBeDefined();
    expect(job.output["step-assets"]).toBeDefined();
    expect(job.output["step-storyboard"]).toBeDefined();
    expect(job.output["step-render-images"]).toBeDefined();
    expect(job.output["step-dubbing-tts"]).toBeDefined();
    expect(job.output["step-render-videos"]).toBeDefined();

    // 验证每一步的执行明细落库
    const steps = ctx.db.listJobSteps(job.id);
    expect(steps.length).toBe(7);
    for (const step of steps) {
      expect(step.status).toBe("completed");
    }

    // 验证数据库中分镜镜头的全模态资产
    const shots = ctx.db.listShotsByProject(project.id);
    expect(shots.length).toBe(3);

    for (const shot of shots) {
      expect(shot.imageUrl).toBeDefined();
      expect(shot.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(shot.audioUrl).toBeDefined();
      expect(shot.audioUrl).toMatch(/^data:audio\/wav;base64,/);
      expect(shot.videoUrl).toBeDefined();
      expect(shot.status).toBe("video_ready");
    }

    // 验证按状态过滤接口
    const readyShots = ctx.db.listShotsByStatus(project.id, "video_ready");
    expect(readyShots.length).toBe(3);
  }, 25000);

  it("should run dubbing-only workflow without video generation", async () => {
    const project = ctx.db.createProject({
      title: "广播剧对白流：纯音频输出",
      aspectRatio: "16:9",
    });

    const job = await ctx.pipeline.createAndRunJob({
      projectId: project.id,
      workflowId: "dubbing-only-workflow",
      input: {
        novelText: "纯音频测试对白短剧",
        title: "纯音频测试",
      },
    });

    expect(job.status).toBe("completed");
    expect(job.output).toBeDefined();
    expect(job.output["step-skeleton"]).toBeDefined();
    expect(job.output["step-script"]).toBeDefined();
    expect(job.output["step-assets"]).toBeDefined();
    expect(job.output["step-storyboard"]).toBeDefined();
    expect(job.output["step-dubbing-tts"]).toBeDefined();
    expect(job.output["step-render-images"]).toBeUndefined();
    expect(job.output["step-render-videos"]).toBeUndefined();

    // 验证每一步的执行明细落库 (5步)
    const steps = ctx.db.listJobSteps(job.id);
    expect(steps.length).toBe(5);

    const shots = ctx.db.listShotsByProject(project.id);
    expect(shots.length).toBe(3);
    for (const shot of shots) {
      expect(shot.audioUrl).toBeDefined();
      expect(shot.imageUrl).toBeUndefined();
      expect(shot.videoUrl).toBeUndefined();
    }
  }, 25000);
});
