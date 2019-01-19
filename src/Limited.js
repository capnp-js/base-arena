/* @flow */

import { PointerLevelError, ReadLimitError } from "@capnp-js/internal-error";

type uint = number;

export default class Limited {
  maxBytes: uint;
  maxLevel: uint;

  constructor(maxBytes: uint, maxLevel: uint) {
    this.maxBytes = maxBytes;
    this.maxLevel = maxLevel;
  }

  checkLevel(level: uint): void {
    if (level > this.maxLevel) {
      throw new PointerLevelError(level);
    }
  }

  read(bytes: uint): void {
    if (bytes > this.maxBytes) {
      throw new ReadLimitError();
    } else {
      this.maxBytes -= bytes;
    }
  }
}
