import type { Context } from "cordis";
import {
  DramaEvaluationSchema,
  type DramaEvaluation,
  type EvaluateDramaDto,
} from "../core/types.js";

export class EvaluationService {
  constructor(private ctx: Context) {
    ctx.reflect.provide("evaluation", this);
  }

  public async evaluateDrama(dto: EvaluateDramaDto): Promise<DramaEvaluation> {
    const projectId = dto.projectId || `eval_proj_${Date.now()}`;
    let projectTitle = dto.title || "未命名漫剧";
    let projectNovel = dto.novelText || "";
    let skeleton = dto.skeleton || "";
    let coreConflict = dto.coreConflict || "";
    let dialogueLines = dto.dialogueLines || [];
    let shots = dto.shots || [];

    // 若传入 projectId 且数据库存在该项目，尝试自动拉取已有分镜与上下文补全
    if (dto.projectId) {
      try {
        const p = this.ctx.db.getProject(dto.projectId);
        if (p) {
          projectTitle = dto.title || p.title;
        }
        if (!shots || shots.length === 0) {
          const dbShots = this.ctx.db.listShotsByProject(dto.projectId);
          if (dbShots && dbShots.length > 0) {
            shots = dbShots.map((s: any) => ({
              shotIndex: s.shotIndex,
              prompt: s.prompt,
              dialogue: s.dialogue,
            }));
          }
        }
      } catch (e) {
        // 忽略项目不存在等异常
      }
    }

    const evalId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const judgeModel = dto.model || this.ctx.providers.getActiveTextModel() || "sensenova";

    // 组装评估裁判 Prompt
    const systemPrompt = `你是一位拥有15年院线电影与顶流网络微短剧制作经验的资深导演、总制片人兼文学总策划。
你的职责是对输入的短剧策划材料（包括故事骨架、冲突起伏、对白台词、分镜运镜）进行专业、严苛且客观的工业级量化评审。

评审量规说明：
1. dramaticTension (戏剧张力与冲突，满分10分)：黄金开场抓人度、起承转合、反转与矛盾爆发力；
2. dialogueQuality (台词对白与人设，满分10分)：台词凝练度、角色情绪张力、符合人设，严禁机械说明书废话；
3. cinematicPacing (分镜镜头画面感，满分10分)：景别变换（特写/全景）、运镜动势、视觉提示词想象力；
4. pacingConsistency (节奏连贯度，满分10分)：镜头与对白承接自然度、整体视听流转。

综合分计算规则：
overallScore = dramaticTension * 0.35 + dialogueQuality * 0.30 + cinematicPacing * 0.25 + pacingConsistency * 0.10
四舍五入保留一位小数。
影视评级标准：
- S 级：>= 9.0 (爆款高爽短剧)
- A 级：>= 8.0 (精品优质短剧)
- B 级：>= 7.0 (合格标准短剧)
- C 级：< 7.0 (不及格或存在明显硬伤，需回炉修改)

请务必输出严格合法的 JSON 对象，不要输出任何额外废话！`;

    const userPrompt = `请对以下微短剧项目进行影视工业级打分与诊断评估：

【漫剧项目标题】：${projectTitle}
【原著背景/脑洞】：${projectNovel ? projectNovel.slice(0, 1000) : "（未提供小说原文）"}
【三幕骨架与核心矛盾】：${skeleton || "（未提供三幕骨架）"}
核心矛盾：${coreConflict || "未明确"}

【角色对白清单】：
${dialogueLines.length > 0 ? dialogueLines.map((d, idx) => `${idx + 1}. [${d.role}]: "${d.line}"`).join("\n") : "（暂无具体对白）"}

【分镜镜头清单】：
${shots.length > 0 ? shots.map((s) => `镜头 ${s.shotIndex || 1}: 提示词="${s.prompt}" 对白="${s.dialogue || ''}"`).join("\n") : "（暂无镜头规划）"}

请根据量规，给出如下结构的严格合法 JSON：
{
  "id": "${evalId}",
  "projectId": "${projectId}",
  "overallScore": 8.5,
  "tier": "A",
  "verdict": "一句话专业总评",
  "highlights": ["亮点1", "亮点2"],
  "improvements": ["改稿建议1", "改稿建议2"],
  "dimensions": {
    "dramaticTension": { "score": 8.5, "reason": "打分理由" },
    "dialogueQuality": { "score": 8.5, "reason": "打分理由" },
    "cinematicPacing": { "score": 8.5, "reason": "打分理由" },
    "pacingConsistency": { "score": 8.5, "reason": "打分理由" }
  },
  "judgeModel": "${judgeModel}",
  "createdAt": ${Date.now()}
}`;

    // 默认兜底评测（基于内容丰满度做启发式保底打分，明确标明离线规则保底 C 级）
    const isRich = (dialogueLines.length > 0 || shots.length > 0) && (coreConflict || skeleton);
    const defaultScore = isRich ? 6.2 : 5.0;
    const defaultTier: "S" | "A" | "B" | "C" = "C";
    const fallback: DramaEvaluation = {
      id: evalId,
      projectId,
      overallScore: defaultScore,
      tier: defaultTier,
      verdict: isRich
        ? "【离线规则预估】大模型裁判未连通或未返回有效结构化评测，当前评分采用离线规则启发式估算（保底 C 级），不可作为最终上线依据。"
        : "【离线规则预估】剧情与对白较为薄弱，且大模型裁判未连通，判定为不达标（C 级）。",
      highlights: isRich
        ? ["具备基础故事框架与角色台词雏形", "分镜镜头运镜具备一定视听画面感"]
        : ["具备基础故事框架"],
      improvements: [
        "请配置有效的大模型 API 密钥以启动真实影视工业级 LLM-as-a-Judge 智能评审",
        "补充更多对白冲突细节与高潮反转",
      ],
      dimensions: {
        dramaticTension: {
          score: isRich ? 6.0 : 5.0,
          reason: "离线规则估算：大模型裁判未连通",
        },
        dialogueQuality: {
          score: isRich ? 6.0 : 5.0,
          reason: "离线规则估算：大模型裁判未连通",
        },
        cinematicPacing: {
          score: isRich ? 6.5 : 5.0,
          reason: "离线规则估算：大模型裁判未连通",
        },
        pacingConsistency: {
          score: isRich ? 6.5 : 5.0,
          reason: "离线规则估算：大模型裁判未连通",
        },
      },
      judgeModel: "heuristic-offline-rules",
      createdAt: Date.now(),
      isFallback: true,
      warnings: ["大模型裁判未连通或调用失败，当前评测为离线启发式规则打分，不可替代真实模型评测"],
    };

    // 使用大模型自我纠错套件执行结构化评测
    const result = await this.ctx.providers.generateStructured<DramaEvaluation>({
      model: judgeModel,
      prompt: userPrompt,
      systemPrompt,
      schema: DramaEvaluationSchema,
      fallback,
      temperature: 0.2, // 裁判打分需要适度确定性
    });

    const isHeuristicFallback = Boolean(result.errors && result.errors.length > 0 && !result.repaired);
    const evaluation = result.data;

    if (isHeuristicFallback) {
      evaluation.isFallback = true;
      evaluation.judgeModel = "heuristic-offline-rules";
      evaluation.overallScore = defaultScore;
      evaluation.tier = defaultTier;
      evaluation.warnings = [
        "大模型裁判未连通或未返回有效结构化评测，降级为离线规则估算",
        ...(result.errors || []),
      ];
    } else {
      evaluation.isFallback = false;
      evaluation.judgeModel = judgeModel;
      evaluation.warnings = [];
    }

    // 重新校准 overallScore 与 tier 确保强确定性
    const dims = evaluation.dimensions;
    const computedScore =
      Math.round(
        (dims.dramaticTension.score * 0.35 +
          dims.dialogueQuality.score * 0.3 +
          dims.cinematicPacing.score * 0.25 +
          dims.pacingConsistency.score * 0.1) *
          10
      ) / 10;

    if (!evaluation.isFallback && Math.abs(evaluation.overallScore - computedScore) > 0.5) {
      evaluation.overallScore = computedScore;
    }
    if (!evaluation.isFallback) {
      evaluation.tier =
        evaluation.overallScore >= 9.0
          ? "S"
          : evaluation.overallScore >= 8.0
          ? "A"
          : evaluation.overallScore >= 7.0
          ? "B"
          : "C";
    }

    // 持久化到 SQLite (仅当该工程在数据库中真实存在时才持久化，避免独立散装文本打分报外键错误)
    try {
      if (this.ctx.db?.getProject?.(evaluation.projectId)) {
        this.ctx.db.saveEvaluation(evaluation);
      }
    } catch (err) {
      console.warn("[EvaluationService] 评测数据持久化跳过:", err);
    }

    return evaluation;
  }
}
