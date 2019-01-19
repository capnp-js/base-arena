/* @flow */

import type { Limiter } from "./index";

type uint = number;

export default class Unlimited implements Limiter {
  checkLevel(level: uint): void {} // eslint-disable-line no-unused-vars
  read(bytes: uint): void {} // eslint-disable-line no-unused-vars
}
