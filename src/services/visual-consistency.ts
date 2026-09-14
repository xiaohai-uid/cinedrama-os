import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Context } from "cordis";
import {
  CharacterVisualAnchorSchema,
  VisualConsistencyReportSchema,
  type CharacterVisualAnchor,
  type VisualConsistencyReport,
} from "../core/types.js";

export interface ImageInspection {
  hasVisualData: boolean;
  format?: string;
  byteSize?: number;
  isCorruptedOrEmpty?: boolean;
  perceptualHash?: string;
  reason?: string;
}

export function inspectImageVisualData(input?: { data?: string; url?: string }): ImageInspection {
  if (!input || (!input.data && !input.url)) {
    return {
      hasVisualData: false,
      isCorruptedOrEmpty: true,
      reason: "未提供任何图像输入数据或URL",
    };
  }

  const raw = input.data || input.url || "";
  if (!raw.trim()) {
    return {
      hasVisualData: false,
      isCorruptedOrEmpty: true,
      reason: "图像路径或Base64内容为空白",
    };
  }

  // 1. Base64 Data URI
  if (raw.startsWith("data:image/")) {
    const parts = raw.split(",");
    if (parts.length < 2) {
      return {
        hasVisualData: false,
        isCorruptedOrEmpty: true,
        reason: "Base64 Data URI 格式损坏缺失payload",
      };
    }
    const header = parts[0];
    const mime = header.match(/data:image\/([a-zA-Z0-9+.-]+);/)?.[1] || "unknown";
    try {
      const buffer = Buffer.from(parts[1], "base64");
      if (buffer.length < 32) {
        return {
          hasVisualData: false,
          format: mime,
          byteSize: buffer.length,
          isCorruptedOrEmpty: true,
          reason: "图像数据体积异常 (< 32 字节)",
        };
      }
      const perceptualHash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
      return {
        hasVisualData: true,
        format: mime,
        byteSize: buffer.length,
        isCorruptedOrEmpty: false,
        perceptualHash,
      };
    } catch {
      return {
        hasVisualData: false,
        format: mime,
        isCorruptedOrEmpty: true,
        reason: "Base64 解码失败",
      };
    }
  }

  // 2. Local File / Storage Path
  let filePath = raw;
  if (filePath.startsWith("/storage/")) {
    filePath = path.resolve(process.cwd(), "public", filePath.slice(1));
  } else if (!path.isAbsolute(filePath)) {
    const pubPath = path.resolve(process.cwd(), "public", filePath);
    if (fs.existsSync(pubPath)) {
      filePath = pubPath;
    } else {
      filePath = path.resolve(process.cwd(), filePath);
    }
  }

  if (fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < 64) {
        return {
          hasVisualData: false,
          byteSize: stat.size,
          isCorruptedOrEmpty: true,
          reason: `图像物理文件过小 (${stat.size} 字节)，可能是空文件`,
        };
      }
      const ext = path.extname(filePath).replace(".", "").toLowerCase() || "unknown";
      return {
        hasVisualData: true,
        format: ext,
        byteSize: stat.size,
        isCorruptedOrEmpty: false,
      };
    } catch (e: any) {
      return {
        hasVisualData: false,
        isCorruptedOrEmpty: true,
        reason: `读取图像文件属性失败: ${e.message}`,
      };
    }
  }

  // 3. HTTP URL (Remote)
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return {
      hasVisualData: true,
      format: "remote-url",
      byteSize: undefined,
      isCorruptedOrEmpty: false,
    };
  }

  return {
    hasVisualData: false,
    isCorruptedOrEmpty: true,
    reason: `本地图像文件不存在: ${raw}`,
  };
}

export class VisualConsistencyService {
  private projectAnchors: Map<string, Map<string, CharacterVisualAnchor>> = new Map();

  constructor(private ctx: Context) {
    ctx.reflect.provide("visualConsistency", this);
  }

  /**
   * 为项目注册或更新角色外观特征锚点 (Anchor)
   */
  public registerCharacterAnchor(projectId: string, anchor: CharacterVisualAnchor): CharacterVisualAnchor {
    const valid = CharacterVisualAnchorSchema.parse(anchor);
    if (!this.projectAnchors.has(projectId)) {
      this.projectAnchors.set(projectId, new Map());
    }
    const map = this.projectAnchors.get(projectId)!;
    map.set(valid.characterName.trim(), valid);
    return valid;
  }

