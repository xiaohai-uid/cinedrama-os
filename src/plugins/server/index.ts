import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { Context } from "cordis";
import { type ZodError } from "zod";
import {
  CreateProjectDtoSchema,
  CreatePipelineJobDtoSchema,
  ActiveModelDtoSchema,
  ProviderConfigDtoSchema,
  TestProviderDtoSchema,
  GenerateTextDtoSchema,
  GenerateImageDtoSchema,
  GenerateTTSDtoSchema,
  GenerateVideoDtoSchema,
  GenerateStructuredDtoSchema,
  StorySkeletonSchema,
  ScriptDialogueSchema,
  StoryboardPlanningSchema,
  EvaluateDramaDtoSchema,
  VerifyAudioDtoSchema,
  ReorderShotsDtoSchema,
  ExportProjectDtoSchema,
} from "../../core/types.js";
import { exportFullEpisode } from "../../services/video-generator.js";

export interface ServerPluginConfig {
  host?: string;
  port?: number;
}

export function apply(ctx: Context, config: ServerPluginConfig = {}) {
  const host = config.host || "127.0.0.1";
  const port = config.port || 3080;

  const server = http.createServer(async (req, res) => {
    // 跨域设置
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    const sendJson = (status: number, data: any) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };

    const sendValidationError = (error: ZodError) => {
      const firstIssue = error.errors[0];
      const message = firstIssue ? `${firstIssue.path.join(".") || "payload"}: ${firstIssue.message}` : "Validation failed";
      return sendJson(400, {
        error: message,
        details: error.format(),
      });
    };

    const readBody = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error("Invalid JSON body"));
          }
        });
        req.on("error", reject);
      });
    };

    try {
      // 1. GET /api/health
      if (pathname === "/api/health" && req.method === "GET") {
        const providers = ctx.providers.listProviders();
        const metrics = ctx.rateLimiter.getMetrics();
        return sendJson(200, {
          status: "ok",
          version: "0.1.0",
          arch: "cordis-microkernel",
          uptime: process.uptime(),
          providerCount: providers.length,
          metrics,
        });
      }

      // 2. GET /api/providers
      if (pathname === "/api/providers" && req.method === "GET") {
        const providers = ctx.providers.listProviders().map((p: any) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          models: p.models,
          config: typeof p.getConfig === "function" ? p.getConfig() : undefined,
        }));
        const models = ctx.providers.listAllModels();
        const activeTextModel = typeof ctx.providers.getActiveTextModel === "function" ? ctx.providers.getActiveTextModel() : "deepseek-v4-flash";
        return sendJson(200, { providers, models, activeTextModel });
      }

      // 2.1 POST /api/providers/active
      if (pathname === "/api/providers/active" && req.method === "POST") {
        const body = await readBody();
        const parsed = ActiveModelDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        ctx.providers.setActiveTextModel(parsed.data.model);
        return sendJson(200, { success: true, activeTextModel: ctx.providers.getActiveTextModel() });
      }

      // 2.2 POST /api/providers/test
      if (pathname === "/api/providers/test" && req.method === "POST") {
        const body = await readBody();
        const parsed = TestProviderDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const result = await ctx.providers.pingProvider(parsed.data.providerId);
        return sendJson(200, result);
      }

      // 2.3 POST /api/providers/config
      if (pathname === "/api/providers/config" && req.method === "POST") {
        const body = await readBody();
        const parsed = ProviderConfigDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const provider = ctx.providers.get(parsed.data.providerId);
        if (provider && typeof (provider as any).updateConfig === "function") {
          (provider as any).updateConfig({ apiKey: parsed.data.apiKey, baseUrl: parsed.data.baseUrl });
          return sendJson(200, { success: true, message: "供应商配置已更新" });
        }
        return sendJson(404, { error: "供应商不存在或不支持动态配置" });
      }

      // 3. GET /api/projects
      if (pathname === "/api/projects" && req.method === "GET") {
        const projects = ctx.db.listProjects();
        return sendJson(200, { projects });
      }

      // 4. POST /api/projects
      if (pathname === "/api/projects" && req.method === "POST") {
        const body = await readBody();
        const parsed = CreateProjectDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const project = ctx.db.createProject(parsed.data);
        return sendJson(201, { project });
      }

      // 5. POST /api/generate/text
      if (pathname === "/api/generate/text" && req.method === "POST") {
        const body = await readBody();
        const parsed = GenerateTextDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const result = await ctx.providers.generateText(parsed.data);
        return sendJson(200, result);
      }

      // 6. POST /api/generate/image
      if (pathname === "/api/generate/image" && req.method === "POST") {
        const body = await readBody();
        const parsed = GenerateImageDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const result = await ctx.providers.generateImage(parsed.data);
        return sendJson(200, result);
      }

      // 6.1 POST /api/generate/tts
      if (pathname === "/api/generate/tts" && req.method === "POST") {
        const body = await readBody();
        const parsed = GenerateTTSDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const result = await ctx.providers.generateTTS({
          model: parsed.data.model,
          text: (parsed.data.text || parsed.data.prompt)!,
          voice: parsed.data.voice,
          speed: parsed.data.speed,
          pitch: parsed.data.pitch,
        });
        return sendJson(200, result);
      }

      // 6.2 POST /api/generate/video
      if (pathname === "/api/generate/video" && req.method === "POST") {
        const body = await readBody();
        const parsed = GenerateVideoDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const result = await ctx.providers.generateVideo(parsed.data);
        return sendJson(200, result);
      }

      // 6.3 POST /api/generate/structured
      if (pathname === "/api/generate/structured" && req.method === "POST") {
        const body = await readBody();
        const parsed = GenerateStructuredDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }

        const { targetType, prompt, model, systemPrompt, temperature } = parsed.data;
        let schema: any = StorySkeletonSchema;
        let fallback: any = {
          skeleton: "默认故事骨架",
          coreConflict: "核心矛盾",
          threeActs: ["起", "承", "转合"],
        };

        if (targetType === "script") {
          schema = ScriptDialogueSchema;
          fallback = {
            episodeIndex: 1,
            title: "默认短剧剧本",
            dialogueLines: [{ role: "旁白", line: "故事开始..." }],
          };
        } else if (targetType === "storyboard") {
          schema = StoryboardPlanningSchema;
          fallback = {
            shots: [
              {
                shotIndex: 1,
                cameraAngle: "全景",
                prompt: "默认分镜画面",
                dialogue: "开场",
                voiceRole: "旁白",
                duration: 3.5,
              },
            ],
          };
        }

        const result = await ctx.providers.generateStructured({
          model,
          prompt,
          systemPrompt,
          temperature,
          schema,
          fallback,
        });

        return sendJson(200, result);
      }

      // 6.3 GET /api/shots/:id
      if (pathname.startsWith("/api/shots/") && req.method === "GET") {
        const shotId = pathname.replace("/api/shots/", "");
        const shot = ctx.db.getShot(shotId);
        if (!shot) {
          return sendJson(404, { error: "Shot not found" });
        }
        return sendJson(200, { shot });
      }

      // 6.4 POST /api/evals/drama
      if (pathname === "/api/evals/drama" && req.method === "POST") {
        const body = await readBody();
        const parsed = EvaluateDramaDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const evaluation = await ctx.evaluation.evaluateDrama(parsed.data);
        return sendJson(200, { evaluation });
      }

      // 6.5 GET /api/projects/:id/eval
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/eval") && req.method === "GET") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const evaluation = ctx.db.getLatestEvaluation(projectId);
        if (!evaluation) {
          return sendJson(404, { error: "No evaluation found for project" });
        }
        return sendJson(200, { evaluation });
      }

      // 6.6 GET /api/projects/:id/media-health
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/media-health") && req.method === "GET") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const report = ctx.mediaIntegrity.auditProjectMedia(projectId);
        return sendJson(200, { report });
      }

      // 6.7 POST /api/media/verify-audio
      if (pathname === "/api/media/verify-audio" && req.method === "POST") {
        const body = await readBody();
        const parsed = VerifyAudioDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const report = ctx.mediaIntegrity.validateAudio(parsed.data.audioUrl);
        return sendJson(200, { report });
      }

      // 6.8 GET /api/projects/:id/visual-anchors
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/visual-anchors") && req.method === "GET") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const visualConsistency = (ctx.root as any)?.visualConsistency || (ctx as any).reflect?.get?.("visualConsistency");
        const anchors = visualConsistency ? visualConsistency.getCharacterAnchors(projectId) : [];
        return sendJson(200, { anchors });
      }

      // 6.9 GET /api/projects/:id/continuity
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/continuity") && req.method === "GET") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const continuity = (ctx.root as any)?.continuity || (ctx as any).reflect?.get?.("continuity");
        const ledger = continuity ? continuity.getOrCreateLedger(projectId) : { projectId, characters: [], props: [], hooks: [] };
        return sendJson(200, { ledger });
      }

      // 6.10 POST /api/projects/:id/shots/reorder
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/shots/reorder") && req.method === "POST") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const body = await readBody();
        const parsed = ReorderShotsDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const updatedShots = ctx.db.reorderShots(projectId, parsed.data.shotIds);
        return sendJson(200, { success: true, shots: updatedShots });
      }

      // 6.11 POST /api/projects/:id/export
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/export") && req.method === "POST") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const body = await readBody();
        const parsed = ExportProjectDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        const shots = ctx.db.listShotsByProject(projectId);
        const exportResult = exportFullEpisode(shots, projectId, parsed.data);
        return sendJson(200, { export: exportResult });
      }

      // 6.12 GET /api/projects/:id/shots
      if (pathname.startsWith("/api/projects/") && pathname.endsWith("/shots") && req.method === "GET") {
        const parts = pathname.split("/");
        const projectId = parts[3];
        const shots = ctx.db.listShotsByProject(projectId);
        return sendJson(200, { shots });
      }

      // 7. GET /api/pipeline/steps
      if (pathname === "/api/pipeline/steps" && req.method === "GET") {
        const steps = ctx.pipeline.listSteps().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          dependsOn: s.dependsOn || [],
        }));
        return sendJson(200, { steps });
      }

      // 8. GET /api/pipeline/workflows
      if (pathname === "/api/pipeline/workflows" && req.method === "GET") {
        const workflows = ctx.pipeline.listWorkflows();
        return sendJson(200, { workflows });
      }

      // 9. POST /api/pipeline/jobs (启动任务)
      if (pathname === "/api/pipeline/jobs" && req.method === "POST") {
        const body = await readBody();
        const parsed = CreatePipelineJobDtoSchema.safeParse(body);
        if (!parsed.success) {
          return sendValidationError(parsed.error);
        }
        // 启动任务 (异步执行)
        ctx.pipeline.createAndRunJob(parsed.data).catch((e: any) => console.error(`[Job Error] ${e.message}`));

        // 等待微任务落表
        await new Promise((r) => setTimeout(r, 60));
        const jobs = ctx.db.listJobs(parsed.data.projectId);
        const currentJob = jobs[0];

        return sendJson(202, {
          message: "Job submitted",
          job: currentJob,
        });
      }

      // 10. GET /api/pipeline/jobs (列表)
      if (pathname === "/api/pipeline/jobs" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId") || undefined;
        const jobs = ctx.db.listJobs(projectId);
        return sendJson(200, { jobs });
      }

      // 11. GET /api/pipeline/jobs/:id (单任务详情与步骤历史)
      if (pathname.startsWith("/api/pipeline/jobs/") && !pathname.endsWith("/cancel") && req.method === "GET") {
        const jobId = pathname.replace("/api/pipeline/jobs/", "");
        const job = ctx.db.getJob(jobId);
        if (!job) {
          return sendJson(404, { error: "Job not found" });
        }
        const steps = ctx.db.listJobSteps(jobId);
        return sendJson(200, { job, steps });
      }

      // 12. POST /api/pipeline/jobs/:id/cancel
      if (pathname.startsWith("/api/pipeline/jobs/") && pathname.endsWith("/cancel") && req.method === "POST") {
        const jobId = pathname.replace("/api/pipeline/jobs/", "").replace("/cancel", "");
        ctx.pipeline.cancelJob(jobId);
        return sendJson(200, { ok: true, message: `Job ${jobId} cancellation requested` });
      }

      // 12.1 POST /api/pipeline/jobs/:id/resume (断点续跑)
      if (pathname.startsWith("/api/pipeline/jobs/") && pathname.endsWith("/resume") && req.method === "POST") {
        const jobId = pathname.replace("/api/pipeline/jobs/", "").replace("/resume", "");
        try {
          const result = await ctx.pipeline.resumeJob(jobId);
          return sendJson(200, { result });
        } catch (e: any) {
          return sendJson(400, { error: e.message });
        }
      }

      // 13. 静态文件托管 (面向创作者的 Studio Web 控制台)
      if (!pathname.startsWith("/api/")) {
        const publicDir = path.resolve(process.cwd(), "public");
        const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
        const filePath = path.resolve(publicDir, relativePath);

        // 防御目录穿越
        if (filePath.startsWith(publicDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".mp4": "video/mp4",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { "Content-Type": contentType });
          res.end(content);
          return;
        }

        // SPA 降级路由
        const indexPath = path.resolve(publicDir, "index.html");
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(content);
          return;
        }
      }

      // 404
      return sendJson(404, { error: "Not Found", pathname });
    } catch (err: any) {
      console.error(`[Server] 处理异常: ${err.message}`);
      return sendJson(500, { error: err.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`[CineDrama Server] 服务已启动: http://${host}:${port}`);
  });

  ctx.events.on("dispose", () => {
    server.close();
    console.log("[CineDrama Server] 服务已安全关闭");
  });
}

export default apply;
