const fs = require('fs');
const path = require('path');

const artifactDir = 'C:\\Users\\francisco.villarreal\\.gemini\\antigravity\\brain\\a9a5c157-0ea8-438f-9885-c09e93e3b25c';

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== '.system_generated') {
        searchDirectory(filePath);
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.log')) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes("11335") || content.includes("11343")) {
          console.log(`Found in: ${filePath}`);
          // Print matching lines
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes("11335") || line.includes("11343")) {
              console.log(`  Line ${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  });
}

try {
  searchDirectory(artifactDir);
} catch (e) {
  console.error(e);
}
