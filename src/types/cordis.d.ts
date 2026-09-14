import type { DatabaseService } from "../services/database.js";
import type { RateLimiterService } from "../services/rate-limiter.js";
import type { ProviderRegistryService } from "../services/provider-registry.js";
import type { ConfigService } from "../services/config.js";
import type { PipelineService } from "../services/pipeline.js";

declare module "cordis" {
  interface Context {
    configService: ConfigService;
    db: DatabaseService;
    rateLimiter: RateLimiterService;
    providers: ProviderRegistryService;
    pipeline: PipelineService;
  }
}
