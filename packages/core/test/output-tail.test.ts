import { describe, expect, it } from 'vitest';
import { OutputTail } from '../src/output-tail.js';

describe('OutputTail', () => {
  it('collapses a run of blank lines into one', () => {
    const tail = new OutputTail(30);
    tail.push('first\r\n\r\n   \r\n\u001b[2K\r\nsecond\r\n  \r\n\r\nthird\r\n');
    expect(tail.snapshot()).toEqual(['first', '', 'second', '', 'third']);
  });

  it('blank runs do not eat into the line limit', () => {
    const tail = new OutputTail(4);
    tail.push(`a\n${'\n'.repeat(50)}b\nc\n`);
    expect(tail.snapshot()).toEqual(['a', '', 'b', 'c']);
  });
});
