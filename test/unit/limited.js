/* @flow */

import test from "ava";
import { PointerLevelError, ReadLimitError } from "@capnp-js/internal-error";

import Limited from "../../src/Limited";

test("`checkLevel`", t => {
  t.plan(2);

  const limiter = new Limited(100, 4);

  t.notThrows(() => limiter.checkLevel(4));
  t.throws(() => {
    limiter.checkLevel(5);
  }, PointerLevelError);
});

test("`read`", t => {
  t.plan(2);

  const limiter = new Limited(100, 4);

  t.notThrows(() => limiter.read(100));
  t.throws(() => {
    limiter.read(1);
  }, ReadLimitError);
});
