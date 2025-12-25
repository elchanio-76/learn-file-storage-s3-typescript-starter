import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, UserForbiddenError } from "./errors";
import { randomBytes } from "crypto";


export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  
  const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  
  console.log("uploading video", videoId, "by user", userID);
  const videoData = await getVideo(cfg.db, videoId);
  if (!videoData) {
    throw new BadRequestError("Video not found");
  }
  if (videoData.userID !== userID) {
    throw new UserForbiddenError("User not authorized to upload video");
  }
  // Get video data and check file type and size
  const formData = await req.formData();
  const videoFile = formData.get("video");
  if (!videoFile || !(videoFile instanceof File)) {
    throw new BadRequestError("Invalid video file");
  }
  if (videoFile.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`Video file too large.\nMax Size: ${MAX_UPLOAD_SIZE/1024/1024} MB.`);
  }
  if (videoFile.type !== "video/mp4") {
    throw new BadRequestError("Invalid video file type");
  }
  // Future-proof handling multiple extensions and write into tmpfile for uploading
  const ext = videoFile.type.split("/")[1];
  const tmpFilePath = `/tmp/${videoId}.${ext}`;
  const bytes = await Bun.write(tmpFilePath, videoFile);
  const processedVideo = processVideoForFastStart(tmpFilePath);

  console.log(`wrote ${bytes} bytes to ${tmpFilePath}`);

  // Upload video in Amazon S3
  const randomFileName = randomBytes(32).toString("base64url");
  const aspectRatio = await getVideoAspectRatio(processedVideo);
  console.log("aspect ratio: ", aspectRatio);

  const s3VideoKey = `${aspectRatio}/${randomFileName}.${ext}`;
  const s3File =  cfg.s3Client.file(s3VideoKey);
  console.log(`uploading video to s3. Bucket: ${s3File.bucket}, Key: ${s3VideoKey}, ${s3File.name}`);
  const uploaded = await s3File.write(await Bun.file(processedVideo).bytes(), {type: videoFile.type});
  console.log("Bytes uploaded: ", uploaded);

  // delete tmpfiles
  await Bun.file(tmpFilePath).delete()
  await Bun.file(processedVideo).delete();

  // Store video URL in DB
  const videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${s3VideoKey}`;
  videoData.videoURL = videoURL;
  updateVideo(cfg.db, videoData);

  return respondWithJSON(200, null);
}

export async function getVideoAspectRatio(filepath:string): Promise<string> {
  const { width, height } = await getVideoDimensions(filepath);

  if (width === 0 || height === 0) {
    throw new Error("Invalid video dimensions");
  }
  const AR = width/height;
  
  if ((AR > 16/9 * 0.95) && (AR < 16/9*1.05)) {
    return "landscape";
  } else if ((AR > 9/16 * 0.95) && (AR < 9/16*1.95)) {
    return "portrait";
  } else {
    return "other";
  }
}

async function getVideoDimensions(filepath: string): Promise<{ width: number; height: number }> {
  const proc = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filepath]);
  const stdout = proc.stdout;
  const stderr = proc.stderr;
  if (await proc.exited !== 0) {
    throw new Error(`ffprobe exited with code ${proc.exited}`);
  }
  const output = await new Response(stdout).json();
  const stream = output.streams[0];
  return { width: stream.width, height: stream.height };
}

function processVideoForFastStart(inputFilePath: string): string {
  const outputFilePath = inputFilePath.replace(".mp4", "_faststart.mp4");
  const command = `ffmpeg -i ${inputFilePath} -movflags faststart -map_metadata 0 -codec copy -f mp4 ${outputFilePath}`;
  const proc = Bun.spawnSync(["ffmpeg", "-i", inputFilePath, "-movflags", "faststart", "-map_metadata", "0", "-codec", "copy", "-f", "mp4", outputFilePath]);
  if (proc.exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${proc.exitCode}`);
  }
  const output = proc.stdout.toString();
  const error = proc.stderr.toString();
  console.log("ffmpeg output: ", output);
  console.log("ffmpeg error: ", error);
  return outputFilePath;
}