/* @flow */

import type {
  Bytes,
  NonboolListEncoding,
  StructLayout,
  BoolListLayout,
  NonboolListLayout,
  CapLayout,
} from "@capnp-js/layout";
import type {
  Pointer,
  SegmentLookup,
  SegmentR,
  SegmentB,
  Word,
} from "@capnp-js/memory";
import type { UInt2 } from "@capnp-js/tiny-uint";
import type { ArenaR } from "@capnp-js/reader-core";
import type { ArenaB } from "@capnp-js/builder-core";

import type { Limiter } from "./index";

import { get } from "@capnp-js/bytes";
import {
  DoubleFarTagError,
  InconsistentWordCountError,
  ListAlignmentError,
  ListTypeError,
  PointerTypeError,
  SegmentIdError,
  StaleStructCompileError,
  StaleNonboolListCompileError,
} from "@capnp-js/internal-error";
import { assertInBounds } from "@capnp-js/memory";
import { int32 } from "@capnp-js/read-data";
import { u2_mask, u3_mask } from "@capnp-js/tiny-uint";
import {
  BoolListSchemaTransitionError,
  isStaleStruct,
  isStaleList,
  listEncodings,
  structBytes,
  wordAligned,
} from "@capnp-js/layout";
import {
  structCopy,
  boolListCopy,
  nonboolListCopy,
} from "@capnp-js/copy-pointers";
import {
  pointer,
  structLayout,
  boolListLayout,
  subwordListLayout,
  inlineCompositeListLayout,
  capLayout,
} from "@capnp-js/read-pointers";
import {
  preallocatedStruct,
  preallocatedBoolList,
  preallocatedNonboolList,
} from "@capnp-js/write-pointers";

type uint = number;
type u32 = number;

function safeBits(typeBits: UInt2): 0x00 | 0x01 {
  if (typeBits === 0x02) {
    throw new PointerTypeError(["struct", "list"], "intersegment");
  } else if (typeBits === 0x03) {
    throw new PointerTypeError(["struct", "list"], "capability");
  } else {
    return typeBits;
  }
}

function nonboolListEncoding(p: Pointer<SegmentR>): NonboolListEncoding {
  if (p.typeBits === 0x01) {
    const flag = u3_mask(p.hi, 0x07);
    if (flag === 0x01) {
      throw new ListAlignmentError("byte aligned", "bit aligned");
    } else if (flag === 0x07) {
      const hi = int32(p.object.segment.raw, p.object.position+4);
      const bytes = structBytes(hi);
      const hiBytes = p.hi & 0xfffffff8;
      const length = int32(p.object.segment.raw, p.object.position) >>> 2;
      if (hiBytes !== length * (bytes.data + bytes.pointers)) {
        throw new InconsistentWordCountError(hiBytes >>> 3, bytes, length);
      }
      return {
        flag: 0x07,
        bytes,
      };
    } else {
      return listEncodings[flag];
    }
  } else {
    if (p.typeBits === 0x00) {
      throw new PointerTypeError(["list"], "struct");
    } else {
      (p.typeBits: 0x03);
      throw new PointerTypeError(["list"], "capability");
    }
  }
}

export default class Base<+S: SegmentR> implements SegmentLookup<S>, ArenaR {
  +segments: $ReadOnlyArray<S>;
  +limiter: Limiter;

  constructor(segments: $ReadOnlyArray<S>, limiter: Limiter) {
    this.segments = segments;
    this.limiter = limiter;
  }

  segment(id: u32): S {
    if (id < this.segments.length) {
      return this.segments[id];
    } else {
      throw new SegmentIdError(id, this.segments.length - 1);
    }
  }

