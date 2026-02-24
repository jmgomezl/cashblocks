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

// IF_ELSE logic block
const ifElseBlock: BlockJson = {
  type: 'IF_ELSE',
  message0: 'If %1 then %2 else %3',
  args0: [
    {
      type: 'input_value',
      name: 'CONDITION',
      check: 'Boolean',
    },
    {
      type: 'input_statement',
      name: 'THEN',
      check: 'Action',
    },
    {
      type: 'input_statement',
      name: 'ELSE',
      check: 'Action',
    },
  ],
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 210,
  tooltip: 'Conditional branching: execute different actions based on condition',
  helpUrl: '',
};

// AND logic block
const andBlock: BlockJson = {
  type: 'AND',
  message0: '%1 AND %2',
  args0: [
    {
      type: 'input_value',
      name: 'A',
      check: 'Boolean',
    },
    {
      type: 'input_value',
      name: 'B',
      check: 'Boolean',
    },
  ],
  output: 'Boolean',
  colour: 210,
  tooltip: 'Returns true if both conditions are true',
  helpUrl: '',
};

// OR logic block
const orBlock: BlockJson = {
  type: 'OR',
  message0: '%1 OR %2',
  args0: [
    {
      type: 'input_value',
      name: 'A',
      check: 'Boolean',
    },
    {
      type: 'input_value',
      name: 'B',
      check: 'Boolean',
    },
  ],
  output: 'Boolean',
  colour: 210,
  tooltip: 'Returns true if either condition is true',
  helpUrl: '',
};

// COMPARE_VALUE logic block
const compareValueBlock: BlockJson = {
  type: 'COMPARE_VALUE',
  message0: 'amount %1 %2',
  args0: [
    {
      type: 'field_dropdown',
      name: 'OPERATOR',
      options: [
        ['>', '>'],
        ['<', '<'],
        ['>=', '>='],
        ['<=', '<='],
        ['==', '=='],
        ['!=', '!='],
      ],
    },
    {
      type: 'field_number',
      name: 'THRESHOLD',
      value: 10000,
      min: 0,
      precision: 1,
    },
  ],
  output: 'Boolean',
  colour: 210,
  tooltip: 'Compare an amount against a threshold',
  helpUrl: '',
};

// CHECK_ADDRESS logic block
const checkAddressBlock: BlockJson = {
  type: 'CHECK_ADDRESS',
  message0: 'signature matches address',
  previousStatement: 'Action',
  nextStatement: 'Action',
  colour: 210,
  tooltip: 'Verify that the signature comes from the expected address',
  helpUrl: '',
};

export const logicBlocks: BlockJson[] = [
  ifElseBlock,
  andBlock,
  orBlock,
  compareValueBlock,
  checkAddressBlock,
];

export function registerLogicBlocks(): void {
  logicBlocks.forEach((block) => {
    Blockly.Blocks[block.type] = {
      init: function (this: Blockly.Block) {
        this.jsonInit(block);
      },
    };
  });
}
