const path = require('path');
const fs = require('fs');

async function run() {
  try {
    const possiblePaths = [
      path.join(__dirname, 'dist', 'main.js'),
      path.join(__dirname, 'dist', 'src', 'main.js'),
    ];

    let distPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) { distPath = p; break; }
    }

    if (!distPath) {
      console.error('dist/main.js not found');
      process.exit(1);
    }

    console.log(`Loading: ${distPath}`);
    require(distPath); // main.js now handles listen() itself
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
}

run();