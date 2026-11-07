import {
  ImFont_CalcTextSizeA,
  ImFont_CalcWordWrapPosition,
  igGetFont,
  igGetFontSize,
} from "maligator:ffi/visualize";

export function textLine(value: string, wrapWidth: number) {
  const font = igGetFont();
  if (!font) throw new Error("Fonts are not initialized");
  const size = igGetFontSize();
  let length = value.indexOf("\n");
  if (length < 0) length = value.length;
  if (wrapWidth > 0) {
    const suffix = ImFont_CalcWordWrapPosition(font, size, value, wrapWidth);
    if (suffix !== null)
      length = Math.min(length, value.length - suffix.length);
  }
  if (length === 0 && value.length && value[0] !== "\n")
    length = (value.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  let consumed = length;
  if (value[consumed] === "\n") consumed++;
  else if (wrapWidth > 0) {
    while (value[consumed] === " " || value[consumed] === "\t") consumed++;
    if (value[consumed] === "\n") consumed++;
  }
  return {
    length,
    consumed,
    width: ImFont_CalcTextSizeA(
      font,
      size,
      3.4028234663852886e38,
      0,
      value.slice(0, length),
    ).x,
  };
}
