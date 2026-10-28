const fs=require('fs'),path=require('path');
const {puppeteerBrowserManager}=require('./puppeteerBrowserManager');
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const TITULOS={nota_evolucion:'NOTA DE EVOLUCIÓN',nota_enfermeria:'NOTA DE ENFERMERÍA'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo=n=>'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../assets/institucional',n)).toString('base64');
// Fechas clínicas sin convertirlas a UTC ni sustituirlas por la fecha de emisión.
const fechaClinica=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('/'):'Sin fecha';
const horaClinica=value=>/^\d{2}:\d{2}(:\d{2})?$/.test(value||'')?value.slice(0,5):'Sin hora';
const MARGEN={top:86,bottom:150,left:40,right:40};
function referenciaControl(n,control){
 if(!n.control_prenatal_id)return 'Sin control asociado';
 const numero=Number.isInteger(control?.numero)&&control.numero>0?`N.º ${control.numero}`:'';
 const fecha=/^\d{4}-\d{2}-\d{2}$/.test(control?.fecha||'')?fechaClinica(control.fecha):'';
 return [numero,fecha].filter(Boolean).join(' · ')||'Referencia no disponible';
}
function crearDocumentoNota({nota:n,paciente:p,control,capturistaHistorico}){
 if(!TITULOS[n.tipo])throw Error('Tipo documental no admitido');const r=n.responsable_snapshot||{};
 // Proyección interna de una fuente histórica ya verificada. El servicio actual
 // no la aporta; jamás se usa el nombre vigente ni el ID como sustituto.
 const nombreCapturista=capturistaHistorico?.verificado===true&&capturistaHistorico.fuente==='snapshot_captura'
   &&Number.isInteger(n.capturista_usuario_id)&&capturistaHistorico.usuario_id===n.capturista_usuario_id
   &&typeof capturistaHistorico.nombre_completo==='string'&&capturistaHistorico.nombre_completo.trim().length<=150
   ?capturistaHistorico.nombre_completo.trim():'';
 const header=`<div style="width:100%;padding:0 40px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;font:10px Arial;color:#111"><img alt="Gobierno de Guatemala y MSPAS" src="${logo('gobierno-guatemala-mspas.png')}" style="width:165px;height:auto"><div style="text-align:center"><strong style="font-size:16px">CAP El Chal</strong><br>DDRISS Petén Área Sur Oriente</div><img alt="DDRISS Petén Área Sur Oriente" src="${logo('ddriss-peten-area-sur-oriente.png')}" style="width:54px;height:auto"></div>`;
 const footer=`<div style="width:100%;padding:0 40px;box-sizing:border-box;font:12px/14px Arial;color:#111">
 <div style="border-top:1px solid #777;padding-top:5px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
 <div style="width:55%;min-width:0;overflow-wrap:anywhere"><b>Paciente:</b> ${esc(p.nombres+' '+p.apellidos)}<br>
 <b>Expediente:</b> ${esc(p.no_expediente)} · <b>Control:</b> ${esc(referenciaControl(n,control))}<br>
 <b>Servicio:</b> CAP El Chal${nombreCapturista?`<br><b>Capturista:</b> ${esc(nombreCapturista)}`:''}</div>
 <div style="width:43%;min-width:0;overflow-wrap:anywhere"><b>Responsable:</b> ${esc(r.nombre_completo)}<br>
 <b>Cargo:</b> ${esc(r.cargo_nombre)}${r.tipo==='externo'?'<br>Identidad externa declarada, no verificada':''}</div></div>
 <div style="margin-top:46px;height:10px"></div>
 <div style="text-align:right;margin-top:7px;font:8px/10px Arial">Hoja No. <span class="pageNumber"></span> de <span class="totalPages"></span></div></div>`;
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'"><style>*{box-sizing:border-box}html{font-family:Arial,sans-serif;color:#111}body{margin:0}table{border-collapse:collapse;width:100%;table-layout:fixed;border:1px solid #777}thead{display:table-header-group}th{font-size:11px;height:26px;border:1px solid #777;padding:4px}th:first-child{width:88px}td{border-left:1px solid #777;border-right:1px solid #777;padding:0 7px;vertical-align:top}tr.line{break-inside:avoid;height:22px}tr.line td{height:22px;line-height:22px;border-bottom:1px solid #bbb;font-size:14px;white-space:pre}td.time{font-size:10px!important;text-align:center}.narrativa{white-space:pre-wrap;overflow-wrap:anywhere;line-height:22px;font-size:14px}</style></head><body><table><thead><tr><th>FECHA / HORA</th><th>${TITULOS[n.tipo]}</th></tr></thead><tbody><tr><td class="time">${esc(n.fecha_atencion)}<br>${esc(n.hora_atencion)}</td><td class="narrativa">${esc(n.contenido)}</td></tr></tbody></table></body></html>`;
 const datedHtml=html.replace('<th>FECHA / HORA</th>',`<th style="font-weight:normal;line-height:13px"><span style="display:block;font-size:9px;font-weight:bold;white-space:nowrap">FECHA / HORA</span><span style="display:block;font-size:10px">${esc(fechaClinica(n.fecha_atencion))}</span><span style="display:block;font-size:10px">${esc(horaClinica(n.hora_atencion))}</span></th>`)
   .replace(/<td class="time">[\s\S]*?<\/td>/,'<td class="time"></td>');
 return{html:datedHtml,header,footer};
}
async function generarNotaClinicaPdf(data,{browserManager=puppeteerBrowserManager}={}){
 const {html,header,footer}=crearDocumentoNota(data);
 return browserManager.withPage(async page=>{
 await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());await page.setViewport({width:736,height:1056});await page.setContent(html,{waitUntil:'load',timeout:15000});
 const lines=await page.evaluate(text=>{const ctx=document.createElement('canvas').getContext('2d');ctx.font='14px Arial';const result=[];for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){let line='';for(const {segment}of new Intl.Segmenter('es',{granularity:'grapheme'}).segment(paragraph)){if(line&&ctx.measureText(line+segment).width>630){const at=line.lastIndexOf(' ');if(at>0){result.push(line.slice(0,at+1));line=line.slice(at+1);}else{result.push(line);line='';}}line+=segment;}result.push(line);}return result;},data.nota.contenido||'');
 const rows=lines.map(line=>`<tr class="line"><td class="time"></td><td>${esc(line)||'&nbsp;'}</td></tr>`).join('');
 await page.setContent(html.replace(/<tbody>[\s\S]*?<\/tbody>/,`<tbody>${rows}</tbody>`),{waitUntil:'load',timeout:15000});
 const metrics=await page.evaluate(footer=>{
   const measure=document.createElement('div');measure.style.cssText='position:absolute;visibility:hidden;left:-10000px;top:0;width:816px';
   measure.innerHTML=footer;document.body.append(measure);
   const footerHeight=measure.getBoundingClientRect().height;measure.remove();
   return{firstRowTop:document.querySelector('tr.line').getBoundingClientRect().top,
     rowHeight:document.querySelector('tr.line').getBoundingClientRect().height,footerHeight};
 },footer);
 const bottomMargin=Math.max(MARGEN.bottom,Math.ceil(metrics.footerHeight+38));
 const bytes=await page.pdf({format:'Letter',landscape:false,printBackground:true,displayHeaderFooter:true,headerTemplate:header,footerTemplate:footer,
   margin:Object.fromEntries(Object.entries({...MARGEN,bottom:bottomMargin}).map(([key,value])=>[key,`${value}px`])),timeout:30000});
 // Cierre documental fuera del flujo HTML: nunca desplaza la última línea ni
 // crea una hoja solo para la leyenda. Se estampa en la última hoja existente.
 const pdf=await PDFDocument.load(bytes);
 const capacity=Math.floor((1056-MARGEN.top-bottomMargin-metrics.firstRowTop)/metrics.rowHeight);
 if(capacity<1||pdf.getPageCount()!==Math.ceil(lines.length/capacity))throw Error('Paginación de nota no verificable');
 const lastRows=lines.length-(pdf.getPageCount()-1)*capacity;
 const baseline=792-(MARGEN.top+metrics.firstRowTop+lastRows*metrics.rowHeight+13)*.75;
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const last=pdf.getPages().at(-1);
 last.drawText('FIN DE NOTA',{x:580-font.widthOfTextAtSize('FIN DE NOTA',8),y:baseline,size:8,font,color:rgb(.35,.35,.35)});
 // El hueco del pie conserva la geometría aprobada (carta); solo esta hoja
 // recibe la firma. Coordenadas medidas en 13B: línea a 39 pt del borde
 // inferior, rótulo a 29.25 pt. La identificación extensa crece hacia arriba.
 const label='Nombre y firma del responsable',size=6.75;
 last.drawLine({start:{x:231.75,y:39},end:{x:380.25,y:39},thickness:.75,color:rgb(.33,.33,.33)});
 last.drawText(label,{x:(last.getWidth()-font.widthOfTextAtSize(label,size))/2,y:29.25,size,font,color:rgb(.07,.07,.07)});
 return pdf.save();
 });
}
module.exports={crearDocumentoNota,generarNotaClinicaPdf};
