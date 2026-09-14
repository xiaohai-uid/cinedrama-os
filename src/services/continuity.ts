import type { Context } from "cordis";
import {
  CharacterLoreStateSchema,
  CriticalPropSchema,
  PlotHookSchema,
  ProjectContinuityLedgerSchema,
  ContinuityAuditReportSchema,
  type CharacterLoreState,
  type CharacterLoreStateInput,
  type CriticalProp,
  type PlotHook,
  type PlotHookInput,
  type ProjectContinuityLedger,
  type ContinuityAuditReport,
} from "../core/types.js";

export class ContinuityService {
  private ledgers: Map<string, ProjectContinuityLedger> = new Map();

  constructor(private ctx: Context) {
    ctx.reflect.provide("continuity", this);
  }

  /**
   * 获取或初始化指定项目的跨集设定与伏笔总账
   */
  public getOrCreateLedger(projectId: string): ProjectContinuityLedger {
    if (!this.ledgers.has(projectId)) {
      this.ledgers.set(projectId, {
        projectId,
        characters: [],
        props: [],
        hooks: [],
        updatedAt: Date.now(),
      });
    }
    return this.ledgers.get(projectId)!;
  }

  /**
   * 记录或更新角色跨集状态 (生死/境界/阵营)
   */
  public recordCharacterState(projectId: string, state: CharacterLoreStateInput): CharacterLoreState {
    const valid = CharacterLoreStateSchema.parse(state);
    const ledger = this.getOrCreateLedger(projectId);
    const idx = ledger.characters.findIndex((c) => c.name.trim() === valid.name.trim());
    if (idx >= 0) {
      ledger.characters[idx] = valid;
    } else {
      ledger.characters.push(valid);
    }
    ledger.updatedAt = Date.now();
    return valid;
  }

  /**
   * 记录关键道具流转状态
   */
  public recordCriticalProp(projectId: string, prop: CriticalProp): CriticalProp {
    const valid = CriticalPropSchema.parse(prop);
    const ledger = this.getOrCreateLedger(projectId);
    const idx = ledger.props.findIndex((p) => p.propName.trim() === valid.propName.trim());
    if (idx >= 0) {
      ledger.props[idx] = valid;
    } else {
      ledger.props.push(valid);
    }
    ledger.updatedAt = Date.now();
    return valid;
  }

  /**
   * 新增剧情伏笔或悬念钩子
   */
  public addPlotHook(projectId: string, hook: PlotHookInput): PlotHook {
    const valid = PlotHookSchema.parse(hook);
    const ledger = this.getOrCreateLedger(projectId);
    const idx = ledger.hooks.findIndex((h) => h.hookId === valid.hookId);
    if (idx >= 0) {
      ledger.hooks[idx] = valid;
    } else {
      ledger.hooks.push(valid);
    }
    ledger.updatedAt = Date.now();
    return valid;
  }

  /**
   * 标记剧情伏笔已在某集回收解决
   */
  public resolvePlotHook(projectId: string, hookId: string, resolvedInEpisode: number): boolean {
    const ledger = this.getOrCreateLedger(projectId);
    const hook = ledger.hooks.find((h) => h.hookId === hookId);
    if (hook) {
      hook.isResolved = true;
      hook.resolvedInEpisode = resolvedInEpisode;
      ledger.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 获取所有未决伏笔，用于递延注入下一集的剧本与大纲提示词中
   */
  public forwardPlotHooksToNext(projectId: string, fromEpisode: number): PlotHook[] {
    const ledger = this.getOrCreateLedger(projectId);
    return ledger.hooks.filter((h) => !h.isResolved && h.introducedInEpisode <= fromEpisode);
  }

  /**
   * 审计指定集数剧本是否存在严重“吃书”、角色死而复生或设定冲突
   */
  public auditEpisodeContinuity(
    projectId: string,
    episodeIndex: number,
    scriptContent: { dialogueLines?: Array<{ role: string; line: string }>; text?: string }
  ): ContinuityAuditReport {
    const ledger = this.getOrCreateLedger(projectId);
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    const dialogue = scriptContent.dialogueLines || [];
    const fullText = (scriptContent.text || "") + " " + dialogue.map((d) => `${d.role}: ${d.line}`).join("\n");

    // 1. 角色生死一致性校验：已阵亡角色严禁无闪回直接复活
    const deceasedCharacters = ledger.characters.filter((c) => c.status === "deceased");
    for (const deceased of deceasedCharacters) {
      const isSpeaking = dialogue.some((d) => d.role.includes(deceased.name));
      const mentioned = fullText.includes(deceased.name);

      if (isSpeaking) {
        // 检查是否有闪回、回忆、幻象标记
        const isFlashback =
          fullText.includes("回忆") || fullText.includes("闪回") || fullText.includes("幻觉") || fullText.includes("心魔");
        if (!isFlashback) {
          violations.push(
            `【重大吃书违规】角色 [${deceased.name}] 已在前序设定中阵亡，但在第 ${episodeIndex} 集剧本中直接以正常对白登场且无闪回标记！`
          );
          score -= 40;
        } else {
          warnings.push(`角色 [${deceased.name}] 已阵亡，当前通过回忆/幻象方式登场。`);
        }
      } else if (mentioned) {
        warnings.push(`提及已故角色 [${deceased.name}]。`);
      }
    }

    // 2. 核心道具归属校验
    const lostProps = ledger.props.filter((p) => p.status === "lost");
    for (const p of lostProps) {
      if (dialogue.some((d) => d.role === p.owner && d.line.includes(p.propName))) {
        violations.push(
          `【道具吃书违规】关键道具 [${p.propName}] 记录状态为【已遗失】，但所有者 [${p.owner}] 正在未交代取回过程的情况下直接使用该道具！`
        );
        score -= 25;
      }
    }

    // 3. 统计继承与活跃伏笔
    const inherited = ledger.hooks.filter((h) => !h.isResolved && h.introducedInEpisode < episodeIndex);
    const active = ledger.hooks.filter((h) => !h.isResolved);

    // 若存在未解决的高危伏笔超过 3 集未提，增加温和提醒
    for (const h of inherited) {
      if (episodeIndex - h.introducedInEpisode >= 3 && h.criticalLevel === "high") {
        warnings.push(`高优先级伏笔 [${h.description}] 已跨越 ${episodeIndex - h.introducedInEpisode} 集未推进，建议安排回收。`);
        score -= 5;
      }
    }

    score = Math.max(0, Math.min(100, score));

    return ContinuityAuditReportSchema.parse({
      projectId,
      episodeIndex,
      continuityScore: score,
      isPassed: score >= 70 && violations.length === 0,
      violations,
      warnings,
      activeHooks: active,
      inheritedHooks: inherited,
      auditedAt: Date.now(),
    });
  }
}
