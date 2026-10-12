import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const filePath = 'C:/Users/devns/Downloads/Minimalist Algothon\u201926 Participation Certificate.pdf';
const data = fs.readFileSync(filePath);
const pdf = await PDFDocument.load(data);
const context = pdf.context;

let count = 0;
for (const [ref, obj] of context.enumerateIndirectObjects()) {
  if (obj.constructor && obj.constructor.name === 'PDFRawStream') {
    const dict = obj.dict;
    const subtype = dict.get(context.obj('Subtype'))?.toString();
    if (subtype === '/Image') {
      count++;
      const width = dict.get(context.obj('Width'))?.toString();
      const height = dict.get(context.obj('Height'))?.toString();
      const filter = dict.get(context.obj('Filter'))?.toString();
      const streamBytes = obj.contents;
      console.log(`Image ${count}: ref=${ref.toString()}, ${width}x${height}, Filter=${filter}, bytes=${streamBytes.length}`);
      
      const outExt = filter === '/DCTDecode' ? 'jpg' : 'bin';
      fs.writeFileSync(`test/output/extracted-img-${count}.${outExt}`, streamBytes);
    }
  }
}
console.log('Extraction complete.');
