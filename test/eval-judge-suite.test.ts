import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { EvaluationService } from "../src/services/evaluation.js";
import serverPlugin from "../src/plugins/server/index.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import fs from "node:fs";
import type { IModelProvider } from "../src/core/types.js";

describe("CineDrama OS Prompt Evals & LLM-as-a-Judge Evaluation Suite", () => {
  const testDb = "./data/test_eval_suite.sqlite";
  const testPort = 13082;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  let ctx: any;

  beforeAll(async () => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    ctx = createContext();
    new DatabaseService(ctx, testDb);
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    new EvaluationService(ctx);

    await ctx.plugin(serverPlugin, { host: "127.0.0.1", port: testPort });
    await ctx.plugin(bridgePlugin, { enableFallback: true });
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

  it("Case 1: Baseline Quality Pass Assertion for High-Tension Drama", async () => {
    // 注册高水平短剧评估 Mock 裁判
    const mockJudgeProvider: IModelProvider = {
      id: "mock-judge-pass",
      name: "Mock Judge Pass Provider",
      version: "1.0.0",
      models: [{ id: "eval-pass-model", name: "Eval Pass", type: "text" }],
      async generateText() {
        return {
          text: JSON.stringify({
            id: "eval_case_1",
            projectId: "proj_pass",
            overallScore: 8.8,
            tier: "A",
            verdict: "冲突强烈，黄金三秒入局迅速，主角反击爽感极高，分镜极具影视视觉画面冲击力。",
            highlights: [
              "开场退婚受辱危机直接拉满观众代入感",
              "台词简练有力，绝无出戏废话",
              "分镜特写与全景景别切换流畅自然",
            ],
            improvements: [
              "可微调第2镜打光提示词以强化压迫氛围",
              "下一集留存钩子可提前在末尾镜头抛出",
            ],
            dimensions: {
              dramaticTension: { score: 9.0, reason: "三幕起伏鲜明，矛盾爆发极强" },
              dialogueQuality: { score: 8.5, reason: "台词有力量感，符合冷酷仙尊人设" },
              cinematicPacing: { score: 8.5, reason: "镜头画面极富动势与空间感" },
              pacingConsistency: { score: 9.0, reason: "视听转换节奏紧凑" },
            },
            judgeModel: "eval-pass-model",
            createdAt: Date.now(),
          }),
        };
      },
    };

    ctx.providers.register(mockJudgeProvider);

    const evalResult = await ctx.evaluation.evaluateDrama({
      model: "eval-pass-model",
      title: "仙尊归来之龙王赘婿",
      novelText: "无极仙尊林破天重伤重生为赘婿，林家演武场上遭众人讥讽退婚，主角眼神冰冷拔剑而起...",
      skeleton: "第一幕遭受羞辱退婚；第二幕残魂觉醒逆转反杀；第三幕震慑全场立下生死战帖",
      coreConflict: "家族豪门势利眼羞辱 vs 仙尊觉醒降维打击",
      dialogueLines: [
        { role: "执法执事", line: "一介废柴赘婿，也配染指家族圣物？给我滚出大殿！" },
        { role: "林破天", line: "三十年河东，三十年河西，今日辱我者，他日必百倍奉还！" },
      ],
      shots: [
        { shotIndex: 1, prompt: "昏暗大殿，执事傲慢俯视镜头，主角浑身浴血低头", dialogue: "给我滚出大殿！" },
        { shotIndex: 2, prompt: "主角双眸骤然亮起金芒极具压迫感超特写镜头", dialogue: "今日辱我者，他日必百倍奉还！" },
      ],
    });

    // 核心门禁断言：优质短剧必须达到基线门槛 (>= 7.0 分，S/A/B 级)
    expect(evalResult.overallScore).toBeGreaterThanOrEqual(7.0);
    expect(["S", "A", "B"]).toContain(evalResult.tier);
    expect(evalResult.highlights.length).toBeGreaterThanOrEqual(1);
    expect(evalResult.dimensions.dramaticTension.score).toBeGreaterThanOrEqual(8.0);
    expect(evalResult.dimensions.dialogueQuality.score).toBeGreaterThanOrEqual(8.0);

    ctx.providers.unregister("mock-judge-pass");
  });

  it("Case 2: Sensitive Detection and C-Tier Interception for Flawed/Dull Story", async () => {
    // 注册严苛裁判 Mock：能够敏锐识别流水账与无冲突故事
    const mockJudgeFlaw: IModelProvider = {
      id: "mock-judge-flaw",
      name: "Mock Judge Flaw Provider",
      version: "1.0.0",
      models: [{ id: "eval-flaw-model", name: "Eval Flaw", type: "text" }],
      async generateText() {
        return {
          text: JSON.stringify({
            id: "eval_case_2",
            projectId: "proj_flaw",
            overallScore: 5.2,
            tier: "C",
            verdict: "剧情平铺直叙，完全缺乏短剧必备的黄金三秒吸睛点与核心矛盾冲突，建议深度回炉重写。",
            highlights: ["具备基础语法表达"],
            improvements: [
              "重构开场第一幕，立刻引入迫在眉睫的危机或反差悬念",
              "删除机械说明书式流水账对话，注入角色强烈的情绪倾向",
              "分镜运镜过于平淡单调，需增加视觉特写与动态冲突",
            ],
            dimensions: {
              dramaticTension: { score: 4.5, reason: "毫无危机与阻碍，缺乏矛盾对立" },
              dialogueQuality: { score: 5.0, reason: "对话如白开水，缺少情绪张力" },
              cinematicPacing: { score: 5.5, reason: "镜头画面缺乏电影级构图细节" },
              pacingConsistency: { score: 6.0, reason: "节奏平缓拖沓，难以留存短剧用户" },
            },
            judgeModel: "eval-flaw-model",
            createdAt: Date.now(),
          }),
        };
      },
    };

    ctx.providers.register(mockJudgeFlaw);

    const evalResult = await ctx.evaluation.evaluateDrama({
      model: "eval-flaw-model",
      title: "普通的一天",
      novelText: "今天天气很好，张三早上起来去菜市场买菜，路上遇到了李四，打了声招呼，然后回家煮饭吃完了。",
      skeleton: "起床买菜回家吃饭",
      coreConflict: "无",
      dialogueLines: [
        { role: "张三", line: "李四你好，今天天气不错啊。" },
        { role: "李四", line: "是啊，挺好的，我去散步了。" },
      ],
      shots: [
        { shotIndex: 1, prompt: "街道全景，两个人站着说话", dialogue: "今天天气不错啊。" },
      ],
    });

    // 门禁断言：水文与劣质剧情必须被裁判模型敏锐拦截为 C 级 (< 7.0)
    expect(evalResult.overallScore).toBeLessThan(7.0);
    expect(evalResult.tier).toBe("C");
    expect(evalResult.improvements.length).toBeGreaterThanOrEqual(2);
    expect(evalResult.verdict).toContain("平");

    ctx.providers.unregister("mock-judge-flaw");
  });

  it("Case 3: Self-Correction Loop Integration inside LLM-as-a-Judge", async () => {
    let callCount = 0;
    const mockHealingJudge: IModelProvider = {
      id: "mock-judge-heal",
      name: "Mock Judge Self-Heal Provider",
      version: "1.0.0",
      models: [{ id: "eval-heal-model", name: "Eval Heal", type: "text" }],
      async generateText() {
        callCount++;
        if (callCount === 1) {
          // 首次输出破损格式（缺失 dimensions 关键字段）
          return {
            text: JSON.stringify({
              id: "eval_case_3",
              overallScore: 8.0,
              tier: "A",
              verdict: "还不错",
            }),
          };
        }
        // 经 Zod 错误引导后，第二次尝试自愈输出完整合法结构
        return {
          text: `\`\`\`json
{
  "id": "eval_case_3",
  "projectId": "proj_heal",
  "overallScore": 8.3,
  "tier": "A",
  "verdict": "自愈成功！剧本三幕结构合规，对白张力良好。",
  "highlights": ["成功经受住自纠错考验", "逻辑自洽"],
  "improvements": ["微调对白细节"],
  "dimensions": {
    "dramaticTension": { "score": 8.5, "reason": "矛盾充分" },
    "dialogueQuality": { "score": 8.0, "reason": "符合人设" },
    "cinematicPacing": { "score": 8.0, "reason": "画面达标" },
    "pacingConsistency": { "score": 8.5, "reason": "节奏顺畅" }
  },
  "judgeModel": "eval-heal-model",
  "createdAt": ${Date.now()}
}
\`\`\``,
        };
      },
    };

    ctx.providers.register(mockHealingJudge);

    const result = await ctx.evaluation.evaluateDrama({
      model: "eval-heal-model",
      title: "自愈测试短剧",
      skeleton: "测试三幕",
      coreConflict: "格式冲突",
    });

    expect(callCount).toBe(2);
    expect(result.overallScore).toBeGreaterThanOrEqual(8.0);
    expect(result.dimensions.dramaticTension.score).toBe(8.5);
    expect(result.tier).toBe("A");

    ctx.providers.unregister("mock-judge-heal");
  });

  it("Case 4: Persistence and History Retrieval in SQLite Database", async () => {
    // 创建真实工程
    const project = ctx.db.createProject({
      title: "修仙逆袭记",
      aspectRatio: "16:9",
    });

    const evalData = {
      id: "eval_db_test_1",
      projectId: project.id,
      overallScore: 8.6,
      tier: "A" as const,
      verdict: "数据库持久化质量报告测试",
      highlights: ["高分影视作品", "画风鲜明"],
      improvements: ["建议增加次集悬念"],
      dimensions: {
        dramaticTension: { score: 9.0, reason: "极其精彩" },
        dialogueQuality: { score: 8.5, reason: "台词凝练" },
        cinematicPacing: { score: 8.5, reason: "运镜考究" },
        pacingConsistency: { score: 8.0, reason: "节奏稳健" },
      },
      judgeModel: "test-db-judge",
      createdAt: Date.now(),
    };

    const saved = ctx.db.saveEvaluation(evalData);
    expect(saved.id).toBe("eval_db_test_1");

    // 验证检索
    const retrieved = ctx.db.getLatestEvaluation(project.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.overallScore).toBe(8.6);
    expect(retrieved?.tier).toBe("A");
    expect(retrieved?.highlights).toContain("高分影视作品");
    expect(retrieved?.dimensions.dramaticTension.score).toBe(9.0);
  });

  it("Case 5: End-to-End HTTP API POST /api/evals/drama and GET /api/projects/:id/eval", async () => {
    // 1. 测试空请求拦截 (HTTP 400)
    const errRes = await fetch(`${baseUrl}/api/evals/drama`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shots: "not-an-array", // 非法格式
      }),
    });
    expect(errRes.status).toBe(400);

    // 2. 创建一个真实测试项目
    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "大帝归来短剧",
        aspectRatio: "16:9",
      }),
    });
    const projData = (await projRes.json()) as any;
    const testProjectId = projData.project.id;

    // 3. POST /api/evals/drama 执行评估打分
    const evalRes = await fetch(`${baseUrl}/api/evals/drama`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: testProjectId,
        title: "大帝归来短剧",
        skeleton: "大帝破关而出，发现宗门被围攻",
        coreConflict: "宗门生死存亡之际大帝出手",
        dialogueLines: [{ role: "大帝", line: "犯我宗门者，虽远必诛！" }],
      }),
    });
    expect(evalRes.status).toBe(200);
    const evalBody = (await evalRes.json()) as any;
    expect(evalBody.evaluation).toBeDefined();
    expect(evalBody.evaluation.overallScore).toBeGreaterThan(0);
    expect(evalBody.evaluation.tier).toBeDefined();

    // 4. GET /api/projects/:id/eval 读取已持久化的评估报告
    const getEvalRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/eval`);
    expect(getEvalRes.status).toBe(200);
    const getEvalBody = (await getEvalRes.json()) as any;
    expect(getEvalBody.evaluation.projectId).toBe(testProjectId);
    expect(getEvalBody.evaluation.overallScore).toBe(evalBody.evaluation.overallScore);
  });
});
