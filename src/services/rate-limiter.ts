import type { Context } from "cordis";

export interface RateLimiterOptions {
  enabled?: boolean;
  tpmLimit?: number; // 默认每分钟 Token 上限
  rpmLimit?: number; // 默认每分钟请求数上限
}

interface TokenRecord {
  timestamp: number;
  tokens: number;
}

export class RateLimiterService {
  private enabled: boolean;
  private tpmLimit: number;
  private rpmLimit: number;

  private records: TokenRecord[] = [];
  private requestCountWindow: number[] = [];

  constructor(ctx: Context, options: RateLimiterOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.tpmLimit = options.tpmLimit ?? 40000000;
    this.rpmLimit = options.rpmLimit ?? 500;

    ctx.reflect.provide("rateLimiter", this);
  }

  /**
   * 清理超过 1 分钟的历史滑动窗口记录
   */
  private cleanOldRecords(now: number) {
    const oneMinuteAgo = now - 60000;
    this.records = this.records.filter((r) => r.timestamp > oneMinuteAgo);
    this.requestCountWindow = this.requestCountWindow.filter((t) => t > oneMinuteAgo);
  }

  /**
   * 获取当前 1 分钟内的 Token 消耗总量
   */
  public getCurrentTPM(): number {
    const now = Date.now();
    this.cleanOldRecords(now);
    return this.records.reduce((acc, r) => acc + r.tokens, 0);
  }

  /**
   * 获取当前 1 分钟内的请求总数
   */
  public getCurrentRPM(): number {
    const now = Date.now();
    this.cleanOldRecords(now);
    return this.requestCountWindow.length;
  }

  /**
   * 请求准入检查 (令牌桶等待机制)
   * 若超额则排队等待窗口滑过，防止触发上游 429 TPM 封锁
   */
  public async acquire(estimatedTokens = 1000): Promise<void> {
    if (!this.enabled) return;

    while (true) {
      const now = Date.now();
      this.cleanOldRecords(now);

      const currentTokens = this.records.reduce((acc, r) => acc + r.tokens, 0);
      const currentRequests = this.requestCountWindow.length;

      if (currentTokens + estimatedTokens <= this.tpmLimit && currentRequests < this.rpmLimit) {
        // 批准准入
        this.records.push({ timestamp: now, tokens: estimatedTokens });
        this.requestCountWindow.push(now);
        return;
      }

      // 计算需要等待的时间 (最早一条记录过期的时间)
      const oldestRecord = this.records[0];
      const waitTime = oldestRecord ? Math.max(100, 60000 - (now - oldestRecord.timestamp) + 50) : 1000;
      
      console.warn(`[RateLimiter] 达到流控阈值 (当前TPM: ${currentTokens}/${this.tpmLimit}), 暂停 ${waitTime}ms 后重试...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * 汇报真实消耗的 Token (修正预估差额)
   */
  public reportActualUsage(estimatedTokens: number, actualTokens: number) {
    if (!this.enabled) return;
    const diff = actualTokens - estimatedTokens;
    if (diff !== 0) {
      this.records.push({ timestamp: Date.now(), tokens: diff });
    }
  }

  public getMetrics() {
    return {
      enabled: this.enabled,
      tpmLimit: this.tpmLimit,
      rpmLimit: this.rpmLimit,
      currentTPM: this.getCurrentTPM(),
      currentRPM: this.getCurrentRPM(),
    };
  }
}
