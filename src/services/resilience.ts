import type { Context } from "cordis";
import {
  RetryOptionsSchema,
  type RetryOptions,
  type JobResumptionResult,
} from "../core/types.js";

export class ResilienceService {
  constructor(private ctx: Context) {
    ctx.reflect.provide("resilience", this);
  }

  /**
   * 判断错误是否属于可重试的临时网络或服务器故障
   */
  public isRetryableError(error: any): boolean {
    if (!error) return false;
    const msg = String(error.message || error).toLowerCase();
    const code = error.status || error.statusCode || error.code;

    // 网络层与超时错误
    if (
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("network") ||
      msg.includes("socket hang up")
    ) {
      return true;
    }

    // HTTP 5xx 与 429 限流
    if (code === 429 || (typeof code === "number" && code >= 500 && code <= 504)) {
      return true;
    }
    if (
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("bad gateway") ||
      msg.includes("service unavailable") ||
      msg.includes("rate limit")
    ) {
      return true;
    }

    return false;
  }

  /**
   * 采用指数退避算法与随机抖动 (Jitter) 执行高容灾重试包裹
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    customOptions?: Partial<RetryOptions>
  ): Promise<{ result: T; attempts: number; recovered: boolean }> {
    const opts = RetryOptionsSchema.parse(customOptions || {});
    let lastError: any = null;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      try {
        const result = await operation();
        return {
          result,
          attempts: attempt,
          recovered: attempt > 1,
        };
      } catch (err: any) {
        lastError = err;
        const isRetryable = this.isRetryableError(err);

        if (attempt >= opts.maxRetries || !isRetryable) {
          console.error(`[Resilience] 操作在第 ${attempt} 次尝试后终态失败: ${err?.message || err}`);
          throw err;
        }

        // 计算指数退避延迟并加入抖动系数 (0.8 ~ 1.2)
        const jitterFactor = opts.jitter ? 0.8 + Math.random() * 0.4 : 1.0;
        const delayMs = Math.round(
          opts.baseDelayMs * Math.pow(opts.backoffFactor, attempt - 1) * jitterFactor
        );

        console.warn(
          `[Resilience][Retry] 第 ${attempt} 次执行遭遇波动: [${err?.message || err}]，将在 ${delayMs}ms 后执行第 ${
            attempt + 1
          } 次重试...`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  /**
   * 断点续跑恢复漫剧生成任务
   */
  public async resumeJob(jobId: string): Promise<JobResumptionResult> {
    return this.ctx.pipeline.resumeJob(jobId);
  }
}
