import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../src/core/context.js";
import { DatabaseService } from "../src/services/database.js";
import { exportFullEpisode, formatVttTime } from "../src/services/video-generator.js";
import { apply as applyServer } from "../src/plugins/server/index.js";
import type { StoryboardShot } from "../src/core/types.js";

import os from "node:os";

describe("CineDrama OS Desktop UX, Timeline Reordering & Master Export Suite", () => {
  const ctx = createContext();
  let db: DatabaseService;
  const testPort = 3188;
  const testHost = "127.0.0.1";
  const testProjectId = `proj_test_${Date.now()}`;
  const testDbPath = path.join(os.tmpdir(), `cinedrama_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = new DatabaseService(ctx, testDbPath);
    (ctx as any).db = db;
    applyServer(ctx, { host: testHost, port: testPort });
    // 等待服务监听
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(() => {
    ctx.events.emit("dispose");
    db.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch {}
  });

  it("should correctly format WebVTT timestamps", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(3.5)).toBe("00:00:03.500");
    expect(formatVttTime(65.123)).toBe("00:01:05.123");
    expect(formatVttTime(3661.05)).toBe("01:01:01.050");
  });

  it("should reorder shots atomically in SQLite and update shot_index", () => {
    db.createProject({ id: testProjectId, title: "交互测试短剧", aspectRatio: "16:9" });

    const shot1 = db.createShot({
      id: "shot_1",
      projectId: testProjectId,
      episodeIndex: 1,
      shotIndex: 1,
      prompt: "镜头一：主角萧凡登场",
      dialogue: "三十年河东，三十年河西！",
      voiceRole: "萧凡",
      duration: 2.0,
      status: "video_ready",
    });

    const shot2 = db.createShot({
      id: "shot_2",
      projectId: testProjectId,
      episodeIndex: 1,
      shotIndex: 2,
      prompt: "镜头二：执法执事冷笑",
      dialogue: "无知小儿，休要狂妄！",
      voiceRole: "执事",
      duration: 2.5,
      status: "video_ready",
    });

    const shot3 = db.createShot({
      id: "shot_3",
      projectId: testProjectId,
      episodeIndex: 1,
      shotIndex: 3,
      prompt: "镜头三：宗门大印光芒万丈",
      dialogue: "破阵之光，现！",
      voiceRole: "萧凡",
      duration: 3.0,
      status: "video_ready",
    });

    // 初始顺序验证
    const initialShots = db.listShotsByProject(testProjectId);
    expect(initialShots.map((s) => s.id)).toEqual(["shot_1", "shot_2", "shot_3"]);
    expect(initialShots.map((s) => s.shotIndex)).toEqual([1, 2, 3]);

    // 重排为 [shot_3, shot_1, shot_2]
    const reorderedShots = db.reorderShots(testProjectId, ["shot_3", "shot_1", "shot_2"]);
    expect(reorderedShots.map((s) => s.id)).toEqual(["shot_3", "shot_1", "shot_2"]);
    expect(reorderedShots.map((s) => s.shotIndex)).toEqual([1, 2, 3]);
  });

  it("should export full episode stitched video and continuous Master WebVTT", () => {
    const shots: StoryboardShot[] = db.listShotsByProject(testProjectId);
    expect(shots.length).toBe(3);

    const exportResult = exportFullEpisode(shots, testProjectId, { includeSubtitles: true, format: "all" });

    expect(exportResult.success).toBe(true);
    expect(exportResult.projectId).toBe(testProjectId);
    expect(exportResult.shotCount).toBe(3);
    expect(exportResult.totalDuration).toBe(7.5); // 2.0 + 2.5 + 3.0
    expect(exportResult.videoUrl).toContain(`master_episode_${testProjectId}.mp4`);
    expect(exportResult.vttUrl).toContain(`master_episode_${testProjectId}.vtt`);

    // 物理文件验证
    expect(exportResult.localVideoPath).toBeDefined();
    expect(fs.existsSync(exportResult.localVideoPath!)).toBe(true);
    expect(fs.statSync(exportResult.localVideoPath!).size).toBeGreaterThan(100);

    expect(exportResult.localVttPath).toBeDefined();
    expect(fs.existsSync(exportResult.localVttPath!)).toBe(true);

    const vttContent = fs.readFileSync(exportResult.localVttPath!, "utf-8");
    expect(vttContent).toContain("WEBVTT - CineDrama Master Episode Subtitles");
    expect(vttContent).toContain("00:00:00.000 --> 00:00:03.000"); // 镜头3 (3.0s) 排在最前
    expect(vttContent).toContain("00:00:03.000 --> 00:00:05.000"); // 镜头1 (2.0s)
    expect(vttContent).toContain("00:00:05.000 --> 00:00:07.500"); // 镜头2 (2.5s)
  });

  it("should handle HTTP endpoints for shot reordering and full export", async () => {
    // 1. GET /api/projects/:id/shots
    const getRes = await fetch(`http://${testHost}:${testPort}/api/projects/${testProjectId}/shots`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as { success: boolean; shots: Array<{ id: string; shotIndex: number }> };
    expect(getData.shots.length).toBe(3);

    // 2. POST /api/projects/:id/shots/reorder
    const reorderRes = await fetch(`http://${testHost}:${testPort}/api/projects/${testProjectId}/shots/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shotIds: ["shot_2", "shot_1", "shot_3"] }),
    });
    expect(reorderRes.status).toBe(200);
    const reorderData = (await reorderRes.json()) as { success: boolean; shots: Array<{ id: string; shotIndex: number }> };
    expect(reorderData.success).toBe(true);
    expect(reorderData.shots[0].id).toBe("shot_2");
    expect(reorderData.shots[0].shotIndex).toBe(1);

    // 3. POST /api/projects/:id/export
    const exportRes = await fetch(`http://${testHost}:${testPort}/api/projects/${testProjectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeSubtitles: true, format: "all" }),
    });
    expect(exportRes.status).toBe(200);
    const exportData = (await exportRes.json()) as { export: { success: boolean; shotCount: number; videoUrl?: string; vttUrl?: string } };
    expect(exportData.export.success).toBe(true);
    expect(exportData.export.shotCount).toBe(3);
    expect(exportData.export.videoUrl).toBeDefined();
    expect(exportData.export.vttUrl).toBeDefined();
  });
});
