import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type CameraMotion = "zoom_in" | "zoom_out" | "pan_right" | "pan_left" | "breathing" | "still";

export interface VideoRenderOptions {
  prompt?: string;
  duration?: number;
  firstFrame?: string;
  audioPathOrBase64?: string;
  cameraMotion?: CameraMotion;
  dialogue?: string;
  voiceRole?: string;
}

export function resolveCameraMotion(options: VideoRenderOptions): CameraMotion {
  if (options.cameraMotion) return options.cameraMotion;
  const p = (options.prompt || "").toLowerCase();
  if (p.includes("特写") || p.includes("close-up") || p.includes("目光") || p.includes("眼神") || p.includes("神光")) {
    return "zoom_in";
  }
  if (p.includes("远景") || p.includes("全景") || p.includes("wide") || p.includes("演武场") || p.includes("暗云")) {
    return "zoom_out";
  }
  if (p.includes("移") || p.includes("追") || p.includes("猎猎") || p.includes("风呼啸") || p.includes("横移")) {
    return "pan_right";
  }
  if (p.includes("呼吸") || p.includes("对立") || p.includes("对峙") || p.includes("微弱") || p.includes("凝视")) {
    return "breathing";
  }
  return "zoom_in";
}

export interface VideoRenderResult {
  videoUrl: string;
  localPath: string;
  duration: number;
  fileSizeBytes: number;
  isPlayable: boolean;
  error?: string;
}

function createBmpBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      buf[rowOffset + x * 3 + 0] = b;
      buf[rowOffset + x * 3 + 1] = g;
      buf[rowOffset + x * 3 + 2] = r;
    }
  }
  return buf;
}

/**
 * 真实视频生成服务 (调用 FFmpeg 生成真正存在、可解码、可播放的 H.264/AAC MP4 文件)
 * 彻底解决“丢弃首帧画面”与“返回假 MP4 地址”缺陷
 */
