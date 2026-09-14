import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import type { Context } from "cordis";

export const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().default(3080),
});

export const DatabaseConfigSchema = z.object({
  path: z.string().default("./data/cinedrama.sqlite"),
});

export const RateLimiterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tpmLimit: z.number().default(40000000),
  rpmLimit: z.number().default(500),
});

export const CineDramaConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  rateLimiter: RateLimiterConfigSchema.default({}),
  plugins: z.record(z.any()).default({}),
});

export type CineDramaConfig = z.infer<typeof CineDramaConfigSchema>;
export const ToonFlowConfigSchema = CineDramaConfigSchema;
export type ToonFlowConfig = CineDramaConfig;

export class ConfigService {
  public config: CineDramaConfig;
  public configPath: string;

  constructor(ctx: Context, configPath?: string) {
    if (configPath) {
      this.configPath = path.resolve(process.cwd(), configPath);
    } else if (fs.existsSync(path.resolve(process.cwd(), "./cinedrama.cordis.yml"))) {
      this.configPath = path.resolve(process.cwd(), "./cinedrama.cordis.yml");
    } else {
      this.configPath = path.resolve(process.cwd(), "./toonflow.cordis.yml");
    }
    this.config = this.loadConfig();
    ctx.reflect.provide("configService", this);
  }

  public loadConfig(): CineDramaConfig {
    if (!fs.existsSync(this.configPath)) {
      // 默认空配置
      return CineDramaConfigSchema.parse({});
    }

    try {
      const content = fs.readFileSync(this.configPath, "utf-8");
      const parsed = yaml.parse(content) || {};
      return CineDramaConfigSchema.parse(parsed);
    } catch (err: any) {
      console.warn(`[ConfigService] 配置文件解析警告: ${err.message}, 使用默认配置`);
      return CineDramaConfigSchema.parse({});
    }
  }

  public getPluginConfig<T = any>(pluginName: string, defaultValue: T): T {
    return (this.config.plugins[pluginName] as T) ?? defaultValue;
  }
}
