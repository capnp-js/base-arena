/* @flow */

import * as assert from "assert";
import { describe, it } from "mocha";
import { PointerLevelError, ReadLimitError } from "@capnp-js/internal-error";

import Limited from "../../src/Limited";

describe("Limited", function () {
  describe(".checkLevel", function () {
    const limiter = new Limited(100, 4);

    it("doesn't throw for levels below the limiter's threshold", function () {
      assert.doesNotThrow(() => limiter.checkLevel(4));
    });

    it("throws for a level beyond the limiter's threshold", function () {
      assert.throws(() => {
        limiter.checkLevel(5);
      }, PointerLevelError);
    });
  });

  describe(".read", function () {
    const limiter = new Limited(100, 4);

    it("doesn't throw for reads below the limiter's threshold", function () {
      assert.doesNotThrow(() => limiter.read(100));
    });

    it("throws for reads beyond the limiter's threshold", function () {
      assert.throws(() => {
        limiter.read(1);
      }, ReadLimitError);
    });
  });
});
