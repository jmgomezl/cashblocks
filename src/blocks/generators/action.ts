import * as Blockly from 'blockly/core';
import type { BlockNode, BlockParams, ActionBlockType } from '../../types';

// Generator functions for action blocks

export function generateActionNode(block: Blockly.Block): BlockNode | null {
  const type = block.type as ActionBlockType;

  const params: BlockParams = {};
  const children: string[] = [];

  // Get next block
  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    children.push(nextBlock.id);
  }

  switch (type) {
    case 'SEND_BCH': {
      params.recipientHash = block.getFieldValue('RECIPIENT_HASH') as string;
      break;
    }

    case 'SEND_TOKEN': {
      params.recipientHash = block.getFieldValue('RECIPIENT_HASH') as string;
      params.categoryHex = block.getFieldValue('CATEGORY_HEX') as string;
      break;
    }

    case 'SPLIT_PERCENT': {
      const percent = block.getFieldValue('PERCENT') as number;
      params.percent = BigInt(percent);
      break;
    }

    case 'TIME_LOCK_OUTPUT': {
      const days = block.getFieldValue('DAYS') as number;
      params.days = BigInt(days);
      break;
    }

    case 'SEND_BACK':
      // No params needed
      break;

    default:
      return null;
  }

  return {
    id: block.id,
    type,
    category: 'action',
    params,
    children,
  };
}

// Check if a block type is an action block
export function isActionBlock(type: string): type is ActionBlockType {
  return [
    'SEND_BCH',
    'SEND_TOKEN',
    'SPLIT_PERCENT',
    'TIME_LOCK_OUTPUT',
    'SEND_BACK',
  ].includes(type);
}
