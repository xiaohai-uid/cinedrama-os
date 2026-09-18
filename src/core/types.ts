import { z } from "zod";

// ============================================================================
// 1. 基础模型与 Provider 契约 (Zod Schema & Inferred Types)
// ============================================================================

export const ModelTypeSchema = z.enum(["text", "image", "video", "tts"]);
export type ModelType = z.infer<typeof ModelTypeSchema>;

export const ModelDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ModelTypeSchema,
  description: z.string().optional(),
  contextWindow: z.number().positive().optional(),
  capabilities: z
    .object({
      streaming: z.boolean().optional(),
      thinking: z.boolean().optional(),
      referenceImages: z.number().int().nonnegative().optional(),
      maxDuration: z.number().positive().optional(),
      resolutions: z.array(z.string()).optional(),
      aspectRatios: z.array(z.string()).optional(),
    })
    .optional(),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const TextGenerateOptionsSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  think: z.boolean().optional(),
});
export type TextGenerateOptions = z.infer<typeof TextGenerateOptionsSchema>;

export const TextGenerateResultSchema = z.object({
  text: z.string(),
  thinkingText: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type TextGenerateResult = z.infer<typeof TextGenerateResultSchema>;

export const ImageGenerateOptionsSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).optional(),
  size: z.enum(["1K", "2K", "4K"]).optional(),
  referenceImages: z.array(z.string()).optional(),
});
export type ImageGenerateOptions = z.infer<typeof ImageGenerateOptionsSchema>;

export const ImageGenerateResultSchema = z.object({
  url: z.string().optional(),
  base64: z.string().optional(),
  mimeType: z.string().optional(),
  seed: z.number().optional(),
});
export type ImageGenerateResult = z.infer<typeof ImageGenerateResultSchema>;

export const VideoGenerateOptionsSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  duration: z.number().positive().optional(),
  resolution: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]).optional(),
  firstFrame: z.string().optional(),
  endFrame: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  audioPathOrBase64: z.string().optional(),
  cameraMotion: z.enum(["zoom_in", "zoom_out", "pan_right", "pan_left", "breathing", "still"]).optional(),
  dialogue: z.string().optional(),
  voiceRole: z.string().optional(),
});
export type VideoGenerateOptions = z.infer<typeof VideoGenerateOptionsSchema>;

export const VideoGenerateResultSchema = z.object({
  videoUrl: z.string().optional(),
  localPath: z.string().optional(),
  duration: z.number().optional(),
});
export type VideoGenerateResult = z.infer<typeof VideoGenerateResultSchema>;

export const TTSGenerateOptionsSchema = z.object({
  model: z.string().min(1),
  text: z.string().min(1),
  voice: z.string().min(1),
  speed: z.number().positive().optional(),
  pitch: z.number().optional(),
});
export type TTSGenerateOptions = z.infer<typeof TTSGenerateOptionsSchema>;

export const TTSGenerateResultSchema = z.object({
  audioUrl: z.string().optional(),
  audioBase64: z.string().optional(),
  format: z.string().optional(),
  durationMs: z.number().positive().optional(),
  duration: z.number().positive().optional(),
});
export type TTSGenerateResult = z.infer<typeof TTSGenerateResultSchema>;

/**
 * 标准模型供应商插件接口 (任何模型服务只需实现对应的方法)
 */
export interface IModelProvider {
  id: string;
  name: string;
  version: string;
  author?: string;
  models: ModelDescriptor[];

  // 能力调用 (可选实现，不支持则抛出明确不支持错误)
  generateText?(options: TextGenerateOptions): Promise<TextGenerateResult>;
  generateImage?(options: ImageGenerateOptions): Promise<ImageGenerateResult>;
  generateVideo?(options: VideoGenerateOptions): Promise<VideoGenerateResult>;
  generateTTS?(options: TTSGenerateOptions): Promise<TTSGenerateResult>;

  // 探活与健康检查
  healthCheck?(): Promise<{ ok: boolean; message?: string }>;
}

// ============================================================================
// 2. 漫剧领域核心实体 (Drama Domain Entities)
// ============================================================================

export const DramaProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  defaultTextModel: z.string().optional(),
  defaultImageModel: z.string().optional(),
  defaultVideoModel: z.string().optional(),
  defaultTTSModel: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DramaProject = z.infer<typeof DramaProjectSchema>;

