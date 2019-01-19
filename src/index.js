/* @flow */

type uint = number;

export interface Limiter {
  checkLevel(level: uint): void;
  read(bytes: uint): void;
}

export { default as Base } from "./Base";
export { default as Limited } from "./Limited";
export { default as Unlimited } from "./Unlimited";
