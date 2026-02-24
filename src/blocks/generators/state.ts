import * as Blockly from 'blockly/core';
import type { BlockNode, BlockParams, StateBlockType } from '../../types';

// Generator functions for state blocks

export function generateStateNode(block: Blockly.Block): BlockNode | null {
  const type = block.type as StateBlockType;

  const params: BlockParams = {};
  const children: string[] = [];

  // Get next block
  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    children.push(nextBlock.id);
  }

  switch (type) {
    case 'STORE_IN_NFT': {
      params.key = block.getFieldValue('KEY') as string;
      break;
    }

    case 'READ_FROM_NFT': {
      params.key = block.getFieldValue('KEY') as string;
      break;
    }

    case 'INCREMENT_COUNTER':
      // No params needed
      break;

    default:
      return null;
  }

  return {
    id: block.id,
    type,
    category: 'state',
    params,
    children,
  };
}

// Check if a block type is a state block
export function isStateBlock(type: string): type is StateBlockType {
  return ['STORE_IN_NFT', 'READ_FROM_NFT', 'INCREMENT_COUNTER'].includes(type);
}
