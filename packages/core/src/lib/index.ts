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

export interface V8CoverageToolsMerge {
  /**
   * Merges a list of process coverages.
   *
   * The result is normalized.
   * The input values may be mutated, it is not safe to use them after passing
   * them to this function.
   * The computation is synchronous.
   *
   * @param processCovs Process coverages to merge.
   * @return Merged process coverage.
   */
  mergeProcessCovs(processCovs: ReadonlyArray<ProcessCov>): ProcessCov;

  /**
   * Merges a list of matching script coverages.
   *
   * Scripts are matching if they have the same `url`.
   * The result is normalized.
   * The input values may be mutated, it is not safe to use them after passing
   * them to this function.
   * The computation is synchronous.
   *
   * @param scriptCovs Process coverages to merge.
   * @return Merged script coverage, or `undefined` if the input list was empty.
   */
  mergeScriptCovs(scriptCovs: ReadonlyArray<ScriptCov>): ScriptCov | undefined;

  /**
   * Merges a list of matching function coverages.
   *
   * Functions are matching if their root ranges have the same span.
   * The result is normalized.
   * The input values may be mutated, it is not safe to use them after passing
   * them to this function.
   * The computation is synchronous.
   *
   * @param funcCovs Function coverages to merge.
   * @return Merged function coverage, or `undefined` if the input list was empty.
   */
  mergeFunctionCovs(funcCovs: ReadonlyArray<FunctionCov>): FunctionCov | undefined;
}

export interface V8CoverageTools extends V8CoverageToolsMerge {
}
