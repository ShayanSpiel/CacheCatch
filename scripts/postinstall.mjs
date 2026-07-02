import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

function isRosettaOnAppleSilicon() {
  if (process.platform !== 'darwin' || process.arch === 'arm64') return false;
  try {
    return execSync('sysctl -n hw.optional.arm64', { encoding: 'utf8' }).trim() === '1';
  } catch {
    return false;
  }
}

function readParentPkg(parent) {
  const p = join(ROOT, 'node_modules', parent, 'package.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const ARM64_NATIVE_DEPS = [
  { parent: 'lightningcss', pkg: 'lightningcss-darwin-arm64' },
  { parent: '@tailwindcss/oxide', pkg: '@tailwindcss/oxide-darwin-arm64' },
];

if (isRosettaOnAppleSilicon()) {
  const toInstall = [];

  for (const { parent, pkg } of ARM64_NATIVE_DEPS) {
    try {
      require.resolve(pkg);
    } catch {
      const parentPkg = readParentPkg(parent);
      const ver = parentPkg?.optionalDependencies?.[pkg]?.replace(/^[\^~]/, '');
      if (ver) toInstall.push(`${pkg}@${ver}`);
    }
  }

  if (toInstall.length > 0) {
    execSync(`npm install ${toInstall.join(' ')} --force --no-save`, {
      stdio: 'inherit', cwd: ROOT, timeout: 60000,
    });
  }
}
