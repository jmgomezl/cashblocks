import type { CompileResponse, CashScriptArtifact } from '../types';

const API_URL = '/api/compile';

export async function compileSource(source: string): Promise<CompileResponse> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source }),
    });

    const data = (await response.json()) as { artifact?: CashScriptArtifact; error?: string };

    if (!response.ok) {
      return { error: data.error || 'Compilation failed' };
    }

    return { artifact: data.artifact };
  } catch (err) {
    const error = err as Error;
    return { error: `Network error: ${error.message}` };
  }
}
