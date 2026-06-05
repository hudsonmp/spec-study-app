// Roman-numeral formatting for scenario ordinals (I, II, III, IV, …).
// Falls back to the plain number for non-positive / non-finite input.
const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n);
  let x = Math.floor(n);
  let out = '';
  for (const [v, s] of ROMAN) {
    while (x >= v) {
      out += s;
      x -= v;
    }
  }
  return out;
}
