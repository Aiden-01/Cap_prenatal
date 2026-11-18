// @vitest-environment jsdom
import { afterEach,expect,test,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AccessRoute from '../src/components/AccessRoute';
import ForcedPasswordChange from '../src/pages/ForcedPasswordChange';
import { validPassword } from '../src/utils/passwordPolicy';
import api from '../src/api/axios';
const {logout}=vi.hoisted(()=>({logout:vi.fn()}));
vi.mock('../src/hooks/useAuth',()=>({useAuth:()=>({usuario:{id:1,requiere_cambio_password:true},logout})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();logout.mockReset();});
test('política frontend rechaza débiles/comunes y exceso UTF-8 sin truncar',()=>{
 expect(validPassword('Personal8!')).toBe(true);
 for(const p of ['weak','Password1!','Aa9!'+ 'ñ'.repeat(35)])expect(validPassword(p)).toBe(false);
});
test('exige confirmación y diferencia con temporal, muestra fortaleza y visibilidad',async()=>{
 vi.spyOn(api,'post').mockResolvedValue({data:{ok:true}});
 render(<MemoryRouter><ForcedPasswordChange/></MemoryRouter>);
 const submit=screen.getByRole('button',{name:'Guardar y continuar'});
 expect(submit.disabled).toBe(true);
 for(const label of ['Contraseña temporal','Nueva contraseña','Confirmar nueva contraseña'])fireEvent.change(screen.getByLabelText(label),{target:{value:'Temporal9!'}});
 expect(submit.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Nueva contraseña'),{target:{value:'Personal8!'}});
 expect(submit.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'),{target:{value:'Personal8!'}});
 expect(submit.disabled).toBe(false);
 expect(screen.getByRole('meter',{name:'Fortaleza de la contraseña'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Mostrar nueva contraseña'}));
 expect(screen.getByLabelText('Nueva contraseña').type).toBe('text');
 fireEvent.click(submit);
 await waitFor(()=>expect(logout).toHaveBeenCalledOnce());
 expect(api.post).toHaveBeenCalledWith('/auth/cambiar-password',{current_password:'Temporal9!',new_password:'Personal8!',confirm_password:'Personal8!'});
});
test('rechazo backend conserva pantalla y sesión',async()=>{
 vi.spyOn(api,'post').mockRejectedValue({response:{data:{message:'No se pudo actualizar'}}});
 render(<MemoryRouter><ForcedPasswordChange/></MemoryRouter>);
 for(const [label,value]of [['Contraseña temporal','Temporal9!'],['Nueva contraseña','Personal8!'],['Confirmar nueva contraseña','Personal8!']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar y continuar'}));
 await screen.findByRole('alert');expect(logout).not.toHaveBeenCalled();
});

test('estado pendiente redirige antes de montar un módulo protegido',async()=>{
 render(<MemoryRouter initialEntries={['/privado']}><Routes><Route path="/privado" element={<AccessRoute><p>Módulo protegido</p></AccessRoute>}/><Route path="/cambiar-password-obligatorio" element={<p>Cambio requerido</p>}/></Routes></MemoryRouter>);
 await screen.findByText('Cambio requerido');expect(screen.queryByText('Módulo protegido')).toBeNull();
});

test('presentación no expone detalles técnicos y conserva rechazo por longitud/comunes',()=>{
 render(<MemoryRouter><ForcedPasswordChange/></MemoryRouter>);
 expect(screen.getByRole('heading',{name:'Protege tu cuenta'})).toBeTruthy();
 expect(screen.queryByText(/72 bytes|UTF-8/)).toBeNull();
 fireEvent.change(screen.getByLabelText('Nueva contraseña'),{target:{value:'Aa9!'+ 'ñ'.repeat(35)}});
 expect(screen.getByText('Esta contraseña es demasiado larga. Prueba con una frase más corta.')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Guardar y continuar'}).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Nueva contraseña'),{target:{value:'Password1!'}});
 expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Débil');
 expect(screen.getByRole('button',{name:'Guardar y continuar'}).disabled).toBe(true);
});
test('ojos independientes y tema respetan preferencias de la cuenta',()=>{
 render(<MemoryRouter><ForcedPasswordChange/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Mostrar nueva contraseña'}));
 expect(screen.getByLabelText('Nueva contraseña').type).toBe('text');
 expect(screen.getByLabelText('Contraseña temporal').type).toBe('password');
 fireEvent.click(screen.getByRole('button',{name:'Usar tema oscuro'}));
 expect(document.documentElement.classList.contains('dark')).toBe(true);
 expect(localStorage.getItem('theme:1')).toBe('dark');
 fireEvent.click(screen.getByRole('button',{name:'Usar tema claro'}));
 expect(document.documentElement.classList.contains('dark')).toBe(false);
});
