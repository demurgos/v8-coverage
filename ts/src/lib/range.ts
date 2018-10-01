import { RangeCov } from "./types";

/**
 * Compares two ranges.
 *
 * The ranges are first ordered by ascending `startOffset` and then by
 * descending `endOffset`.
 * This corresponds to a pre-order sort.
 */
export function compareRanges(a: Readonly<RangeCov>, b: Readonly<RangeCov>): number {
  if (a.startOffset !== b.startOffset) {
    return a.startOffset - b.startOffset;
  } else {
    return b.endOffset - a.endOffset;
  }
}
