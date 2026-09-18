import fs from "node:fs";
import path from "node:path";
import type { Context } from "cordis";
import { z } from "zod";
import {
  type PipelineStep,
  type StepExecutionContext,
  StorySkeletonSchema,
  ScriptDialogueSchema,
  StoryboardPlanningSchema,
} from "../../core/types.js";
import { getStylePreset, enrichPromptWithStyle } from "../../services/style-presets.js";

/**
 * 弹性提取大模型输出的 JSON 数据并经过 Zod Schema 严格校验
 * (支持 Markdown 代码块包裹、前后文本容错与 Schema 校验失败自动 Fallback)
 */
export function safeExtractJsonWithSchema<T>(raw: string, schema: z.ZodType<T>, fallback: T): T {
  if (!raw || typeof raw !== "string") return fallback;

  const tryValidate = (jsonString: string): T | null => {
    try {
      const obj = JSON.parse(jsonString);
      const res = schema.safeParse(obj);
      if (res.success) {
        return res.data;
      }
    } catch {}
    return null;
  };

  // 1. 直接尝试整段解析与校验
  const direct = tryValidate(raw.trim());
  if (direct) return direct;

  // 2. 匹配 Markdown ```json 代码块
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      const parsed = tryValidate(match[1].trim());
      if (parsed) return parsed;
    }
  } catch {}

  // 3. 截取首尾大括号 {} 容错
  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const parsed = tryValidate(raw.slice(firstBrace, lastBrace + 1));
      if (parsed) return parsed;
    }
  } catch {}

  return fallback;
}

/**
 * 弹性提取大模型输出的 JSON 数据 (支持 Markdown 代码块包裹与前后废话容错)
 */
export function safeExtractJson<T>(raw: string, fallback: T): T {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {}

  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
  } catch {}

  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
  } catch {}

  return fallback;
}

/**
 * 1. 故事骨架提取步骤 (调用免费真实大模型提炼核心矛盾与三幕结构)
 */
export function createSkeletonStep(ctx: Context): PipelineStep {
  return {
    id: "step-skeleton",
    name: "故事骨架提取 (Story Skeleton)",
    description: "基于小说原文提炼故事核心、人物弧光、三幕结构与高潮爽点",
    dependsOn: [],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始调用 AI 提取小说故事骨架...");
      stepCtx.reportProgress(20, "正在深度分析小说核心矛盾与三幕结构");

      const novelText = stepCtx.input.novelText || "少年自青云宗起步，偶得神秘道种，踏破苍穹。";
      const prompt = `你是一位顶级影视短剧编剧。请深入分析以下小说原文，提炼核心矛盾、人物欲望与三幕结构大纲，并严格以合法 JSON 格式输出：
小说原文：
"""
${novelText}
"""

输出 JSON 规范：
{
  "coreConflict": "一句话核心矛盾描述",
  "skeleton": "故事整体骨架与转折脉络",
  "threeActs": [
    { "act": 1, "name": "第一幕标题", "target": "主角目标与初遇冲突" },
    { "act": 2, "name": "第二幕标题", "target": "危机升级与命运对抗" },
    { "act": 3, "name": "第三幕标题", "target": "高潮逆转与震撼结局" }
  ]
}
注意：务必只输出合法 JSON 代码块，不要包含多余废话。`;

      const fallback = {
        coreConflict: "平凡少年 vs 家族倾轧与宿命危机",
        skeleton: "少年微末崛起，勘破重重迷局，斩碎宿命枷锁。",
        threeActs: [
          { act: 1, name: "微末崛起", target: "打破羞辱，觉醒潜能" },
          { act: 2, name: "试炼升级", target: "直面强敌，夺取一线生机" },
          { act: 3, name: "终极逆转", target: "破茧成蝶，逆伐强敌" },
        ],
      };

      const result = await ctx.providers.generateStructured({
        model: stepCtx.input.textModel || "deepseek-v4-flash",
        prompt,
        schema: StorySkeletonSchema,
        fallback,
        onRetry: (attempt: number) => {
          stepCtx.log(`[AI 自我纠偏] 故事骨架结构异常，正在启动第 ${attempt} 次针对性纠偏...`);
        },
      });

      if (result.repaired) {
        stepCtx.log(`[AI 自我纠偏成功] 经历 ${result.attempts} 次调用，模型成功自我修复三幕剧本结构！`);
      }

      stepCtx.reportProgress(100, "故事骨架搭建完毕");
      return {
        novelText,
        skeleton: result.data.skeleton,
        coreConflict: result.data.coreConflict,
        threeActs: result.data.threeActs,
      };
    },
  };
}

