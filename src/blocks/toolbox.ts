// Blockly toolbox configuration with all 4 block categories

export interface ToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: ToolboxBlock[];
}

export interface ToolboxBlock {
  kind: 'block';
  type: string;
}

export interface Toolbox {
  kind: 'categoryToolbox';
  contents: ToolboxCategory[];
}

export const toolbox: Toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Triggers',
      colour: '120',
      contents: [
        { kind: 'block', type: 'BCH_RECEIVED' },
        { kind: 'block', type: 'TOKEN_RECEIVED' },
        { kind: 'block', type: 'TIME_PASSED' },
        { kind: 'block', type: 'MULTISIG_SIGNED' },
        { kind: 'block', type: 'PRICE_ABOVE' },
        { kind: 'block', type: 'HASH_LOCK' },
      ],
    },
    {
      kind: 'category',
      name: 'Logic',
      colour: '210',
      contents: [
        { kind: 'block', type: 'IF_ELSE' },
        { kind: 'block', type: 'AND' },
        { kind: 'block', type: 'OR' },
        { kind: 'block', type: 'COMPARE_VALUE' },
        { kind: 'block', type: 'CHECK_ADDRESS' },
      ],
    },
    {
      kind: 'category',
      name: 'Actions',
      colour: '290',
      contents: [
        { kind: 'block', type: 'SEND_BCH' },
        { kind: 'block', type: 'SEND_TOKEN' },
        { kind: 'block', type: 'SPLIT_PERCENT' },
        { kind: 'block', type: 'TIME_LOCK_OUTPUT' },
        { kind: 'block', type: 'SEND_BACK' },
      ],
    },
    {
      kind: 'category',
      name: 'State',
      colour: '45',
      contents: [
        { kind: 'block', type: 'STORE_IN_NFT' },
        { kind: 'block', type: 'READ_FROM_NFT' },
        { kind: 'block', type: 'INCREMENT_COUNTER' },
      ],
    },
  ],
};

export default toolbox;
