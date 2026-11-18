import { useState } from 'react';
import api from '../../api/axios';
import AdminDialog from './AdminDialog';
import PasswordRequirements from '../PasswordRequirements';
import { validPassword } from '../../utils/passwordPolicy';
import { getErrorMessage } from '../../utils/errorMessage';
export default function ResetTemporaryPassword({usuario,onClose,onSaved}) {
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();if(busy||!validPassword(password)||password!==confirm)return;setBusy(true);setError('');try{await api.put(`/usuarios/${usuario.id}`,{password});onSaved();onClose();}catch(err){setError(getErrorMessage(err,'No se pudo restablecer la contraseña.'));setBusy(false);}}
  return <AdminDialog titleId="reset-password-title" busy={busy} onClose={onClose}><h2 id="reset-password-title">Asignar contraseña temporal</h2><p>{usuario.nombre_completo}. Se cerrarán sus sesiones y deberá cambiar esta contraseña al ingresar.</p><form onSubmit={submit} noValidate><fieldset disabled={busy}>
    <label>Contraseña temporal<input className="input-field" type={visible?'text':'password'} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
    <label>Confirmar contraseña temporal<input className="input-field" type={visible?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>
    <button type="button" className="btn-secondary" aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'Ocultar':'Mostrar'} contraseñas</button><PasswordRequirements value={password}/>
    {confirm&&password!==confirm&&<p role="status">Las contraseñas no coinciden.</p>}{error&&<p role="alert">{error}</p>}
    <button className="btn-primary" disabled={!validPassword(password)||password!==confirm||busy}>Asignar contraseña temporal</button><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
  </fieldset></form></AdminDialog>;
}
