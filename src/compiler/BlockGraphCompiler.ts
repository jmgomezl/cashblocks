import type { BlockGraph, BlockNode, CompileResult, ConstructorArg, Edge } from '../types';
import { getBlockTemplate, getFunctionSignature } from './templates';

/**
 * BlockGraphCompiler - Pure function that compiles a BlockGraph to CashScript source
 *
 * This is the heart of CashBlocks. It must be pure:
 * - No network calls
 * - No side effects
 * - No I/O operations
 * - Deterministic output for the same input
 */

// Validation errors
interface ValidationError {
  message: string;
  nodeId?: string;
}

class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

// Validate the block graph structure
function validateGraph(graph: BlockGraph): ValidationError[] {
  const errors: ValidationError[] = [];

  // Must have exactly one trigger
  if (!graph.trigger) {
    errors.push({ message: 'Contract must have exactly one trigger block' });
    return errors;
  }

  // Trigger must be valid
  const triggerNode = graph.nodes.find((n) => n.id === graph.trigger?.id);
  if (!triggerNode) {
    errors.push({ message: 'Trigger block not found in nodes' });
  }

  // Check for at least one action block
  const actionNodes = graph.nodes.filter((n) => n.category === 'action');
  if (actionNodes.length === 0) {
    errors.push({ message: 'Contract must have at least one action block' });
  }

  return errors;
}

// Topological sort of nodes (trigger → logic → action)
function sortNodes(graph: BlockGraph): BlockNode[] {
  if (!graph.trigger) return [];

  const sorted: BlockNode[] = [];
  const visited = new Set<string>();
  const nodeMap = new Map<string, BlockNode>();

  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // DFS traversal following edges
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return;

    sorted.push(node);

    // Follow children (edges)
    for (const childId of node.children) {
      visit(childId);
    }
  }

  // Start from trigger
  visit(graph.trigger.id);

  return sorted;
}

// Collect all constructor arguments from nodes
function collectConstructorArgs(nodes: BlockNode[]): ConstructorArg[] {
  const argsMap = new Map<string, ConstructorArg>();

  for (const node of nodes) {
    const template = getBlockTemplate(node.type, node.params, node.category);
    if (template.error) {
      throw new TemplateError(template.error);
    }
    for (const arg of template.constructorArgs) {
      // Avoid duplicates by name
      if (!argsMap.has(arg.name)) {
        argsMap.set(arg.name, arg);
      }
    }
  }

  return Array.from(argsMap.values());
}

// Check if contract needs signature verification
function needsSignature(nodes: BlockNode[]): { hasSig: boolean; hasMultisig: boolean; sigCount: number; hasHashLock: boolean } {
  let hasSig = false;
  let hasMultisig = false;
  let sigCount = 2;
  let hasHashLock = false;

  for (const node of nodes) {
    if (node.type === 'CHECK_ADDRESS') hasSig = true;
    if (node.type === 'HASH_LOCK') hasHashLock = true;
    if (node.type === 'MULTISIG_SIGNED') {
      hasMultisig = true;
      sigCount = Number(node.params.required ?? 2n);
    }
    // Most contracts need sig verification for spending
    if (node.category === 'action') hasSig = true;
  }

  return { hasSig, hasMultisig, sigCount, hasHashLock };
}

// Generate constructor arguments string
function generateConstructorArgs(args: ConstructorArg[]): string {
  if (args.length === 0) return '';

  const argStrings = args.map((arg) => `    ${arg.type} ${arg.name}`);
  return argStrings.join(',\n');
}

// Collect all node IDs that live inside the THEN/ELSE branches of an IF_ELSE.
// These are skipped in the main loop and generated inline instead.
function collectBranchIds(
  startId: string,
  nodeMap: Map<string, BlockNode>,
  edges: Edge[],
  collected: Set<string>
): void {
  if (collected.has(startId)) return;
  const node = nodeMap.get(startId);
  if (!node) return;
  collected.add(startId);

  if (node.type === 'IF_ELSE') {
    // Recursively collect nested IF_ELSE sub-branches and their continuations
    const subThen = edges.find((e) => e.from === node.id && e.type === 'condition_true');
    const subElse = edges.find((e) => e.from === node.id && e.type === 'condition_false');
    const nextEdge = edges.find((e) => e.from === node.id && e.type === 'next');
    if (subThen) collectBranchIds(subThen.to, nodeMap, edges, collected);
    if (subElse) collectBranchIds(subElse.to, nodeMap, edges, collected);
    if (nextEdge) collectBranchIds(nextEdge.to, nodeMap, edges, collected);
  } else {
    // Follow next block in the branch sequence (children[0] for statement blocks)
    if (node.children.length > 0) {
      collectBranchIds(node.children[0], nodeMap, edges, collected);
    }
  }
}

