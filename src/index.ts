import { createContext } from "./core/context.js";
import { ConfigService } from "./services/config.js";
import { DatabaseService } from "./services/database.js";
import { RateLimiterService } from "./services/rate-limiter.js";
import { ProviderRegistryService } from "./services/provider-registry.js";
import { PipelineService } from "./services/pipeline.js";
import { EvaluationService } from "./services/evaluation.js";
import { MediaIntegrityService } from "./services/media-integrity.js";
import { VisualConsistencyService } from "./services/visual-consistency.js";
import { ResilienceService } from "./services/resilience.js";
import { ContinuityService } from "./services/continuity.js";

// 内置插件
import serverPlugin from "./plugins/server/index.js";
import sensenovaPlugin from "./plugins/provider-sensenova/index.js";
import bridgePlugin from "./plugins/provider-bridge/index.js";
import dramaPipelinePlugin from "./plugins/drama-pipeline/index.js";

async function bootstrap() {
  console.log("==================================================");
  console.log("    CineDrama OS (Cordis Microkernel) v1.0.0      ");
  console.log("==================================================");

  // 1. 初始化 Cordis 上下文
  const ctx = createContext();

  // 2. 注入基础服务
  const configService = new ConfigService(ctx);
  const cfg = configService.config;

  const db = new DatabaseService(ctx, cfg.database.path);
  const rateLimiter = new RateLimiterService(ctx, cfg.rateLimiter);
  const providers = new ProviderRegistryService(ctx);
  const pipeline = new PipelineService(ctx);
  const evaluation = new EvaluationService(ctx);
  const mediaIntegrity = new MediaIntegrityService(ctx);
  const visualConsistency = new VisualConsistencyService(ctx);
  const resilience = new ResilienceService(ctx);
  const continuity = new ContinuityService(ctx);

  // 3. 挂载核心插件 (基于配置驱动)
  console.log("[Kernel] 正在按配置装载插件...");

  // 装载漫剧核心流程引擎插件
  await ctx.plugin(dramaPipelinePlugin);

  // 装载 HTTP 服务插件
  await ctx.plugin(serverPlugin, {
    host: cfg.server.host,
    port: cfg.server.port,
  });

  // 装载商汤 SenseNova 免费官方模型插件
  const sensenovaConfig = configService.getPluginConfig("provider-sensenova", {});
  await ctx.plugin(sensenovaPlugin, sensenovaConfig);

  // 装载本地 Bridge 插件
  const bridgeConfig = configService.getPluginConfig("provider-bridge", {});
  await ctx.plugin(bridgePlugin, bridgeConfig);

  console.log("[Kernel] 内核启动就绪！");

  // 4. 优雅关闭处理
  const shutdown = async () => {
    console.log("\n[Kernel] 正在执行优雅停机...");
    ctx.events.emit("dispose");
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("[Kernel] 启动失败:", err);
  process.exit(1);
});
