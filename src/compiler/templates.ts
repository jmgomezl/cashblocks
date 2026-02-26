import type { BlockType, BlockParams, ConstructorArg } from '../types';
import { normalizeRecipientHash } from './address';

// Template result containing code snippet and any constructor args needed
interface TemplateResult {
  code: string;
  constructorArgs: ConstructorArg[];
  error?: string;
}

// Generate CashScript code for TRIGGER blocks
function triggerTemplate(type: BlockType, params: BlockParams): TemplateResult {
  switch (type) {
    case 'BCH_RECEIVED': {
      const minAmount = params.minAmount ?? 10000n;
      return {
        code: `        // TRIGGER: BCH received
        require(tx.inputs[0].value >= ${minAmount.toString()});`,
        constructorArgs: [],
      };
    }

    case 'TOKEN_RECEIVED': {
      const categoryHex = params.categoryHex;
      if (categoryHex) {
        return {
          code: `        // TRIGGER: Token received
        require(tx.inputs[0].tokenCategory == 0x${categoryHex});`,
          constructorArgs: [],
        };
      }
      return {
        code: `        // TRIGGER: Token received
        require(tx.inputs[0].tokenCategory == tokenCategory);`,
        constructorArgs: [
          { name: 'tokenCategory', type: 'bytes' },
        ],
      };
    }

    case 'TIME_PASSED': {
      const value = params.days ?? 30n;
      const unit = params.timeUnit ?? 'DAYS';
      const unitLabel = unit === 'MINUTES' ? 'minutes' : unit === 'HOURS' ? 'hours' : 'days';
      const multiplier = unit === 'MINUTES' ? 60 : unit === 'HOURS' ? 3600 : 86400;
      const timeOffsetSeconds = Number(value) * multiplier;
      return {
        code: `        // TRIGGER: Time passed (${value} ${unitLabel})
        require(tx.time >= unlockTime);`,
        constructorArgs: [
          { name: 'unlockTime', type: 'int', timeOffsetSeconds },
        ],
      };
    }

    case 'MULTISIG_SIGNED': {
      const required = params.required ?? 2n;
      const total = params.total ?? 3n;
      // Generate pubkey parameters
      const pubkeyArgs: ConstructorArg[] = [];
      for (let i = 0; i < total; i++) {
        pubkeyArgs.push({ name: `pk${i}`, type: 'pubkey' });
      }
      const sigParams = Array.from({ length: Number(required) }, (_, i) => `sig s${i}`).join(', ');
      const pubkeyList = Array.from({ length: Number(total) }, (_, i) => `pk${i}`).join(', ');
      return {
        code: `        // TRIGGER: Multisig (${required} of ${total})
        require(checkMultiSig([${sigParams.replace(/sig /g, '')}], [${pubkeyList}]));`,
        constructorArgs: pubkeyArgs,
      };
    }

    case 'PRICE_ABOVE': {
      const threshold = params.usdThreshold ?? 500n;
      return {
        code: `        // TRIGGER: Price above threshold (requires oracle)
        // Note: Oracle integration required for production
        require(oraclePrice >= ${threshold.toString()});`,
        constructorArgs: [
          { name: 'oraclePrice', type: 'int' },
        ],
      };
    }

    case 'HASH_LOCK': {
      const expectedHash = params.expectedHash;
      if (expectedHash) {
        return {
          code: `        // TRIGGER: Hash lock — caller must reveal secret preimage
        // preimage is passed as a function argument (see function signature)
        require(hash256(preimage) == 0x${expectedHash});`,
          constructorArgs: [],
        };
      }
      return {
        code: `        // TRIGGER: Hash lock — caller must reveal secret preimage
        // preimage is passed as a function argument (see function signature)
        require(hash256(preimage) == expectedHash);`,
        constructorArgs: [
          { name: 'expectedHash', type: 'bytes' },
        ],
      };
    }

    default:
      return { code: '', constructorArgs: [] };
  }
}

// Generate CashScript code for LOGIC blocks
function logicTemplate(type: BlockType, params: BlockParams): TemplateResult {
  switch (type) {
    case 'IF_ELSE':
      // Code generation is handled directly by generateFunctionBody in the compiler.
      // This template is only called for constructor-arg collection (IF_ELSE has none).
      return { code: '', constructorArgs: [] };

    case 'AND':
      return {
        code: `        // LOGIC: AND condition`,
        constructorArgs: [],
      };

    case 'OR':
      return {
        code: `        // LOGIC: OR condition`,
        constructorArgs: [],
      };

    case 'COMPARE_VALUE': {
      const operator = params.operator ?? '>';
      const threshold = params.threshold ?? 10000n;
      return {
        code: `        // LOGIC: Compare value
        require(tx.inputs[0].value ${operator} ${threshold.toString()});`,
        constructorArgs: [],
      };
    }

    case 'CHECK_ADDRESS':
      return {
        code: `        // LOGIC: Check signature matches address
        require(hash160(pk) == recipientHash);
        require(checkSig(s, pk));`,
        constructorArgs: [],
      };

    default:
      return { code: '', constructorArgs: [] };
  }
}

