// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Usuarios from '../src/pages/Usuarios';
import api from '../src/api/axios';
import { requiresVihConfirmation } from '../src/utils/permissionConfirmation';
const toast = vi.hoisted(() => vi.fn());
vi.mock('../src/api/axios', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ usuario: { id: 1, rol: 'director' }, refreshUsuario: vi.fn() }) }));
vi.mock('../src/context/ToastContext', () => ({ useGlobalToast: () => toast }));
const VIH = 'controles.ver_vih';
let original;
beforeEach(() => {
 vi.clearAllMocks(); original = ['pacientes.ver'];
 api.get.mockImplementation(url => Promise.resolve({ data: url === '/usuarios' ? [{ id: 2, rol: 'admin', activo: true, nombre_completo: 'Nombre Objetivo', username: 'objetivo' }] : url === '/permisos' ? ['pacientes.ver', 'reportes.ver', VIH].map(codigo => ({ codigo })) : original.map(codigo => ({ codigo })) }));
 api.put.mockImplementation(async (_url, payload) => { original = [...payload.permisos]; return { data: [] }; });
});
afterEach(cleanup);
async function open() { fireEvent.click(await screen.findByTitle('Gestionar permisos')); await screen.findByText('Ver pacientes'); }
const checkbox = name => screen.getByText(name).closest('label').querySelector('input');
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
async function grant() { await open(); fireEvent.click(checkbox('Ver resultados de VIH')); save(); }
test.each([[false,false],[false,true],[true,true],[true,false]])('delta %s -> %s ignora orden', (had,will) => {
 expect(requiresVihConfirmation(had ? [VIH,'pacientes.ver'] : ['pacientes.ver'], will ? ['pacientes.ver',VIH] : ['pacientes.ver'])).toBe(!had && will);
});
test('concesión espera, identifica objetivo y guarda todo una vez; reabrir no confirma otra vez', async () => {
 render(<Usuarios />); await open(); expect(screen.queryByRole('alertdialog')).toBeNull();
 fireEvent.click(checkbox('Ver reportes')); fireEvent.click(checkbox('Ver resultados de VIH'));
 expect(screen.queryByRole('alertdialog')).toBeNull(); save();
 const dialog=screen.getByRole('alertdialog'); expect(dialog.textContent).toContain('Nombre Objetivo'); expect(dialog.textContent).toContain('@objetivo'); expect(api.put).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole('button',{name:'Asignar permiso'}));
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
 expect(api.put).toHaveBeenCalledTimes(1); expect(api.put).toHaveBeenCalledWith('/usuarios/2/permisos',{permisos:['pacientes.ver','reportes.ver',VIH]});
 await open(); save(); await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(2)); expect(screen.queryByRole('alertdialog')).toBeNull();
});
test.each(['Cancelar','Escape'])('%s conserva selección y formulario usable', async accion => {
 render(<Usuarios />); await grant(); const cancel=screen.getByRole('button',{name:'Cancelar'}); expect(document.activeElement).toBe(cancel);
 if(accion==='Escape') fireEvent.keyDown(cancel,{key:'Escape'}); else fireEvent.click(cancel);
 expect(screen.queryByRole('alertdialog')).toBeNull(); expect(api.put).not.toHaveBeenCalled(); expect(checkbox('Ver resultados de VIH').checked).toBe(true);
 fireEvent.click(checkbox('Ver resultados de VIH')); fireEvent.click(checkbox('Ver reportes')); save();
 await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(1)); expect(api.put).toHaveBeenCalledWith('/usuarios/2/permisos',{permisos:['pacientes.ver','reportes.ver']});
});
test.each([true,false])('VIH original conservado %s no confirma ni al agregar reportes', async conservar => {
 original.push(VIH); render(<Usuarios />); await open(); if(!conservar) fireEvent.click(checkbox('Ver resultados de VIH')); fireEvent.click(checkbox('Ver reportes')); save();
 await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(1)); expect(screen.queryByRole('alertdialog')).toBeNull(); expect(api.put.mock.calls[0][1].permisos.includes(VIH)).toBe(conservar);
});
test('permisos normales sin VIH',async()=>{
 render(<Usuarios />); await open(); fireEvent.click(checkbox('Ver reportes')); save(); await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(1)); expect(screen.queryByRole('alertdialog')).toBeNull();
});
test('doble click, loading, bloqueo y Escape durante request',async()=>{
 let resolve; api.put.mockImplementation(()=>new Promise(r=>{resolve=r;})); render(<Usuarios />); await grant();
 const confirm=screen.getByRole('button',{name:'Asignar permiso'}); fireEvent.click(confirm); fireEvent.click(confirm);
 expect(api.put).toHaveBeenCalledTimes(1); expect(confirm.disabled).toBe(true); expect(screen.getByRole('button',{name:'Guardando...'}).disabled).toBe(true);
 fireEvent.keyDown(confirm,{key:'Escape'}); expect(screen.getByRole('alertdialog')).toBeTruthy(); resolve({data:[]}); await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
});
test('fallo no emite éxito ni reintenta; preserva selección y permite reintento confirmado',async()=>{
 api.put.mockRejectedValueOnce(new Error('fallo')); render(<Usuarios />); await grant(); fireEvent.click(screen.getByRole('button',{name:'Asignar permiso'}));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.any(String),'error')); expect(toast).not.toHaveBeenCalledWith(expect.any(String),'success'); expect(api.put).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'})); expect(checkbox('Ver resultados de VIH').checked).toBe(true); save(); expect(screen.getByRole('alertdialog')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Asignar permiso'})); await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull()); expect(api.put).toHaveBeenCalledTimes(2);
});
test('búsqueda y categorías conservan delta, Tab permanece en confirmación',async()=>{
 render(<Usuarios />); await open(); fireEvent.click(checkbox('Ver resultados de VIH')); fireEvent.click(screen.getByRole('button',{name:/Resultados de VIH/}));
 fireEvent.change(screen.getByRole('searchbox',{name:'Buscar permisos'}),{target:{value:'reportes'}}); expect(screen.queryByRole('alertdialog')).toBeNull(); save();
 const confirm=screen.getByRole('button',{name:'Asignar permiso'}),cancel=screen.getByRole('button',{name:'Cancelar'});
 confirm.focus(); fireEvent.keyDown(confirm,{key:'Tab'}); expect(document.activeElement).toBe(cancel); fireEvent.keyDown(cancel,{key:'Tab',shiftKey:true}); expect(document.activeElement).toBe(confirm); expect(api.put).not.toHaveBeenCalled();
});
