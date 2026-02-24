import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);
const CASHC_VERSION = '0.10.0';

interface CompileRequest {
  source: string;
}

interface CompileResponse {
  artifact?: object;
  error?: string;
}

// Compile CashScript source to artifact using cashc CLI
export async function compileCashScript(source: string): Promise<CompileResponse> {
  const uuid = uuidv4();
  const tempDir = tmpdir();
  const sourcePath = join(tempDir, `cb-${uuid}.cash`);
  const outputPath = join(tempDir, `cb-${uuid}.json`);

  try {
    // Write source to temp file
    await writeFile(sourcePath, source, 'utf-8');

    // Execute cashc compiler (pin to version matching pragma)
    try {
      await execAsync(`npx cashc@${CASHC_VERSION} "${sourcePath}" --output "${outputPath}"`, {
        timeout: 30000, // 30 second timeout
      });
    } catch (execError) {
      const error = execError as { stderr?: string; message?: string };
      const errorMessage = error.stderr || error.message || 'Unknown compilation error';
      return { error: `Compilation failed: ${errorMessage}` };
    }

    // Read artifact JSON
    const artifactJson = await readFile(outputPath, 'utf-8');
    const artifact = JSON.parse(artifactJson) as object;

    return { artifact };
  } catch (err) {
    const error = err as Error;
    return { error: `Compilation error: ${error.message}` };
  } finally {
    // Cleanup temp files
    try {
      await unlink(sourcePath);
    } catch {
      // Ignore cleanup errors
    }
    try {
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Validate compile request
export function validateCompileRequest(body: unknown): CompileRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const req = body as Record<string, unknown>;
  if (typeof req.source !== 'string' || req.source.trim() === '') {
    return null;
  }
  return { source: req.source };
}
