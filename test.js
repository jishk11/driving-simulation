function test() {
  const cum = [0, 5, 5, 10, 15];
  let low = 0;
  let high = cum.length - 2;
  let segmentIndex = 0;
  let elapsedSec = 5.0000000001;

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
  console.log("5.0000000001 ->", segmentIndex);
  
  elapsedSec = 7;
  low = 0; high = cum.length - 2; segmentIndex = 0;
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
  console.log("7 ->", segmentIndex);
}
test();
