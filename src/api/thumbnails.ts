import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import { file, type BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "path";
import { randomBytes } from "crypto";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

//const videoThumbnails: Map<string, Thumbnail> = new Map();
/*
export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}
*/
export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  // TODO: implement the upload here
  const formData = await req.formData();
  const thumbnail = formData.get("thumbnail");
  if (!(thumbnail instanceof File)) {
    throw new BadRequestError("Invalid thumbnail");
  }
  if (thumbnail.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`Thumbnail too large. Max Size: ${MAX_UPLOAD_SIZE/1024/1024} MB.`);
  }
  if (thumbnail.type.startsWith("image/")) {
    const data = await thumbnail.arrayBuffer();
    // Get the video metadata and update the thumbnail global map
    const video = getVideo(cfg.db, videoId);
    if (video?.userID !== userID) {
      throw new UserForbiddenError("Forbidden: Wrong user");
    }
    if (!video) {
      throw new NotFoundError("Couldn't find video");
    }

    // Store image in filesystem
    const fileExtension = thumbnail.type.split("/")[1];
    const randomFileName = randomBytes(32).toString("base64url");
    const filePath = path.join(cfg.assetsRoot, `${randomFileName}.${fileExtension}`);
    if(thumbnail.type !== "image/jpeg" && thumbnail.type !== "image/png"){
      throw new BadRequestError("Invalid thumbnail type. Accepting only image/jpeg or image/png");
    }
    
    await Bun.write(filePath, data);
    video.thumbnailURL = `http://localhost:${cfg.port}/assets/${randomFileName}.${fileExtension}`;

    updateVideo(cfg.db, video);

    // Return the video metadata
    return respondWithJSON(200, video);

  } else {
    throw new BadRequestError("Invalid thumbnail");
  }
}