// Generate CashScript code for ACTION blocks
function actionTemplate(type: BlockType, params: BlockParams, outputIndex: number): TemplateResult {
  switch (type) {
    case 'SEND_BCH': {
      const recipientHash = params.recipientHash;
      if (recipientHash) {
        const normalized = normalizeRecipientHash(recipientHash);
        if (normalized.error) {
          return { code: '', constructorArgs: [], error: normalized.error };
        }
        if (normalized.hex) {
          return {
            code: `        // ACTION: Send BCH to recipient
        require(tx.outputs[${outputIndex}].lockingBytecode == new LockingBytecodeP2PKH(0x${normalized.hex}));
        require(tx.outputs[${outputIndex}].value >= tx.inputs[0].value - 1000);`,
            constructorArgs: [],
          };
        }
      }
      return {
        code: `        // ACTION: Send BCH to recipient
        require(tx.outputs[${outputIndex}].lockingBytecode == new LockingBytecodeP2PKH(recipientHash));
        require(tx.outputs[${outputIndex}].value >= tx.inputs[0].value - 1000);`,
        constructorArgs: [
          { name: 'recipientHash', type: 'bytes20' },
        ],
      };
    }

    case 'SEND_TOKEN': {
      const recipientHash = params.recipientHash;
      const categoryHex = params.categoryHex;
      const tokenArgs: ConstructorArg[] = [];

      let recipientExpr: string;
      if (recipientHash) {
        const normalized = normalizeRecipientHash(recipientHash);
        if (normalized.error) {
          return { code: '', constructorArgs: [], error: normalized.error };
        }
        if (normalized.hex) {
          recipientExpr = `0x${normalized.hex}`;
        } else {
          recipientExpr = 'recipientHash';
          tokenArgs.push({ name: 'recipientHash', type: 'bytes20' });
        }
      } else {
        recipientExpr = 'recipientHash';
        tokenArgs.push({ name: 'recipientHash', type: 'bytes20' });
      }

      let categoryExpr: string;
      if (categoryHex) {
        categoryExpr = `0x${categoryHex}`;
      } else {
        categoryExpr = 'tokenCategory';
        tokenArgs.push({ name: 'tokenCategory', type: 'bytes' });
      }

      return {
        code: `        // ACTION: Send token to recipient
        require(tx.outputs[${outputIndex}].lockingBytecode == new LockingBytecodeP2PKH(${recipientExpr}));
        require(tx.outputs[${outputIndex}].tokenCategory == ${categoryExpr});`,
        constructorArgs: tokenArgs,
      };
    }

    case 'SPLIT_PERCENT': {
      const percent = params.percent ?? 50n;
      const remaining = 100n - percent;
      const firstOutputIndex = outputIndex;
      const secondOutputIndex = outputIndex + 1;
      return {
        code: `        // ACTION: Split ${percent}% / ${remaining}%
        int totalValue = tx.inputs[0].value - 1000;
        int firstOutput = totalValue * ${percent.toString()} / 100;
        int secondOutput = totalValue - firstOutput;
        require(tx.outputs[${firstOutputIndex}].value >= firstOutput);
        require(tx.outputs[${secondOutputIndex}].value >= secondOutput);`,
        constructorArgs: [],
      };
    }

    case 'TIME_LOCK_OUTPUT': {
      const days = params.days ?? 30n;
      return {
        code: `        // ACTION: Time lock output for ${days} days
        // Using sequence number for relative timelock
        require(tx.outputs[${outputIndex}].value >= tx.inputs[0].value - 1000);`,
        constructorArgs: [],
      };
    }

    case 'SEND_BACK':
      return {
        code: `        // ACTION: Send back to contract
        require(tx.outputs[${outputIndex}].lockingBytecode == new LockingBytecodeP2SH32(hash256(this.activeBytecode)));`,
        constructorArgs: [],
      };

    default:
      return { code: '', constructorArgs: [] };
  }
}

// Generate CashScript code for STATE blocks
function stateTemplate(type: BlockType, params: BlockParams): TemplateResult {
  switch (type) {
    case 'STORE_IN_NFT': {
      const key = params.key ?? 'data';
      return {
        code: `        // STATE: Store in NFT commitment (key: ${key})
        // NFT commitment is preserved in output
        require(tx.outputs[0].nftCommitment == tx.inputs[0].nftCommitment);`,
        constructorArgs: [],
      };
    }

    case 'READ_FROM_NFT': {
      const key = params.key ?? 'data';
      return {
        code: `        // STATE: Read from NFT commitment (key: ${key})
        bytes storedData = tx.inputs[0].nftCommitment;`,
        constructorArgs: [],
      };
    }

    case 'INCREMENT_COUNTER':
      return {
        code: `        // STATE: Increment counter in NFT
        bytes oldCommitment = tx.inputs[0].nftCommitment;
        int counter = int(oldCommitment);
        int newCounter = counter + 1;
        require(tx.outputs[0].nftCommitment == bytes8(newCounter));`,
        constructorArgs: [],
      };

    default:
      return { code: '', constructorArgs: [] };
  }
}

// Main template function - routes to specific template based on block category
export function getBlockTemplate(
  type: BlockType,
  params: BlockParams,
  category: 'trigger' | 'logic' | 'action' | 'state',
  outputIndex = 0
): TemplateResult {
  switch (category) {
    case 'trigger':
      return triggerTemplate(type, params);
    case 'logic':
      return logicTemplate(type, params);
    case 'action':
      return actionTemplate(type, params, outputIndex);
    case 'state':
      return stateTemplate(type, params);
    default:
      return { code: '', constructorArgs: [] };
  }
}

// Get function signature based on blocks used
export function getFunctionSignature(
  hasSig: boolean,
  hasMultisig: boolean,
  sigCount: number,
  hasHashLock = false,
): string {
  const preimage = hasHashLock ? 'bytes preimage, ' : '';
  if (hasMultisig) {
    const sigs = Array.from({ length: sigCount }, (_, i) => `sig s${i}`).join(', ');
    return `function execute(${preimage}${sigs})`;
  }
  if (hasSig) {
    return `function execute(${preimage}sig s, pubkey pk)`;
  }
  return `function execute(${preimage}pubkey pk)`;
}
