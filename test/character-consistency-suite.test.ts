import fs from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { PipelineService } from "../src/services/pipeline.js";
import { VisualConsistencyService } from "../src/services/visual-consistency.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "../src/plugins/drama-pipeline/index.js";
import serverPlugin from "../src/plugins/server/index.js";

describe("CineDrama OS Visual & Character Consistency Suite", () => {
  let ctx: any;
  const testDb = "./data/test-visual-consistency.sqlite";
  const port = 8991;

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
    new VisualConsistencyService(ctx);

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

  it("Case 1: Should extract structured character visual anchors from asset definitions", () => {
    const service: VisualConsistencyService = ctx.visualConsistency;
    const projectId = "proj_test_consistency";

    const characters = [
      {
        name: "林破天",
        role: "主角",
        visualPrompt: "英武坚毅的少年，身姿挺拔，目光如炬，暗色系玄青劲装，院线级写实光影",
      },
      {
        name: "神威长老",
        role: "对手",
        visualPrompt: "威严对手，目光阴鸷，华美锦袍，手持法器，冷峻逆光",
      },
    ];

    const anchors = service.extractAnchorsFromAssets(projectId, characters);

    expect(anchors).toHaveLength(2);
    expect(anchors[0].characterName).toBe("林破天");
    expect(anchors[0].appearanceFeatures).toContain("黑发");
    expect(anchors[0].wardrobe).toContain("玄青色修身劲装");
    expect(anchors[0].styleTokens).toContain("院线级电影写实光影");

    expect(anchors[1].characterName).toBe("神威长老");
    expect(anchors[1].wardrobe).toContain("赤金暗纹锦袍");
  });

  it("Case 2: Should detect character feature omission and flag visual drift warnings", () => {
    const service: VisualConsistencyService = ctx.visualConsistency;
    const projectId = "proj_test_drift";

    const anchor = service.registerCharacterAnchor(projectId, {
      characterName: "陆炎",
      gender: "male",
      appearanceFeatures: ["剑眉星目", "短黑发", "冷冽神情"],
      wardrobe: ["深灰战术防寒风衣", "战术皮手套"],
      styleTokens: ["院线级电影写实光影", "废土冷色调"],
      negativePrompt: "低质量, 现代服饰, 异色头发",
    });

    // 提示词遗漏了核心服饰与发型特征
    const flawedPrompt = "漫天风雪中，一个男人孤独地走在昆仑山雪原上，远景。";
    const report = service.validatePromptConsistency(flawedPrompt, anchor);

    expect(report.isConsistent).toBe(false);
    expect(report.featureRecall).toBeLessThan(0.5);
    expect(report.missingFeatures).toContain("短黑发");
    expect(report.missingFeatures).toContain("深灰战术防寒风衣");
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toContain("可能发生角色脸型或服饰漂移");
  });

  it("Case 3: Should auto-enrich prompt with anchor tokens to lock character identity", () => {
    const service: VisualConsistencyService = ctx.visualConsistency;
    const projectId = "proj_test_enrich";

    const anchor = service.registerCharacterAnchor(projectId, {
      characterName: "萧凡",
      gender: "male",
      appearanceFeatures: ["黑发", "清瘦挺拔"],
      wardrobe: ["玄青色修身劲装"],
      styleTokens: ["院线级电影写实光影", "高精写实国漫质感"],
      negativePrompt: "低质量, 畸形",
    });

    const rawPrompt = "紧握断剑，目光凌厉如冰，面对强敌步步逼近。";
    const enriched = service.autoEnrichPrompt(rawPrompt, anchor);

    expect(enriched).toContain("[角色锁定: 萧凡");
    expect(enriched).toContain("黑发");
    expect(enriched).toContain("玄青色修身劲装");
    expect(enriched).toContain("高精写实国漫质感");

    // 再次审计增强后的 Prompt，验证达到一致性标准
    const report = service.validatePromptConsistency(enriched, anchor);
    expect(report.isConsistent).toBe(true);
    expect(report.featureRecall).toBe(1.0);
    expect(report.overallScore).toBe(100);
  });

  it("Case 4: Pipeline step-render-images should automatically enrich prompt with anchor", async () => {
    // 预先创建项目与角色锚点
    const projectId = "proj_pipeline_consistency";
    ctx.db.createProject({
      id: projectId,
      title: "测试一致性短剧",
      aspectRatio: "16:9",
    });

    ctx.visualConsistency.registerCharacterAnchor(projectId, {
      characterName: "萧凡",
      gender: "male",
      appearanceFeatures: ["黑发碎发", "剑眉星目"],
      wardrobe: ["玄青色劲装"],
      styleTokens: ["院线级电影写实光影"],
      negativePrompt: "低质量",
    });

    // 运行生图步骤
    const step = ctx.pipeline.getStep("step-render-images");
    expect(step).toBeDefined();

    const output = await step.execute({
      jobId: "job_consistency_test",
      projectId,
      stepId: "step-render-images",
      input: { novelText: "三十年河东", projectId },
      previousOutputs: {
        "step-storyboard": {
          shots: [
            {
              shotIndex: 1,
              prompt: "少年紧握断剑，对峙长老",
              dialogue: "莫欺少年穷！",
              voiceRole: "萧凡",
              duration: 3.5,
            },
          ],
        },
      },
      log: () => {},
      reportProgress: () => {},
    });

    expect(output.totalRendered).toBe(1);
    const shot = ctx.db.getShot(`shot_job_consistency_test_1`);
    expect(shot).toBeDefined();
    expect(shot.imageUrl).toBeDefined();
  });

  it("Case 5: REST API GET /api/projects/:id/visual-anchors should return registered anchors", async () => {
    const projectId = "proj_api_anchors";
    ctx.visualConsistency.registerCharacterAnchor(projectId, {
      characterName: "十七",
      gender: "male",
      appearanceFeatures: ["机械义眼", "暗红短发"],
      wardrobe: ["高机能战术风衣"],
      styleTokens: ["赛博朋克霓虹光影"],
      negativePrompt: "传统古装",
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/visual-anchors`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.anchors).toBeInstanceOf(Array);
    expect(json.anchors.length).toBe(1);
    expect(json.anchors[0].characterName).toBe("十七");
    expect(json.anchors[0].appearanceFeatures).toContain("机械义眼");
  });
});
