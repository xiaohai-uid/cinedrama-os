import fs from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { RateLimiterService } from "../src/services/rate-limiter.js";
import { ProviderRegistryService } from "../src/services/provider-registry.js";
import { PipelineService } from "../src/services/pipeline.js";
import { ContinuityService } from "../src/services/continuity.js";
import bridgePlugin from "../src/plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "../src/plugins/drama-pipeline/index.js";
import serverPlugin from "../src/plugins/server/index.js";

describe("CineDrama OS Multi-Episode Continuity & Lore Suite", () => {
  let ctx: any;
  const testDb = "./data/test-continuity.sqlite";
  const port = 8993;

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
    new ContinuityService(ctx);

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

  it("Case 1: Should track cross-episode character states, props, and plot hooks in ledger", () => {
    const service: ContinuityService = ctx.continuity;
    const projectId = "proj_continuity_ledger";

    // 记录角色
    service.recordCharacterState(projectId, {
      name: "林破天",
      status: "alive",
      realm: "筑基初期",
      faction: "林家",
    });

    service.recordCharacterState(projectId, {
      name: "黑煞老怪",
      status: "deceased",
      realm: "金丹巅峰",
      faction: "血煞宗",
      notes: "已在第 1 集末尾被九天神雷轰杀",
    });

    // 记录道具
    service.recordCriticalProp(projectId, {
      propName: "九天断剑",
      owner: "林破天",
      status: "held",
    });

    // 记录伏笔
    service.addPlotHook(projectId, {
      hookId: "hook_001",
      description: "林家老祖当年离奇暴毙的密信真相",
      introducedInEpisode: 1,
      criticalLevel: "high",
    });

    const ledger = service.getOrCreateLedger(projectId);
    expect(ledger.characters).toHaveLength(2);
    expect(ledger.props).toHaveLength(1);
    expect(ledger.hooks).toHaveLength(1);
    expect(ledger.characters.find((c) => c.name === "黑煞老怪")?.status).toBe("deceased");
  });

  it("Case 2: Should intercept and fail continuity audit if deceased character speaks alive without flashback", () => {
    const service: ContinuityService = ctx.continuity;
    const projectId = "proj_continuity_audit_fail";

    service.recordCharacterState(projectId, {
      name: "黑煞老怪",
      status: "deceased",
    });

    // 第 2 集剧本中，黑煞老怪居然直接以正常对白出现（严重吃书）
    const flawedScript = {
      dialogueLines: [
        { role: "林破天", line: "你竟然还活着？" },
        { role: "黑煞老怪", line: "桀桀桀，老夫今日就要取你狗命！" },
      ],
      text: "黑煞老怪大步走出密室，狂笑不止。",
    };

    const audit = service.auditEpisodeContinuity(projectId, 2, flawedScript);

    expect(audit.isPassed).toBe(false);
    expect(audit.violations.length).toBeGreaterThan(0);
    expect(audit.violations[0]).toContain("角色 [黑煞老怪] 已在前序设定中阵亡");
    expect(audit.continuityScore).toBeLessThan(70);
  });

  it("Case 3: Should permit deceased character if marked with flashback/memory context", () => {
    const service: ContinuityService = ctx.continuity;
    const projectId = "proj_continuity_flashback";

    service.recordCharacterState(projectId, {
      name: "黑煞老怪",
      status: "deceased",
    });

    // 第 2 集剧本中，属于林破天心魔幻觉或回忆闪回
    const flashbackScript = {
      dialogueLines: [
        { role: "林破天", line: "又是这个梦魇..." },
        { role: "黑煞老怪", line: "你逃不出命运的诅咒..." },
      ],
      text: "林破天识海震荡，眼前浮现出昔日决战的闪回回忆与幻觉。",
    };

    const audit = service.auditEpisodeContinuity(projectId, 2, flashbackScript);

    expect(audit.isPassed).toBe(true);
    expect(audit.violations).toHaveLength(0);
    expect(audit.warnings[0]).toContain("通过回忆/幻象方式登场");
  });

  it("Case 4: Should forward unresolved plot hooks to subsequent episode generation stream", () => {
    const service: ContinuityService = ctx.continuity;
    const projectId = "proj_continuity_forward";

    service.addPlotHook(projectId, {
      hookId: "hook_unresolved_1",
      description: "神威重工核心机房密码锁的来源",
      introducedInEpisode: 1,
      criticalLevel: "high",
    });

    service.addPlotHook(projectId, {
      hookId: "hook_resolved_already",
      description: "师妹假死的真正原因",
      introducedInEpisode: 1,
      isResolved: true,
      resolvedInEpisode: 1,
    });

    const activeHooks = service.forwardPlotHooksToNext(projectId, 1);

    expect(activeHooks).toHaveLength(1);
    expect(activeHooks[0].hookId).toBe("hook_unresolved_1");
    expect(activeHooks[0].description).toBe("神威重工核心机房密码锁的来源");
  });

  it("Case 5: REST API GET /api/projects/:id/continuity should return complete project ledger", async () => {
    const projectId = "proj_api_continuity";
    ctx.continuity.recordCharacterState(projectId, {
      name: "陆炎",
      status: "alive",
      realm: "三阶异能者",
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/continuity`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ledger).toBeDefined();
    expect(data.ledger.characters).toBeInstanceOf(Array);
    expect(data.ledger.characters[0].name).toBe("陆炎");
    expect(data.ledger.characters[0].realm).toBe("三阶异能者");
  });
});
