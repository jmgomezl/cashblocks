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

// SEND_BCH action block
const sendBchBlock: BlockJson = {
  type: 'SEND_BCH',
  message0: 'Send BCH to %1 recipient address hash (hex) %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_input',
      name: 'RECIPIENT_HASH',
      text: '',
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 290,
  tooltip: 'Send BCH to the specified recipient address',
  helpUrl: '',
};

// SEND_TOKEN action block
const sendTokenBlock: BlockJson = {
  type: 'SEND_TOKEN',
  message0: 'Send Token to %1 recipient hash (hex) %2 category ID (hex) %3',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_input',
      name: 'RECIPIENT_HASH',
      text: '',
    },
    {
      type: 'field_input',
      name: 'CATEGORY_HEX',
      text: '',
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 290,
  tooltip: 'Send a CashToken to the specified recipient',
  helpUrl: '',
};

// SPLIT_PERCENT action block
const splitPercentBlock: BlockJson = {
  type: 'SPLIT_PERCENT',
  message0: 'Split %1 %% to first output',
  args0: [
    {
      type: 'field_number',
      name: 'PERCENT',
      value: 50,
      min: 1,
      max: 99,
      precision: 1,
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 290,
  tooltip: 'Split funds: specified percentage to first output, remainder to second',
  helpUrl: '',
};

// TIME_LOCK_OUTPUT action block
const timeLockOutputBlock: BlockJson = {
  type: 'TIME_LOCK_OUTPUT',
  message0: 'Time lock output for %1 days',
  args0: [
    {
      type: 'field_number',
      name: 'DAYS',
      value: 30,
      min: 1,
      precision: 1,
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 290,
  tooltip: 'Lock the output for the specified number of days',
  helpUrl: '',
};

// SEND_BACK action block
const sendBackBlock: BlockJson = {
  type: 'SEND_BACK',
  message0: 'Send back to contract',
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 290,
  tooltip: 'Send funds back to the contract itself (for recurring contracts)',
  helpUrl: '',
};

export const actionBlocks: BlockJson[] = [
  sendBchBlock,
  sendTokenBlock,
  splitPercentBlock,
  timeLockOutputBlock,
  sendBackBlock,
];

export function registerActionBlocks(): void {
  actionBlocks.forEach((block) => {
    Blockly.Blocks[block.type] = {
      init: function (this: Blockly.Block) {
        this.jsonInit(block);
      },
    };
  });
}