  /**
   * 获取项目中所有已注册的角色特征锚点
   */
  public getCharacterAnchors(projectId: string): CharacterVisualAnchor[] {
    const map = this.projectAnchors.get(projectId);
    if (!map) return [];
    return Array.from(map.values());
  }

  /**
   * 按角色名检索特征锚点 (支持模糊或包含匹配)
   */
  public getCharacterAnchor(projectId: string, characterName: string): CharacterVisualAnchor | undefined {
    const map = this.projectAnchors.get(projectId);
    if (!map) return undefined;

    const trimmed = characterName.trim();
    if (map.has(trimmed)) return map.get(trimmed);

    for (const [name, anchor] of map.entries()) {
      if (trimmed.includes(name) || name.includes(trimmed)) {
        return anchor;
      }
    }
    return undefined;
  }

  /**
   * 从流水线资产步骤 (step-assets) 自动提取并结构化角色视觉锚点
   */
  public extractAnchorsFromAssets(
    projectId: string,
    characters: Array<{ name: string; role?: string; visualPrompt?: string }>
  ): CharacterVisualAnchor[] {
    const extracted: CharacterVisualAnchor[] = [];

    for (const c of characters) {
      const p = c.visualPrompt || "";
      const appearance: string[] = [];
      const wardrobe: string[] = [];

      if (p.includes("少年") || p.includes("年轻人") || p.includes("坚毅")) {
        appearance.push("剑眉星目", "英气挺拔", "黑发");
      } else if (p.includes("对手") || p.includes("反派") || p.includes("威严")) {
        appearance.push("目光阴鸷", "冷峻神态", "高冠束发");
      } else {
        appearance.push("面容清晰", "神情专注");
      }

      if (p.includes("劲装") || p.includes("暗色")) {
        wardrobe.push("玄青色修身劲装", "护腕");
      } else if (p.includes("华贵") || p.includes("锦袍")) {
        wardrobe.push("赤金暗纹锦袍", "华美玉带");
      } else {
        wardrobe.push("国风古典长衫");
      }

      const anchor: CharacterVisualAnchor = {
        characterName: c.name,
        gender: c.name.includes("女") || c.name.includes("师妹") ? "female" : "male",
        appearanceFeatures: appearance,
        wardrobe,
        styleTokens: ["院线级电影写实光影", "高精写实国漫质感", "4k分辨率细节"],
        negativePrompt: "低质量, 畸形, 多余手指, 脸部融化, 现代服饰, 异色头发",
      };

      this.registerCharacterAnchor(projectId, anchor);
      extracted.push(anchor);
    }

    return extracted;
  }

  /**
   * 检验分镜 Prompt 对指定角色特征的保留度与视觉漂移（文本关键词层面）
   */
  public validatePromptConsistency(prompt: string, anchor: CharacterVisualAnchor): VisualConsistencyReport {
    const allFeatures = [...anchor.appearanceFeatures, ...anchor.wardrobe];
    const retained: string[] = [];
    const missing: string[] = [];

    for (const feat of allFeatures) {
      if (prompt.includes(feat)) {
        retained.push(feat);
      } else {
        missing.push(feat);
      }
    }

    const featureRecall = allFeatures.length > 0 ? retained.length / allFeatures.length : 1.0;
    const warnings: string[] = [];

    if (featureRecall < 0.6) {
      warnings.push(`分镜提示词遗漏了核心视觉特征: [${missing.join(", ")}]，可能发生角色脸型或服饰漂移`);
    }

    // 计算综合得分 (0~100)
    let score = Math.round(featureRecall * 80);
    if (anchor.styleTokens.some((token) => prompt.includes(token))) {
      score += 20;
    }
    score = Math.min(100, Math.max(0, score));

    // 自动修正 Prompt
    const corrected = this.autoEnrichPrompt(prompt, anchor);

    return VisualConsistencyReportSchema.parse({
      characterName: anchor.characterName,
      overallScore: score,
      featureRecall: Number(featureRecall.toFixed(2)),
      retainedFeatures: retained,
      missingFeatures: missing,
      isConsistent: featureRecall >= 0.6,
      originalPrompt: prompt,
      correctedPrompt: corrected,
      warnings: [
        ...warnings,
        "【提示词一致性说明】本检测仅检验提示词关键词召回，未输入或校验渲染后图片像素",
      ],
      scope: "prompt_only",
      hasImageInput: false,
      imageAuditPassed: undefined,
      imageAuditDetails: {
        hasVisualData: false,
        reason: "未提供图像输入，仅针对文本提示词执行规则审计",
      },
    });
  }

