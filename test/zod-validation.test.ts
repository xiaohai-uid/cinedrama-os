import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ZodError } from "zod";
import fs from "node:fs";
import {
  CreateProjectDtoSchema,
  CreatePipelineJobDtoSchema,
  ActiveModelDtoSchema,
  ProviderConfigDtoSchema,
  GenerateTextDtoSchema,
  GenerateImageDtoSchema,
  GenerateTTSDtoSchema,
  GenerateVideoDtoSchema,
  StorySkeletonSchema,
  ScriptDialogueSchema,
  StoryboardPlanningSchema,
  DramaProjectSchema,
  StoryboardShotSchema,
  JobStatusSchema,
} from "../src/core/types.js";
import { safeExtractJsonWithSchema } from "../src/plugins/drama-pipeline/steps.js";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import serverPlugin from "../src/plugins/server/index.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";

describe("CineDrama OS Zod Contract & Runtime Validation Suite", () => {
  // ==========================================================================
  // 1. DTO Schema 单元校验测试
  // ==========================================================================
  describe("DTO Schemas Validation", () => {
    it("CreateProjectDtoSchema should enforce valid fields and default aspectRatio", () => {
      // 1. 合法入参，缺省画幅应自动为 16:9
      const valid = CreateProjectDtoSchema.parse({
        title: "仙尊逆袭短剧",
        description: "修仙热门爽剧",
      });
      expect(valid.title).toBe("仙尊逆袭短剧");
      expect(valid.aspectRatio).toBe("16:9");

      // 2. 标题为空或纯空白时应报错 (严格对齐官方 Zod 审查规范: trim().min(1))
      expect(() => CreateProjectDtoSchema.parse({ title: "" })).toThrow(ZodError);
      expect(() => CreateProjectDtoSchema.parse({ title: "   " })).toThrow(ZodError);

      // 3. 非法画幅枚举应报错
      expect(() =>
        CreateProjectDtoSchema.parse({
          title: "测试",
          aspectRatio: "4:5" as any,
        })
      ).toThrow(ZodError);
    });

    it("CreatePipelineJobDtoSchema should require projectId and workflowId", () => {
      // 1. 合法入参，默认 input 为 {}
      const valid = CreatePipelineJobDtoSchema.parse({
        projectId: "proj_1",
        workflowId: "full-drama-workflow",
      });
      expect(valid.input).toEqual({});

      // 2. 缺失或纯空白 projectId 报错
      expect(() =>
        CreatePipelineJobDtoSchema.parse({
          workflowId: "full-drama-workflow",
        })
      ).toThrow(ZodError);
      expect(() =>
        CreatePipelineJobDtoSchema.parse({
          projectId: "   ",
          workflowId: "full-drama-workflow",
        })
      ).toThrow(ZodError);

      // 3. 缺失或纯空白 workflowId 报错
      expect(() =>
        CreatePipelineJobDtoSchema.parse({
          projectId: "proj_1",
        })
      ).toThrow(ZodError);
      expect(() =>
        CreatePipelineJobDtoSchema.parse({
          projectId: "proj_1",
          workflowId: "   ",
        })
      ).toThrow(ZodError);
    });

    it("ActiveModelDtoSchema should reject empty or whitespace-only model string", () => {
      expect(ActiveModelDtoSchema.parse({ model: "deepseek-v4-flash" }).model).toBe("deepseek-v4-flash");
      expect(() => ActiveModelDtoSchema.parse({ model: "" })).toThrow(ZodError);
      expect(() => ActiveModelDtoSchema.parse({ model: "   " })).toThrow(ZodError);
      expect(() => ActiveModelDtoSchema.parse({})).toThrow(ZodError);
    });

    it("ProviderConfigDtoSchema should validate URL syntax for baseUrl", () => {
      // 合法 URL
      const valid = ProviderConfigDtoSchema.parse({
        providerId: "sensenova",
        apiKey: "sk-test",
        baseUrl: "https://token.sensenova.cn/v1",
      });
      expect(valid.baseUrl).toBe("https://token.sensenova.cn/v1");

      // 非法 URL
      expect(() =>
        ProviderConfigDtoSchema.parse({
          providerId: "sensenova",
          baseUrl: "not-a-valid-url",
        })
      ).toThrow(ZodError);
    });

    it("GenerateTextDtoSchema should apply defaults and validate prompt", () => {
      const valid = GenerateTextDtoSchema.parse({ prompt: "生成短剧大纲" });
      expect(valid.model).toBe("bridge-text-mock");
      expect(valid.prompt).toBe("生成短剧大纲");

      // 提示词为空或纯空白
      expect(() => GenerateTextDtoSchema.parse({ prompt: "" })).toThrow(ZodError);
      expect(() => GenerateTextDtoSchema.parse({ prompt: "   " })).toThrow(ZodError);

      // temperature 超出范围 (0-2)
      expect(() => GenerateTextDtoSchema.parse({ prompt: "测试", temperature: 3.5 })).toThrow(ZodError);
      expect(() => GenerateTextDtoSchema.parse({ prompt: "测试", temperature: -0.1 })).toThrow(ZodError);
    });

    it("GenerateImageDtoSchema should enforce aspect ratios and sizes", () => {
      const valid = GenerateImageDtoSchema.parse({ prompt: "暗黑修仙对决" });
      expect(valid.aspectRatio).toBe("16:9");
      expect(valid.size).toBe("1K");

      // 非法尺寸
      expect(() => GenerateImageDtoSchema.parse({ prompt: "测试", size: "8K" as any })).toThrow(ZodError);
    });

    it("GenerateTTSDtoSchema should require either text or prompt", () => {
      // 仅有 text
      expect(GenerateTTSDtoSchema.parse({ text: "三十年河东" }).text).toBe("三十年河东");
      // 仅有 prompt
      expect(GenerateTTSDtoSchema.parse({ prompt: "莫欺少年穷" }).prompt).toBe("莫欺少年穷");
      // 两者皆无
      expect(() => GenerateTTSDtoSchema.parse({})).toThrow(ZodError);
    });

    it("GenerateVideoDtoSchema should enforce positive duration", () => {
      const valid = GenerateVideoDtoSchema.parse({ prompt: "拔剑出鞘" });
      expect(valid.duration).toBe(4);

      // 负数时长
      expect(() => GenerateVideoDtoSchema.parse({ prompt: "拔剑", duration: -2 })).toThrow(ZodError);
    });
  });

  // ==========================================================================
  // 2. AI 大模型结构化产物校验与弹性提取测试
  // ==========================================================================
  describe("AI Structured Output Schemas & Resilient Extraction", () => {
    it("StorySkeletonSchema should validate three acts structure", () => {
      const validData = {
        coreConflict: "少年被宗门废黜 vs 觉醒吞噬道种",
        skeleton: "退婚受辱，觉醒禁忌传承，逆伐强敌",
        threeActs: [
          { act: 1, name: "微末受辱", target: "反抗压迫" },
          { act: 2, name: "死地后生", target: "打破生死关" },
          { act: 3, name: "万宗来朝", target: "斩断宿命" },
        ],
      };

      const parsed = StorySkeletonSchema.parse(validData);
      expect(parsed.threeActs.length).toBe(3);

      // 缺失三幕数组
      expect(() => StorySkeletonSchema.parse({ coreConflict: "矛盾", skeleton: "骨架", threeActs: [] })).toThrow(ZodError);
    });

    it("ScriptDialogueSchema should validate dialogue lines", () => {
      const script = ScriptDialogueSchema.parse({
        episodeIndex: 1,
        title: "风云起",
        dialogueLines: [
          { role: "萧凡", line: "莫欺少年穷！", action: "眼神凌厉" },
          { role: "执事", line: "死到临头还敢嘴硬！" },
        ],
      });
      expect(script.dialogueLines[0].role).toBe("萧凡");

      // 对白行空列表报错
      expect(() => ScriptDialogueSchema.parse({ title: "标题", dialogueLines: [] })).toThrow(ZodError);
    });

    it("safeExtractJsonWithSchema should cleanly extract valid JSON and markdown wrapped JSON", () => {
      const fallback = {
        coreConflict: "默认矛盾",
        skeleton: "默认大纲",
        threeActs: [{ act: 1, name: "幕1", target: "目标1" }],
      };

      // 1. 标准纯净 JSON 字符串
      const cleanJson = JSON.stringify({
        coreConflict: "纯净解析冲突",
        skeleton: "大纲文字",
        threeActs: [{ act: 1, name: "开篇", target: "突破" }],
      });
      const res1 = safeExtractJsonWithSchema(cleanJson, StorySkeletonSchema, fallback);
      expect(res1.coreConflict).toBe("纯净解析冲突");

      // 2. 被 Markdown 代码块包裹且有闲聊废话的 LLM 输出
      const markdownRaw = `好的，为您生成的剧本结构化分析如下：
\`\`\`json
{
  "coreConflict": "Markdown代码块中的冲突",
  "skeleton": "剧情转折脉络",
  "threeActs": [
    { "act": 1, "name": "第一幕", "target": "觉醒" }
  ]
}
\`\`\`
希望符合您的拍摄需求！`;

      const res2 = safeExtractJsonWithSchema(markdownRaw, StorySkeletonSchema, fallback);
      expect(res2.coreConflict).toBe("Markdown代码块中的冲突");

      // 3. 字段缺失或结构破坏时，安全 fallback
      const brokenRaw = `\`\`\`json\n{ "invalidKey": 123 }\n\`\`\``;
      const res3 = safeExtractJsonWithSchema(brokenRaw, StorySkeletonSchema, fallback);
      expect(res3.coreConflict).toBe("默认矛盾");

      // 4. 完全非 JSON 文本，安全 fallback
      const garbageRaw = "抱歉，由于算力限制，无法生成结果。";
      const res4 = safeExtractJsonWithSchema(garbageRaw, StorySkeletonSchema, fallback);
      expect(res4.coreConflict).toBe("默认矛盾");
    });
  });

  // ==========================================================================
  // 3. 数据库持久化层边界防御测试
  // ==========================================================================
  describe("Database Service Schema Guardrails", () => {
    const testDb = "./data/test_zod_db.sqlite";
    let ctx: any;
    let db: DatabaseService;

    beforeAll(() => {
      if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
      ctx = createContext();
      db = new DatabaseService(ctx, testDb);
    });

    afterAll(() => {
      db.close();
      if (fs.existsSync(testDb)) {
        try {
          fs.unlinkSync(testDb);
        } catch {}
      }
    });

    it("db.createProject should reject invalid project records via Zod", () => {
      expect(() =>
        db.createProject({
          title: "", // 空标题违反 Schema
        } as any)
      ).toThrow(ZodError);
    });

    it("db.createShot should reject invalid shot records via Zod", () => {
      expect(() =>
        db.createShot({
          id: "shot_bad_1",
          projectId: "proj_1",
          episodeIndex: 1,
          shotIndex: 1,
          prompt: "测试",
          duration: -5, // 负数时长违反 Schema
          status: "image_ready",
        } as any)
      ).toThrow(ZodError);
    });
  });

  // ==========================================================================
  // 4. HTTP API 接口 400 参数校验与错误反馈测试
  // ==========================================================================
  describe("HTTP Server 400 Validation Error Responses", () => {
    const testPort = 13088;
    const baseUrl = `http://127.0.0.1:${testPort}`;
    const testDb = "./data/test_zod_server.sqlite";
    let ctx: any;

    beforeAll(async () => {
      if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
      ctx = createContext();
      new DatabaseService(ctx, testDb);
      new RateLimiterService(ctx, { tpmLimit: 100000 });
      new ProviderRegistryService(ctx);

      await ctx.plugin(serverPlugin, { host: "127.0.0.1", port: testPort });
      await ctx.plugin(bridgePlugin, { enableFallback: true });
      await new Promise((r) => setTimeout(r, 80));
    });

    afterAll(() => {
      ctx.events.emit("dispose");
      ctx.db.close();
      if (fs.existsSync(testDb)) {
        try {
          fs.unlinkSync(testDb);
        } catch {}
      }
    });

    it("POST /api/projects with invalid payload should return 400 with details", async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "", // 空标题
          aspectRatio: "invalid_ratio",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.details).toBeDefined();
      expect(data.details.title._errors.length).toBeGreaterThan(0);
      expect(data.details.aspectRatio._errors.length).toBeGreaterThan(0);
    });

    it("POST /api/generate/text without prompt should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/generate/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain("prompt");
      expect(data.details.prompt).toBeDefined();
    });

    it("POST /api/generate/image with invalid aspectRatio should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/generate/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "对决画面",
          aspectRatio: "21:9", // 非法画幅
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.details.aspectRatio).toBeDefined();
    });

    it("POST /api/generate/tts without text or prompt should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/generate/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: "zh-CN-YunxiNeural",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.details.text._errors[0]).toContain("text 或 prompt 至少提供一项");
    });

    it("POST /api/pipeline/jobs without required IDs should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/pipeline/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "proj_1",
          // 缺少 workflowId
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.details.workflowId).toBeDefined();
    });

    it("POST /api/providers/active without model should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/providers/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.details.model).toBeDefined();
    });

    it("POST /api/providers/config with malformed baseUrl should return 400", async () => {
      const res = await fetch(`${baseUrl}/api/providers/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: "sensenova",
          baseUrl: "ht tp://malformed-url",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.details.baseUrl._errors[0]).toContain("BaseURL");
    });
  });
});
