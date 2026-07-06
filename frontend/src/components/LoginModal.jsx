import React, { useState } from 'react';
import { Shield } from 'lucide-react';

export default function LoginModal({ onLogin, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onLogin(username, password);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-navy" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Admin</h2>
            <p className="text-xs text-text-secondary">Panel de administración</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest block mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full text-sm text-text bg-canvas border-b-2 border-canvas-muted focus:border-navy outline-none py-2"
              placeholder="admin"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm text-text bg-canvas border-b-2 border-canvas-muted focus:border-navy outline-none py-2"
              placeholder="••••••"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-secondary hover:text-text px-4 py-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || !username || !password}
              className="text-sm font-medium text-text-on-navy bg-navy hover:bg-navy-muted disabled:opacity-50 px-5 py-2 rounded-lg transition-colors"
            >
              {busy ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