export const StoryboardShotSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  episodeIndex: z.number().int().default(1),
  shotIndex: z.number().int(),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  voiceRole: z.string().optional(),
  cameraAngle: z.string().optional(),
  cameraMotion: z.enum(["zoom_in", "zoom_out", "pan_right", "pan_left", "breathing", "still"]).optional(),
  duration: z.number().positive().default(3.5),
  status: z.enum(["draft", "image_ready", "video_generating", "video_ready", "failed"]),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  error: z.string().optional(),
  updatedAt: z.number(),
});
export type StoryboardShot = z.infer<typeof StoryboardShotSchema>;

// ============================================================================
// 2.1 API 请求校验 DTO Schemas
// ============================================================================

export const CreateProjectDtoSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "工程标题不能为空"),
  description: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  defaultTextModel: z.string().optional(),
  defaultImageModel: z.string().optional(),
  defaultVideoModel: z.string().optional(),
  defaultTTSModel: z.string().optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectDtoSchema>;

export const CreatePipelineJobDtoSchema = z.object({
  projectId: z.string().trim().min(1, "缺少关联工程 ID"),
  workflowId: z.string().trim().min(1, "缺少工作流 ID"),
  input: z.record(z.any()).default({}),
});
export type CreatePipelineJobDto = z.infer<typeof CreatePipelineJobDtoSchema>;

export const ActiveModelDtoSchema = z.object({
  model: z.string().trim().min(1, "模型名称不能为空"),
});
export type ActiveModelDto = z.infer<typeof ActiveModelDtoSchema>;

export const ProviderConfigDtoSchema = z.object({
  providerId: z.string().trim().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url("BaseURL 必须为合法 URL 地址").optional(),
});
export type ProviderConfigDto = z.infer<typeof ProviderConfigDtoSchema>;

export const TestProviderDtoSchema = z.object({
  providerId: z.string().default("sensenova"),
});
export type TestProviderDto = z.infer<typeof TestProviderDtoSchema>;

export const GenerateTextDtoSchema = z.object({
  model: z.string().default("bridge-text-mock"),
  prompt: z.string().trim().min(1, "提示词不能为空"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  think: z.boolean().optional(),
});
export type GenerateTextDto = z.infer<typeof GenerateTextDtoSchema>;

export const GenerateImageDtoSchema = z.object({
  model: z.string().default("bridge-image"),
  prompt: z.string().trim().min(1, "生图提示词不能为空"),
  negativePrompt: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).default("16:9"),
  size: z.enum(["1K", "2K", "4K"]).default("1K"),
  referenceImages: z.array(z.string()).optional(),
});
export type GenerateImageDto = z.infer<typeof GenerateImageDtoSchema>;

export const GenerateTTSDtoSchema = z
  .object({
    model: z.string().default("bridge-tts"),
    text: z.string().optional(),
    prompt: z.string().optional(),
    voice: z.string().default("zh-CN-YunxiNeural"),
    speed: z.number().positive().optional(),
    pitch: z.number().optional(),
  })
  .refine((data) => !!(data.text || data.prompt), {
    message: "text 或 prompt 至少提供一项",
    path: ["text"],
  });
export type GenerateTTSDto = z.infer<typeof GenerateTTSDtoSchema>;

export const GenerateVideoDtoSchema = z.object({
  model: z.string().default("bridge-video"),
  prompt: z.string().trim().min(1, "视频生成提示词不能为空"),
  duration: z.number().positive().default(4),
  resolution: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  firstFrame: z.string().optional(),
  endFrame: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  audioPathOrBase64: z.string().optional(),
  cameraMotion: z.enum(["zoom_in", "zoom_out", "pan_right", "pan_left", "breathing", "still"]).optional(),
  dialogue: z.string().optional(),
  voiceRole: z.string().optional(),
});
export type GenerateVideoDto = z.infer<typeof GenerateVideoDtoSchema>;

export const GenerateStructuredDtoSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().min(1, "提示词不能为空"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  targetType: z.enum(["skeleton", "script", "storyboard"]).default("skeleton"),
});
export type GenerateStructuredDto = z.infer<typeof GenerateStructuredDtoSchema>;

// ============================================================================
// 3. 有向无环图 (DAG) 流程引擎实体 (Pipeline Entities)
// ============================================================================

export interface StepExecutionContext {
  jobId: string;
  projectId: string;
  stepId: string;
  input: Record<string, any>;
  previousOutputs: Record<string, any>; // 所有已完成前置节点的产出
  log: (msg: string) => void;
  reportProgress: (percent: number, message?: string) => void;
}

export interface PipelineStep {
  id: string;
  name: string;
  description?: string;
  dependsOn?: string[]; // 前置依赖的 Step ID 列表
  execute(ctx: StepExecutionContext): Promise<Record<string, any>>;
}

