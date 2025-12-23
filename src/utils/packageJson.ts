import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function getProjectNameFromPackageJson(): string | null {
  const packagePath = join(process.cwd(), 'package.json');

  if (!existsSync(packagePath)) {
    return null;
  }

  try {
    const content = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return content.name || null;
  } catch {
    return null;
  }
}
