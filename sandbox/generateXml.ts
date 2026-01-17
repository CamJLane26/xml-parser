import * as fs from 'fs';
import * as path from 'path';

const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Black', 'White', 'Brown'];
const toyNames = ['Brick', 'Ball', 'Car', 'Doll', 'Train', 'Plane', 'Robot', 'Teddy Bear', 'Puzzle', 'Blocks'];
const storeNames = ['Target', 'Walmart', 'Toys R Us', 'Amazon', 'Best Buy', 'GameStop', 'Barnes & Noble'];
const locations = ['Texas', 'California', 'New York', 'Florida', 'Illinois', 'Pennsylvania', 'Ohio', 'Georgia', 'North Carolina', 'Michigan'];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateRandomToy(): string {
  const name = toyNames[Math.floor(Math.random() * toyNames.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const numStores = Math.floor(Math.random() * 3) + 1;
  
  let storeElements = '';
  for (let i = 0; i < numStores; i++) {
    const storeName = storeNames[Math.floor(Math.random() * storeNames.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    storeElements += `    <store><name>${escapeXml(storeName)}</name><location>${escapeXml(location)}</location></store>\n`;
  }
  
  return `  <toy>
    <name>${escapeXml(name)}</name>
    <color>${escapeXml(color)}</color>
${storeElements}  </toy>`;
}

function generateXmlFile(numToys: number, outputPath: string): void {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<toys>\n';
  
  for (let i = 0; i < numToys; i++) {
    xml += generateRandomToy() + '\n';
  }
  
  xml += '</toys>';
  
  fs.writeFileSync(outputPath, xml, 'utf-8');
  console.log(`Generated XML file with ${numToys} toys at: ${outputPath}`);
}

const NUM_TOYS = 10;
const outputPath = path.join(__dirname, 'sample.xml');

generateXmlFile(NUM_TOYS, outputPath);
