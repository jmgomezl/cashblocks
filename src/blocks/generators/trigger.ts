import * as Blockly from 'blockly/core';
import type { BlockNode, BlockParams, TriggerBlockType } from '../../types';

// Generator functions for trigger blocks
// These convert Blockly blocks to our IR (BlockNode)

export function generateTriggerNode(block: Blockly.Block): BlockNode | null {
  const type = block.type as TriggerBlockType;

  const params: BlockParams = {};
  const children: string[] = [];

  // Get next block
  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    children.push(nextBlock.id);
  }

  switch (type) {
    case 'BCH_RECEIVED': {
      const minAmount = block.getFieldValue('MIN_AMOUNT') as number;
      params.minAmount = BigInt(minAmount);
      break;
    }

    case 'TOKEN_RECEIVED': {
      params.categoryHex = block.getFieldValue('CATEGORY_HEX') as string;
      break;
    }

    case 'TIME_PASSED': {
      const days = block.getFieldValue('DAYS') as number;
      params.days = BigInt(days);
      break;
    }

    case 'MULTISIG_SIGNED': {
      const required = block.getFieldValue('REQUIRED') as number;
      const total = block.getFieldValue('TOTAL') as number;
      params.required = BigInt(required);
      params.total = BigInt(total);
      break;
    }

    case 'PRICE_ABOVE': {
      const threshold = block.getFieldValue('USD_THRESHOLD') as number;
      params.usdThreshold = BigInt(threshold);
      break;
    }

    default:
      return null;
  }

  return {
    id: block.id,
    type,
    category: 'trigger',
    params,
    children,
  };
}

// Check if a block type is a trigger
export function isTriggerBlock(type: string): type is TriggerBlockType {
  return [
    'BCH_RECEIVED',
    'TOKEN_RECEIVED',
    'TIME_PASSED',
    'MULTISIG_SIGNED',
    'PRICE_ABOVE',
  ].includes(type);
}