  pointer(ref: Word<SegmentR>): Pointer<S> {
    const lsb = get(ref.position, ref.segment.raw);
    const typeBits = u2_mask(lsb, 0x03);
    if (typeBits === 0x02) {
      const id = int32(ref.segment.raw, ref.position+4) >>> 0;
      const position = (int32(ref.segment.raw, ref.position) & 0xfffffff8) >>> 0;
      const far: Word<S> = {
        segment: this.segment(id),
        position,
      };

      if (u3_mask(lsb, 0x04) === 0x00) {
        /* Single Hop */
        assertInBounds(far, 8);
        return pointer.single(far, safeBits(u2_mask(get(far.position, far.segment.raw), 0x03)));
      } else {
        /* Double Hop */
        assertInBounds(far, 16);

        const bits = u3_mask(get(far.position, far.segment.raw), 0x07);
        if (bits !== 0x02) {
          // bits \in {0x00, 0x01, 0x03, 0x04, 0x05, 0x06, 0x07}
          const bits2 = u2_mask(bits, 0x03);
          if (bits2 === 0x00) {
            // Catches bits \in {0x00, 0x04}
            throw new PointerTypeError(["intersegment hop"], "struct");
          } else if (bits2 === 0x01) {
            // Catches bits \in {0x01, 0x05}
            throw new PointerTypeError(["intersegment hop"], "list");
          } else if (bits2 === 0x03) {
            // Catches bits \in {0x03, 0x07}
            throw new PointerTypeError(["intersegment hop"], "capability");
          } else {
            // All that's left is bits \in {0x06}
            (bits2: 0x02);
            throw new PointerTypeError(["intersegment hop"], "intersegment");
          }
        }

        const offset = int32(far.segment.raw, far.position+8) >> 2; // eslint-disable-line no-shadow
        if (offset !== 0) {
          throw new DoubleFarTagError(offset);
        }

        return pointer.double(this, far, safeBits(u2_mask(get(far.position+8, far.segment.raw), 0x03)));
      }
    } else {
      if (typeBits === 0x03) {
        if ((int32(ref.segment.raw, ref.position) & 0xfffffffc) !== 0) {
          console.warn("Invariant violated: Found a capability with non-zero B bits.");
        }
      }

      /* `ref` can be reconstructed as a `Word<S>` by using
         `this.segment(ref.segment.id)`. The covariance of the `segment`
         property on `Word<.>` makes these `ref`-to-`Word<S>` safe type casts.
         An `S`-typed version of `ref`'s segment can be obtained with
         `this.segment(ref.segment.id)`, so `ref.segment`-to-`S` is also a safe
         type cast. */
      return {
        typeBits,
        hi: int32(ref.segment.raw, ref.position+4),
        object: typeBits === 0x03 ? ((ref: any): Word<S>) : { // eslint-disable-line flowtype/no-weak-types
          segment: ((ref.segment: any): S), // eslint-disable-line flowtype/no-weak-types
          position: ref.position + 8 + pointer.offset(ref),
        },
      };
    }
  }

  specificStructLayout(p: Pointer<SegmentR>, compiledBytes: Bytes): StructLayout {
    const layout = this.genericStructLayout(p);

    if (isStaleStruct(layout.bytes, compiledBytes)) {
      throw new StaleStructCompileError(layout.bytes, compiledBytes);
    } else {
      return layout;
    }
  }

  genericStructLayout(p: Pointer<SegmentR>): StructLayout {
    if (p.typeBits !== 0x00) {
      if (p.typeBits === 0x01) {
        throw new PointerTypeError(["struct"], "list");
      } else {
        (p.typeBits: 0x03);
        throw new PointerTypeError(["struct"], "capability");
      }
    }

    const layout = structLayout(p);
    const bytes = layout.bytes.data + layout.bytes.pointers;
    assertInBounds(p.object, bytes);
    this.limiter.read(bytes);
    return layout;
  }

  boolListLayout(p: Pointer<SegmentR>): BoolListLayout {
    if (p.typeBits === 0x01) {
      const type = u3_mask(p.hi, 0x07);
      if (type !== 0x01) {
        const hi = int32(p.object.segment.raw, p.object.position+4);
        throw new BoolListSchemaTransitionError(type !== 0x07 ? listEncodings[type] : {
          flag: 0x07,
          bytes: structBytes(hi),
        });
      }
    } else {
      if (p.typeBits === 0x00) {
        throw new PointerTypeError(["list"], "struct");
      } else {
        (p.typeBits: 0x03);
        throw new PointerTypeError(["list"], "capability");
      }
    }

    const layout = boolListLayout(p);
    const bytes = wordAligned.boolListBytes(layout.length);
    assertInBounds(p.object, bytes);
    this.limiter.read(bytes);
    return layout;
  }

