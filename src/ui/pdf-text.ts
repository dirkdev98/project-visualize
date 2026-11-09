import { readFileSync } from "node:fs";
import type { PDFDict, PDFFont, PDFRef } from "pdf-lib";
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
    PDFHexString,
    PDFName,
    PDFString,
    TextRenderingMode,
    pushGraphicsState,
    popGraphicsState,
    setTextRenderingMode,
    setCharacterSqueeze,
  } = await import("pdf-lib");
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
      slice = plan.slices[index],
      font = fonts.get(span.font);
    if (!font) throw new Error(`PDF font is unavailable: ${span.font}`);
    const size = font.sizeAtHeight(span.size) * slice.factor;
    const advance = font.widthOfTextAtSize(span.value, size);
    if (!(advance > 0)) return;
    const x = slice.left + span.x * slice.factor;
    const y =
      plan.height -
      plan.margin -
      (span.baseline - sourceTop + offset) * slice.factor;
    page.pushOperators(
      pushGraphicsState(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setCharacterSqueeze(((span.width * slice.factor) / advance) * 100),
    );
    page.drawText(span.value, { x, y, size, font });
    page.pushOperators(popGraphicsState());
    if (span.link && /^(https?:|mailto:)/.test(span.link)) {
      const bottom =
        plan.height -
        plan.margin -
        (span.y + span.size - sourceTop + offset) * slice.factor;
      const annotation = pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [
          x,
          bottom,
          x + span.width * slice.factor,
          bottom + span.size * slice.factor,
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
  if (layout.headings.length) {
    interface Bookmark {
      parent?: Bookmark;
      ref: PDFRef;
      dictionary: PDFDict;
      count: number;
      last?: Bookmark;
    }
    const dictionary = pdf.context.obj({ Type: "Outlines" });
    const root: Bookmark = {
      ref: pdf.context.register(dictionary),
      dictionary,
      count: 0,
    };
    const bookmarks = [root],
      captured = new Map<number, Bookmark>();
    for (const [headingIndex, heading] of layout.headings.entries()) {
      const index = plan.slices.findIndex(
        (slice) => heading.top >= slice.top && heading.top < slice.bottom,
      );
      if (index < 0) continue;
      const parent =
          heading.parent === undefined
            ? root
            : (captured.get(heading.parent) ?? root),
        slice = plan.slices[index];
      const top =
        plan.height -
        plan.margin -
        (heading.top - slice.top + slice.headerHeight) * slice.factor;
      const dictionary = pdf.context.obj({
        Title: PDFHexString.fromText(heading.title),
        Parent: parent.ref,
        Dest: [pages[index].ref, "XYZ", null, top, null],
      });
      const bookmark: Bookmark = {
        parent,
        ref: pdf.context.register(dictionary),
        dictionary,
        count: 0,
      };
      if (parent.last) {
        dictionary.set(PDFName.of("Prev"), parent.last.ref);
        parent.last.dictionary.set(PDFName.of("Next"), bookmark.ref);
      } else parent.dictionary.set(PDFName.of("First"), bookmark.ref);
      parent.dictionary.set(PDFName.of("Last"), bookmark.ref);
      parent.last = bookmark;
      for (
        let ancestor: Bookmark | undefined = parent;
        ancestor;
        ancestor = ancestor.parent
      )
        ancestor.count++;
      bookmarks.push(bookmark);
      captured.set(headingIndex, bookmark);
    }
    if (root.count) {
      for (const bookmark of bookmarks)
        if (bookmark.count)
          bookmark.dictionary.set(
            PDFName.of("Count"),
            pdf.context.obj(bookmark.count),
          );
      pdf.catalog.set(PDFName.of("Outlines"), root.ref);
    }
  }
  return pdf.save({ useObjectStreams: false });
}