export interface PipelineWorkflow {
  id: string;
  name: string;
  description?: string;
  stepIds: string[];
}

export const JobStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StepStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const PipelineJobSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  projectId: z.string().min(1),
  status: JobStatusSchema,
  input: z.record(z.any()),
  output: z.record(z.any()),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

export const JobStepRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  stepId: z.string().min(1),
  status: StepStatusSchema,
  inputSnapshot: z.record(z.any()).optional(),
  outputSnapshot: z.record(z.any()).optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
  updatedAt: z.number(),
});
export type JobStepRecord = z.infer<typeof JobStepRecordSchema>;

// ============================================================================
// 4. AI 大模型结构化产物契约 (Structured AI Generation Schemas)
// ============================================================================

export const ThreeActItemSchema = z.object({
  act: z.number().int(),
  name: z.string().min(1),
  target: z.string().min(1),
});
export type ThreeActItem = z.infer<typeof ThreeActItemSchema>;

export const StorySkeletonSchema = z.object({
  coreConflict: z.string().min(1),
  skeleton: z.string().min(1),
  threeActs: z.array(ThreeActItemSchema).min(1),
});
export type StorySkeleton = z.infer<typeof StorySkeletonSchema>;

export const DialogueLineSchema = z.object({
  role: z.string().min(1),
  line: z.string().min(1),
  action: z.string().optional(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const ScriptDialogueSchema = z.object({
  episodeIndex: z.number().int().default(1),
  title: z.string().min(1),
  dialogueLines: z.array(DialogueLineSchema).min(1),
});
export type ScriptDialogue = z.infer<typeof ScriptDialogueSchema>;

export const PlannedShotSchema = z.object({
  shotIndex: z.number().int().optional(),
  cameraAngle: z.string().optional(),
  prompt: z.string().min(1),
  dialogue: z.string().optional().default(""),
  voiceRole: z.string().optional().default("旁白"),
  duration: z.number().positive().optional().default(3.5),
});
export type PlannedShot = z.infer<typeof PlannedShotSchema>;

export const StoryboardPlanningSchema = z.object({
  shots: z.array(PlannedShotSchema).min(1),
});
export type StoryboardPlanning = z.infer<typeof StoryboardPlanningSchema>;

// ============================================================================
// 5. 大模型自我纠错套件契约 (LLM Self-Correction & Repair Types)
// ============================================================================

export interface StructuredGenerateOptions<T> {
  model?: string;
  prompt: string;
  systemPrompt?: string;
  schema: z.ZodType<T>;
  fallback: T;
  maxRetries?: number; // 默认 2 次纠偏重试
  temperature?: number;
  onRetry?: (attempt: number, errorDetails: string) => void;
}

export interface StructuredGenerateResult<T> {
  data: T;
  rawText: string;
  attempts: number;
  repaired: boolean;
  errors?: string[];
}

// ============================================================================
// 6. 自动化质量与提示词评估套件契约 (Prompt Evals & LLM-as-a-Judge Types)
// ============================================================================

export const EvaluationDimensionScoreSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string().min(1),
});
export type EvaluationDimensionScore = z.infer<typeof EvaluationDimensionScoreSchema>;

export const DramaEvaluationSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  overallScore: z.number().min(0).max(10),
  tier: z.enum(["S", "A", "B", "C"]),
  verdict: z.string().min(1),
  highlights: z.array(z.string()).min(1),
  improvements: z.array(z.string()).min(1),
  dimensions: z.object({
    dramaticTension: EvaluationDimensionScoreSchema,
    dialogueQuality: EvaluationDimensionScoreSchema,
    cinematicPacing: EvaluationDimensionScoreSchema,
    pacingConsistency: EvaluationDimensionScoreSchema,
  }),
  judgeModel: z.string(),
  createdAt: z.number(),
  isFallback: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
});
export type DramaEvaluation = z.infer<typeof DramaEvaluationSchema>;

export const EvaluateDramaDtoSchema = z.object({
  projectId: z.string().min(1).optional(),
  model: z.string().optional(),
  title: z.string().optional(),
  novelText: z.string().optional(),
  skeleton: z.string().optional(),
  coreConflict: z.string().optional(),
  dialogueLines: z
    .array(
      z.object({
        role: z.string(),
        line: z.string(),
      })
    )
    .optional(),
  shots: z
    .array(
      z.object({
        shotIndex: z.number().optional(),
        prompt: z.string(),
        dialogue: z.string().optional(),
      })
    )
    .optional(),
});
export type EvaluateDramaDto = z.infer<typeof EvaluateDramaDtoSchema>;

// ============================================================================
// 7. 多模态视听流异常断言与健康契约 (Media Integrity & Health Types)
// ============================================================================

