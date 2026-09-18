import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { listStylePresets, getStylePreset, enrichPromptWithStyle, STYLE_PRESETS } from "../src/services/style-presets.js";
import { listVoicePersonas, resolveVoicePersona, VOICE_PERSONAS } from "../src/services/voice-library.js";
import { getVisualFilterGraph, generateRealVideo, exportFullEpisode } from "../src/services/video-generator.js";
import { DatabaseService } from "../src/services/database.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { PipelineService } from "../src/services/pipeline.js";
import { MediaIntegrityService } from "../src/services/media-integrity.js";
import { VisualConsistencyService } from "../src/services/visual-consistency.js";
import { ContinuityService } from "../src/services/continuity.js";
import { EvaluationService } from "../src/services/evaluation.js";
import { apply as applyServer } from "../src/plugins/server/index.js";
import type { StoryboardShot } from "../src/core/types.js";

describe("CineDrama OS 12-Genre Style Presets, 20+ Voice Personas & Cinematic Transitions Test Suite", () => {
  let serverInstance: http.Server | null = null;
  let serverPort = 3198;
  const ctx = createContext();

  beforeAll(async () => {
    new RateLimiterService(ctx, { enabled: false, tpmLimit: 1000000, rpmLimit: 1000 });
    new ProviderRegistryService(ctx);
    new DatabaseService(ctx, "./data/test_style_transitions.sqlite");
    new MediaIntegrityService(ctx);
    new VisualConsistencyService(ctx);
    new ContinuityService(ctx);
    new EvaluationService(ctx);
    new PipelineService(ctx);

    applyServer(ctx, { host: "127.0.0.1", port: serverPort });
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  afterAll(() => {
    ctx.events.emit("dispose");
  });

  // ==========================================================================
  // 1. 12 大微短剧核心画风预设库验证
  // ==========================================================================
  describe("1. Short-Drama 12-Genre Style Presets Library", () => {
    it("should provide exactly 12 full-genre style presets covering trending drama types", () => {
      const presets = listStylePresets();
      expect(presets).toHaveLength(12);

      const expectedIds = [
        "xianxia",
        "anime",
        "cyberpunk",
        "cinematic",
        "ceo_romance",
        "palace_intrigue",
        "wasteland_survival",
        "suspense_republic",
        "urban_comedy",
        "retro_hk_action",
        "sweet_pet_romance",
        "interstellar_mecha",
      ];

      expectedIds.forEach((id) => {
        const found = presets.find((p) => p.id === id);
        expect(found, `Preset ${id} should exist`).toBeDefined();
        expect(found!.promptEnhancers.length).toBeGreaterThanOrEqual(4);
        expect(found!.defaultFilter).toBeDefined();
      });
    });

    it("should retrieve specific preset by id and gracefully fallback on unknown id", () => {
      const cyberpunk = getStylePreset("cyberpunk");
      expect(cyberpunk.id).toBe("cyberpunk");
      expect(cyberpunk.defaultFilter).toBe("cyberpunk_neon");

      const unknown = getStylePreset("non_existent_preset_xyz");
      expect(unknown.id).toBe("xianxia"); // 默认回退
    });

    it("should enrich base prompt with style enhancers and high resolution keywords", () => {
      const base = "演武场两道身影遥遥相对";
      const enriched = enrichPromptWithStyle(base, "xianxia");

      expect(enriched).toContain(base);
      expect(enriched).toContain("东方仙侠玄幻美学");
      expect(enriched).toContain("8K高分辨率超精细");
    });
  });

  // ==========================================================================
  // 2. 20+ 爆款短剧专有角色人设与音色库验证
  // ==========================================================================
  describe("2. Short-Drama 20+ Character Voice Personas Library", () => {
    it("should provide at least 20 distinctive voice personas", () => {
      const personas = listVoicePersonas();
      expect(personas.length).toBeGreaterThanOrEqual(20);

      const roles = personas.map((p) => p.id);
      expect(roles).toContain("hero_male");
      expect(roles).toContain("ceo_male");
      expect(roles).toContain("villain_cold");
      expect(roles).toContain("master_immortal");
      expect(roles).toContain("heroine_sweet");
      expect(roles).toContain("femme_fatale");
      expect(roles).toContain("emperor");
    });

    it("should accurately resolve persona by character name keywords", () => {
      const xiaoFan = resolveVoicePersona("萧凡");
      expect(xiaoFan.id).toBe("hero_male");

      const ceo = resolveVoicePersona("冷酷薄总");
      expect(ceo.id).toBe("ceo_male");

      const villain = resolveVoicePersona("执法堂长老（反派）");
      expect(villain.id).toBe("villain_cold");

      const sweet = resolveVoicePersona("灵儿小师妹");
      expect(sweet.id).toBe("heroine_sweet");
    });

    it("should feature distinct acoustic fundamental frequencies across personas", () => {
      const ceo = resolveVoicePersona("ceo_male");
      const hero = resolveVoicePersona("hero_male");
      const heroine = resolveVoicePersona("heroine_sweet");

      // 霸总低沉 (105Hz) < 热血男主 (155Hz) < 甜宠女主 (240Hz)
      expect(ceo.fundamentalHz).toBeLessThan(hero.fundamentalHz);
      expect(hero.fundamentalHz).toBeLessThan(heroine.fundamentalHz);
    });
  });

  // ==========================================================================
  // 3. 好莱坞视觉色彩滤镜与 FFmpeg 曲线映射验证
  // ==========================================================================
  describe("3. Hollywood Cinematic Visual Filters & Color Matrices", () => {
    it("should generate appropriate FFmpeg filter graph strings for each filter preset", () => {
      const tealOrange = getVisualFilterGraph("cinematic_teal_orange");
      expect(tealOrange).toContain("colorbalance");
      expect(tealOrange).toContain("contrast");

      const vintage = getVisualFilterGraph("vintage_film");
      expect(vintage).toContain("noise=");

      const noir = getVisualFilterGraph("noir_bw");
      expect(noir).toContain("format=gray");

      const neon = getVisualFilterGraph("cyberpunk_neon");
      expect(neon).toContain("colorbalance");

      const normal = getVisualFilterGraph("normal");
      expect(normal).toBe("");
    });
  });

  // ==========================================================================
  // 4. 物理级真实视频渲染与电影级无缝转场全片导出验证
  // ==========================================================================
  describe("4. Physical Real Video Rendering & XFade Seamless Transition Master", () => {
    it("should render real physical MP4 video with visual filter applied", () => {
      const result = generateRealVideo({
        prompt: "古风修仙大殿对决",
        duration: 2.0,
        filter: "cinematic_teal_orange",
        cameraMotion: "zoom_in",
      });

      expect(result.videoUrl).toMatch(/^\/storage\/videos\/shot-.*\.mp4$/);
      expect(fs.existsSync(result.localPath)).toBe(true);
      const stat = fs.statSync(result.localPath);
      expect(stat.size).toBeGreaterThan(1000);
    });

    it("should export multi-shot episode with smooth XFade transitions and subtitles", () => {
      const testShots: StoryboardShot[] = [
        {
          id: "shot_test_trans_1",
          projectId: "proj_trans_test",
          episodeIndex: 1,
          shotIndex: 1,
          prompt: "青云宗演武场对峙",
          dialogue: "受死吧！",
          voiceRole: "执法执事",
          duration: 2.0,
          filter: "cinematic_teal_orange",
          transition: "fade",
          status: "image_ready",
          updatedAt: Date.now(),
        },
        {
          id: "shot_test_trans_2",
          projectId: "proj_trans_test",
          episodeIndex: 1,
          shotIndex: 2,
          prompt: "少年横剑在前冷冽逆光",
          dialogue: "莫欺少年穷！",
          voiceRole: "萧凡",
          duration: 2.5,
          filter: "cinematic_teal_orange",
          transition: "fadewhite",
          status: "image_ready",
          updatedAt: Date.now(),
        },
      ];

      const exportResult = exportFullEpisode(testShots, "proj_trans_test", {
        includeSubtitles: true,
        format: "all",
        transition: "fade",
        filter: "cinematic_teal_orange",
      });

      expect(exportResult.success).toBe(true);
      expect(exportResult.shotCount).toBe(2);
      expect(exportResult.totalDuration).toBeGreaterThanOrEqual(4.0);

      // 验证物理 MP4 母带与 WebVTT 文件真实落盘
      const masterMp4Path = path.resolve(process.cwd(), "public", exportResult.videoUrl!.replace(/^\//, ""));
      const masterVttPath = path.resolve(process.cwd(), "public", exportResult.vttUrl!.replace(/^\//, ""));

      expect(fs.existsSync(masterMp4Path)).toBe(true);
      expect(fs.existsSync(masterVttPath)).toBe(true);
      expect(fs.statSync(masterMp4Path).size).toBeGreaterThan(1000);

      const vtt = fs.readFileSync(masterVttPath, "utf-8");
      expect(vtt).toContain("受死吧！");
      expect(vtt).toContain("莫欺少年穷！");
    });
  });

  // ==========================================================================
  // 5. HTTP REST API 预设端点联调验证
  // ==========================================================================
  describe("5. REST API Presets Endpoints", () => {
    it("GET /api/presets/styles should return all 12 style presets", async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/presets/styles`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.presets).toBeDefined();
      expect(json.presets.length).toBe(12);
    });

    it("GET /api/presets/voices should return 20+ voice personas", async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/presets/voices`);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.personas).toBeDefined();
      expect(json.personas.length).toBeGreaterThanOrEqual(20);
    });
  });
});
