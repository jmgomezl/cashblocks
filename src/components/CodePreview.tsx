import { useEffect, useRef } from 'react';
import type { CompileResult } from '../types';

interface CodePreviewProps {
  compileResult: CompileResult;
}

export default function CodePreview({ compileResult }: CodePreviewProps): JSX.Element {
  const { source, error } = compileResult;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Display error message if compilation failed
  const displayContent = error
    ? `// Compilation Error:\n// ${error}\n\n// Fix the block configuration to generate valid CashScript`
    : source || '// Add a trigger block to start building your contract';

  // Auto-scroll to top when content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
  }, [displayContent]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e1e1e',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#2d2d2d',
          color: '#cccccc',
          fontSize: '12px',
          fontWeight: 'bold',
          borderBottom: '1px solid #404040',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span>CashScript Output</span>
        {error && (
          <span style={{ color: '#f48771', fontSize: '11px' }}>
            Error
          </span>
        )}
        {!error && source && (
          <span style={{ color: '#89d185', fontSize: '11px' }}>
            Valid
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <textarea
          ref={textareaRef}
          readOnly
          value={displayContent}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#1e1e1e',
            color: error ? '#f48771' : '#d4d4d4',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: '13px',
            lineHeight: '1.5',
            padding: '12px',
            tabSize: 4,
          }}
        />
      </div>
    </div>
  );
}
