/* @flow */

import * as assert from "assert";
import { describe, it } from "mocha";

import Unlimited from "../../src/Unlimited";

describe("Unlimited", function () {
  describe(".checkLevel", function () {
    it("doesn't throw for any level", function () {
      const unlimited = new Unlimited();
      assert.doesNotThrow(() => unlimited.checkLevel(100000000));
    });
  });

  describe(".read", function () {
    it("doesn't throw for any read amount", function () {
      const unlimited = new Unlimited();
      assert.doesNotThrow(() => unlimited.read(100000000));
    });
  });
});