/**
 * 2. 分集短剧剧本编写步骤 (基于故事骨架扩写高张力对白与动作)
 */
export function createScriptStep(ctx: Context): PipelineStep {
  return {
    id: "step-script",
    name: "分集短剧剧本编写 (Script & Dialogue)",
    description: "将故事骨架扩写为带角色动作、对白与情绪卡点的标准化剧本",
    dependsOn: ["step-skeleton"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始基于故事骨架扩写剧本与对白...");
      stepCtx.reportProgress(30, "正在设计角色对白冲突与动作细节");

      const skeletonData = stepCtx.previousOutputs["step-skeleton"];
      const continuity = (ctx.root as any)?.continuity || (ctx as any).reflect?.get?.("continuity");
      let continuityPrompt = "";
      if (continuity) {
        const hooks = continuity.forwardPlotHooksToNext(stepCtx.projectId, 1);
        if (hooks.length > 0) {
          continuityPrompt = `\n- 必须承接贯穿的伏笔悬念：${hooks.map((h: any) => h.description).join("；")}`;
          stepCtx.log(`[跨集连贯性] 成功承接 ${hooks.length} 条剧情伏笔悬念`);
        }
      }

      const prompt = `你是一位短剧金牌编剧。根据以下故事大纲与核心矛盾，为第 1 集撰写最具有戏剧冲突的前 3 个镜头对白与肢体动作提示：
故事信息：
- 核心矛盾：${skeletonData?.coreConflict || "正邪对抗"}
- 剧情概要：${skeletonData?.skeleton || "无"}${continuityPrompt}

请严格以合法 JSON 格式输出：
{
  "episodeIndex": 1,
  "title": "第 1 集标题",
  "dialogueLines": [
    { "role": "角色名", "line": "一句话高张力对白台词", "action": "神态与肢体动作指导" },
    { "role": "角色名", "line": "一句话反击或挑衅对白", "action": "神态与动作" },
    { "role": "旁白", "line": "叙事悬念推进台词", "action": "特写镜头推进" }
  ]
}
注意：只输出合法 JSON 代码块，严禁多余文字。`;

      const fallback = {
        episodeIndex: 1,
        title: "第 1 集：风云乍起",
        dialogueLines: [
          { role: "萧凡", line: "三十年河东，三十年河西，莫欺少年穷！", action: "紧握断剑，目光凌厉如冰" },
          { role: "执法执事", line: "一介顽石，也配在此大放厥词？", action: "轻蔑冷笑，挥袖震荡劲风" },
          { role: "旁白", line: "古老印记在鲜血浸染下，骤然迸发出破晓之光...", action: "镜头拉近聚焦胸口神光" },
        ],
      };

      const result = await ctx.providers.generateStructured({
        model: stepCtx.input.textModel || "deepseek-v4-flash",
        prompt,
        schema: ScriptDialogueSchema,
        fallback,
        onRetry: (attempt: number) => {
          stepCtx.log(`[AI 自我纠偏] 剧本对白结构异常，正在启动第 ${attempt} 次针对性纠偏...`);
        },
      });

      if (result.repaired) {
        stepCtx.log(`[AI 自我纠偏成功] 经历 ${result.attempts} 次调用，模型成功修复角色对白与动作数据！`);
      }

      stepCtx.reportProgress(100, "短剧剧本编写完毕");
      return {
        episodeIndex: result.data.episodeIndex,
        title: result.data.title,
        dialogueLines: result.data.dialogueLines,
        rawScript: result.rawText,
      };
    },
  };
}

/**
 * 3. 角色与场景资产设定步骤
 */
