import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Context } from "cordis";
import {
  DramaProjectSchema,
  StoryboardShotSchema,
  PipelineJobSchema,
  JobStepRecordSchema,
  DramaEvaluationSchema,
  type DramaProject,
  type StoryboardShot,
  type PipelineJob,
  type JobStepRecord,
  type CreateProjectDto,
  type DramaEvaluation,
} from "../core/types.js";

export class DatabaseService {
  private db: Database.Database;

  constructor(ctx: Context, dbPath?: string) {
    let resolvedDbPath = dbPath;
    if (!resolvedDbPath) {
      if (fs.existsSync(path.resolve(process.cwd(), "./data/cinedrama.sqlite"))) {
        resolvedDbPath = "./data/cinedrama.sqlite";
      } else if (fs.existsSync(path.resolve(process.cwd(), "./data/toonflow.sqlite"))) {
        resolvedDbPath = "./data/toonflow.sqlite";
      } else {
        resolvedDbPath = "./data/cinedrama.sqlite";
      }
    }
    const resolvedPath = path.resolve(process.cwd(), resolvedDbPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.initTables();

    ctx.reflect.provide("db", this);
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        aspect_ratio TEXT NOT NULL DEFAULT '16:9',
        default_text_model TEXT,
        default_image_model TEXT,
        default_video_model TEXT,
        default_tts_model TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS storyboard_shots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_index INTEGER NOT NULL DEFAULT 1,
        shot_index INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        dialogue TEXT,
        voice_role TEXT,
        duration REAL NOT NULL DEFAULT 3.0,
        status TEXT NOT NULL DEFAULT 'draft',
        image_url TEXT,
        video_url TEXT,
        audio_url TEXT,
        error TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        input_values TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pipeline_jobs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT NOT NULL DEFAULT '{}',
        output TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pipeline_job_steps (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_snapshot TEXT,
        output_snapshot TEXT,
        error TEXT,
        duration_ms INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_evaluations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        overall_score REAL NOT NULL,
        tier TEXT NOT NULL,
        verdict TEXT NOT NULL,
        highlights TEXT NOT NULL,
        improvements TEXT NOT NULL,
        dimensions TEXT NOT NULL,
        judge_model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
  }

  public createProject(project: CreateProjectDto): DramaProject {
    const now = Date.now();
    const candidate = {
      ...project,
      id: project.id || `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };
    const full = DramaProjectSchema.parse(candidate);

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, title, description, aspect_ratio, default_text_model, default_image_model, default_video_model, default_tts_model, created_at, updated_at)
      VALUES (@id, @title, @description, @aspectRatio, @defaultTextModel, @defaultImageModel, @defaultVideoModel, @defaultTTSModel, @createdAt, @updatedAt)
    `);

    stmt.run({
      id: full.id,
      title: full.title,
      description: full.description || null,
      aspectRatio: full.aspectRatio,
      defaultTextModel: full.defaultTextModel || null,
      defaultImageModel: full.defaultImageModel || null,
      defaultVideoModel: full.defaultVideoModel || null,
      defaultTTSModel: full.defaultTTSModel || null,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
    });

    return full;
  }

  public listProjects(): DramaProject[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      aspectRatio: r.aspect_ratio,
      defaultTextModel: r.default_text_model || undefined,
      defaultImageModel: r.default_image_model || undefined,
      defaultVideoModel: r.default_video_model || undefined,
      defaultTTSModel: r.default_tts_model || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public getProject(id: string): DramaProject | null {
    const r = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      aspectRatio: r.aspect_ratio,
      defaultTextModel: r.default_text_model || undefined,
      defaultImageModel: r.default_image_model || undefined,
      defaultVideoModel: r.default_video_model || undefined,
      defaultTTSModel: r.default_tts_model || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  // --- Storyboard Shot 操作 ---
  public createShot(shot: Omit<StoryboardShot, "updatedAt">): StoryboardShot {
    const now = Date.now();
    const candidate = { ...shot, updatedAt: now };
    const full = StoryboardShotSchema.parse(candidate);

    const stmt = this.db.prepare(`
      INSERT INTO storyboard_shots (id, project_id, episode_index, shot_index, prompt, dialogue, voice_role, duration, status, image_url, video_url, audio_url, error, updated_at)
      VALUES (@id, @projectId, @episodeIndex, @shotIndex, @prompt, @dialogue, @voiceRole, @duration, @status, @imageUrl, @videoUrl, @audioUrl, @error, @updatedAt)
    `);

    stmt.run({
      id: full.id,
      projectId: full.projectId,
      episodeIndex: full.episodeIndex,
      shotIndex: full.shotIndex,
      prompt: full.prompt,
      dialogue: full.dialogue || null,
      voiceRole: full.voiceRole || null,
      duration: full.duration,
      status: full.status,
      imageUrl: full.imageUrl || null,
      videoUrl: full.videoUrl || null,
      audioUrl: full.audioUrl || null,
      error: full.error || null,
      updatedAt: full.updatedAt,
    });

    return full;
  }

  public listShotsByProject(projectId: string): StoryboardShot[] {
    const rows = this.db.prepare("SELECT * FROM storyboard_shots WHERE project_id = ? ORDER BY episode_index ASC, shot_index ASC").all(projectId) as any[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      episodeIndex: r.episode_index,
      shotIndex: r.shot_index,
      prompt: r.prompt,
      dialogue: r.dialogue || undefined,
      voiceRole: r.voice_role || undefined,
      duration: r.duration,
      status: r.status,
      imageUrl: r.image_url || undefined,
      videoUrl: r.video_url || undefined,
      audioUrl: r.audio_url || undefined,
      error: r.error || undefined,
      updatedAt: r.updated_at,
    }));
  }

  public getShot(id: string): StoryboardShot | null {
    const r = this.db.prepare("SELECT * FROM storyboard_shots WHERE id = ?").get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      projectId: r.project_id,
      episodeIndex: r.episode_index,
      shotIndex: r.shot_index,
      prompt: r.prompt,
      dialogue: r.dialogue || undefined,
      voiceRole: r.voice_role || undefined,
      duration: r.duration,
      status: r.status,
      imageUrl: r.image_url || undefined,
      videoUrl: r.video_url || undefined,
      audioUrl: r.audio_url || undefined,
      error: r.error || undefined,
      updatedAt: r.updated_at,
    };
  }

  public updateShotMedia(
    id: string,
    updates: {
      imageUrl?: string;
      videoUrl?: string;
      audioUrl?: string;
      duration?: number;
      status?: StoryboardShot["status"];
      error?: string;
    }
  ): void {
    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [Date.now()];

    if (updates.imageUrl !== undefined) {
      fields.push("image_url = ?");
      values.push(updates.imageUrl);
    }
    if (updates.videoUrl !== undefined) {
      fields.push("video_url = ?");
      values.push(updates.videoUrl);
    }
    if (updates.audioUrl !== undefined) {
      fields.push("audio_url = ?");
      values.push(updates.audioUrl);
    }
    if (updates.duration !== undefined) {
      fields.push("duration = ?");
      values.push(updates.duration);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.error !== undefined) {
      fields.push("error = ?");
      values.push(updates.error);
    }

    values.push(id);
    this.db.prepare(`UPDATE storyboard_shots SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  public listShotsByStatus(projectId: string, status: string): StoryboardShot[] {
    const rows = this.db
      .prepare("SELECT * FROM storyboard_shots WHERE project_id = ? AND status = ? ORDER BY episode_index ASC, shot_index ASC")
      .all(projectId, status) as any[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      episodeIndex: r.episode_index,
      shotIndex: r.shot_index,
      prompt: r.prompt,
      dialogue: r.dialogue || undefined,
      voiceRole: r.voice_role || undefined,
      duration: r.duration,
      status: r.status,
      imageUrl: r.image_url || undefined,
      videoUrl: r.video_url || undefined,
      audioUrl: r.audio_url || undefined,
      error: r.error || undefined,
      updatedAt: r.updated_at,
    }));
  }

  // --- Pipeline Jobs 操作 ---
  public createJob(job: Omit<PipelineJob, "createdAt" | "updatedAt">): PipelineJob {
    const now = Date.now();
    const candidate = { ...job, createdAt: now, updatedAt: now };
    const full = PipelineJobSchema.parse(candidate);
    this.db.prepare(`
      INSERT INTO pipeline_jobs (id, workflow_id, project_id, status, input, output, error, created_at, updated_at)
      VALUES (@id, @workflowId, @projectId, @status, @input, @output, @error, @createdAt, @updatedAt)
    `).run({
      id: full.id,
      workflowId: full.workflowId,
      projectId: full.projectId,
      status: full.status,
      input: JSON.stringify(full.input || {}),
      output: JSON.stringify(full.output || {}),
      error: full.error || null,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
    });
    return full;
  }

  public updateJob(id: string, updates: Partial<Pick<PipelineJob, "status" | "output" | "error">>): void {
    const sets: string[] = ["updated_at = ?"];
    const params: any[] = [Date.now()];

    if (updates.status) {
      sets.push("status = ?");
      params.push(updates.status);
    }
    if (updates.output) {
      sets.push("output = ?");
      params.push(JSON.stringify(updates.output));
    }
    if (updates.error !== undefined) {
      sets.push("error = ?");
      params.push(updates.error);
    }

    params.push(id);
    this.db.prepare(`UPDATE pipeline_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  public getJob(id: string): PipelineJob | null {
    const r = this.db.prepare("SELECT * FROM pipeline_jobs WHERE id = ?").get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      workflowId: r.workflow_id,
      projectId: r.project_id,
      status: r.status,
      input: JSON.parse(r.input || "{}"),
      output: JSON.parse(r.output || "{}"),
      error: r.error || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public listJobs(projectId?: string): PipelineJob[] {
    const query = projectId
      ? "SELECT * FROM pipeline_jobs WHERE project_id = ? ORDER BY created_at DESC"
      : "SELECT * FROM pipeline_jobs ORDER BY created_at DESC";
    const rows = (projectId ? this.db.prepare(query).all(projectId) : this.db.prepare(query).all()) as any[];
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflow_id,
      projectId: r.project_id,
      status: r.status,
      input: JSON.parse(r.input || "{}"),
      output: JSON.parse(r.output || "{}"),
      error: r.error || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // --- Pipeline Job Steps 操作 ---
  public createJobStep(step: Omit<JobStepRecord, "updatedAt">): JobStepRecord {
    const now = Date.now();
    const candidate = { ...step, updatedAt: now };
    const full = JobStepRecordSchema.parse(candidate);
    this.db.prepare(`
      INSERT INTO pipeline_job_steps (id, job_id, step_id, status, input_snapshot, output_snapshot, error, duration_ms, updated_at)
      VALUES (@id, @jobId, @stepId, @status, @inputSnapshot, @outputSnapshot, @error, @durationMs, @updatedAt)
    `).run({
      id: full.id,
      jobId: full.jobId,
      stepId: full.stepId,
      status: full.status,
      inputSnapshot: full.inputSnapshot ? JSON.stringify(full.inputSnapshot) : null,
      outputSnapshot: full.outputSnapshot ? JSON.stringify(full.outputSnapshot) : null,
      error: full.error || null,
      durationMs: full.durationMs || null,
      updatedAt: full.updatedAt,
    });
    return full;
  }

  public updateJobStep(id: string, updates: Partial<Pick<JobStepRecord, "status" | "outputSnapshot" | "error" | "durationMs">>): void {
    const sets: string[] = ["updated_at = ?"];
    const params: any[] = [Date.now()];

    if (updates.status) {
      sets.push("status = ?");
      params.push(updates.status);
    }
    if (updates.outputSnapshot) {
      sets.push("output_snapshot = ?");
      params.push(JSON.stringify(updates.outputSnapshot));
    }
    if (updates.error !== undefined) {
      sets.push("error = ?");
      params.push(updates.error);
    }
    if (updates.durationMs !== undefined) {
      sets.push("duration_ms = ?");
      params.push(updates.durationMs);
    }

    params.push(id);
    this.db.prepare(`UPDATE pipeline_job_steps SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  public listJobSteps(jobId: string): JobStepRecord[] {
    const rows = this.db.prepare("SELECT * FROM pipeline_job_steps WHERE job_id = ? ORDER BY updated_at ASC").all(jobId) as any[];
    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      stepId: r.step_id,
      status: r.status,
      inputSnapshot: r.input_snapshot ? JSON.parse(r.input_snapshot) : undefined,
      outputSnapshot: r.output_snapshot ? JSON.parse(r.output_snapshot) : undefined,
      error: r.error || undefined,
      durationMs: r.duration_ms || undefined,
      updatedAt: r.updated_at,
    }));
  }

  public saveEvaluation(evaluation: DramaEvaluation): DramaEvaluation {
    const valid = DramaEvaluationSchema.parse(evaluation);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO project_evaluations (id, project_id, overall_score, tier, verdict, highlights, improvements, dimensions, judge_model, created_at)
      VALUES (@id, @projectId, @overallScore, @tier, @verdict, @highlights, @improvements, @dimensions, @judgeModel, @createdAt)
    `);

    stmt.run({
      id: valid.id,
      projectId: valid.projectId,
      overallScore: valid.overallScore,
      tier: valid.tier,
      verdict: valid.verdict,
      highlights: JSON.stringify(valid.highlights),
      improvements: JSON.stringify(valid.improvements),
      dimensions: JSON.stringify(valid.dimensions),
      judgeModel: valid.judgeModel,
      createdAt: valid.createdAt,
    });

    return valid;
  }

  public getLatestEvaluation(projectId: string): DramaEvaluation | null {
    const row = this.db
      .prepare("SELECT * FROM project_evaluations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(projectId) as any;
    if (!row) return null;

    return DramaEvaluationSchema.parse({
      id: row.id,
      projectId: row.project_id,
      overallScore: row.overall_score,
      tier: row.tier,
      verdict: row.verdict,
      highlights: JSON.parse(row.highlights),
      improvements: JSON.parse(row.improvements),
      dimensions: JSON.parse(row.dimensions),
      judgeModel: row.judge_model,
      createdAt: row.created_at,
    });
  }

  public reorderShots(projectId: string, shotIdsInOrder: string[]): StoryboardShot[] {
    const updateStmt = this.db.prepare("UPDATE storyboard_shots SET shot_index = ?, updated_at = ? WHERE id = ? AND project_id = ?");
    const now = Date.now();

    const runTransaction = this.db.transaction((ids: string[]) => {
      ids.forEach((id, idx) => {
        updateStmt.run(idx + 1, now, id, projectId);
      });
    });

    runTransaction(shotIdsInOrder);
    return this.listShotsByProject(projectId);
  }

  public close() {
    this.db.close();
  }
}
