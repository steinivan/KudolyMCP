import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProjectNameFromPackageJson } from './packageJson.js';
import * as fs from 'fs';

vi.mock('fs');

describe('getProjectNameFromPackageJson', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns project name when package.json exists and has name', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-project' }));

    const result = getProjectNameFromPackageJson();

    expect(result).toBe('my-project');
  });

  it('returns null when package.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = getProjectNameFromPackageJson();

    expect(result).toBeNull();
  });

  it('returns null when package.json has no name field', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    const result = getProjectNameFromPackageJson();

    expect(result).toBeNull();
  });

  it('returns null when package.json is invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

    const result = getProjectNameFromPackageJson();

    expect(result).toBeNull();
  });
});
