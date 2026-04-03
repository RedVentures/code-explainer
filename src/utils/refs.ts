import * as path from "path";
import { FileRef } from "../models/types";

export function toFileRef(rootPath: string, filePath: string, startLine?: number): FileRef {
  return {
    path: filePath,
    startLine,
    label: path.relative(rootPath, filePath) || path.basename(filePath),
  };
}

export function formatFileRef(ref: FileRef): string {
  return ref.startLine ? `${ref.path}:${ref.startLine}` : ref.path;
}
