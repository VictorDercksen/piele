export interface EmphasisSegment {
  readonly text: string;
  readonly strong: boolean;
}

/**
 * Splits text on `**` markers into plain and strong segments, so templates render emphasis
 * without innerHTML. An unpaired marker leaves the rest of the text plain.
 */
export function emphasisSegments(value: string): readonly EmphasisSegment[] {
  const parts = value.split('**');
  const paired = parts.length % 2 === 1 ? parts.length : parts.length - 1;
  const segments: EmphasisSegment[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    segments.push({ text: part, strong: index % 2 === 1 && index < paired });
  });
  return segments;
}
