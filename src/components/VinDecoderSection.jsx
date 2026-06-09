import React, { useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { decodeVIN, validateVin, mapVinToFormFields } from '../utils/vinDecoder.js';

// Only fields that map to actual form inputs in "Nuevo Vehículo"
const FIELD_LABELS = {
  make: 'Marca',
  model: 'Modelo',
  year: 'Año',
  trim: 'Edición',
  vehicleType: 'Tipo de vehículo',
  fuelType: 'Combustible',
  transmissionStyle: 'Transmisión',
  driveType: 'Tracción',
  cylinders: 'Cilindros',
  displacementL: 'Cilindrada',
};

function ErrorMessage({ type }) {
  const messages = {
    network: 'Revisa tu conexión e intenta nuevamente.',
    api_error: 'No pudimos consultar el VIN en este momento. Puedes llenar el vehículo manualmente.',
    no_results: 'No encontramos información confiable para este VIN/Chasis. Puedes completar los datos manualmente.',
    no_data: 'No encontramos información confiable para este VIN/Chasis. Puedes completar los datos manualmente.',
  };
  return messages[type] || 'Error inesperado. Puedes llenar el vehículo manualmente.';
}

export default function VinDecoderSection({ onApply, existingData = {} }) {
  const [vinInput, setVinInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [decoded, setDecoded] = useState(null);
  const [errorType, setErrorType] = useState(null);
  const [vinWarning, setVinWarning] = useState('');

  const handleVinChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/gi, '');
    setVinInput(val);
    const { isStandard, tooShort, hasInvalidChars } = validateVin(val);
    if (val.length > 0 && !isStandard) {
      if (hasInvalidChars) {
        setVinWarning('El VIN contiene caracteres no válidos (I, O, Q no están permitidos).');
      } else if (tooShort) {
        setVinWarning('El VIN/Chasis no parece estándar, pero puedes continuar manualmente.');
      } else {
        setVinWarning('');
      }
    } else {
      setVinWarning('');
    }
    if (status !== 'idle') {
      setStatus('idle');
      setDecoded(null);
    }
  };

  const handleDetect = async () => {
    if (!vinInput.trim()) return;
    setStatus('loading');
    setDecoded(null);
    setErrorType(null);
    try {
      const result = await decodeVIN(vinInput);
      setDecoded(result);
      setStatus('success');
    } catch (err) {
      setErrorType(err.message);
      setStatus('error');
    }
  };

  const handleApply = () => {
    if (!decoded) return;
    const mapped = mapVinToFormFields(decoded);
    // Only apply to empty fields
    const toApply = {};
    for (const [key, val] of Object.entries(mapped)) {
      if (val && (!existingData[key] || existingData[key] === '-' || existingData[key] === '')) {
        toApply[key] = val;
      }
    }
    onApply(toApply, decoded);
  };

  const summaryEntries = decoded
    ? Object.entries(FIELD_LABELS)
        .map(([key, label]) => ({ label, value: decoded[key] }))
        .filter(({ value }) => value)
    : [];

  return (
    <div className="relative rounded-3xl overflow-hidden mb-4"
      style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.04) 50%, rgba(0,0,0,0.08) 100%)', border: '1.5px solid rgba(220,38,38,0.25)' }}
    >
      {/* Glow accent */}
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)', transform: 'translate(-30%, -30%)' }} />

      <div className="relative p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-xl bg-red-600 shadow-lg shadow-red-600/30">
          <Search size={14} className="text-white" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-red-500 leading-none">
            Buscar por VIN / Chasis
          </h3>
          <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Detecta marca, modelo, motor y más automáticamente
          </p>
        </div>
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <input
            type="text"
            value={vinInput}
            onChange={handleVinChange}
            onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
            maxLength={20}
            placeholder="Escribe el VIN o número de chasis…"
            className="w-full px-4 py-3 rounded-2xl font-mono font-bold text-sm focus:outline-none transition-all tracking-widest"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderWidth: '2px',
              borderColor: 'var(--input-border)',
              color: 'var(--text-primary)',
            }}
            disabled={status === 'loading'}
          />
          {vinWarning && (
            <p className="mt-1.5 ml-1 text-[10px] font-bold text-amber-500 flex items-center gap-1">
              <AlertTriangle size={10} /> {vinWarning}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDetect}
          disabled={status === 'loading' || !vinInput.trim()}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Detectando…
            </>
          ) : (
            <>
              <Search size={14} /> Detectar vehículo
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {status === 'error' && (
        <div
          className="mt-4 p-4 rounded-2xl flex items-start gap-3"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-red-600">{ErrorMessage({ type: errorType })}</p>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && decoded && (
        <div className="mt-4 space-y-3">
          {/* Success badge */}
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">
              Vehículo detectado
            </span>
          </div>

          {/* Summary card */}
          <div
            className="rounded-2xl p-4 space-y-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid rgba(220,38,38,0.15)' }}
          >
            {summaryEntries.map(({ label, value }) => (
              <div key={label} className="flex justify-between items-baseline gap-4">
                <span
                  className="text-[10px] font-black uppercase tracking-wider shrink-0"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {label}
                </span>
                <span
                  className="text-xs font-bold text-right"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Manual fields reminder */}
          <p
            className="text-[10px] font-bold px-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Campos que debes completar manualmente: color, millaje, precio, inicial, placa y fotos.
          </p>

          {/* Apply button */}
          <button
            type="button"
            onClick={handleApply}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
          >
            <CheckCircle2 size={14} /> Usar datos encontrados
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