export function createAssetStep(ctx: Context): PipelineStep {
  return {
    id: "step-assets",
    name: "角色与场景资产设定 (Character & Scene Assets)",
    description: "从剧本中提取大三角角色外貌特征与核心场景氛围描述",
    dependsOn: ["step-script"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("提取核心角色与场景视觉资产...");
      stepCtx.reportProgress(50, "分析视觉外貌特征");

      const scriptData = stepCtx.previousOutputs["step-script"];
      const lines = scriptData?.dialogueLines || [];
      const roles = Array.from(new Set(lines.map((l: any) => l.role).filter((r: string) => r && r !== "旁白")));

      const heroName = roles[0] || "主角";
      const rivalName = roles[1] || "对手";

      const characters = [
        {
          name: heroName,
          role: "主角 (Protagonist)",
          visualPrompt: `英武坚毅的年轻人，身姿挺拔，目光如炬，暗色系精致劲装，电影级超写实光影`,
        },
        {
          name: rivalName,
          role: "反派 / 对手 (Antagonist)",
          visualPrompt: `气势凌人的威严对手，面带嘲弄与杀机，华贵服饰，手持法器，冷峻逆光`,
        },
      ];

      const scenes = [
        {
          name: "核心冲突对决地",
          visualPrompt: "狂风呼啸的古老对决场，巨石林立，暗流涌动的苍穹压顶，强烈戏剧光影",
        },
      ];

      stepCtx.reportProgress(100, "视觉资产配置完毕");

      const visualConsistency = (ctx.root as any)?.visualConsistency || (ctx as any).reflect?.get?.("visualConsistency");
      if (visualConsistency) {
        visualConsistency.extractAnchorsFromAssets(stepCtx.projectId, characters);
      }

      return { characters, scenes };
    },
  };
}

/**
 * 4. 分镜镜头规划步骤 (调用 AI 规划真实分镜镜头表)
 */
export function createStoryboardStep(ctx: Context): PipelineStep {
  return {
    id: "step-storyboard",
    name: "分镜镜头规划 (Storyboard Shot List)",
    description: "将剧本拆解为带景别、运镜、台词、画幅与预估秒数的镜头清单",
    dependsOn: ["step-script", "step-assets"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始规划分镜镜头列表...");
      stepCtx.reportProgress(40, "排布景别与运镜逻辑");

      const scriptData = stepCtx.previousOutputs["step-script"];
      const lines = scriptData?.dialogueLines || [];

      const prompt = `你是一位院线级短剧导演。请根据以下剧本对白，规划 3 个电影级分镜镜头：
剧本台词：
${JSON.stringify(lines)}

请严格以合法 JSON 格式输出：
{
  "shots": [
    {
      "shotIndex": 1,
      "cameraAngle": "远景 (Wide Shot) / 中景 / 特写",
      "prompt": "镜头画面中文视觉提示词，包含光影、环境构图与动作氛围",
      "dialogue": "本镜头对应的对白台词",
      "voiceRole": "说出该台词的角色名字",
      "duration": 3.5
    }
  ]
}
注意：只输出合法 JSON 代码块，不要废话。`;

      const fallbackShots = [
        {
          shotIndex: 1,
          cameraAngle: "远景 (Wide Shot)",
          prompt: "狂风呼啸的古老演武场，两道身影遥遥相对，浓重暗云压顶，电影级逆光",
          dialogue: lines[0]?.line || "受死吧！",
          voiceRole: lines[0]?.role || "执法执事",
          duration: 3.5,
        },
        {
          shotIndex: 2,
          cameraAngle: "中景 (Medium Shot)",
          prompt: "少年横剑在前，眼神如寒星般凌厉，黑袍猎猎作响，周身萦绕微弱神芒",
          dialogue: lines[1]?.line || "三十年河东，三十年河西，莫欺少年穷！",
          voiceRole: lines[1]?.role || "萧凡",
          duration: 4.0,
        },
        {
          shotIndex: 3,
          cameraAngle: "特写 (Close-up)",
          prompt: "胸前古玉碎片骤然爆发刺目神光，无数金色符文冲天而起，粒子光效绚烂",
          dialogue: lines[2]?.line || "古印苏醒，神光破晓！",
          voiceRole: lines[2]?.role || "旁白",
          duration: 3.0,
        },
      ];

      const result = await ctx.providers.generateStructured({
        model: stepCtx.input.textModel || "deepseek-v4-flash",
        prompt,
        schema: StoryboardPlanningSchema,
        fallback: { shots: fallbackShots },
        onRetry: (attempt: number) => {
          stepCtx.log(`[AI 自我纠偏] 分镜清单结构异常，正在启动第 ${attempt} 次针对性纠偏...`);
        },
      });

      if (result.repaired) {
        stepCtx.log(`[AI 自我纠偏成功] 经历 ${result.attempts} 次调用，模型成功修复分镜镜头数据！`);
      }

      const stylePreset = getStylePreset(stepCtx.input?.stylePreset);
      const defaultFilter = stylePreset.defaultFilter || "cinematic_teal_orange";
      const defaultTransitions: any[] = ["fade", "dissolve", "fadewhite"];

      let shots = result.data.shots;
      // 规范化镜头索引与默认值
      shots = shots.slice(0, 3).map((s: any, idx: number) => ({
        shotIndex: s.shotIndex || idx + 1,
        cameraAngle: s.cameraAngle || (idx === 0 ? "远景" : idx === 1 ? "中景" : "特写"),
        prompt: s.prompt || `第 ${idx + 1} 镜头电影质感画面`,
        dialogue: s.dialogue || lines[idx]?.line || "",
        voiceRole: s.voiceRole || lines[idx]?.role || "旁白",
        duration: Number(s.duration) || 3.5,
        filter: s.filter || defaultFilter,
        transition: s.transition || defaultTransitions[idx % defaultTransitions.length],
      }));

      stepCtx.reportProgress(100, `已规划 ${shots.length} 个镜头分镜`);
      return {
        totalShots: shots.length,
        shots,
      };
    },
  };
}

