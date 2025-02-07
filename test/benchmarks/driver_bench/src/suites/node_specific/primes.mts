import assert from 'node:assert/strict';

const findPrimesBelow = 1_000_000;
const expectedPrimes = 78_498;

// byteLength of
// BSON.serialize({ primes: Buffer.from(new Int32Array(sieveOfEratosthenes(findPrimesBelow)).buffer) }).byteLength)
// a bin data of int32s
const byteLength = 314_010;

export const taskSize = 3.1401000000000003; // ~3MB worth of work

assert.equal(taskSize, byteLength * 10e-6); // taskSize should stay hardcoded, checking here the math is done right.

/** @see https://en.wikipedia.org/wiki/Sieve_of_Eratosthenes */
export function sieveOfEratosthenes(n: number) {
  // Create a boolean array "prime[0..n]" and initialize
  // all entries as true. A value in prime[i] will
  // become false if i is Not a prime
  const prime = Array.from({ length: n + 1 }, () => true);

  // We know 0 and 1 are not prime
  prime[0] = false;
  prime[1] = false;

  for (let p = 2; p * p <= n; p++) {
    // If prime[p] is not changed, then it is a prime
    if (prime[p] === true) {
      // Update all multiples of p as false
      for (let i = p * p; i <= n; i += p) {
        prime[i] = false;
      }
    }
  }

  // Collecting all prime numbers
  const primes = [];
  for (let i = 2; i <= n; i++) {
    if (prime[i] === true) {
      primes.push(i);
    }
  }

  return primes;
}

export async function run() {
  assert.equal(sieveOfEratosthenes(findPrimesBelow).length, expectedPrimes);
}