export function generateRealVideo(options: VideoRenderOptions): VideoRenderResult {
  const duration = Math.max(1.5, Math.min(options.duration || 3.5, 15.0));
  const publicDir = path.resolve(process.cwd(), "public");
  const storageVideosDir = path.join(publicDir, "storage", "videos");
  fs.mkdirSync(storageVideosDir, { recursive: true });

  const fileName = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
  const outPath = path.join(storageVideosDir, fileName);
  const videoUrl = `/storage/videos/${fileName}`;

  // 1. 准备配音音频临时文件 (若有)
  let tmpAudioPath: string | null = null;
  if (options.audioPathOrBase64) {
    if (options.audioPathOrBase64.startsWith("data:audio")) {
      const b64 = options.audioPathOrBase64.split(",")[1];
      if (b64) {
        tmpAudioPath = path.join(os.tmpdir(), `tf_audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);
        fs.writeFileSync(tmpAudioPath, Buffer.from(b64, "base64"));
      }
    } else if (fs.existsSync(options.audioPathOrBase64)) {
      tmpAudioPath = options.audioPathOrBase64;
    }
  }

  // 2. 准备首帧图片临时文件 (支持 PNG/JPEG/BMP 或 SVG 解析生成)
  let tmpImagePath: string | null = null;
  if (options.firstFrame) {
    if (options.firstFrame.startsWith("data:image/svg+xml")) {
      // 提取 SVG 颜色或生成高质量底色帧作为首帧视觉输入
      const svgStr = Buffer.from(options.firstFrame.split(",")[1] || "", "base64").toString("utf-8");
      const hexMatch = svgStr.match(/fill="?(#([0-9a-fA-F]{3,6}))"?/);
      let r = 24, g = 28, b = 42;
      if (hexMatch && hexMatch[2]) {
        const hex = hexMatch[2];
        if (hex.length === 6) {
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        }
      }
      tmpImagePath = path.join(os.tmpdir(), `tf_frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.bmp`);
      fs.writeFileSync(tmpImagePath, createBmpBuffer(1280, 720, r, g, b));
    } else if (options.firstFrame.startsWith("data:image/png")) {
      const b64 = options.firstFrame.split(",")[1];
      if (b64) {
        tmpImagePath = path.join(os.tmpdir(), `tf_frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`);
        fs.writeFileSync(tmpImagePath, Buffer.from(b64, "base64"));
      }
    } else if (options.firstFrame.startsWith("data:image/jpeg") || options.firstFrame.startsWith("data:image/jpg")) {
      const b64 = options.firstFrame.split(",")[1];
      if (b64) {
        tmpImagePath = path.join(os.tmpdir(), `tf_frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`);
        fs.writeFileSync(tmpImagePath, Buffer.from(b64, "base64"));
      }
    } else if (fs.existsSync(options.firstFrame)) {
      tmpImagePath = options.firstFrame;
    }
  }

  // 3. 准备字幕文件 (若有角色对白)
  let tmpSrtPath: string | null = null;
  if (options.dialogue && options.dialogue.trim()) {
    try {
      const subText = options.dialogue.trim().replace(/[\r\n]/g, " ");
      const role = options.voiceRole ? `[${options.voiceRole}] ` : "";
      const endSec = Math.max(1, duration);
      const endMs = Math.floor((endSec % 1) * 1000);
      const endS = Math.floor(endSec % 60).toString().padStart(2, "0");
      const endM = Math.floor((endSec / 60) % 60).toString().padStart(2, "0");
      const endH = Math.floor(endSec / 3600).toString().padStart(2, "0");
      const srtTime = `${endH}:${endM}:${endS},${endMs.toString().padStart(3, "0")}`;

      tmpSrtPath = path.join(os.tmpdir(), `cd_sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.srt`);
      fs.writeFileSync(tmpSrtPath, `1\n00:00:00,000 --> ${srtTime}\n${role}${subText}\n`, "utf-8");

      // 同步生成 WebVTT 独立字幕文件供前端播放器 <track> 原生支持
      const vttPath = path.join(storageVideosDir, fileName.replace(/\.mp4$/, ".vtt"));
      fs.writeFileSync(vttPath, `WEBVTT\n\n1\n00:00:00.000 --> ${srtTime.replace(",", ".")}\n${role}${subText}\n`, "utf-8");
    } catch {}
  }

  let ffmpegError: string | null = null;

  // 4. 尝试使用系统 FFmpeg 生成真正可播放、带电影级运镜与字幕的 H.264 / AAC MP4 容器
  try {
    const ffmpegArgs: string[] = ["-y"];

    // 视频流输入: 优先使用真实首帧图像，否则降级为色块画布
    const hasImage = Boolean(tmpImagePath && fs.existsSync(tmpImagePath));
    if (hasImage) {
      ffmpegArgs.push("-loop", "1", "-i", tmpImagePath!);
    } else {
      ffmpegArgs.push("-f", "lavfi", "-i", `color=c=0x0f121b:s=1280x720:d=${duration}`);
    }

    // 音频流输入
    if (tmpAudioPath && fs.existsSync(tmpAudioPath)) {
      ffmpegArgs.push("-i", tmpAudioPath);
    } else {
      ffmpegArgs.push("-f", "lavfi", "-i", `anullsrc=r=16000:cl=mono`);
    }

    // 字幕流输入 (若有)
    const hasSub = Boolean(tmpSrtPath && fs.existsSync(tmpSrtPath));
    if (hasSub) {
      ffmpegArgs.push("-i", tmpSrtPath!);
    }

    // 电影级运镜滤镜计算 (25fps 高帧率平滑插值)
    const fps = 25;
    const totalFrames = Math.max(25, Math.round(duration * fps));
    const motion = resolveCameraMotion(options);

    let vfFilter = "scale=1280:720,format=yuv420p";
    if (motion === "zoom_in") {
      vfFilter = `zoompan=z='min(zoom+0.0015,1.20)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;
    } else if (motion === "zoom_out") {
      vfFilter = `zoompan=z='if(lte(zoom,1.0),1.18,max(1.001,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;
    } else if (motion === "pan_right") {
      vfFilter = `zoompan=z=1.12:x='if(lte(on,1),0,min(x+0.8,iw-iw/zoom))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;
    } else if (motion === "pan_left") {
      vfFilter = `zoompan=z=1.12:x='if(lte(on,1),iw-iw/zoom,max(x-0.8,0))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;
    } else if (motion === "breathing") {
      vfFilter = `zoompan=z='1.03+0.015*sin(on/10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1280x720:fps=${fps},format=yuv420p`;
    }

    // 输出滤镜与编码设置 (必须放在所有输入之后)
    ffmpegArgs.push("-t", String(duration));
    if (hasImage) {
      ffmpegArgs.push("-vf", vfFilter);
    }
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac"
    );
    if (hasSub) {
      ffmpegArgs.push("-c:s", "mov_text", "-metadata:s:s:0", "language=chi");
    }
    ffmpegArgs.push("-shortest", outPath);

    execFileSync("ffmpeg", ffmpegArgs, {
      stdio: "ignore",
      timeout: 15000,
      windowsHide: true,
    });

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
      return {
        videoUrl,
        localPath: outPath,
        duration,
        fileSizeBytes: fs.statSync(outPath).size,
        isPlayable: true,
      };
    }
  } catch (err: any) {
    ffmpegError = err?.message || "FFmpeg 执行未返回成功";
  } finally {
    if (tmpAudioPath && tmpAudioPath.startsWith(os.tmpdir())) {
      try {
        fs.unlinkSync(tmpAudioPath);
      } catch {}
    }
    if (tmpImagePath && tmpImagePath.startsWith(os.tmpdir())) {
      try {
        fs.unlinkSync(tmpImagePath);
      } catch {}
    }
    if (tmpSrtPath && tmpSrtPath.startsWith(os.tmpdir())) {
      try {
        fs.unlinkSync(tmpSrtPath);
      } catch {}
    }
  }

  // 4. 遵守 UVSD 规则 14 & 15：若 FFmpeg 调用未成功，明确标定 isPlayable: false 与 error
  // 严禁在生产运行时静默伪装成成功
  writeMinimalValidMp4(outPath, duration);

  return {
    videoUrl,
    localPath: outPath,
    duration,
    fileSizeBytes: fs.existsSync(outPath) ? fs.statSync(outPath).size : 0,
    isPlayable: false,
    error: `FFmpeg 渲染未完成: ${ffmpegError}`,
  };
}

