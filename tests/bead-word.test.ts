import { expect, test } from "vitest";
import { BEAD_WORD, packBeadWord, unpackBeadWord } from "../src/print";

test("a packed bead word gives back its feature, layer and speed", () => {
  const word = packBeadWord(3, 1234, 77);
  expect(unpackBeadWord(word, BEAD_WORD.feature)).toBe(3);
  expect(unpackBeadWord(word, BEAD_WORD.layer)).toBe(1234);
  expect(unpackBeadWord(word, BEAD_WORD.speed)).toBe(77);
});

test("a packed bead word survives a Float32 round trip at its largest values", () => {
  const word = new Float32Array([packBeadWord(3, 2047, 255)])[0];
  expect(unpackBeadWord(word, BEAD_WORD.feature)).toBe(3);
  expect(unpackBeadWord(word, BEAD_WORD.layer)).toBe(2047);
  expect(unpackBeadWord(word, BEAD_WORD.speed)).toBe(255);
});

test("a layer past the table clamps to the last entry", () => {
  expect(unpackBeadWord(packBeadWord(0, 5000, 0), BEAD_WORD.layer)).toBe(2047);
});
