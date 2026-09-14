import { describe, it, expect } from "vitest";
import { createContext } from "../src/core/context.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";

describe("CineDrama OS Provider Ecosystem", () => {
  it("should mount BridgeProviderPlugin and register models cleanly", async () => {
    const ctx = createContext();
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);

    // 装载插件 (Cordis 4.x plugin 是异步 Fiber)
    await ctx.plugin(bridgePlugin, { enableFallback: true });

    const providers = ctx.providers.listProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe("bridge");

    const allModels = ctx.providers.listAllModels();
    expect(allModels.length).toBeGreaterThanOrEqual(3);
    const imageModel = allModels.find((m) => m.model.type === "image");
    expect(imageModel).toBeDefined();
    expect(imageModel?.model.id).toBe("bridge-image");
  });

  it("should execute text generation and emit domain events", async () => {
    const ctx = createContext();
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    await ctx.plugin(bridgePlugin, { enableFallback: true });

    let eventCaptured = false;
    ctx.events.on("generation/text/completed", (evt: any) => {
      eventCaptured = true;
      expect(evt.providerId).toBe("bridge");
    });

    const res = await ctx.providers.generateText({
      model: "bridge-text-mock",
      prompt: "写一段关于少年修仙出村的开场镜头剧本",
    });

    expect(res.text).toContain("[Bridge Mock Text]");
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
    expect(eventCaptured).toBe(true);
  });

  it("should execute image generation without VM2 sandbox errors", async () => {
    const ctx = createContext();
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    await ctx.plugin(bridgePlugin, { enableFallback: true });

    const res = await ctx.providers.generateImage({
      model: "bridge-image",
      prompt: "远景，云海翻涌中的仙山古刹",
      aspectRatio: "16:9",
      size: "1K",
    });

    expect(res.base64).toBeDefined();
    expect(res.base64).toContain("data:image/svg+xml;base64,");
    expect(res.mimeType).toBe("image/svg+xml");
  });

  it("should cleanly unregister provider on plugin disposal", async () => {
    const ctx = createContext();
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);
    const fiber = await ctx.plugin(bridgePlugin, { enableFallback: true });

    expect(ctx.providers.listProviders().length).toBe(1);

    // 触发卸载事件
    ctx.events.emit("dispose");
    expect(ctx.providers.listProviders().length).toBe(0);
  });
});
