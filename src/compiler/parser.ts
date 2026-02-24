import * as Blockly from 'blockly/core';
import type {
  BlockGraph,
  BlockNode,
  Edge,
  BlockType,
  BlockCategory,
  BlockParams,
  ComparisonOperator,
} from '../types';

// Trigger block types set for type checking
const TRIGGER_TYPES: Set<string> = new Set([
  'BCH_RECEIVED',
  'TOKEN_RECEIVED',
  'TIME_PASSED',
  'MULTISIG_SIGNED',
  'PRICE_ABOVE',
  'HASH_LOCK',
]);

// Logic block types set
const LOGIC_TYPES: Set<string> = new Set([
  'IF_ELSE',
  'AND',
  'OR',
  'COMPARE_VALUE',
  'CHECK_ADDRESS',
]);

// Action block types set
const ACTION_TYPES: Set<string> = new Set([
  'SEND_BCH',
  'SEND_TOKEN',
  'SPLIT_PERCENT',
  'TIME_LOCK_OUTPUT',
  'SEND_BACK',
]);

// State block types set
const STATE_TYPES: Set<string> = new Set([
  'STORE_IN_NFT',
  'READ_FROM_NFT',
  'INCREMENT_COUNTER',
]);

// Determine block category from type
function getBlockCategory(type: string): BlockCategory | null {
  if (TRIGGER_TYPES.has(type)) return 'trigger';
  if (LOGIC_TYPES.has(type)) return 'logic';
  if (ACTION_TYPES.has(type)) return 'action';
  if (STATE_TYPES.has(type)) return 'state';
  return null;
}

// Check if string is valid block type
function isValidBlockType(type: string): type is BlockType {
  return (
    TRIGGER_TYPES.has(type) ||
    LOGIC_TYPES.has(type) ||
    ACTION_TYPES.has(type) ||
    STATE_TYPES.has(type)
  );
}

// Recursively build a CashScript boolean expression from a value-input block tree.
// AND/OR/COMPARE_VALUE are value blocks that plug into IF_ELSE's CONDITION input.
function extractConditionExpr(block: Blockly.Block | null): string {
  if (!block) return 'true';
  switch (block.type) {
    case 'AND': {
      const a = block.getInputTargetBlock('A');
      const b = block.getInputTargetBlock('B');
      return `(${extractConditionExpr(a)} && ${extractConditionExpr(b)})`;
    }
    case 'OR': {
      const a = block.getInputTargetBlock('A');
      const b = block.getInputTargetBlock('B');
      return `(${extractConditionExpr(a)} || ${extractConditionExpr(b)})`;
    }
    case 'COMPARE_VALUE': {
      const operator = block.getFieldValue('OPERATOR') as string;
      const threshold = block.getFieldValue('THRESHOLD') as number;
      return `tx.inputs[0].value ${operator} ${threshold}`;
    }
    default:
      return 'true';
  }
}

// Extract parameters from a Blockly block
function extractParams(block: Blockly.Block): BlockParams {
  const params: BlockParams = {};
  const type = block.type;

  // Trigger params
  if (type === 'BCH_RECEIVED') {
    const minAmount = block.getFieldValue('MIN_AMOUNT') as number;
    params.minAmount = BigInt(minAmount);
  } else if (type === 'TOKEN_RECEIVED') {
    params.categoryHex = block.getFieldValue('CATEGORY_HEX') as string;
  } else if (type === 'TIME_PASSED') {
    const days = block.getFieldValue('DAYS') as number;
    params.days = BigInt(days);
  } else if (type === 'MULTISIG_SIGNED') {
    const required = block.getFieldValue('REQUIRED') as number;
    const total = block.getFieldValue('TOTAL') as number;
    params.required = BigInt(required);
    params.total = BigInt(total);
  } else if (type === 'PRICE_ABOVE') {
    const threshold = block.getFieldValue('USD_THRESHOLD') as number;
    params.usdThreshold = BigInt(threshold);
  } else if (type === 'HASH_LOCK') {
    params.expectedHash = block.getFieldValue('EXPECTED_HASH') as string;
  }

  // Logic params
  if (type === 'COMPARE_VALUE') {
    params.operator = block.getFieldValue('OPERATOR') as ComparisonOperator;
    const threshold = block.getFieldValue('THRESHOLD') as number;
    params.threshold = BigInt(threshold);
  }

  // Action params
  if (type === 'SEND_BCH') {
    params.recipientHash = block.getFieldValue('RECIPIENT_HASH') as string;
  } else if (type === 'SEND_TOKEN') {
    params.recipientHash = block.getFieldValue('RECIPIENT_HASH') as string;
    params.categoryHex = block.getFieldValue('CATEGORY_HEX') as string;
  } else if (type === 'SPLIT_PERCENT') {
    const percent = block.getFieldValue('PERCENT') as number;
    params.percent = BigInt(percent);
  } else if (type === 'TIME_LOCK_OUTPUT') {
    const days = block.getFieldValue('DAYS') as number;
    params.days = BigInt(days);
  }

  // State params
  if (type === 'STORE_IN_NFT' || type === 'READ_FROM_NFT') {
    params.key = block.getFieldValue('KEY') as string;
  }

  // IF_ELSE: resolve the CONDITION value input into a CashScript expression string
  if (type === 'IF_ELSE') {
    const condBlock = block.getInputTargetBlock('CONDITION');
    params.conditionExpr = extractConditionExpr(condBlock);
  }

  return params;
}

