import { useEffect, useRef, useCallback } from 'react';
import * as Blockly from 'blockly';
import type { BlockGraph } from '../types';
import { parseWorkspace } from '../compiler/parser';
import { toolbox } from '../blocks/toolbox';
import { registerTriggerBlocks } from '../blocks/definitions/trigger';
import { registerLogicBlocks } from '../blocks/definitions/logic';
import { registerActionBlocks } from '../blocks/definitions/action';
import { registerStateBlocks } from '../blocks/definitions/state';

interface BlockCanvasProps {
  onChange: (graph: BlockGraph) => void;
  onLoadExample?: (loader: (state: object) => void) => void;
}

// Register all block definitions once
let blocksRegistered = false;

function registerAllBlocks(): void {
  if (blocksRegistered) return;
  registerTriggerBlocks();
  registerLogicBlocks();
  registerActionBlocks();
  registerStateBlocks();
  blocksRegistered = true;
}

export default function BlockCanvas({ onChange, onLoadExample }: BlockCanvasProps): JSX.Element {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  // Handle workspace changes
  const handleChange = useCallback(() => {
    if (!workspaceRef.current) return;
    const graph = parseWorkspace(workspaceRef.current);
    onChange(graph);
  }, [onChange]);

  // Load example state into workspace
  const loadExample = useCallback((state: object) => {
    if (!workspaceRef.current) return;

    // Clear current workspace
    workspaceRef.current.clear();

    // Load the saved state
    try {
      Blockly.serialization.workspaces.load(state, workspaceRef.current);
    } catch (err) {
      console.error('Failed to load example:', err);
    }
  }, []);

  // Initialize Blockly workspace
  useEffect(() => {
    if (!blocklyDiv.current) return;

    // Register blocks before creating workspace
    registerAllBlocks();

    // Create workspace
    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      grid: {
        spacing: 20,
        length: 3,
        colour: '#ccc',
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2,
      },
      trashcan: true,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
    });

    workspaceRef.current = workspace;

    // Add change listener
    workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      // Only trigger on block changes, not UI events
      if (
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.BLOCK_DELETE ||
        event.type === Blockly.Events.BLOCK_MOVE
      ) {
        handleChange();
      }
    });

    // Expose loadExample function to parent
    if (onLoadExample) {
      onLoadExample(loadExample);
    }

    // Initial parse
    handleChange();

    // Cleanup
    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [handleChange, loadExample, onLoadExample]);

  return (
    <div
      ref={blocklyDiv}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
      }}
    />
  );
}

// Export workspace serialization for saving examples
export function getWorkspaceState(workspace: Blockly.WorkspaceSvg): object {
  return Blockly.serialization.workspaces.save(workspace);
}