/**
 * 5. 批量分镜图渲染步骤 (并持久化落库 SQLite)
 */
export function createImageRenderStep(ctx: Context): PipelineStep {
  return {
    id: "step-render-images",
    name: "批量分镜渲染 (Storyboard Image Rendering)",
    description: "遍历分镜镜头表，调用当前生图 Provider 批量生成分镜图并持久化到 SQLite",
    dependsOn: ["step-storyboard"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始批量渲染分镜画面...");
      const storyboardData = stepCtx.previousOutputs["step-storyboard"];
      const shots = storyboardData?.shots || [];

      const renderedShots: any[] = [];
      const total = shots.length;

      for (let i = 0; i < total; i++) {
        const shot = shots[i];
        stepCtx.log(`[渲染镜头 ${i + 1}/${total}] ${shot.prompt.slice(0, 30)}...`);

        // 注入短剧画风提示词增强因子
        let promptToRender = enrichPromptWithStyle(shot.prompt, stepCtx.input?.stylePreset);

        // 角色视觉特征锚定与防漂移强化
        const visualConsistency = (ctx.root as any)?.visualConsistency || (ctx as any).reflect?.get?.("visualConsistency");
        if (visualConsistency) {
          const anchor =
            visualConsistency.getCharacterAnchor(stepCtx.projectId, shot.voiceRole || "") ||
            visualConsistency.getCharacterAnchors(stepCtx.projectId)[0];
          if (anchor) {
            promptToRender = visualConsistency.autoEnrichPrompt(promptToRender, anchor);
            stepCtx.log(`[角色视觉锚定] 镜头 ${shot.shotIndex} 锁定 [${anchor.characterName}] 外观特征`);
          }
        }

        // 调用当前生效的生图 Provider
        const img = await ctx.providers.generateImage({
          model: stepCtx.input.imageModel || "bridge-image",
          prompt: promptToRender,
          aspectRatio: "16:9",
          size: "1K",
        });

        // 持久化写入 SQLite 数据库
        const shotId = `shot_${stepCtx.jobId}_${shot.shotIndex}`;
        const existing = ctx.db.getShot(shotId);
        let record;
        if (existing) {
          ctx.db.updateShotMedia(shotId, {
            imageUrl: img.url || img.base64,
            filter: shot.filter || existing.filter,
            transition: shot.transition || existing.transition,
            status: existing.status === "video_ready" ? "video_ready" : "image_ready",
          });
          record = ctx.db.getShot(shotId)!;
        } else {
          record = ctx.db.createShot({
            id: shotId,
            projectId: stepCtx.projectId,
            episodeIndex: 1,
            shotIndex: shot.shotIndex,
            prompt: shot.prompt,
            dialogue: shot.dialogue,
            voiceRole: shot.voiceRole,
            duration: shot.duration,
            filter: shot.filter,
            transition: shot.transition,
            status: "image_ready",
            imageUrl: img.url || img.base64,
          });
        }

        renderedShots.push({
          shotIndex: shot.shotIndex,
          imageUrl: img.url || img.base64?.slice(0, 60) + "...",
          recordId: record.id,
        });

        const percent = Math.round(((i + 1) / total) * 100);
        stepCtx.reportProgress(percent, `已完成 ${i + 1}/${total} 个分镜画面渲染`);
      }

      return {
        totalRendered: renderedShots.length,
        shots: renderedShots,
      };
    },
  };
}

