const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createAutomatizacionesService,normalizeMissedAppointments}=require('../src/services/automatizacionesService');
const {executeItems}=require('../../n8n/design-v2/operational/validate.cjs');
const Excel=require('exceljs'),root=path.resolve(__dirname,'../..');
test('complete name queries preserve parameterized periods, pending selection and first-component ordering',async()=>{
 const {createAutomatizacionesRepository}=require('../src/repositories/automatizacionesRepository');
 const {seguimientoPendienteSql}=require('../src/repositories/citasPrenatalesRepository');
 const queries=[],repository=createAutomatizacionesRepository({query:async(sql,params)=>{queries.push({sql,params});return{rows:[]};}});
 await repository.obtenerResumenProximasCitas({offsetDays:1,windowDays:2});
 await repository.obtenerInasistenciasSemanales({desde:'2026-10-05',hasta:'2026-10-11',corteAt:'2026-08-01T00:00:00Z'});
 await repository.obtenerCandidatasTdapElChal();
 const [daily,missed,tdap]=queries;
 assert.deepEqual(daily.params,[1,2]);assert.deepEqual(missed.params,['2026-10-05','2026-10-11','2026-08-01T00:00:00Z']);
 for(const{sql}of[daily,missed]){
  assert.match(sql,/TRIM\(p\.nombres\) AS nombres_completos/);assert.match(sql,/TRIM\(p\.apellidos\) AS apellidos_completos/);
  assert.match(sql,/JOIN pacientes p ON p\.id = e\.paciente_id/);assert.match(sql,/LEFT JOIN comunidades com ON com\.id = p\.comunidad_id/);
  assert.match(sql,/SPLIT_PART\(TRIM\(p\.apellidos\), ' ', 1\) AS primer_apellido/);
 }
 assert.match(daily.sql,/CURRENT_TIMESTAMP AT TIME ZONE 'America\/Guatemala'/);
 for(const clause of["e.estado = 'activo'","cp.estado = 'programada'",'cp.control_cumplimiento_id IS NULL','cp.fecha_programada >= b.fecha_desde','cp.fecha_programada < b.fecha_hasta_exclusiva'])assert.ok(daily.sql.includes(clause));
 assert.match(daily.sql,/ORDER BY\s+a\.fecha_proxima_cita ASC NULLS LAST,\s+a\.primer_apellido ASC NULLS LAST,\s+a\.primer_nombre ASC NULLS LAST/);
 assert.ok(missed.sql.includes(seguimientoPendienteSql()));assert.match(missed.sql,/cp\.created_at >= \$3::timestamptz/);assert.match(missed.sql,/cp\.fecha_programada <= \$2::date/);
 assert.match(missed.sql,/BETWEEN \$1::date AND \$2::date THEN 'new'/);assert.match(missed.sql,/< \$1::date THEN 'previous_pending'/);
 assert.match(missed.sql,/ORDER BY\s+cp\.fecha_programada ASC,\s+primer_apellido ASC,\s+primer_nombre ASC/);
 assert.doesNotMatch(tdap.sql,/nombres_completos|apellidos_completos/);assert.match(tdap.sql,/v\.tipo_vacuna = 'tdap'/);
});
test('daily and missed response fields preserve full Spanish given/family names without new keys',async()=>{
 const row={fecha_desde:'2026-10-15',fecha_hasta:'2026-10-15',fecha_proxima_cita:'2026-10-15',fecha_cita:'2026-10-07',primer_nombre:'María',primer_apellido:'Muñoz',nombres_completos:'María Ana',apellidos_completos:'Muñoz de la Peña',telefono:'0000-0000',comunidad:'Comunidad Ficticia',categoria:'new'};
 const service=createAutomatizacionesService({repository:{obtenerResumenProximasCitas:async()=>[row]},now:()=>new Date('2026-10-14T12:00:00Z')});const daily=await service.consultarProximasCitas({offsetDays:1,windowDays:1}),missed=normalizeMissedAppointments([row]);
 for(const p of [daily.appointments[0],missed[0]]){assert.equal(p.first_name,row.nombres_completos);assert.equal(p.last_name,row.apellidos_completos);assert.equal(p.phone,row.telefono);assert.equal(p.community,row.comunidad);}assert.equal(daily.total,1);assert.equal(missed[0].category,'new');assert.deepEqual(Object.keys(daily.appointments[0]).sort(),['community','date','first_name','last_name','phone']);
});
test('150-character given and family names survive both validators and actual Excel serialization',async()=>{
 const names='María '+'Á'.repeat(144),surnames='Muñoz '+'Ñ'.repeat(144),F=require('../../n8n/design-v2/operational/fixtures.cjs');assert.equal(names.length,150);assert.equal(surnames.length,150);
 for(const missed of [false,true]){const file=missed?'seguimiento-inasistencias-resend-v1.json':'recordatorio-citas-resend-v1.json',w=JSON.parse(fs.readFileSync(path.join(root,'n8n/workflows',file))),p=missed?F.missedContract():F.daily();p.appointments.forEach(a=>{a.first_name=names;a.last_name=surnames;});const ready=missed?(await executeItems(w,'Validar contrato y reserva',p))[0].json:p;
 const b=(await executeItems(w,missed?'Construir mensaje operativo':'Construir detalle operativo',ready))[0];assert.ok(!b.json.html.includes(names));const book=new Excel.Workbook();await book.xlsx.load(Buffer.from(b.binary.data.data,'base64'));assert.equal(book.worksheets[0].getRow(2).getCell(2).value,names+' '+surnames);}
});
