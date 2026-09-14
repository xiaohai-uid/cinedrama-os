import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { SenseNovaProviderPlugin, resolveDimensions } from "../src/plugins/provider-sensenova/index.js";

describe("CineDrama OS SenseNova Free Model Provider Plugin", () => {
  let ctx: any;
  let registry: ProviderRegistryService;
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    ctx = createContext();
    rateLimiter = new RateLimiterService(ctx, { enabled: true, tpmLimit: 1000000, rpmLimit: 100 });
    registry = new ProviderRegistryService(ctx);
  });

  afterEach(() => {
    ctx.events.emit("dispose");
  });

  it("should register SenseNova provider and expose free models", () => {
    const plugin = new SenseNovaProviderPlugin(ctx, {
      apiKey: "sk-mock-sensenova-test-key-12345",
      baseUrl: "https://token.sensenova.cn/v1",
    });

    expect(plugin.id).toBe("sensenova");
    expect(plugin.models.length).toBeGreaterThanOrEqual(3);

    const deepseekModel = plugin.models.find((m) => m.id === "deepseek-v4-flash");
    expect(deepseekModel).toBeDefined();
    expect(deepseekModel?.type).toBe("text");
    expect(deepseekModel?.capabilities?.thinking).toBe(true);

    const config = plugin.getConfig();
    expect(config.hasKey).toBe(true);
    expect(config.maskedKey).toContain("****");
  });

  it("should safely generate fallback text when offline without crashing", async () => {
    const plugin = new SenseNovaProviderPlugin(ctx, {
      apiKey: "",
      enableFallback: true,
    });

    const res = await plugin.generateText({
      model: "deepseek-v4-flash",
      prompt: "少年破空而去，剑指苍穹",
    });

    expect(res.text).toContain("少年破空而去");
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
  });

  it("should generate standard PCM WAV data URI for dialogue TTS", async () => {
    const plugin = new SenseNovaProviderPlugin(ctx);
    const res = await plugin.generateTTS({
      model: "default",
      text: "莫欺少年穷！",
      voice: "zh-CN-YunxiNeural",
    });

    expect(res.audioUrl).toMatch(/^data:audio\/wav;base64,/);
    expect(res.format).toBe("wav");
    expect(res.durationMs).toBeGreaterThan(1000);
  });

  it("should generate cinematic SVG poster for storyboard visuals", async () => {
    const plugin = new SenseNovaProviderPlugin(ctx);
    const res = await plugin.generateImage({
      model: "sensenova-u1-fast",
      prompt: "狂风呼啸中的演武场，两道身影拔剑相对",
    });

    expect(res.base64).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(res.mimeType).toBe("image/svg+xml");
  });

  it("should support dynamic config updates and ping diagnostics", async () => {
    const plugin = new SenseNovaProviderPlugin(ctx, {
      apiKey: "",
    });

    const pingFail = await plugin.healthCheck();
    expect(pingFail.ok).toBe(false);
    expect(pingFail.message).toContain("未配置");

    plugin.updateConfig({
      apiKey: "sk-updated-test-key-abcde12345",
      baseUrl: "https://token.sensenova.cn/v1",
    });

    const conf = plugin.getConfig();
    expect(conf.hasKey).toBe(true);
    expect(conf.maskedKey).toContain("sk-upd");
  });

  it("should resolve active text model dynamically in registry", () => {
    new SenseNovaProviderPlugin(ctx, { apiKey: "test" });

    expect(registry.getActiveTextModel()).toBe("deepseek-v4-flash");
    registry.setActiveTextModel("sensenova-6.7-flash-lite");
    expect(registry.getActiveTextModel()).toBe("sensenova-6.7-flash-lite");
  });

  it("should correctly compute dimensions matching standard 16:9/9:16 U1 specification", () => {
    // 16:9 at 1K
    const dim16_9 = resolveDimensions("16:9", "1K");
    expect(dim16_9.width).toBe(1024);
    expect(dim16_9.height).toBe(576);

    // 9:16 at 1K
    const dim9_16 = resolveDimensions("9:16", "1K");
    expect(dim9_16.height).toBe(1024);
    expect(dim9_16.width).toBe(576);

    // 1:1 at 2K
    const dim1_1 = resolveDimensions("1:1", "2K");
    expect(dim1_1.width).toBe(2048);
    expect(dim1_1.height).toBe(2048);
  });
});
