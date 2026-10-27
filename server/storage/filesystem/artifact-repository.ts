import fs from "node:fs";
import path from "node:path";
import type { SyncArtifactRepository } from "../repositories";
import { normalizeArtifactKey } from "../artifact-key";

/** Filesystem-backed artifact repository shared by persistent database adapters. */
export function createFilesystemArtifactRepository(dataDir: string): SyncArtifactRepository {
  const filePath = (key: string) => path.join(dataDir, normalizeArtifactKey(key));
  return {
    read(key) {
      const target = filePath(key);
      try {
        return new Uint8Array(fs.readFileSync(target));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    write(key, contents) {
      const target = filePath(key);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    delete(key) {
      const target = filePath(key);
      try {
        fs.unlinkSync(target);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    exists(key) {
      try {
        return fs.statSync(filePath(key)).isFile();
      } catch {
        return false;
      }
    },
    stat(key) {
      try {
        const stat = fs.statSync(filePath(key));
        return stat.isFile()
          ? { size: stat.size, modifiedAt: stat.mtime.toISOString() }
          : undefined;
      } catch {
        return undefined;
      }
    },
    list(prefix = "") {
      const result: string[] = [];
      const walk = (dir: string, relative: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const nextRelative = relative ? relative + "/" + entry.name : entry.name;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full, nextRelative);
            else if (entry.isFile() && nextRelative.startsWith(prefix)) result.push(nextRelative);
          }
        } catch {
          /* missing or inaccessible directory */
        }
      };
      walk(dataDir, "");
      return result.sort();
    },
    totalBytes() {
      let bytes = 0;
      const walk = (dir: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) bytes += fs.statSync(full).size;
          }
        } catch {
          /* missing or inaccessible directory */
        }
      };
      walk(dataDir);
      return bytes;
    },
  };
}
