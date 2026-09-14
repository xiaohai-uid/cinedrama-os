import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { MediaIntegrityService } from "../src/services/media-integrity.js";
import serverPlugin from "../src/plugins/server/index.js";
import fs from "node:fs";

describe("CineDrama OS Media Integrity & Streaming Health Suite", () => {
  const testDb = "./data/test_media_integrity.sqlite";
  const testPort = 13083;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  let ctx: any;

  beforeAll(async () => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    ctx = createContext();
    new DatabaseService(ctx, testDb);
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    new MediaIntegrityService(ctx);

    await ctx.plugin(serverPlugin, { host: "127.0.0.1", port: testPort });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    ctx.events.emit("dispose");
    ctx.db.close();
    if (fs.existsSync(testDb)) {
      try {
        fs.unlinkSync(testDb);
      } catch {}
    }
  });

  // 辅助函数：构造测试用的标准 PCM WAV Buffer
  function generateTestWav(options: {
    durationSec: number;
    sampleRate?: number;
    silent?: boolean;
    clipped?: boolean;
    brokenHeader?: boolean;
  }): Buffer {
    const sampleRate = options.sampleRate || 16000;
    const numSamples = Math.floor(sampleRate * options.durationSec);
    const dataSize = numSamples * 2; // 16-bit Mono = 2 bytes per sample
    const buffer = Buffer.alloc(44 + dataSize);

    // Header
    buffer.write(options.brokenHeader ? "NOPE" : "RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write(options.brokenHeader ? "FAIL" : "WAVE", 8);

    // fmt subchunk
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);

    // data subchunk
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Sample payload
    for (let i = 0; i < numSamples; i++) {
      let sampleVal = 0;
      if (options.silent) {
        sampleVal = 0;
      } else if (options.clipped) {
        sampleVal = 32767; // 全幅削顶
      } else {
        // 标准正弦波 (440Hz 音调，适度振幅)
        sampleVal = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000);
      }
      buffer.writeInt16LE(sampleVal, 44 + i * 2);
    }

    return buffer;
  }

  it("Case 1: Standard WAV PCM byte-level decoding and accurate duration calculation", () => {
    const cleanWav = generateTestWav({ durationSec: 2.5, sampleRate: 16000 });
    const report = ctx.mediaIntegrity.validateWavBuffer(cleanWav);

    expect(report.valid).toBe(true);
    expect(report.format).toBe("wav");
    expect(report.sampleRate).toBe(16000);
    expect(report.channels).toBe(1);
    expect(report.bitsPerSample).toBe(16);
    expect(report.durationSec).toBe(2.5);
    expect(report.isSilent).toBe(false);
    expect(report.isClipped).toBe(false);
    expect(report.rmsEnergy).toBeGreaterThan(0.2);
    expect(report.issues.length).toBe(0);
  });

  it("Case 2: Sensitive Detection for Silent Audio and Clipping/Distortion Anomalies", () => {
    // 1. 静音全零测试
    const silentWav = generateTestWav({ durationSec: 2.0, silent: true });
    const silentReport = ctx.mediaIntegrity.validateWavBuffer(silentWav);
    expect(silentReport.isSilent).toBe(true);
    expect(silentReport.rmsEnergy).toBeLessThan(0.001);
    expect(silentReport.issues.some((i: string) => i.includes("静音"))).toBe(true);

    // 2. 破音削顶测试
    const clippedWav = generateTestWav({ durationSec: 2.0, clipped: true });
    const clippedReport = ctx.mediaIntegrity.validateWavBuffer(clippedWav);
    expect(clippedReport.isClipped).toBe(true);
    expect(clippedReport.clippingRate).toBeGreaterThan(0.9);
    expect(clippedReport.issues.some((i: string) => i.includes("削顶爆音"))).toBe(true);
  });

  it("Case 3: Rejection and Graceful Interception of Corrupted Audio Stream", () => {
    // 1. 极短截断数据 (小于 44 字节)
    const tooShort = Buffer.from("RIFF1234WAVE");
    const shortReport = ctx.mediaIntegrity.validateWavBuffer(tooShort);
    expect(shortReport.valid).toBe(false);
    expect(shortReport.issues[0]).toContain("不足 44 字节");

    // 2. 容器魔数损坏
    const brokenHeaderWav = generateTestWav({ durationSec: 1.0, brokenHeader: true });
    const brokenReport = ctx.mediaIntegrity.validateWavBuffer(brokenHeaderWav);
    expect(brokenReport.valid).toBe(false);
    expect(brokenReport.issues[0]).toContain("容器头魔数损坏");
  });

  it("Case 4: Audio-Visual Pacing Calibration (Auto-Stretching & Desync Elimination)", () => {
    // 场景 A: 配音长于规划分镜 (4.7s > 3.0s) -> 自动拉伸分镜时长至 4.7s，防止台词截断
    const stretched = ctx.mediaIntegrity.calibrateAudioVisualPacing(3.0, 4.68);
    expect(stretched.calibratedDuration).toBe(4.7);
    expect(stretched.inSync).toBe(true);
    expect(stretched.driftMs).toBe(0);

    // 场景 B: 配音在规划时长内 (2.5s < 4.0s) -> 保持规划时长稳定
    const normal = ctx.mediaIntegrity.calibrateAudioVisualPacing(4.0, 2.5);
    expect(normal.calibratedDuration).toBe(4.0);
    expect(normal.inSync).toBe(true);
  });

  it("Case 5: End-to-End Project Media Audit and RESTful API Integration", async () => {
    // 1. 创建真实漫剧工程与镜头
    const project = ctx.db.createProject({
      title: "视听体检测试短剧",
      aspectRatio: "16:9",
    });

    const cleanWav = generateTestWav({ durationSec: 3.2 });
    const silentWav = generateTestWav({ durationSec: 2.0, silent: true });

    // 镜头 1: 完美健康
    ctx.db.createShot({
      id: `shot_test_${project.id}_1`,
      projectId: project.id,
      episodeIndex: 1,
      shotIndex: 1,
      prompt: "少年拔剑",
      dialogue: "莫欺少年穷！",
      duration: 3.5,
      status: "image_ready",
      audioUrl: `data:audio/wav;base64,${cleanWav.toString("base64")}`,
      videoUrl: "http://127.0.0.1:8766/storage/videos/shot-1.mp4",
    });

    // 镜头 2: 哑巴音频
    ctx.db.createShot({
      id: `shot_test_${project.id}_2`,
      projectId: project.id,
      episodeIndex: 1,
      shotIndex: 2,
      prompt: "执事冷笑",
      dialogue: "顽石而已！",
      duration: 2.5,
      status: "draft",
      audioUrl: `data:audio/wav;base64,${silentWav.toString("base64")}`,
    });

    // 2. GET /api/projects/:id/media-health 审计报告
    const res = await fetch(`${baseUrl}/api/projects/${project.id}/media-health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.report).toBeDefined();
    expect(body.report.totalShots).toBe(2);
    expect(body.report.healthyShotsCount).toBe(1);
    expect(body.report.warningShotsCount).toBe(1);
    expect(body.report.healthScore).toBe(50);
    expect(body.report.shots[0].audioStatus).toBe("healthy");
    expect(body.report.shots[1].audioStatus).toBe("silent");

    // 3. POST /api/media/verify-audio 独立校验
    const verifyOk = await fetch(`${baseUrl}/api/media/verify-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioUrl: `data:audio/wav;base64,${cleanWav.toString("base64")}`,
      }),
    });
    expect(verifyOk.status).toBe(200);
    const verifyOkData = (await verifyOk.json()) as any;
    expect(verifyOkData.report.valid).toBe(true);
    expect(verifyOkData.report.sampleRate).toBe(16000);

    // 4. POST /api/media/verify-audio 异常空参拦截 (HTTP 400)
    const verifyErr = await fetch(`${baseUrl}/api/media/verify-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl: "" }),
    });
    expect(verifyErr.status).toBe(400);
  });
});
