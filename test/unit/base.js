/* @flow */

import test from "ava";

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

test("`segment`", t => {
  const raw = (null: any);
  const end = (null: any);
  const segments = [{
    id: 0,
    raw,
    end,
  }, {
    id: 1,
    raw,
    end,
  }, {
    id: 2,
    raw,
    end,
  }, {
    id: 3,
    raw,
    end,
  }];
  const base = new Base(segments, new Unlimited());

  t.notThrows(() => base.segment(0));
  t.notThrows(() => base.segment(1));
  t.notThrows(() => base.segment(2));
  t.notThrows(() => base.segment(3));
  t.throws(() => {
    base.segment(4)
  }, SegmentIdError);
});

test("Single hop `pointer`", t => {
  t.plan(10);

  const segments = [{
    id: 0,
    raw: new Uint8Array(8),
    end: 8,
  }, {
    id: 1,
    raw: new Uint8Array(32),
    end: 32,
  }];
  const base = new Base(segments, new Unlimited());

  segments[0].raw[0] = 0x02;
  segments[0].raw[4] = 0x01;

  // In bounds struct landing pad
  segments[1].raw[0] = 0x00;
  segments[1].raw[4] = 0x01;
  segments[1].raw[6] = 0x02;
  const p1 = base.pointer(root(base));
  t.is(p1.typeBits, 0x00);
  t.is(p1.hi, (0x02<<16) | 0x01);
  t.deepEqual(p1.object, {segment: segments[1], position: 8});

  // In bounds list landing pad
  segments[1].raw.fill(0, 0, 8);
  segments[1].raw[0] = 0x01;
  segments[1].raw[4] = (3<<3) | 0x05;
  const p2 = base.pointer(root(base));
  t.is(p2.typeBits, 0x01);
  t.is(p2.hi, (3<<3) | 0x05);
  t.deepEqual(p2.object, {segment: segments[1], position: 8});

  // Unexpected single-hop far-pointer landing pad
  segments[1].raw.fill(0, 0, 32);
  segments[1].raw[0] = 0x02;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected double-hop far-pointer landing pad
  segments[1].raw.fill(0, 0, 32);
  segments[1].raw[0] = 0x04 | 0x02;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected capability landing pad
  segments[1].raw.fill(0, 0, 32);
  segments[1].raw[0] = 0x03;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Out of bounds landing pad
  segments[1].raw.fill(0, 0, 32);
  segments[0].raw[0] = (4<<3) | 0x02;
  t.throws(() => {
    base.pointer(root(base));
  }, SegmentRangeError);
});

test("Double hop `pointer`", t => {
  t.plan(13);

  const segments = [{
    id: 0,
    raw: new Uint8Array(8),
    end: 8,
  }, {
    id: 1,
    raw: new Uint8Array(16),
    end: 16,
  }, {
    id: 2,
    raw: new Uint8Array(32),
    end: 32,
  }];
  const base = new Base(segments, new Unlimited());

  segments[0].raw[0] = 0x04 | 0x02;
  segments[0].raw[4] = 0x01;
  segments[1].raw[0] = 0x02;
  segments[1].raw[4] = 0x02;

  // In bounds struct tag
  segments[1].raw[8] = 0x00;
  segments[1].raw[12] = 0x01;
  segments[1].raw[14] = 0x03;
  const p1 = base.pointer(root(base));
  t.is(p1.typeBits, 0x00);
  t.is(p1.hi, (0x03<<16) | 0x01);
  t.deepEqual(p1.object, {segment: segments[2], position: 0});

  // In bounds list tag
  segments[1].raw.fill(0, 8, 16);
  segments[1].raw[8] = 0x01;
  segments[1].raw[12] = (4<<3) | 0x05;
  const p2 = base.pointer(root(base));
  t.is(p2.typeBits, 0x01);
  t.is(p2.hi, (4<<3) | 0x05);
  t.deepEqual(p2.object, {segment: segments[2], position: 0});

  // Unexpected far pointer tag
  segments[1].raw.fill(0, 8, 16);
  segments[1].raw[8] = 0x02;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected capability tag
  segments[1].raw.fill(0, 8, 16);
  segments[1].raw[8] = 0x03;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected struct landing pad
  segments[1].raw.fill(0, 0, 16);
  segments[1].raw[0] = 0x00;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected list landing pad
  segments[1].raw.fill(0, 0, 16);
  segments[1].raw[0] = 0x01;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected capability landing pad
  segments[1].raw.fill(0, 0, 16);
  segments[1].raw[0] = 0x03;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Unexpected double-hop far-pointer landing pad
  segments[1].raw.fill(0, 8, 16);
  segments[1].raw[0] = 0x04 | 0x02;
  t.throws(() => {
    base.pointer(root(base));
  }, PointerTypeError);

  // Out of bounds landing pad
  segments[0].raw.fill(0, 0, 8);
  segments[0].raw[0] = (2<<3) | 0x04 | 0x02;
  segments[0].raw[4] = 0x01;
  segments[1].raw.fill(0, 0, 16);
  segments[1].raw[0] = (4<<3) | 0x02; //TODO: This was setting on segments[0]. That was a bug, right?
  t.throws(() => {
    base.pointer(root(base));
  }, SegmentRangeError);
});

