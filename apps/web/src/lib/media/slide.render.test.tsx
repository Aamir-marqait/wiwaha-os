import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { renderSlide } from "./slide";

const DIR = process.env.SLIDE_TEST_DIR;
// Renders sample slides to files for a visual check (set SLIDE_TEST_DIR to a folder with photos).
describe.skipIf(!DIR)("slide renderer", () => {
  it("renders photo, split, type and CTA slides", async () => {
    const photo = await readFile(`${DIR}/testset/event-043-061.jpg`);
    const door = await readFile(`${DIR}/testset/main-entrance.jpg`);
    const jobs = [
      ["hook", await renderSlide({ aspect: "4:5", layout: "photo", scheme: "light", role: "hook", kicker: "Real weddings", headline: "Your family lands. We take it from there.", support: "Fifteen minutes from Bengaluru airport", imageUrl: photo })],
      ["split", await renderSlide({ aspect: "4:5", layout: "split", scheme: "light", role: "content", headline: "A door that welcomes everyone", support: "Brass urlis, tuberose and mallige either side of the carved teak door", imageUrl: door })],
      ["type", await renderSlide({ aspect: "4:5", layout: "type", scheme: "light", role: "content", kicker: "Planning tip", headline: "Start the rooming list two months out", support: "It gives families time to plan travel, and us time to arrange pickups." })],
      ["cta", await renderSlide({ aspect: "4:5", layout: "type", scheme: "dark", role: "cta", headline: "Check your date with us", support: "Call or WhatsApp +91 9169935666" })],
      ["story", await renderSlide({ aspect: "9:16", layout: "photo", scheme: "light", role: "hook", headline: "Your wedding, your way", support: "A private estate near the airport", imageUrl: photo })],
    ] as const;
    for (const [name, buf] of jobs) {
      expect(buf.length).toBeGreaterThan(20_000);
      await writeFile(`${DIR}/out/slide-${name}.jpg`, buf);
    }
  }, 60_000);
});