  blobLayout(p: Pointer<SegmentR>): NonboolListLayout {
    if (p.typeBits === 0x01) {
      const type = u3_mask(p.hi, 0x07);
      if (type !== 0x02) {
        if (type === 0x01) {
          throw new ListAlignmentError("byte aligned", "bit aligned");
        } else {
          (type: 0x00 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x07);
          throw new ListTypeError(0x02, type);
        }
      }
    } else {
      if (p.typeBits === 0x00) {
        throw new PointerTypeError(["list"], "struct");
      } else {
        (p.typeBits: 0x03);
        throw new PointerTypeError(["capability"], "struct");
      }
    }

    const layout = subwordListLayout(p, 0x02);
    const bytes = wordAligned.bytes(layout.length);
    assertInBounds(p.object, bytes);
    this.limiter.read(bytes);
    return layout;
  }

  specificNonboolListLayout(p: Pointer<SegmentR>, compiledEncoding: NonboolListEncoding): NonboolListLayout {
    const encoding = nonboolListEncoding(p);
    if (isStaleList(encoding, compiledEncoding)) {
      throw new StaleNonboolListCompileError(encoding, compiledEncoding);
    }

    const layout = encoding.flag === 0x07 ?
      inlineCompositeListLayout(p, encoding.bytes) :
      subwordListLayout(p, encoding.flag);
    const bytes = wordAligned.nonboolListBytes(layout.length, layout.encoding);
    assertInBounds(p.object, bytes);
    this.limiter.read(bytes);
    return layout;
  }

  genericNonboolListLayout(p: Pointer<SegmentR>): NonboolListLayout {
    const encoding = nonboolListEncoding(p);
    const layout = encoding.flag === 0x07 ?
      inlineCompositeListLayout(p, encoding.bytes) :
      subwordListLayout(p, encoding.flag);
    const bytes = wordAligned.nonboolListBytes(layout.length, encoding);
    assertInBounds(p.object, bytes);
    this.limiter.read(bytes);
    return layout;
  }

  capLayout(p: Pointer<SegmentR>): CapLayout {
    if (p.typeBits !== 0x03) {
      if (p.typeBits === 0x00) {
        throw new PointerTypeError(["capability"], "struct");
      } else {
        (p.typeBits: 0x01);
        throw new PointerTypeError(["capability"], "list");
      }
    }
    return capLayout(p);
  }

  structCopy(layout: StructLayout, segment: SegmentR, level: uint,
             targetArena: ArenaB, target: Word<SegmentB>): void {
    this.limiter.checkLevel(level);
    const bytes = layout.bytes.data + layout.bytes.pointers;
    const object = targetArena.preallocate(bytes, target.segment);
    structCopy(this, layout, segment, level, targetArena, object);
    preallocatedStruct(target, object, layout.bytes);
  }

  boolListCopy(layout: BoolListLayout, segment: SegmentR, level: uint,
               targetArena: ArenaB, target: Word<SegmentB>): void {
    this.limiter.checkLevel(level);
    const bytes = wordAligned.boolListBytes(layout.length);
    const object = targetArena.preallocate(bytes, target.segment);
    /* Preallocation may include garbage outside of the bool list's length, so
     * zero out the final word. */
    boolListCopy(layout, segment, targetArena, object, bytes);
    preallocatedBoolList(target, object, layout.length);
  }

  nonboolListCopy(layout: NonboolListLayout, segment: SegmentR, level: uint,
                  targetArena: ArenaB, target: Word<SegmentB>): void {
    this.limiter.checkLevel(level);
    const bytes = wordAligned.nonboolListBytes(layout.length, layout.encoding);
    const object = targetArena.preallocate(bytes, target.segment);
    /* Preallocation may include garbage outside of the nonbool list's length,
     * so zero out the final word. */
    nonboolListCopy(this, layout, segment, level, targetArena, object, bytes);
    preallocatedNonboolList(target, object, layout.encoding, layout.length);
  }
}
