import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildMoodboardPdf } from "./deck-pdf";

const DIR = process.env.SLIDE_TEST_DIR;
describe.skipIf(!DIR)("moodboard PDF", () => {
  it("cover, function page and space-vs-décor pages", async () => {
    const pdf = await buildMoodboardPdf({
      couple: "Ananya & Rohan", palette: ["#F8F3E9", "#E9DCC0", "#C9A24B", "#F6C445"], labelAi: true,
      functions: [{ name: "Muhurtham", dateLabel: "SUN, 31 JAN 2027 · MORNING", areas: ["Lawn", "Main entrance"], guests: 350, theme: "Brass and mallige", description: "Ivory and gold with marigold, brass lamps and jasmine strings.", slides: [
        { areaName: "Main entrance", element: "Entrance décor", caption: "Brass urlis and tuberose either side of the carved door", baseUrl: await readFile(`${DIR}/testset/main-entrance.jpg`), imageUrl: await readFile(`${DIR}/pdf2/img-013-021.jpg`), ai: true },
        { areaName: "Lawn", element: "Mandap", caption: "A floral canopy mandap facing the guests", baseUrl: await readFile(`${DIR}/testset/lawn.jpg`), imageUrl: await readFile(`${DIR}/testset/event-043-061.jpg`), ai: false },
      ] }],
    });
    expect(pdf.length).toBeGreaterThan(50_000);
    await writeFile(`${DIR}/out/moodboard.pdf`, pdf);
  }, 60_000);
});