test("`specificStructLayout`", t => {
  t.plan(6);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x00,
    hi: (0x02<<16) | 0x01,
    object: {
      segment,
      position: 0,
    },
  };
  t.deepEqual(base.specificStructLayout(p, {data: 16, pointers: 24}), {
    tag: "struct",
    bytes: {
      data: 8,
      pointers: 16,
    },
    dataSection: 0,
    pointersSection: 8,
    end: 24,
  });

  // Stale compile
  t.throws(() => {
    base.specificStructLayout(p, {data: 8, pointers: 8})
  }, StaleStructCompileError);

  // Out of bounds
  p.hi = (0x03<<16) | 0x01;
  t.throws(() => {
    base.specificStructLayout(p, {data: 8, pointers: 16})
  }, SegmentRangeError);

  // Out of bounds
  p.hi = (0x02<<16) | 0x02;
  t.throws(() => {
    base.specificStructLayout(p, {data: 8, pointers: 16})
  }, SegmentRangeError);

  // List
  p.typeBits = 0x01;
  p.hi = 0;
  t.throws(() => {
    base.specificStructLayout(p, {data: 8, pointers: 16})
  }, PointerTypeError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.specificStructLayout(p, {data: 8, pointers: 16})
  }, PointerTypeError);
});

test("`genericStructLayout`", t => {
  t.plan(5);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x00,
    hi: (0x02<<16) | 0x01,
    object: {
      segment,
      position: 0,
    },
  };
  t.deepEqual(base.genericStructLayout(p), {
    tag: "struct",
    bytes: {
      data: 8,
      pointers: 16,
    },
    dataSection: 0,
    pointersSection: 8,
    end: 24,
  });

  // Out of bounds
  p.hi = (0x03<<16) | 0x01;
  t.throws(() => {
    base.genericStructLayout(p)
  }, SegmentRangeError);

  // Out of bounds
  p.hi = (0x02<<16) | 0x02;
  t.throws(() => {
    base.genericStructLayout(p)
  }, SegmentRangeError);

  // List
  p.typeBits = 0x01;
  p.hi = 0;
  t.throws(() => {
    base.genericStructLayout(p)
  }, PointerTypeError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.genericStructLayout(p)
  }, PointerTypeError);
});

