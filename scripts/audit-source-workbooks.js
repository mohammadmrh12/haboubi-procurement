#!/usr/bin/env node
// Audit source need rows against the bundled catalogue. Does not edit catalogue or private data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const root=path.resolve(process.argv[2]||path.join(process.env.HOME||'','Downloads'));
const project=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(project,'app.js'),'utf8');
const cut=source.indexOf('\n$$(".nav").forEach(button => button.onclick');
if(cut<0)throw new Error('Could not isolate workbook parser');
const context={console,XLSX,document:{querySelector:()=>({})},setTimeout,localStorage:{getItem:()=>null,setItem:()=>{}},window:{}};
vm.createContext(context);vm.runInContext(source.slice(0,cut)+'\nglobalThis.__audit={parseWorkbook,reviewNameBase,norm};',context);
const tools=context.__audit;
(async()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(project,'catalog-seed.json'),'utf8')).items;
 const preserved=new Set();
 for(const item of catalog)for(const n of item.needRecords||[])preserved.add([n.source,n.sheet,n.row,String(Number(n.annual))].join('|'));
 const parsed=[];let skipped=0,workbooks=0,sheets=0;
 for(const name of fs.readdirSync(root).filter(n=>n.toLowerCase().endsWith('.xlsx')).sort()){
  const bytes=fs.readFileSync(path.join(root,name));const wb=XLSX.read(bytes,{type:'buffer',cellText:true,cellDates:false});const result=tools.parseWorkbook({name},wb);parsed.push(...result.items);skipped+=result.skipped;sheets+=result.sheetsRead;workbooks++;
 }
 const sourceNeeds=[];for(const item of parsed)for(const n of item.needRecords||[])if(n.annual!=null&&n.annual!==''&&Number.isFinite(Number(n.annual))&&Number(n.annual)>0)sourceNeeds.push({...n,name:item.name,code:item.code});
 const missing=sourceNeeds.filter(n=>!preserved.has([n.source,n.sheet,n.row,String(Number(n.annual))].join('|')));
 const mixed=catalog.filter(item=>{const vals=new Set((item.needRecords||[]).filter(n=>n.annual!=null&&n.annual!==''&&Number.isFinite(Number(n.annual))).map(n=>String(Number(n.annual))));return vals.size>1&&[...vals].some(v=>Number(v)>0)&&[...vals].some(v=>Number(v)===0)}).map(item=>({name:item.name,code:item.code,annual:item.annual,values:[...new Set((item.needRecords||[]).filter(n=>n.annual!=null&&n.annual!=='').map(n=>Number(n.annual)))].sort((a,b)=>a-b),sources:(item.needRecords||[]).filter(n=>n.annual!=null&&n.annual!=='').map(n=>({annual:n.annual,row:n.row,source:n.source,note:n.note})).slice(0,6)}));
 const noCode=catalog.filter(item=>!item.code&&Number(item.annual)>0).map(item=>({name:item.name,annual:item.annual,source:item.source,row:item.row,note:item.note}));
 const report={sourceFolder:root,workbooks,sheetsRead:sheets,parserRows:parsed.length,skippedRows:skipped,catalogItems:catalog.length,sourcePositiveNeedRecords:sourceNeeds.length,preservedPositiveNeedRecords:sourceNeeds.length-missing.length,missingPositiveNeedRecords:missing.length,missingExamples:missing.slice(0,30),itemsWithZeroAndPositiveNeed: mixed.length,zeroPositiveExamples:mixed.slice(0,50),positiveNeedItemsMissingNationalCode:noCode.length,noCodeExamples:noCode.slice(0,30)};
 console.log(JSON.stringify(report,null,2));
 if(missing.length)process.exitCode=2;
})().catch(e=>{console.error(e);process.exit(1)});
