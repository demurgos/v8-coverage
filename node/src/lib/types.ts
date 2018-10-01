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
}

export interface RangeCov {
  startOffset: number;
  endOffset: number;
  count: number;
}
