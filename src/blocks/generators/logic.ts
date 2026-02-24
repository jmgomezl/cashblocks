import * as Blockly from 'blockly/core';
import type { BlockNode, BlockParams, LogicBlockType, ComparisonOperator } from '../../types';

// Generator functions for logic blocks

export function generateLogicNode(block: Blockly.Block): BlockNode | null {
  const type = block.type as LogicBlockType;

  const params: BlockParams = {};
  const children: string[] = [];

  // Get next block for statement blocks
  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    children.push(nextBlock.id);
  }

  switch (type) {
    case 'IF_ELSE': {
      // Get then and else blocks
      const thenBlock = block.getInputTargetBlock('THEN');
      const elseBlock = block.getInputTargetBlock('ELSE');
      if (thenBlock) children.push(thenBlock.id);
      if (elseBlock) children.push(elseBlock.id);
      break;
    }

    case 'AND':
    case 'OR':
      // These are value blocks, no params needed
      break;

    case 'COMPARE_VALUE': {
      params.operator = block.getFieldValue('OPERATOR') as ComparisonOperator;
      const threshold = block.getFieldValue('THRESHOLD') as number;
      params.threshold = BigInt(threshold);
      break;
    }

    case 'CHECK_ADDRESS':
      // No additional params
      break;

    default:
      return null;
  }

  return {
    id: block.id,
    type,
    category: 'logic',
    params,
    children,
  };
}

// Check if a block type is a logic block
export function isLogicBlock(type: string): type is LogicBlockType {
  return ['IF_ELSE', 'AND', 'OR', 'COMPARE_VALUE', 'CHECK_ADDRESS'].includes(type);
}