// Generate CashScript code for a linear sequence of nodes within a branch.
// Uses 12-space indent so branch content is nested inside the if/else wrapper.
function generateBranchCode(
  startId: string,
  nodeMap: Map<string, BlockNode>,
  edges: Edge[],
  startOutputIndex: number
): string {
  const lines: string[] = [];
  let outputIndex = startOutputIndex;
  let currentId: string | undefined = startId;

  while (currentId) {
    const node = nodeMap.get(currentId);
    if (!node) break;
    const isAction = node.category === 'action';

    if (node.type === 'IF_ELSE') {
      const condExpr = node.params.conditionExpr ?? 'true';
      const thenEdge = edges.find((e) => e.from === node.id && e.type === 'condition_true');
      const elseEdge = edges.find((e) => e.from === node.id && e.type === 'condition_false');
      let code = `            if (${condExpr}) {\n`;
      if (thenEdge) code += generateBranchCode(thenEdge.to, nodeMap, edges, outputIndex).replace(/^/gm, '    ') + '\n';
      code += '            } else {\n';
      if (elseEdge) code += generateBranchCode(elseEdge.to, nodeMap, edges, outputIndex).replace(/^/gm, '    ') + '\n';
      code += '            }';
      lines.push(code);
      const nextEdge = edges.find((e) => e.from === node.id && e.type === 'next');
      currentId = nextEdge?.to;
    } else {
      const template = getBlockTemplate(node.type, node.params, node.category, isAction ? outputIndex : 0);
      if (template.error) throw new TemplateError(template.error);
      if (template.code) {
        // Template uses 8-space indent; branches need 12 spaces
        const reindented = template.code
          .split('\n')
          .map((line) => line.replace(/^        /, '            '))
          .join('\n');
        lines.push(reindented);
      }
      if (node.type !== 'SPLIT_PERCENT' && isAction) outputIndex += 1;
      currentId = node.children[0];
    }
  }

  return lines.join('\n\n');
}

// Generate function body from sorted nodes
function generateFunctionBody(nodes: BlockNode[], edges: Edge[]): string {
  const codeLines: string[] = [];
  let outputIndex = 0;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Pre-compute which nodes live inside IF_ELSE branches so we can skip them
  // in the main loop and emit them inline inside the if/else block instead.
  const branchNodeIds = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'IF_ELSE') {
      const thenEdge = edges.find((e) => e.from === node.id && e.type === 'condition_true');
      const elseEdge = edges.find((e) => e.from === node.id && e.type === 'condition_false');
      if (thenEdge) collectBranchIds(thenEdge.to, nodeMap, edges, branchNodeIds);
      if (elseEdge) collectBranchIds(elseEdge.to, nodeMap, edges, branchNodeIds);
    }
  }

  for (const node of nodes) {
    if (branchNodeIds.has(node.id)) continue; // handled inline by IF_ELSE

    const isAction = node.category === 'action';

    if (node.type === 'IF_ELSE') {
      const condExpr = node.params.conditionExpr ?? 'true';
      const thenEdge = edges.find((e) => e.from === node.id && e.type === 'condition_true');
      const elseEdge = edges.find((e) => e.from === node.id && e.type === 'condition_false');

      let code = `        // LOGIC: Conditional branch\n        if (${condExpr}) {\n`;
      if (thenEdge) {
        code += generateBranchCode(thenEdge.to, nodeMap, edges, outputIndex) + '\n';
      } else {
        code += '            // empty branch\n';
      }
      code += '        } else {\n';
      if (elseEdge) {
        code += generateBranchCode(elseEdge.to, nodeMap, edges, outputIndex) + '\n';
      } else {
        code += '            // empty branch\n';
      }
      code += '        }';
      codeLines.push(code);
    } else {
      const template = getBlockTemplate(
        node.type,
        node.params,
        node.category,
        isAction ? outputIndex : 0
      );
      if (template.error) throw new TemplateError(template.error);
      if (template.code) codeLines.push(template.code);
    }

    // Track output index for action blocks.
    // SPLIT_PERCENT only adds value constraints to the next two outputs —
    // the subsequent SEND_* blocks each claim one of those output slots.
    if (node.type !== 'SPLIT_PERCENT' && isAction) outputIndex += 1;
  }

  return codeLines.join('\n\n');
}

// Main compile function - PURE, no side effects
export function compile(graph: BlockGraph): CompileResult {
  try {
    // Validate graph
    const validationErrors = validateGraph(graph);
    if (validationErrors.length > 0) {
      return {
        source: '',
        constructorArgs: [],
        error: validationErrors.map((e) => e.message).join('; '),
      };
    }

    // Sort nodes topologically
    const sortedNodes = sortNodes(graph);

    // Collect constructor arguments
    const constructorArgs = collectConstructorArgs(sortedNodes);

    // Determine signature requirements
    const { hasSig, hasMultisig, sigCount, hasHashLock } = needsSignature(sortedNodes);

    // Generate function signature
    const functionSig = getFunctionSignature(hasSig, hasMultisig, sigCount, hasHashLock);

    // Generate constructor args string
    const constructorArgsStr = generateConstructorArgs(constructorArgs);

    // Generate function body
    const functionBody = generateFunctionBody(sortedNodes, graph.edges);

    // Assemble full contract
    const contractName = 'GeneratedContract';
    const constructorSection = constructorArgsStr
      ? `(\n${constructorArgsStr}\n)`
      : '()';

    // Add standard signature check if needed and not multisig
    let sigCheck = '';
    if (hasSig && !hasMultisig) {
      sigCheck = `        // Verify signature
        require(checkSig(s, pk));\n\n`;
    }

    const source = `pragma cashscript ^0.10.0;\n\ncontract ${contractName}${constructorSection} {\n    ${functionSig} {\n${sigCheck}${functionBody}\n    }\n}\n`;

    return {
      source,
      constructorArgs,
    };
  } catch (err) {
    if (err instanceof TemplateError) {
      return {
        source: '',
        constructorArgs: [],
        error: err.message,
      };
    }
    throw err;
  }
}

// Export for testing
export { validateGraph, sortNodes, collectConstructorArgs };
