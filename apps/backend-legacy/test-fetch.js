fetch('http://localhost:4000/static/musique/302db626-db1f-4fde-a1f0-bfbd9eb099f3.m4a')
  .then(res => console.log('Status:', res.status, res.statusText))
  .catch(console.error);
