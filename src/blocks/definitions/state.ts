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

// STORE_IN_NFT state block
const storeInNftBlock: BlockJson = {
  type: 'STORE_IN_NFT',
  message0: 'Store in NFT commitment %1 key %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_input',
      name: 'KEY',
      text: 'data',
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 45,
  tooltip: 'Store data in the NFT commitment (on-chain state)',
  helpUrl: '',
};

// READ_FROM_NFT state block
const readFromNftBlock: BlockJson = {
  type: 'READ_FROM_NFT',
  message0: 'Read from NFT commitment %1 key %2',
  args0: [
    {
      type: 'input_dummy',
    },
    {
      type: 'field_input',
      name: 'KEY',
      text: 'data',
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 45,
  tooltip: 'Read data from the NFT commitment (on-chain state)',
  helpUrl: '',
};

// INCREMENT_COUNTER state block
const incrementCounterBlock: BlockJson = {
  type: 'INCREMENT_COUNTER',
  message0: 'Increment counter in NFT',
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 45,
  tooltip: 'Increment a counter stored in the NFT commitment',
  helpUrl: '',
};

export const stateBlocks: BlockJson[] = [
  storeInNftBlock,
  readFromNftBlock,
  incrementCounterBlock,
];

export function registerStateBlocks(): void {
  stateBlocks.forEach((block) => {
    Blockly.Blocks[block.type] = {
      init: function (this: Blockly.Block) {
        this.jsonInit(block);
      },
    };
  });
}
