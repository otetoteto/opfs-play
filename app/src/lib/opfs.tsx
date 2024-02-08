import { useState, useSyncExternalStore } from "react";

class OpfsDir {
  kind = "dir" as const;
  #name: string;
  #children: OpfsEntry[];
  #handle: FileSystemDirectoryHandle;
  #emitChange: (() => void) | null = null;
  constructor(
    handle: FileSystemDirectoryHandle,
    emitChange: null | (() => void),
    children: OpfsEntry[] = [],
    name: string = ""
  ) {
    this.#name = name || handle.name;
    this.#children = children;
    this.#handle = handle;
    this.#emitChange = emitChange;
  }

  get name() {
    return this.#name;
  }

  get children() {
    return this.#children;
  }

  async *iter() {
    for await (const [name, handle] of this.#handle) {
      yield [name, handle] as const;
    }
  }

  async createFile(name: string, content: string = "") {
    const handle = await this.#handle.getFileHandle(name, { create: true });
    const file = new OpfsFile(handle, this.#emitChange, content);
    this.#children.push(file);
    this.#emitChange?.();
  }

  async createDir(name: string, children: OpfsEntry[] = []) {
    const handle = await this.#handle.getDirectoryHandle(name, {
      create: true,
    });
    const dir = new OpfsDir(handle, this.#emitChange, children);
    this.#children.push(dir);
    this.#emitChange?.();
  }
}

class OpfsFile {
  kind = "file" as const;
  #name: string;
  #content: string;
  #handle: FileSystemFileHandle;
  #emitChange: (() => void) | null = null;
  constructor(
    handle: FileSystemFileHandle,
    emitChange: null | (() => void),
    content: string = ""
  ) {
    this.#name = handle.name;
    this.#content = content;
    this.#handle = handle;
    this.#emitChange = emitChange;
  }

  get name() {
    return this.#name;
  }

  get content() {
    return this.#content;
  }
}

type OpfsEntry = OpfsDir | OpfsFile;

declare global {
  interface FileSystemDirectoryHandle {
    [Symbol.asyncIterator](): AsyncGenerator<[string, FileSystemHandle]>;
    remove(options?: { recursive?: boolean }): Promise<void>;
  }
}

export class OpfsTree {
  #listenId: number | null = null;
  #interval: number = 15_000;

  #emitChange: (() => void) | null = null;

  #cache = {
    kind: "dir" as const,
    name: "root",
    children: [] as OpfsEntry[],
  };

  tree() {
    return this.#cache as OpfsDir;
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
      (this.#cache = new OpfsDir(root, this.#emitChange, [], "root"))
    );
  }

  async #walk_(dir: OpfsDir): Promise<void> {
    for await (const [, handle] of dir.iter()) {
      if (this.#isDirHandle(handle)) {
        const child = new OpfsDir(handle, this.#emitChange);
        dir.children.push(child);
        await this.#walk_(child);
      } else {
        dir.createFile(handle.name);
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
