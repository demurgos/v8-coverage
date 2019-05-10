export interface ProcessCov {
  result: ScriptCov[];
}

export interface ScriptCov {
  scriptId: string;
  url: string;
  functions: FunctionCov[];
}

export interface FunctionCov {
  functionName: string;
  ranges: RangeCov[];
  isBlockCoverage: boolean;

  /**
   * Non-V8 field representing the total number of calls to this function.
   *
   * It is used to merge `FunctionCov` objects with mixed `isBlockCoverage`
   * values without loosing information.
   *
   * Default: `ranges.length > 0 ? ranges[0].count : 0`
   * Invariant:
   * ```
   * count === undefined
   * || ranges.length === 0
   * || (isBlockCoverage ? count >= ranges[0].count : count === ranges[0].count)
   * ```
   */
  count?: number;
}

export interface Range {
  readonly start: number;
  readonly end: number;
}

export interface RangeCov {
  startOffset: number;
  endOffset: number;
  count: number;
}
