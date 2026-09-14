import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import serverPlugin from "../src/plugins/server/index.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import fs from "node:fs";

describe("CineDrama OS HTTP API Integration Tests", () => {
  const testPort = 13080;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  const testDb = "./data/test_server.sqlite";
  let ctx: any;

  beforeAll(async () => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    ctx = createContext();
    new DatabaseService(ctx, testDb);
    new RateLimiterService(ctx, { tpmLimit: 100000 });
    new ProviderRegistryService(ctx);

    await ctx.plugin(serverPlugin, { host: "127.0.0.1", port: testPort });
    await ctx.plugin(bridgePlugin, { enableFallback: true });

    // 等待端口监听就绪
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

  it("GET /api/health should return ok and system metrics", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
    expect(data.arch).toBe("cordis-microkernel");
    expect(data.providerCount).toBe(1);
    expect(data.metrics.enabled).toBe(true);
  });

  it("GET /api/providers should return model catalog", async () => {
    const res = await fetch(`${baseUrl}/api/providers`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.providers.length).toBe(1);
    expect(data.models.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /api/projects and GET /api/projects should create and list projects", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "修仙短剧第一季",
        description: "由 CineDrama OS 生成",
        aspectRatio: "16:9",
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.project.title).toBe("修仙短剧第一季");

    const listRes = await fetch(`${baseUrl}/api/projects`);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.projects.length).toBe(1);
    expect(listData.projects[0].title).toBe("修仙短剧第一季");
  });

  it("POST /api/generate/text should return generated text", async () => {
    const res = await fetch(`${baseUrl}/api/generate/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "生成前三幕短剧旁白",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.text).toContain("[Bridge Mock Text]");
    expect(data.usage.totalTokens).toBeGreaterThan(0);
  });

  it("POST /api/generate/image should return image base64 data", async () => {
    const res = await fetch(`${baseUrl}/api/generate/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "主角拔剑出鞘",
        aspectRatio: "16:9",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.base64).toBeDefined();
    expect(data.base64).toContain("data:image/svg+xml;base64,");
  });

  it("POST /api/generate/tts should return valid synthesized WAV data", async () => {
    const res = await fetch(`${baseUrl}/api/generate/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "莫欺少年穷！",
        voice: "zh-CN-YunxiNeural",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.audioUrl).toMatch(/^data:audio\/wav;base64,/);
    expect(data.format).toBe("wav");
    expect(data.durationMs).toBeGreaterThan(500);
  });

  it("POST /api/generate/video should return video asset URL", async () => {
    const res = await fetch(`${baseUrl}/api/generate/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "两道身影对峙",
        duration: 4,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.videoUrl).toBeDefined();
    expect(data.duration).toBe(4);
  });

  it("GET /api/shots/:id should return single shot details", async () => {
    // 先创建关联项目，满足外键约束
    const proj = ctx.db.createProject({
      id: "proj_test_shot_1",
      title: "测试分镜工程",
      aspectRatio: "16:9",
    });

    // 写入一条分镜数据
    const shot = ctx.db.createShot({
      id: "shot_server_test_1",
      projectId: proj.id,
      episodeIndex: 1,
      shotIndex: 1,
      prompt: "少年拔剑",
      duration: 3,
      status: "image_ready",
      imageUrl: "data:image/png;base64,test",
    });

    const res = await fetch(`${baseUrl}/api/shots/${shot.id}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.shot).toBeDefined();
    expect(data.shot.id).toBe(shot.id);
    expect(data.shot.prompt).toBe("少年拔剑");
  });

  it("GET / should serve creator studio HTML", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("CineDrama Studio");
    expect(text).toContain("AI 漫剧与短剧创作工坊");
  });

  it("GET /style.css and /app.js should serve frontend studio assets", async () => {
    const cssRes = await fetch(`${baseUrl}/style.css`);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get("content-type")).toContain("text/css");

    const jsRes = await fetch(`${baseUrl}/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get("content-type")).toContain("javascript");
  });

  it("POST /api/providers/active and POST /api/providers/test should manage AI engine models", async () => {
    // 1. 获取 providers 列表与当前激活模型
    const getRes = await fetch(`${baseUrl}/api/providers`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.providers).toBeDefined();
    expect(getData.activeTextModel).toBeDefined();

    // 2. 切换当前生效文本模型
    const postRes = await fetch(`${baseUrl}/api/providers/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-v4-flash" }),
    });
    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as any;
    expect(postData.success).toBe(true);
    expect(postData.activeTextModel).toBe("deepseek-v4-flash");

    // 3. 测试供应商网络连通性
    const testRes = await fetch(`${baseUrl}/api/providers/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "bridge" }),
    });
    expect(testRes.status).toBe(200);
    const testData = (await testRes.json()) as any;
    expect(testData.message).toBeDefined();
  });

  it("POST /api/generate/structured should execute self-correcting structured generation and validate input", async () => {
    // 1. 验证空提示词拦截 (HTTP 400)
    const errRes = await fetch(`${baseUrl}/api/generate/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });
    expect(errRes.status).toBe(400);

    // 2. 正常请求 structured 生成
    const okRes = await fetch(`${baseUrl}/api/generate/structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "请为《绝世丹神》规划前三幕骨架",
        targetType: "skeleton",
      }),
    });
    expect(okRes.status).toBe(200);
    const data = (await okRes.json()) as any;
    expect(data.data).toBeDefined();
    expect(data.attempts).toBeGreaterThanOrEqual(1);
    expect(data.data.skeleton).toBeDefined();
    expect(data.data.coreConflict).toBeDefined();
  });
});