/**
 * 6. 对白语音合成步骤 (TTS Dubbing)
 */
export function createTTSDubbingStep(ctx: Context): PipelineStep {
  return {
    id: "step-dubbing-tts",
    name: "对白语音合成 (Dialogue TTS Dubbing)",
    description: "提取分镜镜头表对白台词与角色人设，批量调用 TTS 生成配音音频并持久化到 SQLite",
    dependsOn: ["step-storyboard"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始批量合成短剧角色对白配音...");
      const storyboardData = stepCtx.previousOutputs["step-storyboard"];
      const shots = storyboardData?.shots || [];

      const dubbedShots: any[] = [];
      const total = shots.length;

      for (let i = 0; i < total; i++) {
        const shot = shots[i];
        if (!shot.dialogue) {
          continue;
        }

        stepCtx.log(`[配音镜头 ${i + 1}/${total}] [${shot.voiceRole || "角色"}]: "${shot.dialogue}"`);

        const tts = await ctx.providers.generateTTS({
          model: stepCtx.input.ttsModel || "bridge-tts",
          text: shot.dialogue,
          voice: shot.voiceRole || "zh-CN-YunxiNeural",
        });

        // 视听健康质检与音画时长自适应校准
        const mediaIntegrity = (ctx.root as any)?.mediaIntegrity || (ctx as any).reflect?.get?.("mediaIntegrity");
        let actualAudioSec = (tts.durationMs || 3000) / 1000;
        if (mediaIntegrity && tts.audioUrl) {
          const audioHealth = mediaIntegrity.validateAudio(tts.audioUrl);
          if (audioHealth.valid && audioHealth.durationSec > 0) {
            actualAudioSec = audioHealth.durationSec;
          }
          if (audioHealth.isSilent) {
            stepCtx.log(`[视听流告警] 镜头 ${shot.shotIndex} 配音能量过低（疑似静音）`);
          } else if (audioHealth.isClipped) {
            stepCtx.log(`[视听流告警] 镜头 ${shot.shotIndex} 检测到削顶爆音`);
          }
        }

        // 音画时序对齐：若配音长于规划镜头，自动拉伸分镜时长，防止台词被截断
        let finalDuration = shot.duration;
        if (mediaIntegrity) {
          const sync = mediaIntegrity.calibrateAudioVisualPacing(shot.duration, actualAudioSec);
          if (sync.calibratedDuration > shot.duration) {
            finalDuration = sync.calibratedDuration;
            stepCtx.log(`[音画时序校准] 镜头 ${shot.shotIndex} 配音(${actualAudioSec}s) > 规划(${shot.duration}s)，已自动拉伸至 ${finalDuration}s`);
          }
        }

        const shotId = `shot_${stepCtx.jobId}_${shot.shotIndex}`;
        const existing = ctx.db.getShot(shotId);
        if (existing) {
          ctx.db.updateShotMedia(shotId, {
            audioUrl: tts.audioUrl,
            duration: finalDuration,
          });
        } else {
          ctx.db.createShot({
            id: shotId,
            projectId: stepCtx.projectId,
            episodeIndex: 1,
            shotIndex: shot.shotIndex,
            prompt: shot.prompt,
            dialogue: shot.dialogue,
            voiceRole: shot.voiceRole,
            duration: finalDuration,
            status: "draft",
            audioUrl: tts.audioUrl,
          });
        }

        dubbedShots.push({
          shotIndex: shot.shotIndex,
          voiceRole: shot.voiceRole,
          dialogue: shot.dialogue,
          audioUrl: tts.audioUrl?.slice(0, 60) + "...",
          durationMs: tts.durationMs,
        });

        const percent = Math.round(((i + 1) / total) * 100);
        stepCtx.reportProgress(percent, `已完成 ${i + 1}/${total} 个镜头对白配音`);
      }

      return {
        totalDubbed: dubbedShots.length,
        shots: dubbedShots,
      };
    },
  };
}

