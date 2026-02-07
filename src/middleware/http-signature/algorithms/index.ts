import type { SignatureAlgorithm } from '../types.js';

const registry = new Map<string, SignatureAlgorithm>();

export function registerAlgorithm(algo: SignatureAlgorithm): void {
  registry.set(algo.name, algo);
}

export function getAlgorithm(name: string): SignatureAlgorithm | undefined {
  return registry.get(name);
}

export function getRegisteredAlgorithms(): string[] {
  return Array.from(registry.keys());
}
