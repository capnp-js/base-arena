/* @flow */

import * as assert from "assert";
import { describe, it } from "mocha";
import { create, fill, set } from "@capnp-js/bytes";
import {
  ListAlignmentError,
  ListTypeError,
  PointerTypeError,
  SegmentIdError,
  StaleStructCompileError,
  StaleNonboolListCompileError,
} from "@capnp-js/internal-error";
import { BoolListSchemaTransitionError } from "@capnp-js/layout";
import { SegmentRangeError, root } from "@capnp-js/memory";
import { int32 } from "@capnp-js/write-data";

import Unlimited from "../../src/Unlimited";
import Base from "../../src/Base";

describe("Base", function () {
  describe(".segment", function () {
    it("prevents access to out-of-bounds segments", function () {
      const raw = (null: any);
      const end = (null: any);
      const segments = [
        { id: 0, raw, end },
        { id: 1, raw, end },
        { id: 2, raw, end },
        { id: 3, raw, end },
      ];
      const base = new Base(segments, new Unlimited());

      assert.doesNotThrow(() => base.segment(0));
      assert.doesNotThrow(() => base.segment(1));
      assert.doesNotThrow(() => base.segment(2));
      assert.doesNotThrow(() => base.segment(3));
      assert.throws(() => {
        base.segment(4)
      }, SegmentIdError);
    });
  });

  describe(".pointer operating on single-hop far pointers", function () {
    const segments = [
      { id: 0, raw: create(8), end: 8 },
      { id: 1, raw: create(32), end: 32 },
    ];
    set(0x02, 0, segments[0].raw);
    set(0x01, 4, segments[0].raw);
    const base = new Base(segments, new Unlimited());

    it("computes in bounds, struct landing pads", function () {
      set(0x00, 0, segments[1].raw);
      set(0x01, 4, segments[1].raw);
      set(0x02, 6, segments[1].raw);
      const p1 = base.pointer(root(base));
      assert.equal(p1.typeBits, 0x00);
      assert.equal(p1.hi, (0x02<<16) | 0x01);
      assert.deepEqual(p1.object, {segment: segments[1], position: 8});
    });

    it("computes in bounds, list landing pads", function () {
      fill(0, 0, 8, segments[1].raw);
      set(0x01, 0, segments[1].raw);
      set((3<<3) | 0x05, 4, segments[1].raw);
      const p2 = base.pointer(root(base));
      assert.equal(p2.typeBits, 0x01);
      assert.equal(p2.hi, (3<<3) | 0x05);
      assert.deepEqual(p2.object, {segment: segments[1], position: 8});
    });

    it("rejects in bounds, single-hop far pointer landing pads", function () {
      fill(0, 0, 32, segments[1].raw);
      set(0x02, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, double-hop far pointer landing pads", function () {
      fill(0, 0, 32, segments[1].raw);
      set(0x04 | 0x02, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    })

    it("rejects in bounds, capability landing pads", function () {
      fill(0, 0, 32, segments[1].raw);
      set(0x03, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects out of bounds landing pads", function () {
      fill(0, 0, 32, segments[1].raw);
      set((4<<3) | 0x02, 0, segments[0].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, SegmentRangeError);
    });
  });

  describe(".pointer operating on double-hop far pointers", function () {
    const segments = [
      { id: 0, raw: create(8), end: 8 },
      { id: 1, raw: create(16), end: 16 },
      { id: 2, raw: create(32), end: 32 },
    ];
    const base = new Base(segments, new Unlimited());

    set(0x04 | 0x02, 0, segments[0].raw);
    set(0x01, 4, segments[0].raw);
    set(0x02, 0, segments[1].raw);
    set(0x02, 4, segments[1].raw);

    it("computes in bounds, struct landing pads", function () {
      set(0x00, 8, segments[1].raw);
      set(0x01, 12, segments[1].raw);
      set(0x03, 14, segments[1].raw);
      const p1 = base.pointer(root(base));
      assert.equal(p1.typeBits, 0x00);
      assert.equal(p1.hi, (0x03<<16) | 0x01);
      assert.deepEqual(p1.object, {segment: segments[2], position: 0});
    });

    it("computes in bounds, list landing pads", function () {
      fill(0, 8, 16, segments[1].raw);
      set(0x01, 8, segments[1].raw);
      set((4<<3) | 0x05, 12, segments[1].raw);
      const p2 = base.pointer(root(base));
      assert.equal(p2.typeBits, 0x01);
      assert.equal(p2.hi, (4<<3) | 0x05);
      assert.deepEqual(p2.object, {segment: segments[2], position: 0});
    });

    it("rejects in bounds, far pointer landing pads", function () {
      fill(0, 8, 16, segments[1].raw);
      set(0x02, 8, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, capability tags", function () {
      fill(0, 8, 16, segments[1].raw);
      set(0x03, 8, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, struct landing pads", function () {
      fill(0, 0, 16, segments[1].raw);
      set(0x00, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, list landing pads", function () {
      fill(0, 0, 16, segments[1].raw);
      set(0x01, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, capability landing pads", function () {
      fill(0, 0, 16, segments[1].raw);
      set(0x03, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects in bounds, double-hop far pointer landing pads", function () {
      fill(0, 8, 16, segments[1].raw);
      set(0x04 | 0x02, 0, segments[1].raw);
      assert.throws(() => {
        base.pointer(root(base));
      }, PointerTypeError);
    });

    it("rejects out of bounds landing pads", function () {
      fill(0, 0, 8, segments[0].raw);
      set((2<<3) | 0x04 | 0x02, 0, segments[0].raw);
      set(0x01, 4, segments[0].raw);
      fill(0, 0, 16, segments[1].raw);
      set((4<<3) | 0x02, 0, segments[1].raw); //TODO: This was setting on segments[0]. That was a bug, right?
      assert.throws(() => {
        base.pointer(root(base));
      }, SegmentRangeError);
    });
  });

  describe(".specificStructLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x00,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("computes in bounds, struct layouts that are compatible with compile-time metadata", function () {
      p.hi = (0x02<<16) | 0x01;
      assert.deepEqual(base.specificStructLayout(p, {data: 16, pointers: 24}), {
        tag: "struct",
        bytes: {
          data: 8,
          pointers: 16,
        },
        dataSection: 0,
        pointersSection: 8,
        end: 24,
      });
    });

    it("rejects struct layouts that are not compatible with compile-time metadata", function () {
      assert.throws(() => {
        base.specificStructLayout(p, {data: 8, pointers: 8})
      }, StaleStructCompileError);
    });

    it("rejects struct layouts that are out of bounds", function () {
      p.hi = (0x03<<16) | 0x01;
      assert.throws(() => {
        base.specificStructLayout(p, {data: 8, pointers: 16})
      }, SegmentRangeError);
    });

    it("rejects far pointers that land out of bounds", function () {
      p.hi = (0x02<<16) | 0x02;
      assert.throws(() => {
        base.specificStructLayout(p, {data: 8, pointers: 16})
      }, SegmentRangeError);
    });

    it("rejects list pointers", function () {
      p.typeBits = 0x01;
      p.hi = 0;
      assert.throws(() => {
        base.specificStructLayout(p, {data: 8, pointers: 16})
      }, PointerTypeError);
    });

    it("rejects capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.specificStructLayout(p, {data: 8, pointers: 16})
      }, PointerTypeError);
    });
  });

  describe(".genericStructLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x00,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("computes in bounds, struct layouts", function () {
      p.hi = (0x02<<16) | 0x01;
      assert.deepEqual(base.genericStructLayout(p), {
        tag: "struct",
        bytes: {
          data: 8,
          pointers: 16,
        },
        dataSection: 0,
        pointersSection: 8,
        end: 24,
      });
    });

    it("rejects out of bounds struct objects", function () {
      p.hi = (0x03<<16) | 0x01;
      assert.throws(() => {
        base.genericStructLayout(p)
      }, SegmentRangeError);
    });

    it("rejects out of bounds far pointers", function () {
      p.hi = (0x02<<16) | 0x02;
      assert.throws(() => {
        base.genericStructLayout(p)
      }, SegmentRangeError);
    });

    it("rejects list pointers", function () {
      p.typeBits = 0x01;
      p.hi = 0;
      assert.throws(() => {
        base.genericStructLayout(p)
      }, PointerTypeError);
    });

    it("rejects capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.genericStructLayout(p)
      }, PointerTypeError);
    });
  });

  describe(".boolListLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x01,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("computes in bounds, bool list layouts", function () {
      p.hi = (192<<3) | 0x01;
      assert.deepEqual(base.boolListLayout(p), {
        tag: "bool list",
        begin: 0,
        length: 192,
      });
    });

    it("rejects out of bounds bool list", function () {
      p.hi = (193<<3) | 0x01;
      assert.throws(() => {
        base.boolListLayout(p)
      }, SegmentRangeError);
    });

    it("rejects in bounds, nonbool list layouts", function () {
      p.hi = (0<<3) | 0x00;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x02;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x03;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x04;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x05;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x06;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);

      p.hi = (0<<3) | 0x07;
      assert.throws(() => {
        base.boolListLayout(p)
      }, BoolListSchemaTransitionError);
    });

    it("rejects in bounds, struct layouts", function () {
      p.typeBits = 0x00;
      p.hi = 0;
      assert.throws(() => {
        base.boolListLayout(p)
      }, PointerTypeError);
    });

    it("rejects in bounds capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.boolListLayout(p)
      }, PointerTypeError);
    });
  });

  describe(".blobLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x01,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("computes in bounds, blob layouts", function () {
      p.hi = (21<<3) | 0x02,
      assert.deepEqual(base.blobLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x02,
          bytes: {data: 1, pointers: 0},
        },
        begin: 0,
        length: 21,
      });
    });

    it("rejects out of bounds blobs", function () {
      p.hi = (25<<3) | 0x02;
      assert.throws(() => {
        base.blobLayout(p)
      }, SegmentRangeError);
    });

    it("rejects non-blob list layouts", function () {
      p.hi = (0<<3) | 0x00;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);

      p.hi = (0<<3) | 0x01;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListAlignmentError);

      p.hi = (0<<3) | 0x03;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);

      p.hi = (0<<3) | 0x04;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);

      p.hi = (0<<3) | 0x05;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);

      p.hi = (0<<3) | 0x06;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);

      p.hi = (0<<3) | 0x07;
      assert.throws(() => {
        base.blobLayout(p)
      }, ListTypeError);
    });

    it("rejects struct pointers", function () {
      p.typeBits = 0x00;
      p.hi = 0;
      assert.throws(() => {
        base.blobLayout(p)
      }, PointerTypeError);
    });

    it("rejects capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.blobLayout(p)
      }, PointerTypeError);
    });
  });

  describe(".specificNonboolListLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x01,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("computes in bounds, nonbool list layouts that are compatible with compile-time metadata", function () {
      p.hi = (100<<3) | 0x00;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x00,
          bytes: {data: 0, pointers: 0},
        },
        begin: 0,
        length: 100,
      });
    });

    it("rejects out of bounds lists", function () {
      p.hi = (4<<3) | 0x06;
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x06, bytes: {data: 0, pointers: 8}})
      }, SegmentRangeError);
    });

    it("rejects pre-upgrade list layouts that are not compatible with compile-time metadata", function () {
      p.hi = (2<<3) | 0x07;
      int32((1<<2) | 0x00, segment.raw, 0);
      int32((0x01<<16) | 0x01, segment.raw, 4);

      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x02, bytes: {data: 1, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x03, bytes: {data: 2, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x04, bytes: {data: 4, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x05, bytes: {data: 8, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x06, bytes: {data: 0, pointers: 8}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}})
      }, StaleNonboolListCompileError);
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 8}})
      }, StaleNonboolListCompileError);
    });

    it("rejects post-upgrade layouts that are compatible with compile-time metadata", function () {
      p.hi = (2<<3) | 0x07;
      int32((1<<2) | 0x00, segment.raw, 0);
      int32((0x01<<16) | 0x01, segment.raw, 4);

      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x07,
          bytes: {data: 8, pointers: 8},
        },
        begin: 8,
        length: 1,
      });

      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x07,
          bytes: {data: 8, pointers: 8},
        },
        begin: 8,
        length: 1,
      });

      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 16}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x07,
          bytes: {data: 8, pointers: 8},
        },
        begin: 8,
        length: 1,
      });
    });

    it("accepts pre-upgrade layouts that are compatible with compile-time metadata", function () {
      p.hi = (5<<3) | 0x00;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x00,
          bytes: {data: 0, pointers: 0},
        },
        begin: 0,
        length: 5,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x00,
          bytes: {data: 0, pointers: 0},
        },
        begin: 0,
        length: 5,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 24}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x00,
          bytes: {data: 0, pointers: 0},
        },
        begin: 0,
        length: 5,
      });

      p.hi = (12<<3) | 0x02;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x02,
          bytes: {data: 1, pointers: 0},
        },
        begin: 0,
        length: 12,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x02,
          bytes: {data: 1, pointers: 0},
        },
        begin: 0,
        length: 12,
      });

      p.hi = (2<<3) | 0x03;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x03,
          bytes: {data: 2, pointers: 0},
        },
        begin: 0,
        length: 2,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 16}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x03,
          bytes: {data: 2, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (1<<3) | 0x04;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x04,
          bytes: {data: 4, pointers: 0},
        },
        begin: 0,
        length: 1,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x04,
          bytes: {data: 4, pointers: 0},
        },
        begin: 0,
        length: 1,
      });

      p.hi = (2<<3) | 0x05;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x05,
          bytes: {data: 8, pointers: 0},
        },
        begin: 0,
        length: 2,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x05,
          bytes: {data: 8, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x06;
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x06,
          bytes: {data: 0, pointers: 8},
        },
        begin: 0,
        length: 2,
      });
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x06,
          bytes: {data: 0, pointers: 8},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x07;
      int32((1<<2) | 0x00, segment.raw, 0);
      int32((0x01<<16) | 0x01, segment.raw, 4);
      assert.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 16}}), {
        tag: "non-bool list",
        encoding: {
          flag: 0x07,
          bytes: {data: 8, pointers: 8},
        },
        begin: 8,
        length: 1,
      });
    });

    it("rejects struct objects", function () {
      p.typeBits = 0x00;
      p.hi = 0;
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
      }, PointerTypeError);
    });

    it("rejects bool lists", function () {
      p.typeBits = 0x01;
      p.hi = (0<<3) | 0x01;
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
      }, ListAlignmentError);
    });

    it("rejects capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
      }, PointerTypeError);
    });
  });

  describe(".genericNonboolListLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x01,
      hi: 0,
      object: {
        segment,
        position: 0,
      },
    };

    it("rejects in bounds, bool lists", function () {
      p.hi = (21<<3) | 0x01;
      assert.throws(() => {
        base.genericNonboolListLayout(p)
      }, ListAlignmentError);
    });

    it("computes in bounds, nonbool lists", function () {
      p.hi = (21<<3) | 0x00;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x00,
          bytes: {data: 0, pointers: 0},
        },
        begin: 0,
        length: 21,
      });

      p.hi = (2<<3) | 0x02;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x02,
          bytes: {data: 1, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x03;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x03,
          bytes: {data: 2, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x04;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x04,
          bytes: {data: 4, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x05;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x05,
          bytes: {data: 8, pointers: 0},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x06;
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x06,
          bytes: {data: 0, pointers: 8},
        },
        begin: 0,
        length: 2,
      });

      p.hi = (2<<3) | 0x07;
      int32((1<<2) | 0x00, p.object.segment.raw, p.object.position);
      int32((0x02<<16) | 0x00, p.object.segment.raw, p.object.position+4);
      assert.deepEqual(base.genericNonboolListLayout(p), {
        tag: "non-bool list",
        encoding: {
          flag: 0x07,
          bytes: {data: 0, pointers: 16},
        },
        begin: 8,
        length: 1,
      });
    });

    it("rejects out of bounds lists", function () {
      p.hi = (25<<3) | 0x02;
      assert.throws(() => {
        base.genericNonboolListLayout(p)
      }, SegmentRangeError);
    });

    it("rejects structs", function () {
      p.typeBits = 0x00;
      p.hi = 0;
      assert.throws(() => {
        base.genericNonboolListLayout(p)
      }, PointerTypeError);
    });

    it("rejects capabilities", function () {
      p.typeBits = 0x03;
      p.hi = 0;
      assert.throws(() => {
        base.genericNonboolListLayout(p)
      }, PointerTypeError);
    });
  });

  describe(".capLayout", function () {
    const segment = { id: 0, raw: create(24), end: 24 };
    const base = new Base([segment], new Unlimited());
    const p = {
      typeBits: 0x03,
      hi: 0x12345678,
      object: {
        segment,
        position: 0,
      },
    };

    it("returns the pointer's `hi` as a capability `index`", function () {
      assert.deepEqual(base.capLayout(p), {
        tag: "cap",
        index: 0x12345678,
      });
    });

    it("rejects structs", function () {
      p.typeBits = 0x00;
      p.hi = 0x00;
      assert.throws(() => {
        base.capLayout(p)
      }, PointerTypeError);
    });

    it("rejects lists", function () {
      p.typeBits = 0x01;
      p.hi = 0x00;
      assert.throws(() => {
        base.capLayout(p)
      }, PointerTypeError);
    });
  });
});
