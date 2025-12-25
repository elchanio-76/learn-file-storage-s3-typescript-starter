import { describe, test, expect, mock, spyOn } from "bun:test";
import { getVideoAspectRatio } from "../api/videos";

describe("getVideoAspectRatio", () => {
  test("returns 16:9 for 1920x1080 video", async () => {
    const mockSpawn = spyOn(Bun, "spawn").mockReturnValue({
      stdout: {
        toString: () => JSON.stringify({
          streams: [{ width: 1920, height: 1080 }]
        })
      },
      stderr: {
        toString: () => ""
      },
      exited: Promise.resolve(0)
    } as any);
    
    const result = await getVideoAspectRatio("/fake/path.mp4");
    expect(result).toBe("landscape");
    
    mockSpawn.mockRestore();
  });

  test("returns 9:16 for 1080x1920 video", async () => {
    const mockSpawn = spyOn(Bun, "spawn").mockReturnValue({
      stdout: {
        toString: () => JSON.stringify({
          streams: [{ width: 1080, height: 1920 }]
        })
      },
      stderr: {
        toString: () => ""
      },
      exited: Promise.resolve(0)
    } as any);
    
    const result = await getVideoAspectRatio("/fake/path.mp4");
    expect(result).toBe("portrait");
    
    mockSpawn.mockRestore();
  });

  test("returns other for non-standard aspect ratio", async () => {
    const mockSpawn = spyOn(Bun, "spawn").mockReturnValue({
      stdout: {
        toString: () => JSON.stringify({
          streams: [{ width: 800, height: 600 }]
        })
      },
      stderr: {
        toString: () => ""
      },
      exited: Promise.resolve(0)
    } as any);
    
    const result = await getVideoAspectRatio("/fake/path.mp4");
    expect(result).toBe("other");
    
    mockSpawn.mockRestore();
  });

  test("throws error for invalid dimensions", async () => {
    const mockSpawn = spyOn(Bun, "spawn").mockReturnValue({
      stdout: {
        toString: () => JSON.stringify({
          streams: [{ width: 0, height: 0 }]
        })
      },
      stderr: {
        toString: () => ""
      },
      exited: Promise.resolve(0)
    } as any);
    
    await expect(getVideoAspectRatio("/fake/path.mp4")).rejects.toThrow("Invalid video dimensions");
    
    mockSpawn.mockRestore();
  });

  test("throws error when ffprobe fails", async () => {
    const mockSpawn = spyOn(Bun, "spawn").mockReturnValue({
      stdout: {
        toString: () => ""
      },
      stderr: {
        toString: () => "error"
      },
      exited: Promise.resolve(1)
    } as any);
    
    await expect(getVideoAspectRatio("/fake/path.mp4")).rejects.toThrow("ffprobe exited with code");
    
    mockSpawn.mockRestore();
  });
});
