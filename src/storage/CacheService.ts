import * as vscode from "vscode";
import { CachedResultEntry } from "../models/types";

const STORAGE_KEY = "codeExplainer.cachedResults";
const MAX_ENTRIES = 20;

export class CacheService {
  public constructor(private readonly storage: vscode.Memento) {}

  public get(key: string): CachedResultEntry | undefined {
    return this.read().find((entry) => entry.key === key);
  }

  public list(): CachedResultEntry[] {
    return this.read();
  }

  public async set(entry: CachedResultEntry): Promise<void> {
    const entries = this.read().filter((item) => item.key !== entry.key);
    entries.unshift(entry);
    await this.storage.update(STORAGE_KEY, entries.slice(0, MAX_ENTRIES));
  }

  private read(): CachedResultEntry[] {
    return this.storage.get<CachedResultEntry[]>(STORAGE_KEY, []);
  }
}
