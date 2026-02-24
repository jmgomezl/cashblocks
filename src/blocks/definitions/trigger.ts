import * as Blockly from 'blockly/core';

// JSON block definition type for Blockly
interface BlockJson {
  type: string;
  message0: string;
  args0?: Array<{
    type: string;
    name?: string;
    value?: number;
    text?: string;
    min?: number;
    max?: number;
    precision?: number;
    check?: string;
    options?: Array<[string, string]>;
  }>;
  previousStatement?: string;
  nextStatement?: string;
  output?: string;
  colour: number;
  tooltip: string;
  helpUrl: string;
}

// BCH_RECEIVED trigger block
const bchReceivedBlock: BlockJson = {
  type: 'BCH_RECEIVED',
  message0: 'When BCH received %1 minimum amount (satoshis) %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_number',
      name: 'MIN_AMOUNT',
      value: 10000,
      min: 546,
      precision: 1,
    },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Triggers when BCH is received at the contract address',
  helpUrl: '',
};

// TOKEN_RECEIVED trigger block
const tokenReceivedBlock: BlockJson = {
  type: 'TOKEN_RECEIVED',
  message0: 'When Token received %1 category ID (hex) %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_input',
      name: 'CATEGORY_HEX',
      text: '',
    },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Triggers when a CashToken of the specified category is received',
  helpUrl: '',
};

// TIME_PASSED trigger block
const timePassedBlock: BlockJson = {
  type: 'TIME_PASSED',
  message0: 'When time passed %1 days %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_number',
      name: 'DAYS',
      value: 30,
      min: 1,
      precision: 1,
    },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Triggers after the specified number of days have passed',
  helpUrl: '',
};

// MULTISIG_SIGNED trigger block
const multisigSignedBlock: BlockJson = {
  type: 'MULTISIG_SIGNED',
  message0: 'When multisig signed %1 required signatures %2 of total %3',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_number',
      name: 'REQUIRED',
      value: 2,
      min: 1,
      max: 15,
      precision: 1,
    },
    {
      type: 'field_number',
      name: 'TOTAL',
      value: 3,
      min: 1,
      max: 15,
      precision: 1,
    },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Triggers when the required number of signatures are provided',
  helpUrl: '',
};

// PRICE_ABOVE trigger block
const priceAboveBlock: BlockJson = {
  type: 'PRICE_ABOVE',
  message0: 'When BCH price above %1 USD threshold %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_number',
      name: 'USD_THRESHOLD',
      value: 500,
      min: 1,
      precision: 1,
    },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Triggers when BCH price exceeds the threshold (requires oracle)',
  helpUrl: '',
};

// HASH_LOCK trigger block (HTLC / atomic swap)
const hashLockBlock: BlockJson = {
  type: 'HASH_LOCK',
  message0: 'Hash lock %1 expected hash256 (hex) %2',
  args0: [
    { type: 'input_dummy' },
    { type: 'field_input', name: 'EXPECTED_HASH', text: '' },
  ],
  nextStatement: 'Action',
  colour: 120,
  tooltip: 'Requires revealing a secret preimage whose hash256 matches — used for HTLC and atomic swaps',
  helpUrl: '',
};

export const triggerBlocks: BlockJson[] = [
  bchReceivedBlock,
  tokenReceivedBlock,
  timePassedBlock,
  multisigSignedBlock,
  priceAboveBlock,
  hashLockBlock,
];

export function registerTriggerBlocks(): void {
  triggerBlocks.forEach((block) => {
    Blockly.Blocks[block.type] = {
      init: function (this: Blockly.Block) {
        this.jsonInit(block);
      },
    };
  });
}
