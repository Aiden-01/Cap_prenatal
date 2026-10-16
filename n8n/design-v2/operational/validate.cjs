'use strict';
const vm=require('node:vm');
function executeItems(workflow,name,payload,nodeData={},loadExcel){
 const node=workflow.nodes.find(n=>n.name===name);if(!node)throw Error('Missing Code node');
 const ctx={$json:structuredClone(payload),$input:{first:()=>({json:structuredClone(payload)})},$node:structuredClone(nodeData),require:name=>{if(name!=='exceljs')throw Error('TEST_MODULE_BLOCKED');return loadExcel?loadExcel():require('../../../backend/node_modules/exceljs');}};
 return new vm.Script('(function(){'+node.parameters.jsCode+'\n})()').runInNewContext(ctx,{timeout:30000,contextCodeGeneration:{strings:false,wasm:false}});
}
function execute(workflow,name,payload,nodeData={}){const r=executeItems(workflow,name,payload,nodeData);const json=x=>JSON.parse(JSON.stringify(x[0].json));return r&&typeof r.then==='function'?r.then(json):json(r);}
// Validation is read-only by default. Evidence requires an explicit external directory.
async function validate(writeEvidence=false){return require('./summary-excel/validate.cjs').validate(writeEvidence);}
if(require.main===module)validate().then(r=>console.log(JSON.stringify(r.counts))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={execute,executeItems,validate};
