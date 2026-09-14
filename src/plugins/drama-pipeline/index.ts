import type { Context } from "cordis";
import {
  createSkeletonStep,
  createScriptStep,
  createAssetStep,
  createStoryboardStep,
  createImageRenderStep,
  createTTSDubbingStep,
  createVideoRenderStep,
} from "./steps.js";

/**
 * 标准短剧制作流水线插件 (Drama Pipeline Plugin)
 */
export function apply(ctx: Context) {
  // 1. 注册标准核心步骤 (7 大模块)
  ctx.pipeline.registerStep(createSkeletonStep(ctx));
  ctx.pipeline.registerStep(createScriptStep(ctx));
  ctx.pipeline.registerStep(createAssetStep(ctx));
  ctx.pipeline.registerStep(createStoryboardStep(ctx));
  ctx.pipeline.registerStep(createImageRenderStep(ctx));
  ctx.pipeline.registerStep(createTTSDubbingStep(ctx));
  ctx.pipeline.registerStep(createVideoRenderStep(ctx));

  // 2. 注册预设工作流
  ctx.pipeline.registerWorkflow({
    id: "full-drama-workflow",
    name: "全流程短剧生成 (端到端: 骨架->剧本->资产->分镜->生图)",
    description: "从小说文本直接自动生成完整分镜与画面",
    stepIds: [
      "step-skeleton",
      "step-script",
      "step-assets",
      "step-storyboard",
      "step-render-images",
    ],
  });

  ctx.pipeline.registerWorkflow({
    id: "audiovisual-drama-workflow",
    name: "全模态视听漫剧工作流 (骨架->剧本->资产->分镜->生图+配音->视频片段)",
    description: "端到端完成分镜生图、台词语音合成(TTS)与图生视频渲染",
    stepIds: [
      "step-skeleton",
      "step-script",
      "step-assets",
      "step-storyboard",
      "step-render-images",
      "step-dubbing-tts",
      "step-render-videos",
    ],
  });

  ctx.pipeline.registerWorkflow({
    id: "dubbing-only-workflow",
    name: "仅编剧与对白配音工作流 (骨架->剧本->资产->分镜->TTS)",
    description: "专注于剧本与广播剧级配音台词输出，不执行视频渲染",
    stepIds: [
      "step-skeleton",
      "step-script",
      "step-assets",
      "step-storyboard",
      "step-dubbing-tts",
    ],
  });

  ctx.pipeline.registerWorkflow({
    id: "script-only-workflow",
    name: "仅编剧工作流 (骨架->剧本)",
    description: "专注于剧本与台词创作，不执行视觉生成",
    stepIds: ["step-skeleton", "step-script"],
  });

  ctx.pipeline.registerWorkflow({
    id: "storyboard-planning-workflow",
    name: "分镜规划工作流 (骨架->剧本->资产->分镜表)",
    description: "完成分镜规划但暂停生图，便于导演人工微调提示词",
    stepIds: ["step-skeleton", "step-script", "step-assets", "step-storyboard"],
  });

  console.log("[DramaPipeline] 标准漫剧 7 大视听步骤与 5 套工作流已装配完成！");
}

export default apply;
