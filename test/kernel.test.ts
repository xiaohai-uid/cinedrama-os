import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { ConfigService } from "../src/services/config.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import fs from "node:fs";
import path from "node:path";

describe("CineDrama OS Kernel & Core Services", () => {
  const testDbPath = "./data/test_kernel.sqlite";

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }
  });

  it("should initialize Cordis context and register services cleanly", () => {
    const ctx = createContext();
    expect(ctx).toBeDefined();

    const configService = new ConfigService(ctx);
    expect(ctx.configService).toBe(configService);
    expect(ctx.configService.config.server.port).toBe(3080);

    const db = new DatabaseService(ctx, testDbPath);
    expect(ctx.db).toBe(db);

    const limiter = new RateLimiterService(ctx, { tpmLimit: 10000, rpmLimit: 100 });
    expect(ctx.rateLimiter).toBe(limiter);

    db.close();
  });

  it("should perform CRUD on SQLite database through DatabaseService", () => {
    const ctx = createContext();
    const db = new DatabaseService(ctx, testDbPath);

    // 1. 创建项目
    const proj = db.createProject({
      id: "p_test_1",
      title: "测试漫剧项目",
      description: "自动化单元测试工程",
      aspectRatio: "16:9",
      defaultTextModel: "deepseek-v4",
    });

    expect(proj.id).toBe("p_test_1");
    expect(proj.title).toBe("测试漫剧项目");

    // 2. 查询项目
    const fetched = db.getProject("p_test_1");
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("测试漫剧项目");

    // 3. 插入分镜
    const shot = db.createShot({
      id: "shot_1_1",
      projectId: "p_test_1",
      episodeIndex: 1,
      shotIndex: 1,
      prompt: "近景，主角站在山巅俯瞰宗门，眼神坚定",
      duration: 4.5,
      status: "draft",
    });

    expect(shot.id).toBe("shot_1_1");
    expect(shot.duration).toBe(4.5);

    const shots = db.listShotsByProject("p_test_1");
    expect(shots.length).toBe(1);
    expect(shots[0].prompt).toContain("山巅");

    db.close();
  });

  it("should track TPM and RPM properly in RateLimiterService", async () => {
    const ctx = createContext();
    const limiter = new RateLimiterService(ctx, { tpmLimit: 5000, rpmLimit: 10 });

    expect(limiter.getCurrentTPM()).toBe(0);
    expect(limiter.getCurrentRPM()).toBe(0);

    // 申请 1000 tokens
    await limiter.acquire(1000);
    expect(limiter.getCurrentTPM()).toBe(1000);
    expect(limiter.getCurrentRPM()).toBe(1);

    // 实际消耗 1200 tokens
    limiter.reportActualUsage(1000, 1200);
    expect(limiter.getCurrentTPM()).toBe(1200);

    const metrics = limiter.getMetrics();
    expect(metrics.currentTPM).toBe(1200);
    expect(metrics.currentRPM).toBe(1);
    expect(metrics.tpmLimit).toBe(5000);
  });
});