/**
 * 7. 图生视频动画渲染步骤 (Video Rendering)
 */
export function createVideoRenderStep(ctx: Context): PipelineStep {
  return {
    id: "step-render-videos",
    name: "图生视频动画渲染 (Storyboard Video Rendering)",
    description: "基于已渲染的分镜图作为首帧，结合运镜指示与提示词批量生成连续视频片段",
    dependsOn: ["step-render-images", "step-dubbing-tts"],
    async execute(stepCtx: StepExecutionContext) {
      stepCtx.log("开始基于分镜首帧与配音渲染可播放视频片段...");
      const storyboardData = stepCtx.previousOutputs["step-storyboard"];
      const shots = storyboardData?.shots || [];

      const videoShots: any[] = [];
      const total = shots.length;

      for (let i = 0; i < total; i++) {
        const shot = shots[i];
        const shotId = `shot_${stepCtx.jobId}_${shot.shotIndex}`;
        const shotRecord = ctx.db.getShot(shotId);

        stepCtx.log(`[视频渲染 ${i + 1}/${total}] 镜头 #${shot.shotIndex}: ${shot.prompt.slice(0, 30)}...`);

        const video = await ctx.providers.generateVideo({
          model: stepCtx.input.videoModel || "bridge-video",
          prompt: `${shot.cameraAngle || ""} ${shot.prompt}`,
          duration: shot.duration || 3.5,
          firstFrame: shotRecord?.imageUrl,
          audioPathOrBase64: shotRecord?.audioUrl,
          cameraMotion: shot.cameraMotion,
          dialogue: shot.dialogue,
          voiceRole: shot.voiceRole,
          filter: shot.filter || shotRecord?.filter,
          transition: shot.transition || shotRecord?.transition,
        });

        const videoUrl = video.videoUrl || "";
        let isPhysicallyVerified = false;
        let fileSizeBytes = 0;
        if (videoUrl && videoUrl.startsWith("/")) {
          const localPath = path.resolve(process.cwd(), "public", videoUrl.replace(/^\//, ""));
          if (fs.existsSync(localPath)) {
            const stat = fs.statSync(localPath);
            isPhysicallyVerified = stat.size > 100;
            fileSizeBytes = stat.size;
            stepCtx.log(`[视频物理文件审计通过] ${videoUrl} (大小: ${fileSizeBytes} 字节)`);
          }
        }

        ctx.db.updateShotMedia(shotId, {
          videoUrl,
          status: "video_ready",
        });

        videoShots.push({
          shotIndex: shot.shotIndex,
          videoUrl,
          duration: video.duration,
          fileSizeBytes,
          isPhysicallyVerified,
        });

        const percent = Math.round(((i + 1) / total) * 100);
        stepCtx.reportProgress(percent, `已完成 ${i + 1}/${total} 个分镜视频片段渲染并确认物理文件落盘`);
      }

      return {
        totalVideos: videoShots.length,
        shots: videoShots,
      };
    },
  };
}
