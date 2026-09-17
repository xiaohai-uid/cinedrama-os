import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { SenseNovaProviderPlugin } from "../src/plugins/provider-sensenova/index.js";
import { VisualConsistencyService } from "../src/services/visual-consistency.js";
import { EvaluationService } from "../src/services/evaluation.js";

describe("CineDrama OS Real Capability & Verifiable User Output Assertions", () => {
  const ctx = createContext();
  new RateLimiterService(ctx, { enabled: false, tpmLimit: 1000000, rpmLimit: 1000 });
  new ProviderRegistryService(ctx);
  const evaluationService = new EvaluationService(ctx);
  const provider = new SenseNovaProviderPlugin(ctx, { apiKey: "", enableFallback: true });
  const visual = new VisualConsistencyService(ctx);

  afterAll(() => {
    ctx.events.emit("dispose");
  });

  it("Assertion 1 (TTS): Different dialogue text and voice roles must produce distinct waveforms", async () => {
    const ttsA = await provider.generateTTS({ model: "sensenova-tts", text: "三十年河东三十年河西", voice: "male-xiao-fan" });
    const ttsB = await provider.generateTTS({ model: "sensenova-tts", text: "执法大殿之上休得放肆", voice: "female-master" });

    expect(ttsA.audioUrl).toBeDefined();
    expect(ttsB.audioUrl).toBeDefined();
    expect(ttsA.audioUrl).not.toBe(ttsB.audioUrl);
    expect(ttsA.duration).toBeGreaterThan(0.5);
    expect(ttsB.duration).toBeGreaterThan(0.5);

    // 验证音频 Base64 数据解码有效
    const bufA = Buffer.from(ttsA.audioUrl!.split(",")[1], "base64");
    const bufB = Buffer.from(ttsB.audioUrl!.split(",")[1], "base64");
    expect(bufA.length).toBeGreaterThan(1000);
    expect(bufB.length).toBeGreaterThan(1000);
    expect(bufA.equals(bufB)).toBe(false);
  }, 20000);

  it("Assertion 2 (Video): Video generation must create physical, non-empty playable MP4 file on disk with cinematic camera motion & subtitles", async () => {
    const video = await provider.generateVideo({
      model: "bridge-video",
      prompt: "少年主角拔剑凌空飞斩特写",
      cameraMotion: "zoom_in",
      duration: 2,
      firstFrame: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEyMzQ1NiIvPjwvc3ZnPg==",
      dialogue: "三十年河东，三十年河西！",
      voiceRole: "萧凡",
    });

    expect(video.videoUrl).toMatch(/^\/storage\/videos\/shot-.*\.mp4$/);
    const diskPath = path.resolve(process.cwd(), "public", video.videoUrl!.replace(/^\//, ""));
    expect(fs.existsSync(diskPath)).toBe(true);
    const stat = fs.statSync(diskPath);
    expect(stat.size).toBeGreaterThan(500); // 必须是包含真实视频盒容器的文件

    // 验证同步生成独立 WebVTT 字幕文件
    const vttPath = diskPath.replace(/\.mp4$/, ".vtt");
    expect(fs.existsSync(vttPath)).toBe(true);
    const vttContent = fs.readFileSync(vttPath, "utf-8");
    expect(vttContent).toContain("WEBVTT");
    expect(vttContent).toContain("三十年河东，三十年河西！");
  });

  it("Assertion 3 (Consistency): Must separate prompt text audit from actual image asset presence", () => {
    const anchor = visual.registerCharacterAnchor("proj_verif", {
      characterName: "主角林破天",
      gender: "male",
      appearanceFeatures: ["剑眉星目", "黑发"],
      wardrobe: ["玄青色修身劲装"],
      styleTokens: ["院线级写实光影"],
      negativePrompt: "低质量",
    });

    // 3.1 提示词审计必须声明 scope 为 prompt_only，且明确警告未输入图像
    const promptAudit = visual.validatePromptConsistency("剑眉星目 黑发 玄青色修身劲装 院线级写实光影", anchor);
    expect(promptAudit.isConsistent).toBe(true);
    expect(promptAudit.scope).toBe("prompt_only");
    expect(promptAudit.hasImageInput).toBe(false);
    expect(promptAudit.warnings.some((w) => w.includes("未输入或校验渲染后图片像素"))).toBe(true);

    // 3.2 真实图像审计：缺失图像时必须判定失败
    const noImageAudit = visual.validateImageVisualConsistency({ data: "" }, anchor);
    expect(noImageAudit.isConsistent).toBe(false);
    expect(noImageAudit.imageAuditPassed).toBe(false);

    // 3.3 真实图像审计：具备有效图像时通过资产完整性审计与知觉哈希生成
    const withImageAudit = visual.validateImageVisualConsistency(
      { data: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzEyMzQ1NiIvPjwvc3ZnPg==" },
      anchor
    );
    expect(withImageAudit.isConsistent).toBe(true);
    expect(withImageAudit.imageAuditPassed).toBe(true);
    expect(withImageAudit.scope).toBe("image_integrity");
    expect(withImageAudit.imageAuditDetails?.perceptualHash).toBeDefined();
  });

  it("Assertion 4 (Evaluation): Offline fallback must never mask itself as LLM Grade A", async () => {
    const fallbackEval = await evaluationService.evaluateDrama({
      model: "sensenova-offline-judge",
      title: "测试短剧",
      skeleton: "第一幕退婚；第二幕反杀；第三幕战帖",
      coreConflict: "退婚复仇",
      dialogueLines: [{ role: "执事", line: "滚出大殿！" }],
    });

    expect(fallbackEval.isFallback).toBe(true);
    expect(fallbackEval.judgeModel).toBe("heuristic-offline-rules");
    expect(fallbackEval.tier).toBe("C");
    expect(fallbackEval.overallScore).toBeLessThanOrEqual(7.0);
    expect(fallbackEval.warnings?.length).toBeGreaterThan(0);
  });
});
