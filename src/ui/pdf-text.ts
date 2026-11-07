import { readFileSync } from "node:fs";
import type { PDFFont } from "pdf-lib";
import { type Font, fontFile } from "./font-files.ts";
import type { LayoutCapture, TextFragment } from "./layout.ts";
import type { PdfPages } from "./pdf.ts";

export async function searchablePdf(
  raster: Uint8Array,
  layout: LayoutCapture,
  plan: PdfPages,
  title: string,
): Promise<Uint8Array> {
  const {
    PDFDocument,
    PDFString,
    TextRenderingMode,
    pushGraphicsState,
    popGraphicsState,
    setTextRenderingMode,
    setCharacterSqueeze,
  } = (await import("pdf-lib")).default;
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  const pdf = await PDFDocument.load(raster, { updateMetadata: false });
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setCreator("Project Visualize");
  const fonts = new Map<Font, PDFFont>();
  for (const name of new Set(layout.text.map((span) => span.font)))
    fonts.set(
      name,
      await pdf.embedFont(readFileSync(fontFile(name)), {
        subset: true,
        customName: `Visualize-${name}`,
        features: { liga: false, kern: false },
      }),
    );
  const pages = pdf.getPages();
  function drawSpan(
    index: number,
    span: TextFragment,
    sourceTop: number,
    offset: number,
  ) {
    const page = pages[index],
      font = fonts.get(span.font);
    if (!font) throw new Error(`PDF font is unavailable: ${span.font}`);
    const size = font.sizeAtHeight(span.size) * plan.factor;
    const advance = font.widthOfTextAtSize(span.value, size);
    if (!(advance > 0)) return;
    const x = plan.margin + span.x * plan.factor;
    const y =
      plan.height -
      plan.margin -
      (span.baseline - sourceTop + offset) * plan.factor;
    page.pushOperators(
      pushGraphicsState(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setCharacterSqueeze(((span.width * plan.factor) / advance) * 100),
    );
    page.drawText(span.value, { x, y, size, font });
    page.pushOperators(popGraphicsState());
    if (span.link && /^(https?:|mailto:)/.test(span.link)) {
      const bottom =
        plan.height -
        plan.margin -
        (span.y + span.size - sourceTop + offset) * plan.factor;
      const annotation = pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [
          x,
          bottom,
          x + span.width * plan.factor,
          bottom + span.size * plan.factor,
        ],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(span.link) },
      });
      page.node.addAnnot(pdf.context.register(annotation));
    }
  }
  for (const [index, slice] of plan.slices.entries()) {
    for (const table of slice.repeats)
      for (const span of table.headerText)
        drawSpan(index, span, table.header.top, 0);
    for (const span of layout.text)
      if (span.y >= slice.top && span.y < slice.bottom)
        drawSpan(index, span, slice.top, slice.headerHeight);
  }
  return pdf.save({ useObjectStreams: false });
}