export const AudioIntegrityReportSchema = z.object({
  valid: z.boolean(),
  format: z.string(),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
  bitsPerSample: z.number().int().positive(),
  dataSizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  rmsEnergy: z.number().nonnegative(),
  clippingRate: z.number().min(0).max(1),
  isSilent: z.boolean(),
  isClipped: z.boolean(),
  issues: z.array(z.string()),
});
export type AudioIntegrityReport = z.infer<typeof AudioIntegrityReportSchema>;

export const ShotMediaHealthSchema = z.object({
  shotIndex: z.number().int(),
  plannedDurationSec: z.number().positive(),
  actualAudioDurationSec: z.number().nonnegative().optional(),
  calibratedDurationSec: z.number().positive(),
  inSync: z.boolean(),
  driftMs: z.number(),
  audioStatus: z.enum(["healthy", "silent", "clipped", "missing", "corrupted"]),
  videoStatus: z.enum(["ready", "generating", "missing", "error"]),
  healthLevel: z.enum(["optimal", "acceptable", "needs_attention"]),
  diagnostics: z.array(z.string()),
});
export type ShotMediaHealth = z.infer<typeof ShotMediaHealthSchema>;

export const ProjectMediaAuditReportSchema = z.object({
  projectId: z.string().min(1),
  totalShots: z.number().int().nonnegative(),
  healthyShotsCount: z.number().int().nonnegative(),
  warningShotsCount: z.number().int().nonnegative(),
  healthScore: z.number().min(0).max(100),
  overallStatus: z.enum(["flawless", "good", "warning", "critical"]),
  totalAudioDurationSec: z.number().nonnegative(),
  totalProjectDurationSec: z.number().nonnegative(),
  maxDriftMs: z.number(),
  shots: z.array(ShotMediaHealthSchema),
  summary: z.string(),
  auditedAt: z.number(),
});
export type ProjectMediaAuditReport = z.infer<typeof ProjectMediaAuditReportSchema>;

export const VerifyAudioDtoSchema = z.object({
  audioUrl: z.string().min(1, "音频 URL 或 Base64 不能为空"),
});
export type VerifyAudioDto = z.infer<typeof VerifyAudioDtoSchema>;

// ============================================================================
// 8. 角色视觉与风格一致性断言契约 (Visual & Character Consistency Types)
// ============================================================================

export const CharacterVisualAnchorSchema = z.object({
  characterName: z.string().min(1, "角色姓名不能为空"),
  gender: z.enum(["male", "female", "other"]).default("male"),
  appearanceFeatures: z.array(z.string()).default([]), // 如 ["黑色碎发", "剑眉星目", "英气少年"]
  wardrobe: z.array(z.string()).default([]),           // 如 ["玄青色修身劲装", "银色暗纹云纹护腕"]
  styleTokens: z.array(z.string()).default(["院线级电影写实光影", "高精写实国漫质感"]),
  negativePrompt: z.string().default("低质量, 畸形, 多余手指, 脸部融化, 现代服饰, 异色头发"),
  seed: z.number().int().optional(),
});
export type CharacterVisualAnchor = z.infer<typeof CharacterVisualAnchorSchema>;

