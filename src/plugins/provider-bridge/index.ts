import type { Context } from "cordis";
import type {
  IModelProvider,
  ImageGenerateOptions,
  ImageGenerateResult,
  VideoGenerateOptions,
  VideoGenerateResult,
  TextGenerateOptions,
  TextGenerateResult,
  TTSGenerateOptions,
  TTSGenerateResult,
} from "../../core/types.js";
import { synthesizeSpeech } from "../../services/speech-synthesizer.js";
import { generateRealVideo } from "../../services/video-generator.js";

export interface BridgePluginConfig {
  baseUrl?: string;
  enableFallback?: boolean;
}

/**
 * 桥接与本地素材 Provider 插件 (CineDrama OS 原生插件，解绑 VM2)
 */
export class BridgeProviderPlugin implements IModelProvider {
  public id = "bridge";
  public name = "本地素材与中继桥 (Local Bridge)";
  public version = "2.0.0";
  public author = "CineDrama Community";

  public models = [
    {
      id: "bridge-image",
      name: "本地投递生图 (Bridge Image)",
      type: "image" as const,
      capabilities: {
        aspectRatios: ["16:9", "9:16", "1:1"],
        resolutions: ["1K", "2K"],
      },
    },
    {
      id: "bridge-video",
      name: "本地图生视频合成 (Bridge Video)",
      type: "video" as const,
      capabilities: {
        maxDuration: 15,
        resolutions: ["720P", "1080P"],
      },
    },
    {
      id: "bridge-tts",
      name: "本地对白语音合成 (Bridge TTS)",
      type: "tts" as const,
      capabilities: {
        voices: ["zh-CN-YunxiNeural", "zh-CN-XiaoxiaoNeural", "zh-CN-YunjianNeural"],
      },
    },
    {
      id: "bridge-text-mock",
      name: "本地测试文本模型 (Mock Script)",
      type: "text" as const,
      capabilities: {
        thinking: false,
      },
    },
  ];

  private baseUrl: string;
  private enableFallback: boolean;

  constructor(private ctx: Context, config: BridgePluginConfig = {}) {
    this.baseUrl = config.baseUrl || "http://127.0.0.1:8766";
    this.enableFallback = config.enableFallback ?? true;

    // 注册到全局 Provider 注册表
    this.ctx.providers.register(this);

    // 监听卸载事件
    this.ctx.events.on("dispose", () => {
      this.ctx.providers.unregister(this.id);
    });
  }

  public async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        return { ok: true, message: "本地中继桥服务运行正常" };
      }
      return { ok: false, message: `桥服务返回状态码: ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: `本地桥未启动 (${this.baseUrl}): ${e.message}（已开启自动本地兜底）` };
    }
  }

  public async generateText(options: TextGenerateOptions): Promise<TextGenerateResult> {
    return {
      text: `[Bridge Mock Text] 剧本场景：${options.prompt.slice(0, 50)}... [生成成功]`,
      usage: {
        promptTokens: options.prompt.length,
        completionTokens: 25,
        totalTokens: options.prompt.length + 25,
      },
    };
  }

  public async generateImage(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
    // 优先尝试与本地运行的中继桥服务握手
    try {
      const resp = await fetch(`${this.baseUrl}/images/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: options.prompt,
          aspectRatio: options.aspectRatio || "16:9",
          size: options.size || "1K",
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data.base64 || data.url) {
          return { base64: data.base64, url: data.url, mimeType: data.mime || "image/png" };
        }
      }
    } catch (e: any) {
      // 若外部 bridge 未起，且开启兜底
      if (!this.enableFallback) {
        throw new Error(`本地桥服务连接失败: ${e.message}`);
      }
    }

    // 原生兜底返回占位素材（脱离 VM2，可直接生成本地 SVG/DataURI）
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <rect width="800" height="450" fill="#1e1e2e"/>
      <text x="50%" y="45%" fill="#89b4fa" font-size="24" font-family="sans-serif" text-anchor="middle">CineDrama OS 镜头占位图</text>
      <text x="50%" y="55%" fill="#a6adc8" font-size="14" font-family="sans-serif" text-anchor="middle">${options.prompt.slice(0, 40)}</text>
    </svg>`;

    const base64 = Buffer.from(svg).toString("base64");
    return {
      base64: `data:image/svg+xml;base64,${base64}`,
      mimeType: "image/svg+xml",
    };
  }

  public async generateTTS(options: TTSGenerateOptions): Promise<TTSGenerateResult> {
    // 1. 优先尝试外部 Bridge
    try {
      const resp = await fetch(`${this.baseUrl}/audio/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: options.text,
          voice: options.voice,
          speed: options.speed || 1.0,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data.audioUrl || data.audioBase64) {
          return {
            audioUrl: data.audioUrl || `data:audio/wav;base64,${data.audioBase64}`,
            durationMs: data.durationMs || 3000,
            format: data.format || "wav",
          };
        }
      }
    } catch (e: any) {
      if (!this.enableFallback) {
        throw new Error(`TTS 服务调用失败: ${e.message}`);
      }
    }

    // 2. 原生兜底：调用真实配音声学发声引擎
    const wavBuffer = synthesizeSpeech({
      text: options.text,
      voice: options.voice,
      rate: options.speed,
    });
    const audioBase64 = wavBuffer.toString("base64");
    const sampleRate = 16000;
    const durationMs = Math.max(1000, Math.round(((wavBuffer.length - 44) / (sampleRate * 2)) * 1000));

    return {
      audioUrl: `data:audio/wav;base64,${audioBase64}`,
      durationMs,
      duration: durationMs / 1000,
      format: "wav",
    };
  }

  public async generateVideo(options: VideoGenerateOptions): Promise<VideoGenerateResult> {
    // 优先尝试外部 Bridge
    try {
      const resp = await fetch(`${this.baseUrl}/videos/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: options.prompt,
          duration: options.duration || 4,
          firstFrame: options.firstFrame,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data.videoUrl) {
          return {
            videoUrl: data.videoUrl,
            duration: data.duration || options.duration || 4,
          };
        }
      }
    } catch (e: any) {
      if (!this.enableFallback) {
        throw new Error(`视频生成服务调用失败: ${e.message}`);
      }
    }

    // 原生兜底调用真实视频生成引擎生成物理 mp4 文件
    const render = generateRealVideo({
      prompt: options.prompt,
      duration: options.duration || 3.5,
      firstFrame: options.firstFrame,
      audioPathOrBase64: options.audioPathOrBase64,
      cameraMotion: options.cameraMotion,
      filter: options.filter,
      transition: options.transition,
      dialogue: options.dialogue,
      voiceRole: options.voiceRole,
    });
    return {
      videoUrl: render.videoUrl,
      duration: render.duration,
    };
  }
}

/**
 * Cordis 插件安装入口
 */
export default function apply(ctx: Context, config?: BridgePluginConfig) {
  new BridgeProviderPlugin(ctx, config);
}
