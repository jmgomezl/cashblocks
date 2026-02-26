// Block type categories
export type BlockCategory = 'trigger' | 'logic' | 'action' | 'state';

// Trigger block types
export type TriggerBlockType =
  | 'BCH_RECEIVED'
  | 'TOKEN_RECEIVED'
  | 'TIME_PASSED'
  | 'MULTISIG_SIGNED'
  | 'PRICE_ABOVE'
  | 'HASH_LOCK';

// Logic block types
export type LogicBlockType =
  | 'IF_ELSE'
  | 'AND'
  | 'OR'
  | 'COMPARE_VALUE'
  | 'CHECK_ADDRESS';

// Action block types
export type ActionBlockType =
  | 'SEND_BCH'
  | 'SEND_TOKEN'
  | 'SPLIT_PERCENT'
  | 'TIME_LOCK_OUTPUT'
  | 'SEND_BACK';

// State block types
export type StateBlockType =
  | 'STORE_IN_NFT'
  | 'READ_FROM_NFT'
  | 'INCREMENT_COUNTER';

// Union of all block types
export type BlockType = TriggerBlockType | LogicBlockType | ActionBlockType | StateBlockType;

// Comparison operators for COMPARE_VALUE block
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

// Block parameter types
export interface BlockParams {
  // Trigger params
  minAmount?: bigint;
  categoryHex?: string;
  days?: bigint;
  required?: bigint;
  total?: bigint;
  usdThreshold?: bigint;

  // Hash lock params
  expectedHash?: string;

  // Logic params
  operator?: ComparisonOperator;
  threshold?: bigint;

  // Action params
  recipientHash?: string;
  percent?: bigint;

  // State params
  key?: string;

  // Time unit for TIME_PASSED block (defaults to 'DAYS' for backwards compat)
  timeUnit?: 'MINUTES' | 'HOURS' | 'DAYS';

  // IF_ELSE: resolved condition expression (set by parser, consumed by compiler)
  conditionExpr?: string;
}

// A single block node in the graph
export interface BlockNode {
  id: string;
  type: BlockType;
  category: BlockCategory;
  params: BlockParams;
  children: string[]; // IDs of connected child blocks
}

// Edge connecting two blocks
export interface Edge {
  from: string;
  to: string;
  type: 'next' | 'condition_true' | 'condition_false';
}

// The complete block graph
export interface BlockGraph {
  trigger: BlockNode | null;
  nodes: BlockNode[];
  edges: Edge[];
}

// Constructor argument for CashScript contract
export interface ConstructorArg {
  name: string;
  type: 'bytes20' | 'int' | 'bytes' | 'pubkey' | 'sig';
  value?: string | bigint;
  // Seconds from now for unlockTime auto-fill (set by TIME_PASSED template)
  timeOffsetSeconds?: number;
}

// Result of compiling a block graph
export interface CompileResult {
  source: string;
  constructorArgs: ConstructorArg[];
  error?: string;
}

// Backend compile endpoint response
export interface CompileResponse {
  artifact?: CashScriptArtifact;
  error?: string;
}

// CashScript artifact structure (simplified)
export interface CashScriptArtifact {
  contractName: string;
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  abi: Array<{
    name: string;
    inputs: Array<{
      name: string;
      type: string;
    }>;
  }>;
  bytecode: string;
  source: string;
  compiler: {
    name: string;
    version: string;
  };
  updatedAt: string;
}

// Deployed contract info
export interface DeployedContract {
  address: string;
  artifact: CashScriptArtifact;
  constructorArgs: ConstructorArg[];
}

// Example workspace (saved Blockly state)
export interface ExampleWorkspace {
  name: string;
  description: string;
  blocklyState: object;
}
