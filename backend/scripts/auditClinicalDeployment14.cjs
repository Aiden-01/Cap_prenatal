// Auditoría local de código/Git. No conecta con AWS, servicios ni bases de datos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8000000}).trim();
const parse=status=>status?status.split('\n').map(line=>{const[change,...parts]=line.split('\t');return{status:change,path:parts.at(-1)}}):[];
const files=parse(git('diff','--name-status','origin/main','HEAD'));
const local=[...parse(git('diff','--name-status','HEAD')),...git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean).map(path=>({status:'?',path}))];
const categories={};for(const file of files){const category=file.path.startsWith('backend/src/db/migrations/')?'migrations':file.path.split('/')[0];categories[category]??={added:0,modified:0,deleted:0,other:0};categories[category][({A:'added',M:'modified',D:'deleted'})[file.status]||'other']++}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const migrations=files.filter(f=>f.path.startsWith('backend/src/db/migrations/')).map(f=>{
 const bytes=execFileSync('git',['show','HEAD:'+f.path]);return{...f,sha256_git_content:hash(bytes),unchanged_in_checkpoint14:git('diff','--name-only','HEAD','--',f.path)===''};
});
const preserved=['docs/cpren120/checkpoint09','docs/cpren120/checkpoint10','docs/cpren120/checkpoint11','docs/cpren120/checkpoint12','docs/cpren120/checkpoint13','docs/cpren120/checkpoint13b','docs/cpren120/PUBLICACION_CHECKPOINT_11_13B.md','docs/cpren120/publicacion-checkpoints11-13b.json'];
const packageFiles=['backend/package.json','backend/package-lock.json','frontend/package.json','frontend/package-lock.json'];
const envFiles=['.env.example','backend/.env.example','frontend/.env.example'];
const report={generated_utc:new Date().toISOString(),local_only:true,production_access:false,production_state:'No verificable: no acceso AWS ni respaldo productivo',equipo:'Casa',machine:'HUGUITO',
 refs:{branch:git('branch','--show-current'),head:git('rev-parse','HEAD'),origin_clinical:git('rev-parse','origin/feature/cpren-120-editor-pdf-notas-clinicas'),origin_main:git('rev-parse','origin/main'),local_main:git('rev-parse','main')},
 ahead_commits:git('log','--format=%H %s','origin/main..HEAD').split('\n'),categories,committed_file_count:files.length,committed_files_vs_main:files,local_checkpoint14_files:local,migrations,
 package_dependency_differences:parse(git('diff','--name-status','origin/main','HEAD','--',...packageFiles)),
 environment_template_differences:parse(git('diff','--name-status','origin/main','HEAD','--',...envFiles)),
 deployment_or_n8n_differences:parse(git('diff','--name-status','origin/main','HEAD','--','operations','scripts','.github','n8n')),
 prior_evidence_preserved:git('diff','--name-only','HEAD','--',...preserved)==='',
 historical_migrations_preserved:git('diff','--name-only','HEAD','--','backend/src/db/migrations')==='',
 active_obsolete_field_references:[
  {file:'backend/src/db/schemaCompatibility.js',reason:'Nombre de migración histórica requerida, sin funcionalidad de Especialidades'},
  {file:'backend/src/services/seguimientoNotasService.js',reason:'Lectura de snapshot legado para reintento idempotente, sin reescritura ni clasificación activa'},
 ],
 clinical_codes:['MED','AE','EP'],clinical_grants_automatic:false,
 new_environment_variables:[],new_runtime_dependencies:[],
 endpoints:[
  {path:'/api/catalogos/cargos',methods:['GET','POST']},{path:'/api/catalogos/cargos/:id',methods:['GET','PUT']},
  {path:'/api/catalogos/cargos/:id/desactivar',methods:['PATCH']},{path:'/api/catalogos/cargos/:id/reactivar',methods:['PATCH']},
  {path:'/api/profesionales',methods:['GET']},{path:'/api/usuarios',methods:['GET','POST']},{path:'/api/usuarios/:id',methods:['GET','PUT']},
  {path:'/api/pacientes/:pacienteId/notas-clinicas',methods:['GET','POST']},{path:'/api/pacientes/:pacienteId/notas-clinicas/:notaId',methods:['GET','PUT']},
  {path:'/api/pacientes/:pacienteId/notas-clinicas/:notaId/finalizar',methods:['POST']},{path:'/api/pacientes/:pacienteId/notas-clinicas/:notaId/pdf',methods:['GET']},
  {path:'/api/pacientes/:pacienteId/controles/seguimiento-notas',methods:['GET']},{path:'/api/pacientes/:pacienteId/controles/:id/seguimiento-notas',methods:['POST']},
 ],
};
const out=path.join(root,'docs/cpren120/checkpoint14');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'deployment-inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({refs:report.refs,files:files.length,commits:report.ahead_commits.length,categories,migrations:migrations.length,dependencies_changed:report.package_dependency_differences.length,env_templates_changed:report.environment_template_differences.length,prior_evidence_preserved:report.prior_evidence_preserved}));
