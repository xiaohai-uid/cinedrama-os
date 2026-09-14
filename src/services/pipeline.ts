import type { Context } from "cordis";
import {
  CreatePipelineJobDtoSchema,
  type PipelineStep,
  type PipelineWorkflow,
  type PipelineJob,
  type JobStepRecord,
  type StepExecutionContext,
  type CreatePipelineJobDto,
  type JobResumptionOptions,
  type JobResumptionResult,
} from "../core/types.js";

export class PipelineService {
  private steps: Map<string, PipelineStep> = new Map();
  private workflows: Map<string, PipelineWorkflow> = new Map();
  private cancelledJobs: Set<string> = new Set();
  private ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
    ctx.reflect.provide("pipeline", this);
  }

  // ==========================================================================
  // 1. 节点与工作流注册
  // ==========================================================================

  public registerStep(step: PipelineStep) {
    if (this.steps.has(step.id)) {
      console.log(`[Pipeline] 替换已有流程节点: [${step.id}] (${step.name})`);
    } else {
      console.log(`[Pipeline] 注册新流程节点: [${step.id}] (${step.name})`);
    }
    this.steps.set(step.id, step);
    this.ctx.events.emit("pipeline/step/registered", step);
  }

  public unregisterStep(stepId: string) {
    if (this.steps.delete(stepId)) {
      console.log(`[Pipeline] 移除流程节点: [${stepId}]`);
    }
  }

  public getStep(stepId: string): PipelineStep | undefined {
    return this.steps.get(stepId);
  }

  public listSteps(): PipelineStep[] {
    return Array.from(this.steps.values());
  }

  public registerWorkflow(workflow: PipelineWorkflow) {
    this.workflows.set(workflow.id, workflow);
    console.log(`[Pipeline] 注册工作流: [${workflow.id}] (${workflow.name}, 包含 ${workflow.stepIds.length} 个节点)`);
  }

  public getWorkflow(workflowId: string): PipelineWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  public listWorkflows(): PipelineWorkflow[] {
    return Array.from(this.workflows.values());
  }

  // ==========================================================================
  // 2. 有向无环图 (DAG) 拓扑排序与依赖校验
  // ==========================================================================

  /**
   * 使用 Kahn 算法对 Workflow 的节点执行拓扑排序并检测环形依赖
   */
  public topologicalSort(stepIds: string[]): PipelineStep[] {
    const inDegree: Map<string, number> = new Map();
    const adjList: Map<string, string[]> = new Map();

    // 校验节点是否都已注册
    for (const id of stepIds) {
      if (!this.steps.has(id)) {
        throw new Error(`工作流包含未注册的步骤节点: [${id}]`);
      }
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    // 建立依赖图 (若 A dependsOn B，则存在 B -> A 的依赖边)
    for (const id of stepIds) {
      const step = this.steps.get(id)!;
      const deps = step.dependsOn || [];
      for (const dep of deps) {
        if (stepIds.includes(dep)) {
          adjList.get(dep)!.push(id);
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
      }
    }

    // 将所有入度为 0 的节点加入队列
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sortedIds: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedIds.push(current);

      for (const neighbor of adjList.get(current) || []) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 环形依赖检测
    if (sortedIds.length !== stepIds.length) {
      throw new Error(`工作流存在循环依赖 (Circular Dependency)，无法执行: [${stepIds.join(" -> ")}]`);
    }

    return sortedIds.map((id) => this.steps.get(id)!);
  }

  // ==========================================================================
  // 3. 任务调度与执行引擎
  // ==========================================================================

  public async createAndRunJob(params: CreatePipelineJobDto): Promise<PipelineJob> {
    const validated = CreatePipelineJobDtoSchema.parse(params);
    const workflow = this.workflows.get(validated.workflowId);
    if (!workflow) {
      throw new Error(`找不到指定工作流: [${validated.workflowId}]`);
    }

    // 1. 校验并计算执行顺序
    const stepsToRun = this.topologicalSort(workflow.stepIds);

    // 2. 创建 Job 持久化记录
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job = this.ctx.db.createJob({
      id: jobId,
      workflowId: validated.workflowId,
      projectId: validated.projectId,
      status: "running",
      input: validated.input,
      output: {},
    });

    console.log(`[Pipeline] 启动漫剧生成任务: [${jobId}] (工作流: ${workflow.name}, 共 ${stepsToRun.length} 步)`);
    this.ctx.events.emit("pipeline/job/started", { jobId, workflowId: workflow.id, projectId: validated.projectId });

    // 异步执行完整任务流
    const accumulatedOutputs: Record<string, any> = {};

    try {
      for (const step of stepsToRun) {
        // 检查取消信号
        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          this.ctx.db.updateJob(jobId, { status: "cancelled" });
          this.ctx.events.emit("pipeline/job/cancelled", { jobId });
          return this.ctx.db.getJob(jobId)!;
        }

        // 创建步骤记录
        const stepRecordId = `step_${jobId}_${step.id}`;
        this.ctx.db.createJobStep({
          id: stepRecordId,
          jobId,
          stepId: step.id,
          status: "running",
          inputSnapshot: {
            jobInput: params.input,
            previousOutputs: accumulatedOutputs,
          },
        });

        console.log(`[Pipeline] 开始执行步骤: [${step.id}] ${step.name}...`);
        this.ctx.events.emit("pipeline/step/started", { jobId, stepId: step.id });

        const startTime = Date.now();
        const stepContext: StepExecutionContext = {
          jobId,
          projectId: params.projectId,
          stepId: step.id,
          input: params.input,
          previousOutputs: accumulatedOutputs,
          log: (msg: string) => {
            console.log(`[Pipeline][${step.id}] ${msg}`);
          },
          reportProgress: (percent: number, message?: string) => {
            this.ctx.events.emit("pipeline/step/progress", {
              jobId,
              stepId: step.id,
              percent,
              message,
            });
          },
        };

        // 执行具体节点逻辑
        const stepOutput = await step.execute(stepContext);
        const durationMs = Date.now() - startTime;

        accumulatedOutputs[step.id] = stepOutput;

        // 更新步骤完成状态
        this.ctx.db.updateJobStep(stepRecordId, {
          status: "completed",
          outputSnapshot: stepOutput,
          durationMs,
        });

        console.log(`[Pipeline] 步骤完成: [${step.id}] (耗时: ${durationMs}ms)`);
        this.ctx.events.emit("pipeline/step/completed", {
          jobId,
          stepId: step.id,
          durationMs,
          output: stepOutput,
        });
      }

      // 3. 所有步骤完成，归档 Job
      this.ctx.db.updateJob(jobId, {
        status: "completed",
        output: accumulatedOutputs,
      });

      console.log(`[Pipeline] 任务完成: [${jobId}]`);
      this.ctx.events.emit("pipeline/job/completed", {
        jobId,
        output: accumulatedOutputs,
      });

      return this.ctx.db.getJob(jobId)!;
    } catch (err: any) {
      console.error(`[Pipeline] 任务失败 [${jobId}]: ${err.message}`);
      this.ctx.db.updateJob(jobId, {
        status: "failed",
        error: err.message,
        output: accumulatedOutputs,
      });

      this.ctx.events.emit("pipeline/job/failed", {
        jobId,
        error: err.message,
      });

      return this.ctx.db.getJob(jobId)!;
    }
  }

  public cancelJob(jobId: string) {
    this.cancelledJobs.add(jobId);
  }

  /**
   * 断点续跑：跳过已成功的历史步骤，从失败或挂起节点接续执行
   */
  public async resumeJob(jobId: string, options?: JobResumptionOptions): Promise<JobResumptionResult> {
    const job = this.ctx.db.getJob(jobId);
    if (!job) {
      throw new Error(`找不到需要恢复的任务: [${jobId}]`);
    }

    const workflow = this.workflows.get(job.workflowId);
    if (!workflow) {
      throw new Error(`找不到工作流: [${job.workflowId}]`);
    }

    const allSteps = this.topologicalSort(workflow.stepIds);
    const existingStepRecords = this.ctx.db.listJobSteps(jobId);

    const accumulatedOutputs: Record<string, any> = { ...job.output };
    const skippedSteps: string[] = [];
    const executedSteps: string[] = [];

    // 筛选已成功的步骤，提取 output
    for (const record of existingStepRecords) {
      if (record.status === "completed" && record.outputSnapshot) {
        accumulatedOutputs[record.stepId] = record.outputSnapshot;
        if (!skippedSteps.includes(record.stepId)) {
          skippedSteps.push(record.stepId);
        }
      }
    }

    console.log(
      `[Pipeline][断点续跑] 任务 [${jobId}] 准备恢复，跳过 ${skippedSteps.length} 个已完成步骤: [${skippedSteps.join(", ")}]`
    );
    this.ctx.db.updateJob(jobId, { status: "running", error: undefined });

    try {
      for (const step of allSteps) {
        if (skippedSteps.includes(step.id)) {
          continue;
        }

        // 检查取消信号
        if (this.cancelledJobs.has(jobId)) {
          this.cancelledJobs.delete(jobId);
          this.ctx.db.updateJob(jobId, { status: "cancelled" });
          return {
            jobId,
            skippedSteps,
            executedSteps,
            status: "cancelled",
            error: "Job cancelled by user",
          };
        }

        executedSteps.push(step.id);
        const stepRecordId = `step_${jobId}_${step.id}`;
        this.ctx.db.createJobStep({
          id: stepRecordId,
          jobId,
          stepId: step.id,
          status: "running",
          inputSnapshot: {
            jobInput: job.input,
            previousOutputs: accumulatedOutputs,
          },
        });

        console.log(`[Pipeline][断点续跑] 开始接续执行步骤: [${step.id}] ${step.name}...`);
        const startTime = Date.now();
        const stepContext: StepExecutionContext = {
          jobId,
          projectId: job.projectId,
          stepId: step.id,
          input: job.input,
          previousOutputs: accumulatedOutputs,
          log: (msg: string) => {
            console.log(`[Pipeline][${step.id}] ${msg}`);
          },
          reportProgress: (percent: number, message?: string) => {
            this.ctx.events.emit("pipeline/step/progress", {
              jobId,
              stepId: step.id,
              percent,
              message,
            });
          },
        };

        const stepOutput = await step.execute(stepContext);
        const durationMs = Date.now() - startTime;
        accumulatedOutputs[step.id] = stepOutput;

        this.ctx.db.updateJobStep(stepRecordId, {
          status: "completed",
          outputSnapshot: stepOutput,
          durationMs,
        });

        console.log(`[Pipeline][断点续跑] 步骤完成: [${step.id}] (耗时: ${durationMs}ms)`);
      }

      this.ctx.db.updateJob(jobId, {
        status: "completed",
        output: accumulatedOutputs,
      });

      return {
        jobId,
        skippedSteps,
        executedSteps,
        status: "completed",
      };
    } catch (err: any) {
      console.error(`[Pipeline][断点续跑] 恢复执行失败: ${err.message}`);
      this.ctx.db.updateJob(jobId, {
        status: "failed",
        error: err.message,
        output: accumulatedOutputs,
      });

      return {
        jobId,
        skippedSteps,
        executedSteps,
        status: "failed",
        error: err.message,
      };
    }
  }
}