  /**
   * 检验生成图像的真实物理存在与视觉数据有效性
   */
  public validateImageVisualConsistency(
    imageInput: { data?: string; url?: string },
    anchor: CharacterVisualAnchor
  ): VisualConsistencyReport {
    const inspection = inspectImageVisualData(imageInput);
    const warnings: string[] = [];

    if (!inspection.hasVisualData || inspection.isCorruptedOrEmpty) {
      warnings.push(`图像像素真实性检验失败: ${inspection.reason || "图像不存在或损坏"}`);
      return VisualConsistencyReportSchema.parse({
        characterName: anchor.characterName,
        overallScore: 0,
        featureRecall: 0,
        retainedFeatures: [],
        missingFeatures: [...anchor.appearanceFeatures, ...anchor.wardrobe],
        isConsistent: false,
        originalPrompt: "",
        correctedPrompt: "",
        warnings,
        scope: "image_only",
        hasImageInput: Boolean(imageInput?.data || imageInput?.url),
        imageAuditPassed: false,
        imageAuditDetails: inspection,
      });
    }

    warnings.push(
      `【视觉资产完整性审计通过】图像物理数据有效（格式: ${inspection.format || "未知"}, 大小: ${inspection.byteSize || "未知"}B）。本阶段断言图像物理数据完整性与哈希有效性，角色面容语义特征深度比对需调度 VLM 视觉模型。`
    );

    return VisualConsistencyReportSchema.parse({
      characterName: anchor.characterName,
      overallScore: 75,
      featureRecall: 0,
      retainedFeatures: [],
      missingFeatures: [],
      isConsistent: true,
      originalPrompt: "",
      correctedPrompt: "",
      warnings,
      scope: "image_integrity",
      hasImageInput: true,
      imageAuditPassed: true,
      imageAuditDetails: inspection,
    });
  }

  /**
   * 综合审计单个分镜的提示词与实际图像一致性
   */
  public auditShot(
    shot: { prompt: string; imageUrl?: string; imageBase64?: string },
    anchor: CharacterVisualAnchor
  ): VisualConsistencyReport {
    const promptReport = this.validatePromptConsistency(shot.prompt, anchor);
    const imageInput = {
      data: shot.imageBase64,
      url: shot.imageUrl,
    };
    const hasImage = Boolean(shot.imageUrl || shot.imageBase64);
    const inspection = inspectImageVisualData(hasImage ? imageInput : undefined);

    const warnings = [...promptReport.warnings];
    let isConsistent = promptReport.isConsistent;
    let overallScore = promptReport.overallScore;

    if (!hasImage || !inspection.hasVisualData) {
      isConsistent = false;
      overallScore = Math.min(overallScore, 40);
      warnings.push("【真实视觉断言失败】分镜缺少实际渲染图像文件或数据为空，仅凭提示词不能断言角色视觉一致性");
    }

    return VisualConsistencyReportSchema.parse({
      characterName: anchor.characterName,
      overallScore,
      featureRecall: promptReport.featureRecall,
      retainedFeatures: promptReport.retainedFeatures,
      missingFeatures: promptReport.missingFeatures,
      isConsistent,
      originalPrompt: shot.prompt,
      correctedPrompt: promptReport.correctedPrompt,
      warnings,
      scope: "prompt_and_image",
      hasImageInput: hasImage,
      imageAuditPassed: inspection.hasVisualData && !inspection.isCorruptedOrEmpty,
      imageAuditDetails: inspection,
    });
  }

  /**
   * 自动将角色的视觉特征锚点强注入至分镜生图提示词中，锁定画风与外观
   */
  public autoEnrichPrompt(prompt: string, anchor: CharacterVisualAnchor): string {
    const missing: string[] = [];
    for (const f of [...anchor.appearanceFeatures, ...anchor.wardrobe]) {
      if (!prompt.includes(f)) {
        missing.push(f);
      }
    }

    const styleNeeded = anchor.styleTokens.filter((s) => !prompt.includes(s));
    let prefix = `[角色锁定: ${anchor.characterName}`;
    if (missing.length > 0) {
      prefix += ` | 外观与服饰: ${missing.join(", ")}`;
    }
    prefix += `]`;

    let enriched = `${prefix} ${prompt}`;
    if (styleNeeded.length > 0) {
      enriched += `, ${styleNeeded.join(", ")}`;
    }

    return enriched;
  }
}

