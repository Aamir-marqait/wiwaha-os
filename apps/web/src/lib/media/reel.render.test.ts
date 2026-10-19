import { writeFile } from "node:fs/promises";
import path from "node:path";
import { contactCueStart, groupWords, spokenText, timeWordsEvenly } from "@wiwaha/agents";
import { describe, expect, it } from "vitest";
import { assembleArgs, buildAss, photoShotArgs, posterArgs, run, xfadeOffsets } from "./reel";

describe("reel pieces", () => {
  it("xfade offsets add up", () => {
    expect(xfadeOffsets([3, 4, 5], [0.35, 0])).toEqual([2.65, 6.65]);
  });
  it("captions never show voice tags or braces, and the number plate runs to the end", () => {
    const ass = buildAss([{ start: 0, end: 1.2, text: "Your {wedding}," }], { text: "+91 9169935666", start: 4 }, 9);
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.20,Cap,,0,0,0,,Your wedding,");
    expect(ass).toContain("Dialogue: 1,0:00:04.00,0:00:09.00,Num,,0,0,0,,+91 9169935666");
  });
});

const DIR = process.env.SLIDE_TEST_DIR;
describe.skipIf(!DIR)("reel assembly (local ffmpeg)", () => {
  it("builds a silent captioned reel from photos", async () => {
    const t0 = Date.now();
    const script = "Your wedding, your way. A private estate fifteen minutes from the airport. Every corner dressed for your story. Call or WhatsApp us on +91 9169935666.";
    const words = timeWordsEvenly(spokenText(script), 2.3);
    const total = words.at(-1)!.end + 0.6;
    const photos = ["event-043-061", "main-entrance", "lobby-pathway", "event-041-059", "lawn"];
    const motions = ["in", "left", "out", "right", "in"] as const;
    const len = total / photos.length;
    const shots = [];
    for (const [i, p] of photos.entries()) {
      const out = `${DIR}/out/shot-${i}.mp4`;
      await run(photoShotArgs(`${DIR}/testset/${p}.jpg`, out, len + (i < photos.length - 1 && i === 2 ? 0.35 : 0), motions[i]!));
      shots.push({ path: out, duration: len + (i === 2 ? 0.35 : 0), transition: (i === 3 ? "dissolve" : "cut") as "cut" | "dissolve" });
    }
    const t1 = Date.now();
    const assPath = `${DIR}/out/caps.ass`;
    await writeFile(assPath, buildAss(groupWords(words), { text: "+91 9169935666", start: contactCueStart(words)! }, total));
    const output = `${DIR}/out/reel.mp4`;
    await run(assembleArgs({ shots, voice: null, music: null, logo: null, ass: assPath, fontsDir: path.join(process.cwd(), "assets", "fonts"), total, output }));
    await run(posterArgs(output, `${DIR}/out/poster.jpg`));
    console.log(`shots ${(t1 - t0) / 1000}s, assemble ${(Date.now() - t1) / 1000}s, total ${total.toFixed(1)}s`);
    expect(total).toBeGreaterThan(5);
  }, 400_000);
});