test("`boolListLayout`", t => {
  t.plan(11);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x01,
    hi: (192<<3) | 0x01,
    object: {
      segment,
      position: 0,
    },
  };

  t.deepEqual(base.boolListLayout(p), {
    tag: "bool list",
    begin: 0,
    length: 192,
  });

  // Out of bounds
  p.hi = (193<<3) | 0x01;
  t.throws(() => {
    base.boolListLayout(p)
  }, SegmentRangeError);

  // List, but not bool list
  p.hi = (0<<3) | 0x00;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x02;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x03;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x04;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x05;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x06;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);
  p.hi = (0<<3) | 0x07;
  t.throws(() => {
    base.boolListLayout(p)
  }, BoolListSchemaTransitionError);

  // Struct
  p.typeBits = 0x00;
  p.hi = 0;
  t.throws(() => {
    base.boolListLayout(p)
  }, PointerTypeError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.boolListLayout(p)
  }, PointerTypeError);
});

test("`blobLayout`", t => {
  t.plan(11);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x01,
    hi: (21<<3) | 0x02,
    object: {
      segment,
      position: 0,
    },
  };

  t.deepEqual(base.blobLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x02,
      bytes: {data: 1, pointers: 0},
    },
    begin: 0,
    length: 21,
  });

  // Out of bounds
  p.hi = (25<<3) | 0x02;
  t.throws(() => {
    base.blobLayout(p)
  }, SegmentRangeError);

  // List, but not bytes list
  p.hi = (0<<3) | 0x00;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);
  p.hi = (0<<3) | 0x01;
  t.throws(() => {
    base.blobLayout(p)
  }, ListAlignmentError);
  p.hi = (0<<3) | 0x03;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);
  p.hi = (0<<3) | 0x04;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);
  p.hi = (0<<3) | 0x05;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);
  p.hi = (0<<3) | 0x06;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);
  p.hi = (0<<3) | 0x07;
  t.throws(() => {
    base.blobLayout(p)
  }, ListTypeError);

  // Struct
  p.typeBits = 0x00;
  p.hi = 0;
  t.throws(() => {
    base.blobLayout(p)
  }, PointerTypeError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.blobLayout(p)
  }, PointerTypeError);
});

test("`specificNonboolListLayout`", t => {
  t.plan(30);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24, 
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x01,
    hi: (100<<3) | 0x00,
    object: {
      segment,
      position: 0,
    },
  };

  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x00,
      bytes: {data: 0, pointers: 0},
    },
    begin: 0,
    length: 100,
  });

  // Out of bounds
  p.hi = (4<<3) | 0x06;
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x06, bytes: {data: 0, pointers: 8}})
  }, SegmentRangeError);

  // Stale compile
  p.hi = (2<<3) | 0x07;
  int32((1<<2) | 0x00, segment.raw, 0);
  int32((0x01<<16) | 0x01, segment.raw, 4);

  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x02, bytes: {data: 1, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x03, bytes: {data: 2, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x04, bytes: {data: 4, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x05, bytes: {data: 8, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x06, bytes: {data: 0, pointers: 8}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}})
  }, StaleNonboolListCompileError);
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 8}})
  }, StaleNonboolListCompileError);

  // Stale message
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x07,
      bytes: {data: 8, pointers: 8},
    },
    begin: 8,
    length: 1,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x07,
      bytes: {data: 8, pointers: 8},
    },
    begin: 8,
    length: 1,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 16}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x07,
      bytes: {data: 8, pointers: 8},
    },
    begin: 8,
    length: 1,
  });

  p.hi = (5<<3) | 0x00;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x00,
      bytes: {data: 0, pointers: 0},
    },
    begin: 0,
    length: 5,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x00,
      bytes: {data: 0, pointers: 0},
    },
    begin: 0,
    length: 5,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 24}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x00,
      bytes: {data: 0, pointers: 0},
    },
    begin: 0,
    length: 5,
  });

  p.hi = (12<<3) | 0x02;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x02,
      bytes: {data: 1, pointers: 0},
    },
    begin: 0,
    length: 12,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x02,
      bytes: {data: 1, pointers: 0},
    },
    begin: 0,
    length: 12,
  });

  p.hi = (2<<3) | 0x03;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x03,
      bytes: {data: 2, pointers: 0},
    },
    begin: 0,
    length: 2,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 16}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x03,
      bytes: {data: 2, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (1<<3) | 0x04;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x04,
      bytes: {data: 4, pointers: 0},
    },
    begin: 0,
    length: 1,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x04,
      bytes: {data: 4, pointers: 0},
    },
    begin: 0,
    length: 1,
  });

  p.hi = (2<<3) | 0x05;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 0}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x05,
      bytes: {data: 8, pointers: 0},
    },
    begin: 0,
    length: 2,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x05,
      bytes: {data: 8, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (2<<3) | 0x06;
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 0, pointers: 8}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x06,
      bytes: {data: 0, pointers: 8},
    },
    begin: 0,
    length: 2,
  });
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 8, pointers: 8}}), {
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
  t.deepEqual(base.specificNonboolListLayout(p, {flag: 0x07, bytes: {data: 16, pointers: 16}}), {
    tag: "non-bool list",
    encoding: {
      flag: 0x07,
      bytes: {data: 8, pointers: 8},
    },
    begin: 8,
    length: 1,
  });

  // Struct
  p.typeBits = 0x00;
  p.hi = 0;
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
  }, PointerTypeError);

  // Bool list
  p.typeBits = 0x01;
  p.hi = (0<<3) | 0x01;
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
  }, ListAlignmentError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.specificNonboolListLayout(p, {flag: 0x00, bytes: {data: 0, pointers: 0}})
  }, PointerTypeError);
});

