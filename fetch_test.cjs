const https = require('https');
const url = 'https://router.project-osrm.org/route/v1/driving/-118.243683,34.052235;-122.419418,37.774929?overview=false&steps=true';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const steps = json.routes[0].legs[0].steps;
    for (let i = 0; i < 10; i++) {
      console.log(steps[i].name, "|", steps[i].ref, "|", steps[i].destinations, "|", steps[i].driving_side);
    }
  });
});
