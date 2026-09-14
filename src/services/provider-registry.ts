import type { Context } from "cordis";
import type {
  IModelProvider,
  ModelDescriptor,
  TextGenerateOptions,
  TextGenerateResult,
  ImageGenerateOptions,
  ImageGenerateResult,
  VideoGenerateOptions,
  VideoGenerateResult,
  TTSGenerateOptions,
  TTSGenerateResult,
  StructuredGenerateOptions,
  StructuredGenerateResult,
} from "../core/types.js";

export class ProviderRegistryService {
  private providers: Map<string, IModelProvider> = new Map();
  private ctx: Context;
  private activeTextModel: string = "deepseek-v4-flash";

  constructor(ctx: Context) {
    this.ctx = ctx;
    ctx.reflect.provide("providers", this);
  }

  public getActiveTextModel(): string {
    return this.activeTextModel;
  }

  public setActiveTextModel(model: string) {
    this.activeTextModel = model;
    console.log(`[ProviderRegistry] 切换当前默认文本模型为: ${model}`);
  }

  /**
   * 注册模型供应商插件
   */
  public register(provider: IModelProvider) {
    if (this.providers.has(provider.id)) {
      console.warn(`[ProviderRegistry] 覆盖已有供应商: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
    console.log(`[ProviderRegistry] 成功装载模型供应商: [${provider.id}] ${provider.name} (模型数: ${provider.models.length})`);
    this.ctx.events.emit("provider/registered", provider);
  }

  /**
   * 卸载模型供应商插件
   */
  public unregister(id: string) {
    const provider = this.providers.get(id);
    if (provider) {
      this.providers.delete(id);
      console.log(`[ProviderRegistry] 卸载模型供应商: [${id}]`);
      this.ctx.events.emit("provider/unregistered", provider);
    }
  }

  public get(id: string): IModelProvider | undefined {
    return this.providers.get(id);
  }

  public listProviders(): IModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 列出系统当前所有可用的模型 (聚合视图)
   */
  public listAllModels(): { providerId: string; providerName: string; model: ModelDescriptor }[] {
    const results: { providerId: string; providerName: string; model: ModelDescriptor }[] = [];
    for (const p of this.providers.values()) {
      for (const m of p.models) {
        results.push({
          providerId: p.id,
          providerName: p.name,
          model: m,
        });
      }
    }
    return results;
  }

  /**
   * 解析形如 "providerId:modelName" 或自动匹配支持该模型的 Provider
   */
  private resolveProvider(modelKey?: string): { provider: IModelProvider; modelName: string } {
    const targetKey = (modelKey && modelKey !== "default") ? modelKey : this.activeTextModel;

    if (targetKey.includes(":")) {
      const [pId, ...rest] = targetKey.split(":");
      const mName = rest.join(":");
      const provider = this.providers.get(pId);
      if (!provider) {
        throw new Error(`找不到指定的模型供应商: ${pId}`);
      }
      return { provider, modelName: mName };
    }

    // 自动扫描包含该 modelName 的 Provider
    for (const p of this.providers.values()) {
      if (p.models.some((m) => m.id === targetKey || m.name === targetKey)) {
        return { provider: p, modelName: targetKey };
      }
    }

    // 若依然找不到，优先取 sensenova，其次取首个注册的 Provider 兜底尝试
    const fallback = this.providers.get("sensenova") || Array.from(this.providers.values())[0];
    if (!fallback) {
      throw new Error(`当前没有任何可用的模型供应商 (请求模型: ${targetKey})`);
    }
    return { provider: fallback, modelName: targetKey };
  }

  /**
   * 测试指定 Provider 的连通性与网络延迟
   */
  public async pingProvider(providerId: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { ok: false, latencyMs: 0, message: `找不到供应商: ${providerId}` };
    }
    if (typeof (provider as any).healthCheck === "function") {
      return await (provider as any).healthCheck();
    }
    return { ok: true, latencyMs: 1, message: `供应商 [${provider.name}] 已就绪` };
  }

  // ==========================================================================
  // 统一调度生成门面 (附带流控与事件追踪)
  // ==========================================================================

  public async generateText(options: TextGenerateOptions): Promise<TextGenerateResult> {
    const { provider, modelName } = this.resolveProvider(options.model);
    if (!provider.generateText) {
      throw new Error(`供应商 [${provider.id}] 不支持文本生成接口`);
    }

    // 1. 流量准入限制 (预估 2000 tokens)
    const estimated = options.maxTokens || 2000;
    await this.ctx.rateLimiter.acquire(estimated);

    // 2. 执行模型调用
    const startTime = Date.now();
    try {
      const result = await provider.generateText({ ...options, model: modelName });
      
      // 3. 统计真实消耗
      if (result.usage?.totalTokens) {
        this.ctx.rateLimiter.reportActualUsage(estimated, result.usage.totalTokens);
      }

      this.ctx.events.emit("generation/text/completed", {
        providerId: provider.id,
        model: modelName,
        durationMs: Date.now() - startTime,
        usage: result.usage,
      });

      return result;
    } catch (err: any) {
      this.ctx.events.emit("generation/failed", {
        type: "text",
        providerId: provider.id,
        model: modelName,
        error: err.message,
      });
      throw err;
    }
  }

  public async generateImage(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
    const { provider, modelName } = this.resolveProvider(options.model);
    if (!provider.generateImage) {
      throw new Error(`供应商 [${provider.id}] 不支持图片生成接口`);
    }

    await this.ctx.rateLimiter.acquire(100); // 计入常规请求开销
    const result = await provider.generateImage({ ...options, model: modelName });
    this.ctx.events.emit("generation/image/completed", {
      providerId: provider.id,
      model: modelName,
    });
    return result;
  }

  public async generateVideo(options: VideoGenerateOptions): Promise<VideoGenerateResult> {
    const { provider, modelName } = this.resolveProvider(options.model);
    if (!provider.generateVideo) {
      throw new Error(`供应商 [${provider.id}] 不支持视频生成接口`);
    }

    await this.ctx.rateLimiter.acquire(100);
    const result = await provider.generateVideo({ ...options, model: modelName });
    this.ctx.events.emit("generation/video/completed", {
      providerId: provider.id,
      model: modelName,
    });
    return result;
  }

  public async generateTTS(options: TTSGenerateOptions): Promise<TTSGenerateResult> {
    const { provider, modelName } = this.resolveProvider(options.model);
    if (!provider.generateTTS) {
      throw new Error(`供应商 [${provider.id}] 不支持语音生成接口`);
    }

    await this.ctx.rateLimiter.acquire(100);
    const result = await provider.generateTTS({ ...options, model: modelName });
    this.ctx.events.emit("generation/tts/completed", {
      providerId: provider.id,
      model: modelName,
    });
    return result;
  }

  /**
   * 结构化大模型生成门面：带自动自我纠偏与 Zod 契约自愈闭环 (Self-Correction Loop)
   */
  public async generateStructured<T>(options: StructuredGenerateOptions<T>): Promise<StructuredGenerateResult<T>> {
    const maxRetries = options.maxRetries ?? 2;
    const model = options.model || this.activeTextModel;
    const collectedErrors: string[] = [];

    let currentPrompt = options.prompt;
    let currentSystemPrompt = options.systemPrompt;
    let currentTemp = options.temperature;
    let lastRawText = "";

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const isRetry = attempt > 1;
      const gen = await this.generateText({
        model,
        prompt: currentPrompt,
        systemPrompt: currentSystemPrompt,
        temperature: isRetry ? 0.1 : currentTemp,
      });

      lastRawText = gen.text || "";
      const rawJson = tryExtractJson(lastRawText);

      if (rawJson !== null) {
        const parseResult = options.schema.safeParse(rawJson);
        if (parseResult.success) {
          if (isRetry) {
            console.log(`[ProviderRegistry][Self-Correction] 大模型在第 ${attempt} 次尝试中成功自愈纠偏！`);
          }
          return {
            data: parseResult.data,
            rawText: lastRawText,
            attempts: attempt,
            repaired: isRetry,
            errors: collectedErrors.length > 0 ? collectedErrors : undefined,
          };
        }

        // Schema 校验失败，格式化具体字段错误
        const formattedErrors = parseResult.error.issues
          .map((i) => `- 字段 [${i.path.join(".") || "root"}]: ${i.message}`)
          .join("\n");
        const errMsg = `第 ${attempt} 次生成输出不符合契约规范:\n${formattedErrors}`;
        collectedErrors.push(errMsg);
        console.warn(`[ProviderRegistry][Self-Correction] ${errMsg}`);
        if (options.onRetry) {
          options.onRetry(attempt, errMsg);
        }
      } else {
        const errMsg = `第 ${attempt} 次生成输出未能成功提取合法 JSON 格式`;
        collectedErrors.push(errMsg);
        console.warn(`[ProviderRegistry][Self-Correction] ${errMsg}`);
        if (options.onRetry) {
          options.onRetry(attempt, errMsg);
        }
      }

      // 如果已达最大重试，不再构造新的重试提示词
      if (attempt > maxRetries) {
        break;
      }

      // 构造精准纠偏 Prompt 注入回大模型
      const errorSummary = collectedErrors[collectedErrors.length - 1];
      currentPrompt = `【系统错误修正指令】
你上一次生成的回答未通过系统严格的 Schema 契约校验，具体问题如下：
${errorSummary}

你上一次输出的原始内容为：
"""
${lastRawText.slice(0, 800)}
"""

请针对上述具体错误修正数据，务必只输出修正后的合法 JSON 代码块（用 \`\`\`json 包裹），确保所有字段完整且符合结构规范，绝对不要输出任何多余解释！`;
    }

    // 所有尝试均失败，执行安全平滑降级
    console.warn(`[ProviderRegistry][Self-Correction] 经历 ${maxRetries + 1} 次尝试后仍未通过契约检验，平滑降级至默认模板。`);
    return {
      data: options.fallback,
      rawText: lastRawText,
      attempts: maxRetries + 1,
      repaired: false,
      errors: collectedErrors,
    };
  }
}

function tryExtractJson(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {}
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) return JSON.parse(match[1]);
  } catch {}
  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
  } catch {}
  return null;
}