test("`genericNonboolListLayout`", t => {
  t.plan(11);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x01,
    hi: (21<<3) | 0x00,
    object: {
      segment,
      position: 0,
    },
  };
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x00,
      bytes: {data: 0, pointers: 0},
    },
    begin: 0,
    length: 21,
  });

  p.hi = (21<<3) | 0x01;
  t.throws(() => {
    base.genericNonboolListLayout(p)
  }, ListAlignmentError);

  p.hi = (2<<3) | 0x02;
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x02,
      bytes: {data: 1, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (2<<3) | 0x03;
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x03,
      bytes: {data: 2, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (2<<3) | 0x04;
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x04,
      bytes: {data: 4, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (2<<3) | 0x05;
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x05,
      bytes: {data: 8, pointers: 0},
    },
    begin: 0,
    length: 2,
  });

  p.hi = (2<<3) | 0x06;
  t.deepEqual(base.genericNonboolListLayout(p), {
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
  t.deepEqual(base.genericNonboolListLayout(p), {
    tag: "non-bool list",
    encoding: {
      flag: 0x07,
      bytes: {data: 0, pointers: 16},
    },
    begin: 8,
    length: 1,
  });

  // Out of bounds
  p.hi = (25<<3) | 0x02;
  t.throws(() => {
    base.genericNonboolListLayout(p)
  }, SegmentRangeError);

  // Struct
  p.typeBits = 0x00;
  p.hi = 0;
  t.throws(() => {
    base.genericNonboolListLayout(p)
  }, PointerTypeError);

  // Capability
  p.typeBits = 0x03;
  p.hi = 0;
  t.throws(() => {
    base.genericNonboolListLayout(p)
  }, PointerTypeError);
});

test("`capLayout`", t => {
  t.plan(3);

  const segment = {
    id: 0,
    raw: new Uint8Array(24),
    end: 24,
  };

  const base = new Base([segment], new Unlimited());

  const p = {
    typeBits: 0x03,
    hi: 0x12345678,
    object: {
      segment,
      position: 0,
    },
  };

  t.deepEqual(base.capLayout(p), {
    tag: "cap",
    index: 0x12345678,
  });

  // Struct
  p.typeBits = 0x00;
  p.hi = 0x00;
  t.throws(() => {
    base.capLayout(p)
  }, PointerTypeError);

  // List
  p.typeBits = 0x01;
  p.hi = 0x00;
  t.throws(() => {
    base.capLayout(p)
  }, PointerTypeError);
});
