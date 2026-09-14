import { Context } from "cordis";
import type { DatabaseService } from "../services/database.js";
import type { RateLimiterService } from "../services/rate-limiter.js";
import type { ProviderRegistryService } from "../services/provider-registry.js";
import type { ConfigService } from "../services/config.js";
import type { PipelineService } from "../services/pipeline.js";
import type { EvaluationService } from "../services/evaluation.js";
import type { MediaIntegrityService } from "../services/media-integrity.js";
import type { VisualConsistencyService } from "../services/visual-consistency.js";
import type { ResilienceService } from "../services/resilience.js";
import type { ContinuityService } from "../services/continuity.js";

declare module "cordis" {
  interface Context {
    configService: ConfigService;
    db: DatabaseService;
    rateLimiter: RateLimiterService;
    providers: ProviderRegistryService;
    pipeline: PipelineService;
    evaluation: EvaluationService;
    mediaIntegrity: MediaIntegrityService;
    visualConsistency: VisualConsistencyService;
    resilience: ResilienceService;
    continuity: ContinuityService;
  }
}

export { Context };

export function createContext(): Context {
  return new Context();
}
