import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { createContext } from "../src/core/context.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import {
  StorySkeletonSchema,
  ScriptDialogueSchema,
  StoryboardPlanningSchema,
  type IModelProvider,
  type TextGenerateOptions,
  type TextGenerateResult,
} from "../src/core/types.js";
import { createSkeletonStep } from "../src/plugins/drama-pipeline/steps.js";

describe("CineDrama OS LLM Output Self-Correction & Repair Loop Suite", () => {
  let ctx: any;
  let registry: ProviderRegistryService;

  beforeEach(() => {
    ctx = createContext();
    new RateLimiterService(ctx, { tpmLimit: 1000000 });
    registry = new ProviderRegistryService(ctx);
  });

  it("Case 1: Direct First-shot Success (attempts = 1, repaired = false)", async () => {
    const validJson = JSON.stringify({
      coreConflict: "少年自青云宗觉醒神体 vs 强敌压境",
      skeleton: "废柴逆袭，三剑斩破天劫",
      threeActs: [
        { act: 1, name: "微末受辱", target: "打破枷锁" },
        { act: 2, name: "宗门大比", target: "镇压强敌" },
        { act: 3, name: "踏破苍穹", target: "成就神位" },
      ],
    });

    const mockProvider: IModelProvider = {
      id: "mock-smart",
      name: "Smart LLM Provider",
      version: "1.0.0",
      models: [{ id: "smart-model", name: "smart-model", type: "text" }],
      async generateText(_options: TextGenerateOptions): Promise<TextGenerateResult> {
        return { text: validJson, usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 } };
      },
    };

    registry.register(mockProvider);

    const fallback = {
      coreConflict: "兜底矛盾",
      skeleton: "兜底大纲",
      threeActs: [{ act: 1, name: "幕1", target: "目标1" }],
    };

    const result = await registry.generateStructured({
      model: "smart-model",
      prompt: "生成修仙三幕短剧",
      schema: StorySkeletonSchema,
      fallback,
    });

    expect(result.attempts).toBe(1);
    expect(result.repaired).toBe(false);
    expect(result.data.coreConflict).toBe("少年自青云宗觉醒神体 vs 强敌压境");
    expect(result.data.threeActs.length).toBe(3);
    expect(result.errors).toBeUndefined();
  });

  it("Case 2: First-shot Schema Violation, Self-Correction on Attempt 2 (attempts = 2, repaired = true)", async () => {
    let callCount = 0;
    const retryCalls: { attempt: number; errMsg: string }[] = [];

    // 第一次返回残缺数据（缺少 threeActs），第二次根据错误反馈返回完整修复数据
    const brokenJson = JSON.stringify({
      coreConflict: "少年逆境崛起",
      skeleton: "踏破苍穹",
      // 故意漏掉 threeActs 字段
    });

    const fixedJson = JSON.stringify({
      coreConflict: "少年逆境崛起",
      skeleton: "踏破苍穹",
      threeActs: [
        { act: 1, name: "第一幕", target: "觉醒道种" },
        { act: 2, name: "第二幕", target: "逆伐宗门" },
      ],
    });

    const mockProvider: IModelProvider = {
      id: "mock-self-heal",
      name: "Self Healing Provider",
      version: "1.0.0",
      models: [{ id: "heal-model", name: "heal-model", type: "text" }],
      async generateText(options: TextGenerateOptions): Promise<TextGenerateResult> {
        callCount++;
        if (callCount === 1) {
          return { text: brokenJson, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } };
        }
        // 第二次：检查纠错 Prompt 中是否正确携带了上一次的错误信息
        expect(options.prompt).toContain("【系统错误修正指令】");
        expect(options.prompt).toContain("threeActs");
        return { text: fixedJson, usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 } };
      },
    };

    registry.register(mockProvider);

    const fallback = {
      coreConflict: "兜底矛盾",
      skeleton: "兜底大纲",
      threeActs: [{ act: 1, name: "幕1", target: "目标1" }],
    };

    const result = await registry.generateStructured({
      model: "heal-model",
      prompt: "生成大纲",
      schema: StorySkeletonSchema,
      fallback,
      onRetry: (attempt, errMsg) => {
        retryCalls.push({ attempt, errMsg });
      },
    });

    expect(callCount).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.data.threeActs.length).toBe(2);
    expect(result.data.threeActs[0].name).toBe("第一幕");
    expect(retryCalls.length).toBe(1);
    expect(retryCalls[0].errMsg).toContain("threeActs");
  });

  it("Case 3: Non-JSON Output on Attempt 1, Repaired with Markdown ```json on Attempt 2", async () => {
    let callCount = 0;

    const mockProvider: IModelProvider = {
      id: "mock-markdown",
      name: "Markdown Provider",
      version: "1.0.0",
      models: [{ id: "md-model", name: "md-model", type: "text" }],
      async generateText(options: TextGenerateOptions): Promise<TextGenerateResult> {
        callCount++;
        if (callCount === 1) {
          // 第一次输出一堆自然语言废话，没有合法 JSON
          return { text: "好的，我认为剧本应该这样写，非常精彩！", usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 } };
        }
        // 第二次输出标准的 Markdown 代码块包裹的剧本对白
        const markdownJson = `\`\`\`json
{
  "episodeIndex": 1,
  "title": "第 1 集：初露锋芒",
  "dialogueLines": [
    { "role": "萧炎", "line": "三十年河东，三十年河西！", "action": "紧握重尺" }
  ]
}
\`\`\``;
        return { text: markdownJson, usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 } };
      },
    };

    registry.register(mockProvider);

    const fallback = {
      episodeIndex: 1,
      title: "兜底剧本",
      dialogueLines: [{ role: "旁白", line: "默认台词" }],
    };

    const result = await registry.generateStructured({
      model: "md-model",
      prompt: "扩写剧本台词",
      schema: ScriptDialogueSchema,
      fallback,
    });

    expect(callCount).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.data.dialogueLines[0].role).toBe("萧炎");
    expect(result.data.dialogueLines[0].line).toBe("三十年河东，三十年河西！");
  });

  it("Case 4: Persistent Hallucination Exceeds maxRetries -> Graceful Fallback", async () => {
    let callCount = 0;

    const mockProvider: IModelProvider = {
      id: "mock-stubborn",
      name: "Stubborn Provider",
      version: "1.0.0",
      models: [{ id: "stubborn-model", name: "stubborn-model", type: "text" }],
      async generateText(_options: TextGenerateOptions): Promise<TextGenerateResult> {
        callCount++;
        // 顽固生成乱码与破坏性数据
        return { text: `【乱码尝试 ${callCount}】无法解析`, usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
      },
    };

    registry.register(mockProvider);

    const fallback = {
      shots: [
        {
          shotIndex: 1,
          cameraAngle: "全景",
          prompt: "安全兜底镜头",
          dialogue: "安全对白",
          voiceRole: "旁白",
          duration: 3.5,
        },
      ],
    };

    const result = await registry.generateStructured({
      model: "stubborn-model",
      prompt: "生成分镜列表",
      schema: StoryboardPlanningSchema,
      fallback,
      maxRetries: 2, // 允许重试 2 次 (共 3 次尝试)
    });

    expect(callCount).toBe(3);
    expect(result.attempts).toBe(3);
    expect(result.repaired).toBe(false);
    expect(result.data).toEqual(fallback);
    expect(result.errors?.length).toBe(3);
  });

  it("Case 5: End-to-End Pipeline Step Self-Correction Log Verification", async () => {
    let stepLogMessages: string[] = [];
    let callCount = 0;

    const brokenSkeleton = JSON.stringify({ coreConflict: "只有核心矛盾" });
    const fixedSkeleton = JSON.stringify({
      coreConflict: "自愈后的核心矛盾",
      skeleton: "自愈后的大纲",
      threeActs: [{ act: 1, name: "起篇", target: "觉醒" }],
    });

    const mockProvider: IModelProvider = {
      id: "mock-pipeline-llm",
      name: "Pipeline LLM",
      version: "1.0.0",
      models: [{ id: "deepseek-v4-flash", name: "deepseek-v4-flash", type: "text" }],
      async generateText(): Promise<TextGenerateResult> {
        callCount++;
        if (callCount === 1) return { text: brokenSkeleton };
        return { text: fixedSkeleton };
      },
    };

    registry.register(mockProvider);

    const step = createSkeletonStep(ctx);
    const mockStepCtx: any = {
      jobId: "job_test_repair",
      projectId: "proj_test",
      stepId: "step-skeleton",
      input: { textModel: "deepseek-v4-flash", novelText: "少年微末崛起..." },
      previousOutputs: {},
      log: (msg: string) => stepLogMessages.push(msg),
      reportProgress: () => {},
    };

    const output = await step.execute(mockStepCtx);

    expect(output.coreConflict).toBe("自愈后的核心矛盾");
    expect(output.threeActs.length).toBe(1);
    expect(stepLogMessages.some((m) => m.includes("[AI 自我纠偏]"))).toBe(true);
    expect(stepLogMessages.some((m) => m.includes("[AI 自我纠偏成功]"))).toBe(true);
  });
});
