import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const downloadsDir = 'C:/Users/devns/Downloads';
const files = fs.readdirSync(downloadsDir).filter(f => f.includes('Minimalist'));
console.log('Found files in Downloads:', files);

for (const file of files) {
  const filePath = path.join(downloadsDir, file);
  const stat = fs.statSync(filePath);
  console.log(`\nFile: ${file} (${stat.size} bytes)`);
  if (file.endsWith('.pdf')) {
    const data = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(data);
    console.log('PDF Page count:', pdf.getPageCount());
    const page0 = pdf.getPage(0);
    console.log('Page 0 dimensions:', page0.getSize());
    
    // Inspect objects in PDF
    const context = pdf.context;
    let imageCount = 0;
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (obj.constructor && obj.constructor.name === 'PDFRawStream') {
        const dict = obj.dict;
        const subtype = dict.get(pdf.context.obj('Subtype'))?.toString();
        if (subtype === '/Image') {
          imageCount++;
          const width = dict.get(pdf.context.obj('Width'))?.toString();
          const height = dict.get(pdf.context.obj('Height'))?.toString();
          const filter = dict.get(pdf.context.obj('Filter'))?.toString();
          console.log(`  Embedded Image ${imageCount}: ref=${ref.toString()}, Dimensions=${width}x${height}, Filter=${filter}`);
        }
      }
    }
    console.log(`Total embedded images found: ${imageCount}`);
  }
}
