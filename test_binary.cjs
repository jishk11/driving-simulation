const fs = require('fs');

function interpolate(routeLen, cum, elapsedSec) {
  let low = 0;
  let high = cum.length - 2;
  let segmentIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (cum[mid] <= elapsedSec && elapsedSec <= cum[mid + 1]) {
      segmentIndex = mid;
      break;
    } else if (cum[mid] > elapsedSec) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return segmentIndex;
}

// Fuzz test
let cum = [0];
let sum = 0;
for (let i = 0; i < 50000; i++) {
  sum += Math.random() * 10;
  cum.push(sum);
}

const total = cum[cum.length - 1];
let failed = 0;
for (let i = 0; i < 100000; i++) {
  const target = Math.random() * total;
  const idx = interpolate(50001, cum, target);
  if (idx === 0 && target > cum[1]) {
    console.log("FAILED for target:", target);
    failed++;
  }
}
console.log("Failed:", failed);
