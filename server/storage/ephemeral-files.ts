import path from "node:path";

interface Entry {
  contents: string;
  modifiedAt: Date;
}

const files = new Map<string, Entry>();

function key(filePath: string): string {
  return path.basename(filePath);
}

export function isMemoryPath(filePath: string): boolean {
  return filePath === ":memory:" || filePath.startsWith(":memory:" + path.sep) || filePath.startsWith(":memory:/");
}

export function writeEphemeralFile(filePath: string, contents: string): void {
  files.set(key(filePath), { contents, modifiedAt: new Date() });
}

export function readEphemeralFile(filePath: string): string {
  const entry = files.get(key(filePath));
  if (!entry) {
    const error = new Error("ENOENT: no such ephemeral file") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  return entry.contents;
}

export function statEphemeralFile(filePath: string): { isFile(): boolean; size: number; mtime: Date } {
  const entry = files.get(key(filePath));
  if (!entry) {
    const error = new Error("ENOENT: no such ephemeral file") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  return { isFile: () => true, size: Buffer.byteLength(entry.contents, "utf8"), mtime: entry.modifiedAt };
}

export function unlinkEphemeralFile(filePath: string): void {
  if (!files.delete(key(filePath))) {
    const error = new Error("ENOENT: no such ephemeral file") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
}

export function clearEphemeralFiles(): void {
  files.clear();
}
