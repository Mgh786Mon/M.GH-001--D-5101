const fs = require('fs');
const path = require('path');

function toFloat(v, def = 0) {
  const n = parseFloat(String(v || '').trim());
  return Number.isNaN(n) ? def : n;
}
function mmToM(v_mm) { return toFloat(v_mm) / 1000.0; }

const MATERIAL_DENSITIES = {
  steel: 7850,
  stainless_304: 8000,
  aluminum: 2700,
  cast_iron: 7200,
  concrete: 2400
};

function plateWeight(t,L,W,d){ return t*L*W*d; }
function cylinderWeight(dia,h,dens){ const r=dia/2; return Math.PI*r*r*h*dens; }
function ringWeight(od,id,t,dens){ const area=Math.PI*(od*od-id*id)/4; return area*t*dens; }
function diskWeight(d,t,dens){ const r=d/2; return Math.PI*r*r*t*dens; }

function computeRowWeight(row){
  const typ = String((row.type||'').trim()).toLowerCase();
  const material = String((row.material||'').trim()).toLowerCase();
  const densityField = toFloat(row.density || '');
  const density = densityField || MATERIAL_DENSITIES[material];
  if(!density) throw new Error(`Unknown density for material '${row.material}'`);
  const t = mmToM(row.thickness_mm);
  const L = mmToM(row.length_mm);
  const W = mmToM(row.width_mm);
  const d = mmToM(row.diameter_mm);
  const h = mmToM(row.height_mm);
  const od = mmToM(row.od_mm);
  const id = mmToM(row.id_mm);
  const qty = Math.max(1, Math.round(toFloat(row.quantity,1)));
  let w=0;
  if(typ==='plate' || typ==='flat_plate') w=plateWeight(t,L,W,density);
  else if(typ==='cylinder' || typ==='pipe' || typ==='nozzle') w=cylinderWeight(d,h,density);
  else if(typ==='ring' || typ==='flange') w=ringWeight(od,id,t,density);
  else if(typ==='disk') w=diskWeight(d,t,density);
  else throw new Error(`Unsupported type '${row.type}'`);
  return w*qty;
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim()!=='');
  const headers = lines[0].split(',').map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){ 
    // simple CSV split (does not handle quoted commas)
    const cols = lines[i].split(',');
    const obj = {};
    for(let j=0;j<headers.length;j++) obj[headers[j]] = cols[j] ? cols[j].trim() : '';
    rows.push(obj);
  }
  return rows;
}

function writeCSV(rows, outPath){
  if(!rows.length) return;
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(',')];
  for(const r of rows){
    const vals = keys.map(k=>{
      const v = r[k]; if(v===null||v===undefined) return '';
      const s = String(v);
      if(s.includes(',')||s.includes('"')) return `"${s.replace(/"/g,'""') }`;
      return s;
    });
    lines.push(vals.join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
}

function run(inputPath, outputPath){
  const txt = fs.readFileSync(inputPath, 'utf8');
  const records = parseCSV(txt);
  const out=[];
  let total=0;
  for(const r of records){
    try{
      const w = computeRowWeight(r);
      const wKg = Number(w.toFixed(6));
      out.push({...r, weight_kg: wKg});
      total += wKg;
    }catch(e){
      out.push({...r, weight_kg:'', error: e.message});
    }
  }
  writeCSV(out, outputPath);
  console.log(`Total weight: ${total.toFixed(6)} kg`);
  console.log(`Report written to ${outputPath}`);
}

if(require.main===module){
  const args = process.argv.slice(2);
  if(args.length<1){ console.error('Usage: node tools/weight.js input.csv [output.csv]'); process.exit(1); }
  const input = args[0];
  const output = args[1] || path.join(path.dirname(input),'report.csv');
  run(input, output);
}