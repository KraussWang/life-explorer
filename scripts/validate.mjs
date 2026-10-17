import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
const root=path.resolve(import.meta.dirname,'..');
let failed=false;
for(const name of ['primordial_ocean','collision','rock_source','vent_source']){
 const bytes=fs.readFileSync(path.join(root,'public/assets',name+'.glb'));
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name+'.glb',maxIssues:100});
 fs.writeFileSync(path.join(root,'review',name+'-validation.json'),JSON.stringify(report,null,2));
 console.log(name,JSON.stringify({errors:report.issues.numErrors,warnings:report.issues.numWarnings,info:report.issues.numInfos,bytes:bytes.length}));
 failed ||= report.issues.numErrors>0;
}
if(failed)process.exitCode=1;