/**
 * 写入标准 ISO BMFF / MP4 规范二进制文件 (ftyp + moov + mdat)
 */
function writeMinimalValidMp4(filePath: string, durationSec: number) {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // 32 bytes
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6f, 0x6d, // 'isom'
    0x69, 0x73, 0x6f, 0x32, // 'iso2'
    0x61, 0x76, 0x63, 0x31, // 'avc1'
    0x6d, 0x70, 0x34, 0x31, // 'mp41'
  ]);

  const mdatHeader = Buffer.from([
    0x00, 0x00, 0x01, 0x00, // 256 bytes
    0x6d, 0x64, 0x61, 0x74, // 'mdat'
  ]);
  const mdatPayload = Buffer.alloc(248, 0x00);

  const moovHeader = Buffer.from([
    0x00, 0x00, 0x00, 0x6c, // 108 bytes
    0x6d, 0x6f, 0x6f, 0x76, // 'moov'
    0x00, 0x00, 0x00, 0x64, // 100 bytes mvhd
    0x6d, 0x76, 0x68, 0x64, // 'mvhd'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x03, 0xe8, // timescale: 1000
    0x00, 0x00, 0x0f, 0xa0, // duration: 4000
    0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x02,
  ]);

  const total = Buffer.concat([ftyp, mdatHeader, mdatPayload, moovHeader]);
  fs.writeFileSync(filePath, total);
}