// Convert a single Blockly block to BlockNode
function blockToNode(block: Blockly.Block): BlockNode | null {
  const type = block.type;

  if (!isValidBlockType(type)) {
    return null;
  }

  const category = getBlockCategory(type);
  if (!category) {
    return null;
  }

  const children: string[] = [];

  // Get next block in sequence
  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    children.push(nextBlock.id);
  }

  // Get statement inputs (for IF_ELSE)
  if (type === 'IF_ELSE') {
    const thenBlock = block.getInputTargetBlock('THEN');
    const elseBlock = block.getInputTargetBlock('ELSE');
    if (thenBlock) children.push(thenBlock.id);
    if (elseBlock) children.push(elseBlock.id);
  }

  return {
    id: block.id,
    type: type as BlockType,
    category,
    params: extractParams(block),
    children,
  };
}

// Build edges from block relationships
function buildEdges(nodes: BlockNode[], blockMap: Map<string, Blockly.Block>): Edge[] {
  const edges: Edge[] = [];

  for (const node of nodes) {
    const block = blockMap.get(node.id);
    if (!block) continue;

    // Next statement edge
    const nextBlock = block.getNextBlock();
    if (nextBlock && nodes.some((n) => n.id === nextBlock.id)) {
      edges.push({ from: node.id, to: nextBlock.id, type: 'next' });
    }

    // IF_ELSE edges
    if (node.type === 'IF_ELSE') {
      const thenBlock = block.getInputTargetBlock('THEN');
      const elseBlock = block.getInputTargetBlock('ELSE');
      if (thenBlock && nodes.some((n) => n.id === thenBlock.id)) {
        edges.push({ from: node.id, to: thenBlock.id, type: 'condition_true' });
      }
      if (elseBlock && nodes.some((n) => n.id === elseBlock.id)) {
        edges.push({ from: node.id, to: elseBlock.id, type: 'condition_false' });
      }
    }
  }

  return edges;
}

// Parse Blockly workspace into BlockGraph
export function parseWorkspace(workspace: Blockly.Workspace): BlockGraph {
  const allBlocks = workspace.getAllBlocks(false);
  const blockMap = new Map<string, Blockly.Block>();
  const nodes: BlockNode[] = [];
  let trigger: BlockNode | null = null;

  // First pass: convert all blocks to nodes
  for (const block of allBlocks) {
    blockMap.set(block.id, block);
    const node = blockToNode(block);
    if (node) {
      nodes.push(node);

      // Find the trigger (top-level block with no parent)
      if (node.category === 'trigger') {
        const parent = block.getParent();
        if (!parent) {
          trigger = node;
        }
      }
    }
  }

  // Build edges
  const edges = buildEdges(nodes, blockMap);

  return {
    trigger,
    nodes,
    edges,
  };
}

// Serialize BlockGraph to JSON (for saving examples)
export function serializeGraph(graph: BlockGraph): string {
  // Convert bigint to string for JSON serialization
  const serializable = {
    trigger: graph.trigger
      ? {
          ...graph.trigger,
          params: serializeParams(graph.trigger.params),
        }
      : null,
    nodes: graph.nodes.map((node) => ({
      ...node,
      params: serializeParams(node.params),
    })),
    edges: graph.edges,
  };
  return JSON.stringify(serializable, null, 2);
}

// Helper to serialize params with bigint values
function serializeParams(params: BlockParams): Record<string, string | number | undefined> {
  const result: Record<string, string | number | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'bigint') {
      result[key] = value.toString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Deserialize JSON back to BlockGraph
export function deserializeGraph(json: string): BlockGraph {
  const parsed = JSON.parse(json) as {
    trigger: (Omit<BlockNode, 'params'> & { params: Record<string, string | number | undefined> }) | null;
    nodes: Array<Omit<BlockNode, 'params'> & { params: Record<string, string | number | undefined> }>;
    edges: Edge[];
  };

  const deserializeParams = (params: Record<string, string | number | undefined>): BlockParams => {
    const result: BlockParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (key === 'minAmount' || key === 'days' || key === 'required' || key === 'total' ||
          key === 'usdThreshold' || key === 'threshold' || key === 'percent') {
        result[key as keyof BlockParams] = BigInt(value as string | number) as never;
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  };

  return {
    trigger: parsed.trigger
      ? {
          ...parsed.trigger,
          params: deserializeParams(parsed.trigger.params),
        } as BlockNode
      : null,
    nodes: parsed.nodes.map((node) => ({
      ...node,
      params: deserializeParams(node.params),
    })) as BlockNode[],
    edges: parsed.edges,
  };
}
