import { useState, useSyncExternalStore } from "react";

export type OpfsDir = {
  kind: "dir";
  name: string;
  children: OpfsEntry[];
};

export type OpfsFile = {
  kind: "file";
  name: string;
  content: string;
};

export type OpfsEntry = OpfsDir | OpfsFile;

declare global {
  interface FileSystemDirectoryHandle {
    [Symbol.asyncIterator](): AsyncGenerator<[string, FileSystemHandle]>;
    remove(options?: { recursive?: boolean }): Promise<void>;
  }
}

export class OpfsTree {
  #listenId: number | null = null;
  #interval: number = 10_000;

  #emitChange: (() => void) | null = null;

  #cache: OpfsDir = {
    kind: "dir",
    name: "root",
    children: [],
  };

  tree(): OpfsDir {
    return this.#cache;
  }

  constructor(config: { interval?: number } = {}) {
    const { interval } = config;
    if (interval) {
      this.#interval = interval;
    }
  }

  listen(callback: () => void) {
    this.#emitChange = callback;
    const cancel = () => {
      if (this.#listenId !== null) {
        clearInterval(this.#listenId);
        this.#listenId = null;
      }
    };

    if (this.#listenId !== null) {
      return cancel;
    }

    this.#listenId = setInterval(async () => {
      await this.#walk();
      callback();
    }, this.#interval);

    return cancel;
  }

  async #walk() {
    const root = await navigator.storage.getDirectory();
    await this.#walk_(
      root,
      (this.#cache = {
        kind: "dir",
        name: "root",
        children: [],
      })
    );
  }

  async #walk_(dirHandle: FileSystemDirectoryHandle, dirEntry: OpfsDir) {
    for await (const [name, handle] of dirHandle) {
      if (this.#isDirHandle(handle)) {
        const child: OpfsDir = {
          kind: "dir",
          name,
          children: [],
        };
        dirEntry.children.push(child);
        await this.#walk_(handle, child);
      } else {
        dirEntry.children.push({
          kind: "file",
          name,
          content: "",
        });
      }
    }
  }

  #isDirHandle(handle: FileSystemHandle): handle is FileSystemDirectoryHandle {
    return handle.kind === "directory";
  }

  async addDir(name: string) {
    const root = await navigator.storage.getDirectory();
    await root.getDirectoryHandle(name, { create: true });
    await this.#walk();
    this.#emitChange?.();
  }

  async removeAll() {
    const root = await navigator.storage.getDirectory();
    await root.remove({ recursive: true });
    await this.#walk();
    this.#emitChange?.();
  }
}

export function useOpfs() {
  const [_tree] = useState(() => new OpfsTree());
  const tree = useSyncExternalStore(_tree.listen.bind(_tree), () =>
    _tree.tree()
  );

  return {
    tree,
    addDir: _tree.addDir.bind(_tree),
    remove: _tree.removeAll.bind(_tree),
  };
}