export const VisualConsistencyReportSchema = z.object({
  characterName: z.string(),
  overallScore: z.number().min(0).max(100),
  featureRecall: z.number().min(0).max(1),
  retainedFeatures: z.array(z.string()),
  missingFeatures: z.array(z.string()),
  isConsistent: z.boolean(),
  originalPrompt: z.string(),
  correctedPrompt: z.string(),
  warnings: z.array(z.string()),
  scope: z.enum(["prompt_only", "image_only", "prompt_and_image", "image_integrity"]).default("prompt_only"),
  hasImageInput: z.boolean().default(false),
  imageAuditPassed: z.boolean().optional(),
  imageAuditDetails: z
    .object({
      hasVisualData: z.boolean(),
      format: z.string().optional(),
      byteSize: z.number().optional(),
      isCorruptedOrEmpty: z.boolean().optional(),
      perceptualHash: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});
export type VisualConsistencyReport = z.infer<typeof VisualConsistencyReportSchema>;

export const ProjectVisualAnchorsSchema = z.object({
  projectId: z.string().min(1),
  anchors: z.array(CharacterVisualAnchorSchema),
  updatedAt: z.number(),
});
export type ProjectVisualAnchors = z.infer<typeof ProjectVisualAnchorsSchema>;

// ============================================================================
// 9. 容灾与网络波动断点续跑契约 (Chaos & Resilience Types)
// ============================================================================

export const RetryOptionsSchema = z.object({
  maxRetries: z.number().int().positive().default(3),
  baseDelayMs: z.number().int().positive().default(300),
  backoffFactor: z.number().positive().default(2),
  jitter: z.boolean().default(true),
});
export type RetryOptions = z.infer<typeof RetryOptionsSchema>;

export const JobResumptionOptionsSchema = z.object({
  jobId: z.string().min(1),
  skipCompletedSteps: z.boolean().default(true),
  retryFailedStep: z.boolean().default(true),
});
export type JobResumptionOptions = z.infer<typeof JobResumptionOptionsSchema>;

export const StepResilienceReportSchema = z.object({
  stepId: z.string(),
  attempts: z.number().int().positive(),
  success: z.boolean(),
  recoveredFromFailure: z.boolean(),
  lastError: z.string().optional(),
  durationMs: z.number().nonnegative(),
});
export type StepResilienceReport = z.infer<typeof StepResilienceReportSchema>;

export const JobResumptionResultSchema = z.object({
  jobId: z.string(),
  skippedSteps: z.array(z.string()),
  executedSteps: z.array(z.string()),
  status: z.enum(["completed", "failed", "cancelled"]),
  error: z.string().optional(),
});
export type JobResumptionResult = z.infer<typeof JobResumptionResultSchema>;

// ============================================================================
// 10. 长篇多集连贯性与剧情伏笔检查契约 (Multi-Episode Continuity Types)
// ============================================================================

export const CharacterLoreStateSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["alive", "injured", "deceased"]).default("alive"),
  realm: z.string().default("凡胎境"),
  faction: z.string().default("中立"),
  notes: z.string().optional(),
});
export type CharacterLoreState = z.infer<typeof CharacterLoreStateSchema>;
export type CharacterLoreStateInput = z.input<typeof CharacterLoreStateSchema>;

export const CriticalPropSchema = z.object({
  propName: z.string().min(1),
  owner: z.string().min(1),
  status: z.enum(["held", "lost", "transferred"]).default("held"),
  notes: z.string().optional(),
});
export type CriticalProp = z.infer<typeof CriticalPropSchema>;

export const PlotHookSchema = z.object({
  hookId: z.string().min(1),
  description: z.string().min(1),
  introducedInEpisode: z.number().int().positive(),
  resolvedInEpisode: z.number().int().positive().optional(),
  isResolved: z.boolean().default(false),
  criticalLevel: z.enum(["high", "medium", "low"]).default("medium"),
});
export type PlotHook = z.infer<typeof PlotHookSchema>;
export type PlotHookInput = z.input<typeof PlotHookSchema>;

export const ContinuityAuditReportSchema = z.object({
  projectId: z.string().min(1),
  episodeIndex: z.number().int().positive(),
  continuityScore: z.number().min(0).max(100),
  isPassed: z.boolean(),
  violations: z.array(z.string()),
  warnings: z.array(z.string()),
  activeHooks: z.array(PlotHookSchema),
  inheritedHooks: z.array(PlotHookSchema),
  auditedAt: z.number(),
});
export type ContinuityAuditReport = z.infer<typeof ContinuityAuditReportSchema>;

export const ProjectContinuityLedgerSchema = z.object({
  projectId: z.string().min(1),
  characters: z.array(CharacterLoreStateSchema),
  props: z.array(CriticalPropSchema),
  hooks: z.array(PlotHookSchema),
  updatedAt: z.number(),
});
export type ProjectContinuityLedger = z.infer<typeof ProjectContinuityLedgerSchema>;

// ============================================================================
// 12. 分镜重排与全片导出契约 (Reorder & Master Export DTOs)
// ============================================================================

export const ReorderShotsDtoSchema = z.object({
  shotIds: z.array(z.string().min(1)).min(1),
});
export type ReorderShotsDto = z.infer<typeof ReorderShotsDtoSchema>;

export const ExportProjectDtoSchema = z.object({
  includeSubtitles: z.boolean().optional().default(true),
  format: z.enum(["mp4", "vtt", "all"]).optional().default("all"),
});
export type ExportProjectDto = z.infer<typeof ExportProjectDtoSchema>;

export const ExportProjectResultSchema = z.object({
  success: z.boolean(),
  projectId: z.string(),
  totalDuration: z.number(),
  shotCount: z.number(),
  videoUrl: z.string().optional(),
  vttUrl: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  localVideoPath: z.string().optional(),
  localVttPath: z.string().optional(),
  error: z.string().optional(),
});
export type ExportProjectResult = z.infer<typeof ExportProjectResultSchema>;

