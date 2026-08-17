import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
// import imageCompression from 'browser-image-compression';
import { db, auth, storage } from './firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { supabase, SUPABASE_FUNCTIONS_URL } from './supabase.js';
import LoginView from './components/LoginView.jsx';
import {
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  collectionGroup,
  query,
  where,
  getDocs
} from 'firebase/firestore';

import confetti from 'canvas-confetti';
import { sileo, Toaster } from 'sileo';
import { motion, AnimatePresence } from 'framer-motion';

import {
  LayoutDashboard, Car, FileText, LogOut, Plus, Search, Edit, Trash2,
  DollarSign, CheckCircle, X, Menu, User, Send, Loader2, FilePlus,
  CreditCard, FileSignature, Files, Fuel, Settings, IdCard, Trash, Undo, Printer, Eye, Download,
  PlusCircle, Box, ArrowUpRight, Building2, Fingerprint, Lock, EyeOff, Share2, Check, ArrowRight, Key, Copy, Link,
  AlertTriangle, TrendingUp, History, Bell, Calendar, Briefcase, Inbox, Headset, Sparkles, Camera,
  ChevronLeft, ChevronRight, Save, ChevronDown, MoreVertical, FileCode, AtSign, Building, LayoutGrid, ShieldCheck,
  Phone, Mail, RefreshCw, Users, MessageCircle, UploadCloud, FileSpreadsheet, Table2, Clock
} from 'lucide-react';
import VinDecoderSection from './components/VinDecoderSection.jsx';
import { mapVinToFormFields } from './utils/vinDecoder.js';
import { fetchDealerRateConfig, resolveExchangeRate, convertAmount, getLastRateMeta, DEFAULT_PRIMARY_CURRENCY, DEFAULT_SECONDARY_CURRENCY, DEFAULT_AUTO_INITIAL_PCT } from './utils/exchangeRate.js';
import { formatWithCommas, parseCommaNumber, cursorPosAfterFormat } from './utils/formatInput.js';
// Heavy views loaded on demand (only when their tab/route is active) to shrink the initial bundle.
const VehicleEditView = lazy(() => import('./VehicleEditView'));
const ContactsView = lazy(() => import('./ContactsView'));
const ConversationsView = lazy(() => import('./ConversationsView'));
import { generarContratoEnGHL } from './ghl_integration/ghlService';
import { requestNotificationPermission, onForegroundMessage, sendDealerNotification } from './notifications';
import { useI18n } from './i18n/I18nContext.jsx';
import { useTheme } from './ThemeContext.jsx';
import { useCurrency, CURRENCIES, CURRENCY_CODES } from './CurrencyContext.jsx';

// Formatea fecha+hora de vehículos (created_at/updated_at) de forma compacta: "10 jul 2026 · 3:28 PM"
export const formatVehicleTimestamp = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const datePart = d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
};

// Normaliza teléfono a E.164 (por defecto NANP/+1, contexto RD) para que coincida
// con el formato que usa el backend al buscar comprador por teléfono (integración Cloy).
export const toE164 = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('+')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : null;
};

// Importar html2pdf.js de forma dinámica para evitar problemas de SSR si fuera necesario,
// o directamente ya que es una SPA de Vite.
// import html2pdf from 'html2pdf.js';

// --- SHARED STYLES FOR TEMPLATES ---
export const SHARED_QUILL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&family=Mirza:wght@400;700&family=Roboto:wght@400;700&family=Aref+Ruqaa:wght@400;700&display=swap');

  /* Reset */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  /* Container and Base Typography */
  body, .ql-editor { 
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* Quill alignment classes */
  .ql-align-center { text-align: center !important; }
  .ql-align-right { text-align: right !important; }
  .ql-align-left { text-align: left !important; }
  .ql-align-justify { text-align: justify !important; }
  
  /* Quill indentation */
  .ql-indent-1 { padding-left: 3em !important; }
  .ql-indent-2 { padding-left: 6em !important; }
  .ql-indent-3 { padding-left: 9em !important; }
  .ql-indent-4 { padding-left: 12em !important; }
  .ql-indent-5 { padding-left: 15em !important; }
  
  /* Typography */
  h1 { font-size: 2.5em; font-weight: 800; margin-bottom: 0.5em; color: #0f172a; }
  h2 { font-size: 1.75em; font-weight: 700; margin-bottom: 0.5em; color: #0f172a; }
  h3 { font-size: 1.25em; font-weight: 700; margin-bottom: 0.5em; color: #0f172a; }
  p { margin: 0; padding: 0; min-height: 1.25em; }
  
  /* Lists */
  ul, ol { padding-left: 1.5em; margin: 0.75em 0; }
  li { margin: 0.4em 0; }
  
  /* Images */
  img { max-width: 100%; height: auto; display: block; margin: 15px auto; border-radius: 4px; }
  
  /* Quill font sizes */
  .ql-size-small { font-size: 0.8em; }
  .ql-size-large { font-size: 1.5em; }
  .ql-size-huge { font-size: 2.25em; }
  
  /* Quill fonts */
  .ql-font-serif { font-family: Georgia, 'Times New Roman', serif; }
  .ql-font-monospace { font-family: Monaco, 'Courier New', monospace; }
  .ql-font-mirza { font-family: 'Mirza', serif; }
  .ql-font-roboto { font-family: 'Roboto', sans-serif; }
  .ql-font-aref { font-family: 'Aref Ruqaa', serif; }
  .ql-font-helvetica { font-family: 'Helvetica', Arial, sans-serif; }
  .ql-font-inter { font-family: 'Inter', sans-serif; }
  .ql-font-arial { font-family: 'Arial', sans-serif; }
  .ql-font-calibri { font-family: 'Calibri', 'Candara', 'Segoe UI', sans-serif; }
  .ql-font-times-new-roman { font-family: 'Times New Roman', serif; }
  .ql-font-georgia { font-family: 'Georgia', serif; }
  .ql-font-verdana { font-family: 'Verdana', sans-serif; }
  
  /* Text styles */
  strong, b { font-weight: 700; color: #0f172a; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
  s { text-decoration: line-through; }
  
  /* Horizontal rules */
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
  
  /* Table support */
  table { border-collapse: collapse; width: 100%; margin: 20px 0; table-layout: fixed; }
  td, th { border: 1px solid #cbd5e1; padding: 12px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  th { background: #f8fafc; font-weight: 700; }
`;

// --- UI KIT ---
const Button = ({ children, variant = 'primary', className = '', icon: Icon, onClick, ...props }) => {
  const hasManualBg = className.includes('bg-');
  const hasManualText = className.includes('text-');

  const baseClasses = `px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-500 ease-[0.23,1,0.32,1] flex items-center justify-center gap-2 active:scale-95 active:brightness-90 hover:scale-[1.02] hover:brightness-105`;

  const variantStyles = {
    primary: { background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' },
    secondary: { background: 'var(--bg-glass)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', backdropFilter: 'blur(24px)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
    danger: { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border-glass)' },
  };

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${className}`}
      style={!hasManualBg && !hasManualText ? (variantStyles[variant] || variantStyles.primary) : undefined}
      {...props}
    >
      {Icon && <Icon size={18} className="transition-transform group-hover:rotate-12" />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '', noPadding = false }) => {
  const hasCustomBg = className.includes('glass-card') || className.includes('theme-card') || className.includes('banner-gradient') || className.includes('bg-');
  return (
    <div className={`
      rounded-[2.5rem]
      hover:-translate-y-1
      transition-all
      duration-700
      ease-[0.23,1,0.32,1]
      ${noPadding ? '' : 'p-6'}
      ${!hasCustomBg ? 'glass-card' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
};

const Badge = ({ status }) => {
  const { t } = useI18n();
  const styles = {
    available: "bg-gradient-to-br from-red-500 to-rose-700 text-white px-3 py-1 font-black shadow-[0_0_12px_rgba(225,29,72,0.35)] border-red-400/30 uppercase tracking-tighter ring-1 ring-white/10",
    quoted: "bg-gradient-to-r from-yellow-300 to-amber-500 text-amber-950 px-3 py-1 font-black shadow-[0_0_15px_rgba(245,158,11,0.25)] border-amber-400/50 uppercase tracking-tighter ring-1 ring-white/20",
    sold: "bg-gradient-to-br from-emerald-500 to-teal-700 text-white px-3 py-1 font-black shadow-[0_0_12px_rgba(16,185,129,0.35)] border-emerald-400/30 uppercase tracking-tighter ring-1 ring-white/10",
    upcoming: "bg-gradient-to-br from-indigo-500 to-blue-700 text-white px-3 py-1 font-black shadow-[0_0_12px_rgba(79,70,229,0.35)] border-indigo-400/30 uppercase tracking-tighter ring-1 ring-white/10",
    pending: "bg-gradient-to-br from-orange-400 to-orange-600 text-white px-3 py-1 font-black shadow-[0_0_12px_rgba(249,115,22,0.3)] border-orange-400/30 uppercase tracking-tighter ring-1 ring-white/10",
    signed: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-3 py-1 font-black shadow-[0_0_12px_rgba(59,130,246,0.3)] border-blue-400/30 uppercase tracking-tighter ring-1 ring-white/10",
  };
  const labels = {
    available: t('status_available'),
    quoted: t('status_quoted'),
    sold: t('status_sold'),
    upcoming: t('status_upcoming'),
    pending: t('status_pendingSignature'),
    signed: t('status_signed')
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || styles.sold}`}>
      {labels[status] || status}
    </span>
  );
};

const Input = ({ label, className = "", type = "text", error, ...props }) => (
  <div className="mb-4 group text-left transition-all duration-300">
    {label && (
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-all duration-300" style={{ color: error ? 'var(--accent)' : 'var(--text-secondary)' }}>
        {label}
      </label>
    )}
    <input
      type={type}
      className={`glass-input w-full shadow-sm px-4 py-3 font-bold text-sm transition-all duration-300 hover:shadow-md ${error ? 'ring-2 ring-red-500/20' : ''} ${className}`}
      {...props}
    />
    {error && <span className="text-[10px] font-bold ml-1 mt-1 block animate-slide-in-right" style={{ color: 'var(--accent)' }}>{error}</span>}
  </div>
);

const Select = ({ label, options = [], name, defaultValue, value, onChange, disabled, ...props }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || defaultValue || (options[0]?.value || options[0]));
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (value !== undefined) setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val) => {
    if (disabled) return;
    setSelectedValue(val);
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { name, value: val } });
    }
  };

  const currentOption = options.find(opt => (typeof opt === 'object' ? opt.value : opt) === selectedValue);
  const displayLabel = typeof currentOption === 'object' ? currentOption.label : currentOption || selectedValue;

  return (
    <div className="mb-4 group relative text-left" ref={dropdownRef}>
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`glass-input w-full flex items-center justify-between px-4 py-3 font-bold text-sm transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={16} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} style={{ color: isOpen ? 'var(--accent)' : 'var(--text-tertiary)' }} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-2 p-2 rounded-2xl z-[110] animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-glass)', boxShadow: 'var(--shadow-modal)', backdropFilter: 'blur(40px)' }}>
          <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-1">
            {options.map((opt, i) => {
              const isObj = typeof opt === 'object' && opt !== null;
              if (isObj && opt.header) {
                return (
                  <div key={i} className={`px-3 pb-1 text-[9px] font-black uppercase tracking-widest ${i === 0 ? 'pt-1' : 'pt-3'}`} style={{ color: 'var(--text-tertiary)' }}>
                    {opt.header}
                  </div>
                );
              }
              const optionValue = isObj ? opt.value : opt;
              const optionLabel = isObj ? opt.label : opt;
              const isSelected = selectedValue === optionValue;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(optionValue)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between"
                  style={isSelected ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : { color: 'var(--text-primary)' }}
                >
                  {optionLabel}
                  {isSelected && <Check size={16} style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Hidden field for FormData compatibility */}
      <input type="hidden" name={name} value={selectedValue} />
    </div>
  );
};


const AppLogo = ({ className, size = 32, invert = false }) => {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <div className={`flex items-center justify-center ${invert ? 'text-white' : 'text-red-600'} ${className} `}><Car size={size} /></div>;
  return <img src="/logo.png" alt="Carbot" className={`${className} object-contain`} style={{ height: size, width: 'auto' }} onError={() => setHasError(true)} />;
};

// --- MODALES ---

const ActionSelectionModal = ({ isOpen, onClose, onSelect }) => {
  const { t } = useI18n();
  if (!isOpen) return null;
  return (
    <div className="theme-overlay fixed inset-0 z-[110] flex items-center justify-center p-4 transition-opacity duration-300">
      <div className="w-[95%] max-w-sm animate-in zoom-in-95 duration-200">
        <Card className="glass-card rounded-[32px] border-0 overflow-hidden p-2" style={{ boxShadow: 'var(--shadow-modal)' }}>
          <div className="flex justify-between items-center mb-4 mt-2 px-4">
            <h3 className="text-xl font-black tracking-tight text-center w-full ml-6 font-display" style={{ color: 'var(--text-primary)' }}>{t('tools_links')}</h3>
            <button onClick={onClose} className="p-1"><X size={20} style={{ color: 'var(--text-tertiary)' }} className="hover:text-red-500 transition-colors" /></button>
          </div>
          <div className="grid gap-4 px-2 pb-4">
            <button onClick={() => onSelect('quote')} className="flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-100 bg-white hover:border-red-500 hover:shadow-xl hover:shadow-red-500/10 transition-all group overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 group-hover:bg-red-100 transition-colors"></div>
              <div className="p-4 bg-red-600 rounded-xl text-white shadow-lg shadow-red-600/30 group-hover:scale-110 transition-transform relative z-10"><Send size={24} /></div>
              <div className="mt-4 text-center relative z-10">
                <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight group-hover:text-red-700">{t('quotes')}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('send_tech_sheet')}</p>
              </div>
            </button>
            <button onClick={() => onSelect('contract')} className="flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-100 bg-white hover:border-red-500 hover:shadow-xl hover:shadow-red-500/10 transition-all group overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-full -mr-16 -mt-16 group-hover:bg-red-100 transition-colors"></div>
              <div className="p-4 bg-red-600 rounded-xl text-white shadow-lg shadow-red-600/30 group-hover:scale-110 transition-transform relative z-10"><FilePlus size={24} /></div>
              <div className="mt-4 text-center relative z-10">
                <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight group-hover:text-red-700">{t('contracts')}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('generate_legal_doc')}</p>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Tope de fotos por vehículo. Nada más abajo en la cadena (catálogo público,
// endpoint del bot, feed de Meta) recorta el arreglo, así que este es el único
// punto de control.
const MAX_PHOTOS = 20;
// Comprimir 20 imágenes a la vez levanta 20 web workers y ahoga el navegador.
// De a 4 el progreso avanza parejo y la memoria se mantiene estable.
const CONCURRENT_COMPRESSIONS = 4;
// Escalera de compresión: si un paso falla o deja la foto todavía muy pesada,
// se reintenta más agresivo en vez de rendirse. Una foto de 20 MB del celular
// se resuelve en el primer paso (se reescala a 2000px); sólo formatos raros o
// memoria justa llegan a los siguientes.
const PHOTO_MAX_SIZE_MB = 3;
const COMPRESSION_STEPS = [
  { maxSizeMB: PHOTO_MAX_SIZE_MB, maxWidthOrHeight: 2000, initialQuality: 0.9 },
  { maxSizeMB: 2, maxWidthOrHeight: 1600, initialQuality: 0.75 },
  { maxSizeMB: 1, maxWidthOrHeight: 1200, initialQuality: 0.6 },
];
// Si ni un solo paso funcionó y el original pesa más que esto, no se sube: un
// archivo así tarda muchísimo y probablemente falle a mitad de camino.
const PHOTO_HARD_LIMIT_MB = 8;

const VehicleFormModal = ({ isOpen, onClose, onSave, initialData, userProfile }) => {
  const { t } = useI18n();
  const { selected: selectedCurrencies, getSymbol } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [photos, setPhotos] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [downPaymentCurrency, setDownPaymentCurrency] = useState('USD');
  const [mileageUnit, setMileageUnit] = useState(initialData?.mileage_unit || 'KM');
  const [mileageValue, setMileageValue] = useState(String(initialData?.mileage ?? ''));
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoProgress, setPhotoProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState(initialData?.status || 'available');
  const [linkExterno, setLinkExterno] = useState(initialData?.detalles?.link_externo || initialData?.link_externo || '');
  const formRef = useRef(null);
  // Controlled values for selects filled by VIN decoder
  const [vinSelects, setVinSelects] = useState({});
  const [rateConfig, setRateConfig] = useState(null); // { primary, secondary, rate, isManual }

  useEffect(() => {
    // Este modal suele quedar montado (solo oculto) entre aperturas, así que
    // sin `isOpen` en las deps la config de tasa/% se pediría UNA sola vez por
    // sesión — cualquier cambio hecho después en Ajustes (moneda, tasa manual,
    // % inicial automático) nunca se vería reflejado sin recargar la página.
    if (!isOpen) return;
    const dealerId = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
    if (!dealerId) return;
    let cancelled = false;
    (async () => {
      const config = await fetchDealerRateConfig(supabase, dealerId);
      const primary = config?.primary || DEFAULT_PRIMARY_CURRENCY;
      const secondary = config?.secondary || DEFAULT_SECONDARY_CURRENCY;
      const { rate, isManual, ratesToPrimary } = await resolveExchangeRate({ primary, secondary, manualRate: config?.manualRate });
      if (!cancelled) setRateConfig({ primary, secondary, rate, isManual, ratesToPrimary, autoInitialPct: config?.autoInitialPct });
    })();
    return () => { cancelled = true; };
  }, [userProfile?.supabaseDealerId, userProfile?.dealerId, isOpen]);

  // Recalcula el inicial en cuanto llega/cambia la config de tasa+% — no solo
  // cuando el usuario retipea el precio. Sin esto, reabrir un vehículo después
  // de cambiar el % en Ajustes seguía mostrando el inicial calculado con el %
  // viejo hasta que se tocara el campo Precio.
  useEffect(() => {
    if (!rateConfig || leaveInitialEmpty || initialManuallyEditedRef.current) return;
    const priceNum = Number(prices.price) || 0;
    if (priceNum <= 0) return;
    const autoPct = (rateConfig.autoInitialPct ?? DEFAULT_AUTO_INITIAL_PCT) / 100;
    const priceInPrimary = convertAmount(priceNum, currency, rateConfig.primary, rateConfig.ratesToPrimary);
    const recalculated = String(Math.round(priceInPrimary * autoPct));
    if (recalculated !== prices.initial) setPrices(prev => ({ ...prev, initial: recalculated }));
    if (downPaymentCurrency !== rateConfig.primary) setDownPaymentCurrency(rateConfig.primary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateConfig]);

  // Text inputs that can be filled by VIN decoder via DOM
  const VIN_TEXT_INPUTS = ['make', 'model', 'year', 'edition', 'vin', 'engine_cyl', 'engine_cc'];
  // Select inputs managed via state
  const VIN_SELECT_INPUTS = ['type', 'fuel', 'transmission', 'traction', 'engine_type', 'camera', 'key_type', 'seats'];

  const applyVinToForm = (fields) => {
    const form = formRef.current;
    const newSelects = {};

    Object.entries(fields).forEach(([key, val]) => {
      if (!val) return;

      if (VIN_SELECT_INPUTS.includes(key)) {
        // Only fill if not already set by user
        if (!vinSelects[key] || vinSelects[key] === '-') {
          newSelects[key] = val;
        }
        return;
      }

      // Text inputs: set via DOM
      if (form && VIN_TEXT_INPUTS.includes(key)) {
        const el = form.elements[key];
        if (!el) return;
        if (el.value && el.value !== '' && el.value !== '-') return;
        el.value = val;
      }
    });

    if (Object.keys(newSelects).length > 0) {
      setVinSelects(prev => ({ ...prev, ...newSelects }));
    }
  };



  const [prices, setPrices] = useState({
    price: '',
    initial: ''
  });
  // Autorelleno del inicial (30% del precio) mientras el usuario no lo haya
  // tocado a mano ni marcado "dejar vacío" — se reinicia cada vez que el modal
  // carga un vehículo distinto (ver el useEffect de abajo).
  const initialManuallyEditedRef = useRef(false);
  const [leaveInitialEmpty, setLeaveInitialEmpty] = useState(false);

  // Al reformatear con comas en cada tecla, el navegador manda el cursor al
  // final. Guardamos la posición deseada y la restauramos tras el repintado.
  const priceInputRef = useRef(null);
  const initialInputRef = useRef(null);
  const pendingCursorRef = useRef({ price: null, initial: null });

  useLayoutEffect(() => {
    const pos = pendingCursorRef.current.price;
    if (pos !== null && priceInputRef.current) {
      priceInputRef.current.setSelectionRange(pos, pos);
      pendingCursorRef.current.price = null;
    }
  }, [prices.price]);

  useLayoutEffect(() => {
    const pos = pendingCursorRef.current.initial;
    if (pos !== null && initialInputRef.current) {
      initialInputRef.current.setSelectionRange(pos, pos);
      pendingCursorRef.current.initial = null;
    }
  }, [prices.initial]);

  useEffect(() => {
    if (initialData && isOpen) {
      setCurrency(initialData.moneda_precio || initialData.currency || (initialData.precio > 0 ? 'USD' : (initialData.price_dop && !initialData.price ? 'DOP' : 'USD')));
      setDownPaymentCurrency(initialData.moneda_inicial || initialData.downPaymentCurrency || (initialData.initial_payment_dop && !initialData.initial_payment ? 'DOP' : 'USD'));
      setMileageUnit(initialData.unit || initialData.mileage_unit || 'MI');
      setMileageValue(String(initialData.millas ?? initialData.mileage ?? ''));
      setPrices({
        price: initialData.precio > 0 ? initialData.precio.toString() : (initialData.price_dop > 0 ? initialData.price_dop.toString() : (initialData.price?.toString() || '')),
        initial: initialData.inicial > 0 ? initialData.inicial.toString() : (initialData.initial_payment_dop > 0 ? initialData.initial_payment_dop.toString() : (initialData.initial_payment?.toString() || ''))
      });
      // Usamos el flag guardado en DB (inicial_automatico) para decidir si este
      // inicial se puede recalcular: si es explícitamente true, el dealer nunca
      // lo tocó a mano y es seguro recalcular. Si es false o desconocido (datos
      // viejos, de antes de este flag), lo tratamos como manual — NUNCA pisar
      // un valor que pudo haber sido escrito a mano por el dealer.
      const hasRealInitial = initialData.inicial > 0 || initialData.initial_payment_dop > 0 || initialData.initial_payment > 0;
      const hasRealPrice = initialData.precio > 0 || initialData.price_dop > 0 || initialData.price > 0;
      initialManuallyEditedRef.current = hasRealInitial ? (initialData.inicial_automatico !== true) : false;
      // Si ya tiene precio guardado pero nunca se le puso inicial, asumimos que se
      // dejó vacío a propósito la vez anterior — mostrar el checkbox ya marcado.
      setLeaveInitialEmpty(!hasRealInitial && hasRealPrice);
      setStatus(initialData.status || initialData.estado || 'available');
      setLinkExterno(initialData.detalles?.link_externo || initialData.link_externo || '');

      // Populate Photos
      if (initialData.images && Array.isArray(initialData.images)) {
        setPhotos(initialData.images.map(url => ({ url, isExisting: true, file: null })));
      } else if (initialData.image) {
        setPhotos([{ url: initialData.image, isExisting: true, file: null }]);
      } else {
        setPhotos([]);
      }
    } else if (!initialData && isOpen) {
      setCurrency('USD');
      setDownPaymentCurrency('USD');
      setMileageUnit('MI');
      setPrices({ price: '', initial: '' });
      initialManuallyEditedRef.current = false;
      setLeaveInitialEmpty(false);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    const totalCurrent = photos.length;

    if (totalCurrent + files.length > MAX_PHOTOS) {
      setPhotoError(`Máximo ${MAX_PHOTOS} fotos. Tienes ${totalCurrent} y estás agregando ${files.length}.`);
      e.target.value = '';
      return;
    }
    setPhotoError('');

    if (files.length > 0) {
      setIsOptimizing(true);
      setPhotoProgress({ done: 0, total: files.length });
      try {
        // Dynamic import to avoid build/load issues
        const imageCompression = (await import('browser-image-compression')).default;

        // Devuelve { file, optimized }. Nunca lanza: si todo falla se queda con
        // el original y quien llama decide si es demasiado pesado para subirlo.
        const compressOne = async (file) => {
          try {
            let best = null;
            for (const step of COMPRESSION_STEPS) {
              try {
                const out = await imageCompression(file, { ...step, useWebWorker: true });
                if (!out) continue;
                best = out;
                if (out.size <= step.maxSizeMB * 1024 * 1024) break;
              } catch (error) {
                console.error(`Compresión falló en el paso ${step.maxWidthOrHeight}px:`, error);
              }
            }
            return { file: best || file, optimized: !!best };
          } finally {
            setPhotoProgress(prev => ({ ...prev, done: prev.done + 1 }));
          }
        };

        const results = [];
        for (let i = 0; i < files.length; i += CONCURRENT_COMPRESSIONS) {
          const batch = files.slice(i, i + CONCURRENT_COMPRESSIONS);
          results.push(...await Promise.all(batch.map(compressOne)));
        }

        // Las que no se pudieron optimizar sí se suben, salvo que sean enormes.
        const tooBig = results.filter(r => !r.optimized && r.file.size > PHOTO_HARD_LIMIT_MB * 1024 * 1024);
        const usable = results.filter(r => !tooBig.includes(r));

        const newItems = usable.map(r => ({
          url: URL.createObjectURL(r.file),
          file: r.file,
          isExisting: false
        }));

        setPhotos(prev => [...prev, ...newItems]);

        if (tooBig.length > 0) {
          setPhotoError(`${tooBig.length} foto(s) no se pudieron procesar y pesan más de ${PHOTO_HARD_LIMIT_MB} MB, así que no se agregaron. Conviértelas a JPG e inténtalo de nuevo.`);
        } else {
          const raw = usable.filter(r => !r.optimized).length;
          if (raw > 0) setPhotoError(`${raw} foto(s) se agregaron sin optimizar — la subida puede tardar más.`);
        }
      } catch (error) {
        console.error("Error general procesando imágenes:", error);
        setPhotoError('Hubo un error procesando las imágenes. Inténtalo de nuevo.');
      } finally {
        setIsOptimizing(false);
        setPhotoProgress({ done: 0, total: 0 });
      }
    }
  };

  const removeImage = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const movePhoto = (index, direction) => {
    const newPhotos = [...photos];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= newPhotos.length) return;
    [newPhotos[index], newPhotos[nextIndex]] = [newPhotos[nextIndex], newPhotos[index]];
    setPhotos(newPhotos);
  };

  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState(null);

  const setAsCover = (index) => {
    if (index === 0) return;
    const newPhotos = [...photos];
    const [target] = newPhotos.splice(index, 1);
    newPhotos.unshift(target);
    setPhotos(newPhotos);
  };

  const handleDragStart = (e, index) => {
    setDraggedPhotoIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // We only use dataTransfer for visuals, logic is driven by state
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedPhotoIndex === null || draggedPhotoIndex === targetIndex) return;

    const newPhotos = [...photos];
    const draggedItem = newPhotos[draggedPhotoIndex];
    newPhotos.splice(draggedPhotoIndex, 1);
    newPhotos.splice(targetIndex, 0, draggedItem);

    setPhotos(newPhotos);
    setDraggedPhotoIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedPhotoIndex(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Preserve status
    data.status = status;
    data.estado = status === 'sold' ? 'Vendido' : (status === 'quoted' ? 'Cotizado' : 'Disponible');

    // --- CLEANUP "-" VALUES ---
    Object.keys(data).forEach(key => {
      if (data[key] === '-') data[key] = '';
    });

    // --- NORMALIZE UPPERCASE FIELDS ---
    ['make', 'model', 'edition', 'color', 'plate', 'vin', 'chassis'].forEach(key => {
      if (data[key] && typeof data[key] === 'string') {
        data[key] = data[key].toUpperCase();
      }
    });

    // --- PRECIO ---
    const priceValue = Number(prices.price);
    data.price = priceValue;
    data.currency = currency;
    delete data.price_unified;

    // --- INICIAL ---
    // Red de seguridad: si no está marcado "dejar vacío" y el inicial quedó en
    // 0 (por ejemplo el usuario nunca tocó el campo precio), lo calculamos aquí
    // mismo antes de guardar en vez de guardar un 0 no intencional.
    let initialValue = Number(prices.initial) || 0;
    let finalDownPaymentCurrency = downPaymentCurrency;
    if (!leaveInitialEmpty && initialValue <= 0 && priceValue > 0) {
      const autoPct = (rateConfig?.autoInitialPct ?? DEFAULT_AUTO_INITIAL_PCT) / 100;
      if (rateConfig) {
        const priceInPrimary = convertAmount(priceValue, currency, rateConfig.primary, rateConfig.ratesToPrimary);
        initialValue = Math.round(priceInPrimary * autoPct);
        finalDownPaymentCurrency = rateConfig.primary;
      } else {
        initialValue = Math.round(priceValue * autoPct);
      }
    }
    data.initial_payment = initialValue;
    data.downPaymentCurrency = finalDownPaymentCurrency;
    data.inicial_automatico = !leaveInitialEmpty && !initialManuallyEditedRef.current;
    delete data.initial_unified;

    // --- MILLAJE ---
    data.mileage = Number(mileageValue);
    data.mileage_unit = mileageUnit;

    // --- DATA CLEANUP ---
    data.year = Number(data.year);
    if (data.seats) data.seats = Number(data.seats);

    try {
      let uploadedUrls = [];
      const filesToUpload = photos.filter(p => !p.isExisting && p.file);

      if (filesToUpload.length > 0) {
        setUploadProgress(`Subiendo ${filesToUpload.length} foto(s)...`);
      }

      // Prepare folder details for new structure
      // dealer-{Nombre de dealer} -Marcas- {ano} {marca}, {modelo}, {color} {4 ultimos digitos del chasis}
      const cleanDealerName = (userProfile?.dealerName || 'Dealer').replace(/[^a-zA-Z0-9]/g, '_');
      const year = data.year || '0000';
      const make = (data.make || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const model = (data.model || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const color = (data.color || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const last4Vin = (data.vin || '0000').slice(-4);

      const folderName = `${year}_${make}_${model}_${color}_${last4Vin}`.trim();
      const baseStoragePath = `dealer_${cleanDealerName}/Marcas/${folderName}`;

      // Una subida fallida no puede pasar desapercibida: antes se registraba en
      // consola y la foto desaparecía del vehículo sin avisar a nadie.
      const failedPhotos = [];
      for (let i = 0; i < photos.length; i++) {
        const item = photos[i];
        if (item.isExisting) {
          uploadedUrls.push(item.url);
        } else if (item.file) {
          const cleanName = (item.file.name || `image_${i}.jpg`).replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase();
          let uploaded = false;
          // Un reintento cubre el corte de red momentáneo, que es la causa
          // habitual cuando se suben tandas grandes desde el celular.
          for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
            try {
              setUploadProgress(`Subiendo foto ${i + 1} de ${photos.length}...`);
              const storageRef = ref(storage, `${baseStoragePath}/${Date.now()}_${cleanName}`);
              await uploadBytes(storageRef, item.file);
              uploadedUrls.push(await getDownloadURL(storageRef));
              uploaded = true;
            } catch (err) {
              console.error(`Error subiendo foto ${cleanName} (intento ${attempt + 1}):`, err);
            }
          }
          if (!uploaded) failedPhotos.push(cleanName);
        }
      }
      setUploadProgress('');

      if (failedPhotos.length > 0) {
        setPhotoError(`No se pudieron subir ${failedPhotos.length} foto(s). Revisa tu conexión e intenta guardar de nuevo — no se guardó nada todavía.`);
        setLoading(false);
        return;
      }

      data.images = uploadedUrls;
      data.image = uploadedUrls[0] || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800';
      data.link_externo = linkExterno.trim() || null;

      if (initialData?.id) {
        data.id = initialData.id;
      }

      await onSave(data);
      setLoading(false);
      onClose();
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar: " + error.message);
      setLoading(false);
    }
  };

  const SectionHeader = ({ title, icon: Icon }) => (
    <div className="flex items-center gap-2 mb-6 mt-2 pb-2 border-b border-slate-100">
      {Icon && <Icon className="text-red-500" size={18} />}
      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide truncate">{title}</h4>
    </div>
  );

  // Determine if editing is locked (only if it was ALREADY sold when opening)
  const isLocked = initialData?.status === 'sold';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/20 transition-opacity duration-300">
      <div className="w-full max-w-5xl animate-in zoom-in-95 duration-200 h-[100dvh] sm:h-[92vh] flex flex-col bg-white rounded-none sm:rounded-[24px] overflow-hidden shadow-2xl ring-1 ring-black/5">

        {/* HEADER */}
        <div className="flex justify-between items-center px-8 py-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-red-50 p-2 rounded-xl">
              <AppLogo size={32} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight leading-none">
                {initialData ? 'Editar Vehículo' : 'Nuevo Vehículo'}
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {initialData ? 'Modifica los detalles del inventario' : 'Agrega una nueva unidad al sistema'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-red-600 rounded-full transition-all hover:rotate-90 duration-300"><X size={24} /></button>
        </div>

        {/* VISUAL BANNER IF LOCKED */}
        {isLocked && (
          <div className="bg-slate-800 text-white px-8 py-3 flex items-center gap-3 shrink-0 animate-in slide-in-from-top-2">
            <Lock size={18} className="text-red-400" />
            <p className="text-xs font-bold uppercase tracking-wide">
              Modo Solo Lectura: Este vehículo está marcado como <span className="text-red-400">VENDIDO</span>.
              <span className="opacity-75 font-normal ml-1 normal-case text-white/80">Cambia el estado a "Disponible" o "Cotizado" para editar los detalles.</span>
            </p>
          </div>
        )}

        {/* SCROLLABLE FORM */}
        <div className="flex-1 overflow-y-auto bg-white">
          <form id="vehicle-main-form" ref={formRef} onSubmit={handleSubmit} className="p-8 max-w-5xl mx-auto space-y-10">

            {/* VIN DECODER */}
            {!isLocked && (
              <VinDecoderSection
                existingData={{}}
                onApply={(fields) => applyVinToForm(fields)}
              />
            )}

            {/* DATOS PRINCIPALES */}
            <div className={isLocked ? "opacity-60 pointer-events-none grayscale-[0.5] transition-all" : "transition-all"}>
              <SectionHeader title="Información Principal" icon={Car} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                <Input name="make" label="Marca" defaultValue={initialData?.make} placeholder="Ej. TOYOTA" required disabled={isLocked} onInput={e => { e.target.value = e.target.value.toUpperCase(); }} />
                <Input name="model" label="Modelo" defaultValue={initialData?.model} placeholder="Ej. CAMRY" required disabled={isLocked} onInput={e => { e.target.value = e.target.value.toUpperCase(); }} />
                {/* AÑO-small */}
                <Input name="year" label="Año" type="number" onWheel={(e) => e.target.blur()} defaultValue={initialData?.year} placeholder="2026" required disabled={isLocked} />

                <Input name="edition" label="Edición" defaultValue={initialData?.edition} placeholder="Ej. XSE" disabled={isLocked} onInput={e => { e.target.value = e.target.value.toUpperCase(); }} />
                <Input name="color" label="Color" defaultValue={initialData?.color} placeholder="Ej. BLANCO PERLA" required disabled={isLocked} onInput={e => { e.target.value = e.target.value.toUpperCase(); }} />

                {/* MILLAJE CON TOGGLE INTEGRADO */}
                <div className="flex flex-col mb-4 group text-left">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-500">Millaje</label>
                  <div className={`flex relative items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 transition-all ${isLocked ? 'bg-slate-50' : 'bg-white'}`}>
                    <input
                      name="mileage"
                      id="mileage"
                      type="text"
                      inputMode="numeric"
                      value={formatWithCommas(mileageValue)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setMileageValue(raw);
                      }}
                      className="w-full px-4 py-3 bg-transparent text-slate-900 font-bold text-sm outline-none placeholder:text-slate-300"
                      disabled={isLocked}
                    />
                    <div className="bg-slate-50 flex items-center border-l border-slate-200 shrink-0">
                      {['KM', 'MI'].map(u => (
                        <button
                          key={u}
                          type="button"
                          disabled={isLocked}
                          onClick={() => setMileageUnit(u)}
                          className={`px-3 py-3 text-[10px] font-black transition-all ${mileageUnit === u ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >{u}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Input
                    name="vin"
                    label="VIN / Chasis"
                    defaultValue={initialData?.vin}
                    className="font-mono uppercase tracking-wider"
                    placeholder="NÚMERO DE CHASIS"
                    disabled={isLocked}
                    onInput={(e) => {
                      e.target.value = e.target.value.toUpperCase().replace(/[O]/g, '');
                    }}
                  />
                </div>
                <div className="md:col-span-1">
                  <Input
                    name="plate"
                    label="Placa"
                    defaultValue={initialData?.plate || initialData?.placa}
                    className="font-mono uppercase tracking-wider"
                    placeholder="PLACA"
                    disabled={isLocked}
                    onInput={(e) => {
                      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* FICHA TÉCNICA */}
            <div className={`rounded-3xl p-6 ${isLocked ? "opacity-60 pointer-events-none grayscale-[0.5]" : ""}`} style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
              <SectionHeader title="Ficha Técnica y Accesorios" icon={Settings} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                {/* FILA 1 */}
                <Select name="condition" label="Condición" defaultValue={initialData?.condition || '-'} options={['-', 'Usado', 'Recién Importado', 'Nuevo', 'Certificado']} disabled={isLocked} />
                <Select name="clean_carfax" label="Clean Carfax" defaultValue={initialData?.clean_carfax || '-'} options={['-', 'Sí', 'No']} disabled={isLocked} />
                <Select name="type" label="Tipo de Vehículo"
                  value={vinSelects.type || undefined}
                  defaultValue={initialData?.type || initialData?.bodyType || initialData?.tipo_vehiculo || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, type: e.target.value }))}
                  options={[
                    '-',
                    { header: 'Autos' }, 'Automóvil', 'Jeepeta', 'Camioneta',
                    { header: 'Motos' }, 'Moto', 'Scooter', 'Pasola', 'Buggy',
                    { header: 'Vehículos Pesados' }, 'Camión', 'Camión Refrigerado', 'Camión Doble Cabina', 'Camión Cama Abierta', 'Camión Doble Cabina Refrigerado', 'Camión Plataforma', 'Camión Furgón Seco', 'Bus', 'Vehículos Pesados',
                    { header: 'Vehículos de Construcción o Agrícolas' }, 'Tractor', 'Tractor Cabezal', 'Tractor Quinta Rueda', 'Tractor Cama Baja'
                  ]} disabled={isLocked} />

                {/* FILA 2 */}
                <Select name="transmission" label="Transmisión"
                  value={vinSelects.transmission || undefined}
                  defaultValue={initialData?.transmission || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, transmission: e.target.value }))}
                  options={['-', 'Automática', 'Manual', 'CVT', 'Tiptronic', 'DSG']} disabled={isLocked} />
                <Select name="fuel" label="Combustible"
                  value={vinSelects.fuel || undefined}
                  defaultValue={initialData?.fuel || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, fuel: e.target.value }))}
                  options={['-', 'Gasolina', 'Diesel', 'Híbrido', 'Eléctrico', 'GLP']} disabled={isLocked} />
                <Select name="traction" label="Tracción"
                  value={vinSelects.traction || undefined}
                  defaultValue={initialData?.traction || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, traction: e.target.value }))}
                  options={['-', 'FWD', 'RWD', 'AWD', '4x4']} disabled={isLocked} />

                {/* FILA 3 */}
                <Select name="engine_type" label="Aspiración/Tipo"
                  value={vinSelects.engine_type || undefined}
                  defaultValue={initialData?.engine_type || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, engine_type: e.target.value }))}
                  options={['-', 'Normal', 'Turbo', 'Supercharged', 'Híbrido', 'Eléctrico']} disabled={isLocked} />
                <Input name="engine_cyl" label="Cilindros" defaultValue={initialData?.engine_cyl} placeholder="4 Cil" disabled={isLocked} />
                <Input name="engine_cc" label="Cilindrada" defaultValue={initialData?.engine_cc} placeholder="2.0L" disabled={isLocked} />
                <Select
                  name="carplay"
                  label="CarPlay / Android"
                  defaultValue={(initialData?.carplay === true || initialData?.carplay === 'Sí') ? 'Sí' : (initialData?.carplay === false || initialData?.carplay === 'No') ? 'No' : '-'}
                  options={['-', 'Sí', 'No']}
                  disabled={isLocked}
                />

                {/* INTERIOR */}
                <Select name="seat_material" label="Interior" defaultValue={initialData?.seat_material || '-'} options={['-', 'Piel', 'Tela', 'Alcántara', 'Piel/Tela', 'Vinil']} disabled={isLocked} />
                <Select name="roof_type" label="Techo" defaultValue={initialData?.roof_type || '-'} options={['-', 'Normal', 'Panorámico', 'Sunroof', 'Convertible', 'Targa']} disabled={isLocked} />

                {/* EXTRAS */}
                <Select name="camera" label="Cámara"
                  value={vinSelects.camera || undefined}
                  defaultValue={initialData?.camera || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, camera: e.target.value }))}
                  options={['-', 'No', 'Reversa', '360°', 'Frontal + Reversa']} disabled={isLocked} />
                <Select
                  name="sensors"
                  label="Sensores"
                  defaultValue={(initialData?.sensors === true || initialData?.sensors === 'Sí' || initialData?.sensores === true || initialData?.sensores === 'Sí') ? 'Sí' : (initialData?.sensors === false || initialData?.sensors === 'No' || initialData?.sensores === false || initialData?.sensores === 'No') ? 'No' : '-'}
                  options={['-', 'Sí', 'No']}
                  disabled={isLocked}
                />
                <Select
                  name="trunk"
                  label="Baúl Eléctrico"
                  defaultValue={(initialData?.trunk === 'Sí' || initialData?.is_electric_trunk === 'Sí' || initialData?.trunk_type === 'Eléctrica' || initialData?.baul_electrico === true || initialData?.baul_electrico === 'Sí') ? 'Sí' : (initialData?.trunk === 'No' || initialData?.is_electric_trunk === 'No' || initialData?.trunk_type === 'Manual' || initialData?.baul_electrico === false || initialData?.baul_electrico === 'No') ? 'No' : '-'}
                  options={['-', 'Sí', 'No']}
                  disabled={isLocked}
                />
                <Select
                  name="electric_windows"
                  label="Cristales Eléctricos"
                  defaultValue={(initialData?.electric_windows === true || initialData?.electric_windows === 'Sí' || initialData?.vidrios_electricos === true || initialData?.vidrios_electricos === 'Sí') ? 'Sí' : (initialData?.electric_windows === false || initialData?.electric_windows === 'No' || initialData?.vidrios_electricos === false || initialData?.vidrios_electricos === 'No') ? 'No' : '-'}
                  options={['-', 'Sí', 'No']}
                  disabled={isLocked}
                />
                <Select name="key_type" label="Llave"
                  value={vinSelects.key_type || undefined}
                  defaultValue={initialData?.key_type || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, key_type: e.target.value }))}
                  options={['-', 'Llave Normal', 'Push Button']} disabled={isLocked} />
                <Select name="seats" label="Filas Asientos"
                  value={vinSelects.seats || undefined}
                  defaultValue={initialData?.seats || '-'}
                  onChange={(e) => setVinSelects(prev => ({ ...prev, seats: e.target.value }))}
                  options={['-', '1', '2', '3', '4', '5']} disabled={isLocked} />
              </div>
            </div>

            {/* PRECIO & ESTADO */}
            <div className="border-t border-slate-100 pt-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* PRECIO */}
                <div className={isLocked ? "opacity-60 pointer-events-none grayscale-[0.5] flex flex-col group" : "flex flex-col group"}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-500">Precio de Venta</label>
                  <div className={`flex relative items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 transition-all ${isLocked ? 'bg-slate-50' : 'bg-white'}`}>
                    <input
                      type="text"
                      ref={priceInputRef}
                      value={formatWithCommas(prices.price)}
                      onChange={(e) => {
                        const cleanValue = parseCommaNumber(e.target.value);
                        const priceNum = Number(cleanValue) || 0;
                        pendingCursorRef.current.price = cursorPosAfterFormat(e.target.value, e.target.selectionStart, formatWithCommas(cleanValue));

                        // El inicial autogenerado siempre se calcula en la moneda PRINCIPAL
                        // del dealer (aunque el precio esté en otra) — se convierte primero
                        // con la tasa y luego se saca el % configurado, marcado en esa moneda.
                        let autoInitial = '';
                        const autoPct = (rateConfig?.autoInitialPct ?? DEFAULT_AUTO_INITIAL_PCT) / 100;
                        if (!leaveInitialEmpty && !initialManuallyEditedRef.current && priceNum > 0) {
                          if (rateConfig) {
                            const priceInPrimary = convertAmount(priceNum, currency, rateConfig.primary, rateConfig.ratesToPrimary);
                            autoInitial = String(Math.round(priceInPrimary * autoPct));
                            if (downPaymentCurrency !== rateConfig.primary) setDownPaymentCurrency(rateConfig.primary);
                          } else {
                            autoInitial = String(Math.round(priceNum * autoPct));
                          }
                        }

                        setPrices(prev => {
                          const next = { ...prev, price: cleanValue };
                          if (!leaveInitialEmpty && !initialManuallyEditedRef.current) next.initial = autoInitial;
                          return next;
                        });
                      }}
                      className="flex-1 min-w-0 px-4 py-3 bg-transparent focus:outline-none font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                      placeholder="0.00"
                      required
                      disabled={isLocked}
                    />
                    <div className="bg-slate-50 flex p-1 items-center border-l border-slate-200 shrink-0">
                      <div className="flex p-0.5 rounded-lg bg-slate-200/50">
                        {selectedCurrencies.map((c) => (
                          <button
                            key={c}
                            type="button"
                            disabled={isLocked}
                            onClick={() => setCurrency(c)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-black transition-all ${currency === c ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 border border-transparent'}`}
                          >
                            {getSymbol(c)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* INICIAL */}
                <div className={isLocked ? "opacity-60 pointer-events-none grayscale-[0.5] flex flex-col group" : "flex flex-col group"}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-500">Inicial</label>
                  <div className={`flex relative items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 transition-all ${isLocked ? 'bg-slate-50' : 'bg-white'}`}>
                    <input
                      type="text"
                      ref={initialInputRef}
                      value={formatWithCommas(prices.initial)}
                      onChange={(e) => {
                        initialManuallyEditedRef.current = true;
                        const cleanValue = parseCommaNumber(e.target.value);
                        pendingCursorRef.current.initial = cursorPosAfterFormat(e.target.value, e.target.selectionStart, formatWithCommas(cleanValue));
                        setPrices(prev => ({ ...prev, initial: cleanValue }));
                      }}
                      className="flex-1 min-w-0 px-4 py-3 bg-transparent focus:outline-none font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                      placeholder="0.00"
                      disabled={isLocked || leaveInitialEmpty}
                    />
                    <div className="bg-slate-50 flex p-1 items-center border-l border-slate-200 shrink-0">
                      <div className="flex p-0.5 rounded-lg bg-slate-200/50">
                        {selectedCurrencies.map((c) => (
                          <button
                            key={c}
                            type="button"
                            disabled={isLocked}
                            onClick={() => setDownPaymentCurrency(c)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-black transition-all ${downPaymentCurrency === c ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 border border-transparent'}`}
                          >
                            {getSymbol(c)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-2 ml-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={leaveInitialEmpty}
                      disabled={isLocked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setLeaveInitialEmpty(checked);
                        if (checked) {
                          initialManuallyEditedRef.current = true;
                          setPrices(prev => ({ ...prev, initial: '' }));
                        } else {
                          initialManuallyEditedRef.current = false;
                          const autoPct = (rateConfig?.autoInitialPct ?? DEFAULT_AUTO_INITIAL_PCT) / 100;
                          setPrices(prev => {
                            if (prev.initial) return prev;
                            const priceNum = Number(prev.price) || 0;
                            if (priceNum <= 0) return prev;
                            if (rateConfig) {
                              const priceInPrimary = convertAmount(priceNum, currency, rateConfig.primary, rateConfig.ratesToPrimary);
                              if (downPaymentCurrency !== rateConfig.primary) setDownPaymentCurrency(rateConfig.primary);
                              return { ...prev, initial: String(Math.round(priceInPrimary * autoPct)) };
                            }
                            return { ...prev, initial: String(Math.round(priceNum * autoPct)) };
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-red-600"
                    />
                    <span className="text-[10px] font-bold text-slate-400">¿Dejar el inicial vacío?</span>
                  </label>
                </div>

                {/* ESTADO */}
                {/* ESTADO-PREMIUM SELECTOR */}
                <div className="md:col-span-1 group">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-500">Estado del Vehículo</label>
                  <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                    {[
                      { value: 'available', label: 'Disponible', color: 'bg-red-500', text: 'text-red-600', border: 'border-transparent', bg: 'bg-red-50' },
                      { value: 'quoted', label: 'Cotizado', color: 'bg-gradient-to-r from-yellow-400 to-amber-500', text: 'text-amber-950', border: 'border-amber-200', bg: 'bg-amber-100' },
                      { value: 'sold', label: 'Vendido', color: 'bg-slate-400', text: 'text-slate-600', border: 'border-transparent', bg: 'bg-slate-200' }
                    ].map((option) => {
                      const isActive = (initialData?.status || 'available') === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setStatus(option.value);
                          }}
                          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 rounded-lg ${status === option.value
                            ? `bg-white shadow-md ${option.text} scale-100`
                            : 'text-slate-400 hover:bg-white/50 hover:text-slate-500 border border-transparent'
                            }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full mb-1 ${status === option.value ? option.color : 'bg-slate-300'}`} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <input type="hidden" name="status" value={status} />
                </div>
              </div>
            </div>

            {/* IMÁGENES */}
            <div className={`md:col-span-2 space-y-4 ${isLocked ? "opacity-60 pointer-events-none grayscale-[0.5]" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <Camera size={16} className="text-red-500" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Galería de Imágenes</h3>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => document.getElementById('image-upload').click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-red-400 hover:bg-red-50 transition-all group bg-slate-50/20"
                >
                  <div className="p-2 bg-slate-50 rounded-full group-hover:bg-white transition-colors">
                    {loading ? <Loader2 size={20} className="animate-spin text-slate-400" /> : <Plus size={20} className="text-slate-400 group-hover:text-red-500" />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-red-500 text-center px-1">Subir Fotos</span>
                </button>
                <input
                  id="image-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isLocked}
                />

                {photos.map((photo, index) => (
                  <div
                    key={index}
                    draggable={!isLocked}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`relative aspect-square rounded-2xl overflow-hidden group border shadow-sm bg-white cursor-move transition-transform ${draggedPhotoIndex === index ? 'opacity-50 scale-95 border-red-500' : 'border-slate-100 hover:scale-[1.02]'}`}
                  >
                    <img src={photo.url} alt={`Upload ${index}`} className="w-full h-full object-cover pointer-events-none" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                      <div className="flex justify-between">
                        {index > 0 ? (
                          <button type="button" onClick={() => movePhoto(index, -1)} className="p-1 bg-white/20 hover:bg-white text-white hover:text-red-600 rounded backdrop-blur-sm transition-colors"><ChevronLeft size={14} /></button>
                        ) : <div />}
                        {index < photos.length - 1 ? (
                          <button type="button" onClick={() => movePhoto(index, 1)} className="p-1 bg-white/20 hover:bg-white text-white hover:text-red-600 rounded backdrop-blur-sm transition-colors"><ChevronRight size={14} /></button>
                        ) : <div />}
                      </div>
                      <div className="flex justify-center gap-1 mb-2">
                        <button type="button" onClick={() => removeImage(index)} title="Eliminar foto" className="p-1.5 bg-red-600 text-white rounded-full hover:scale-110 transition-transform shadow-lg"><X size={12} /></button>
                        {index !== 0 && <button type="button" onClick={() => setAsCover(index)} title="Hacer Portada" className="p-1.5 bg-emerald-500 text-white rounded-full hover:scale-110 transition-transform shadow-lg"><Check size={12} /></button>}
                      </div>
                    </div>
                    {index === 0 && <span className="absolute bottom-0 left-0 right-0 bg-emerald-500 text-white text-[8px] font-black text-center py-0.5 uppercase tracking-widest">Portada</span>}
                  </div>
                ))}
              </div>
              {photoError && (
                <p className="text-xs font-bold text-red-600 mt-1">{photoError}</p>
              )}

              {/* OPTIMIZACIÓN DE FOTOS */}
              {isOptimizing && photoProgress.total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Loader2 size={14} className="animate-spin" />
                      Optimizando fotos…
                    </span>
                    <span className="text-xs font-black text-slate-600 tabular-nums">
                      {photoProgress.done} / {photoProgress.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((photoProgress.done / photoProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* PROGRESS BAR */}
              {uploadProgress && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 animate-pulse">
                  <Loader2 size={14} className="animate-spin" /> {uploadProgress}
                </div>
              )}

              {/* LINK EXTERNO */}
              <div
                className="relative rounded-3xl overflow-hidden mt-4"
                style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.04) 50%, rgba(0,0,0,0.08) 100%)', border: '1.5px solid rgba(220,38,38,0.25)' }}
              >
                {/* Glow accent */}
                <div className="absolute top-0 left-0 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)', transform: 'translate(-30%, -30%)' }} />

                <div className="relative p-6">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-xl bg-red-600 shadow-lg shadow-red-600/30">
                      <Link size={14} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-red-500 leading-none">
                        Link de Fotos
                      </h3>
                      <p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        Instagram, Google Drive, etc. — el bot lo comparte en vez del catálogo
                      </p>
                    </div>
                  </div>

                  {/* Input */}
                  <input
                    type="url"
                    value={linkExterno}
                    onChange={e => setLinkExterno(e.target.value)}
                    disabled={isLocked}
                    placeholder="https://instagram.com/p/…"
                    className="w-full px-4 py-3 rounded-2xl font-bold text-sm focus:outline-none transition-all disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderWidth: '2px',
                      borderColor: 'var(--input-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Spacer for mobile safe area */}
            <div className="h-24 md:h-0"></div>
          </form>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 sm:p-6 border-t border-slate-100 bg-white sticky bottom-0 z-20 flex gap-3 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
          <button
            type="button"
            onClick={onClose}
            className="hidden sm:block px-6 py-3 font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <Button
            type="submit"
            form="vehicle-main-form"
            disabled={loading}
            className="flex-1 py-4 text-sm sm:text-base bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-600/20 hover:shadow-red-600/30"
          >
            {loading ? <><Loader2 className="animate-spin mr-2" /> Guardando...</> : <><Save size={20} /> Guardar Vehículo</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

const QuoteModal = ({ isOpen, onClose, vehicle, onConfirm, userProfile, templates = [] }) => {
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [cedula, setCedula] = useState('');
  const [price, setPrice] = useState(vehicle?.price || '');

  // Get first quote template if available
  const quoteTemplates = useMemo(() => templates.filter(t => t.category === 'quote'), [templates]);
  const defaultTemplate = quoteTemplates[0] || null;

  // Reset price when vehicle changes
  useEffect(() => {
    if (vehicle) {
      // Priorizar precio en DOP (pesos), luego el base (que suele ser USD)
      const autoPrice = vehicle.price_dop > 0 ? vehicle.price_dop : (vehicle.price || '');
      setPrice(autoPrice);
    }
  }, [vehicle]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. Tu enlace (El que termina en dd14)
    const baseUrl = "https://services.leadconnectorhq.com/hooks/5YBWavjywU0Ay0Y85R9p/webhook-trigger/c3456437-ef2d-4ed8-b6da-61235568dd14";

    const form = e.target;
    // Usamos elements para evitar conflictos con propiedades reservadas como .name
    const firstName = form.elements.name ? form.elements.name.value : '';
    const lastName = form.elements.lastname ? form.elements.lastname.value : '';
    const tel = form.elements.phone ? form.elements.phone.value : '';

    // 2. Preparamos los datos para el webhook
    const params = new URLSearchParams();
    params.append("firstName", firstName);
    params.append("lastName", lastName);
    params.append("phone", tel);
    params.append("vehicle", `${vehicle.make} ${vehicle.model} ${vehicle.year}`);
    params.append("price", price);
    params.append("source", "App CarBot");

    const quoteData = {
      name: firstName,
      lastname: lastName,
      phone: tel,
      cedula: cedula,
      price: price,
      bank: bankName,
      vehicleId: vehicle.id,
      vehicle: `${vehicle.make} ${vehicle.model}`,
      // Additional vehicle fields for template replacement
      year: vehicle.year || '',
      color: vehicle.color || '',
      version: vehicle.version || '',
      vin: vehicle.vin || '',
      mileage: vehicle.mileage || '',
      fuel: vehicle.fuel || '',
      transmission: vehicle.transmission || '',
      drivetrain: vehicle.drivetrain || '',
      passengers: vehicle.passengers || '',
      // Template data
      template: defaultTemplate?.name || null,
      templateId: defaultTemplate?.id || null,
      templateContent: defaultTemplate?.content || null,
      category: 'quote',
      createdAt: new Date().toISOString()
    };

    const finalUrl = `${baseUrl}?${params.toString()}`;

    // 4. EL TRUCO DEL PIXEL
    const pixel = new Image();
    pixel.src = finalUrl;

    // Simulamos éxito inmediato
    setTimeout(() => {
      onConfirm(quoteData);
      setLoading(false);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/20 transition-opacity duration-300">
      <div className="w-full h-full sm:h-auto sm:max-w-md animate-in zoom-in-95 duration-200">
        <Card className="h-full sm:h-auto rounded-none sm:rounded-[24px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center">
              <div className="p-2 bg-red-50 rounded-lg mr-3"><Send size={18} className="text-red-600" /></div>
              Cotizar: {userProfile?.dealerName}
            </h3>
            <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500 transition-colors" /></button>
          </div>
          <form onSubmit={handleSend}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input name="name" label="Nombre Cliente" placeholder="Ej. Juan" required />
              <Input name="lastname" label="Apellido" placeholder="Ej. Pérez" required />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input name="phone" label="Teléfono" placeholder="+1 829..." required />
              <Input name="cedula" label="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input label="Precio de Venta" type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
              <Input label="Banco Dirigido" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Ej. Banco Popular" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
              <Button type="submit" disabled={loading} className="bg-red-600 text-white hover:bg-red-700">Enviar Cotización</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

const GenerateQuoteModal = ({ isOpen, onClose, inventory, onSave, templates = [], showToast, initialData }) => {
  const { t } = useI18n();
  const { selected: selectedCurrencies, getSymbol } = useCurrency();
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [name, setName] = useState('');
  const [lastname, setLastname] = useState('');
  const [phone, setPhone] = useState('');
  const [cedula, setCedula] = useState('');
  const [email, setEmail] = useState('');
  const [bank, setBank] = useState('');
  const [price, setPrice] = useState('');
  const [inicial, setInicial] = useState('');
  const [priceCurrency, setPriceCurrency] = useState('USD');
  const [inicialCurrency, setInicialCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [successData, setSuccessData] = useState(null);

  // Pre-fill if initialData is provided
  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || initialData.cliente?.split(' ')[0] || '');
      setLastname(initialData.lastname || initialData.cliente?.split(' ').slice(1).join(' ') || '');
      setPhone(initialData.phone || '');
      setCedula(initialData.cedula || '');
      setEmail(initialData.email || '');
      setBank(initialData.bank || '');
      setPrice(initialData.price || '');
      setInicial(initialData.inicial || initialData.downPayment || '');
      setPriceCurrency(initialData.priceCurrency || initialData.currency || 'USD');
      setInicialCurrency(initialData.inicialCurrency || initialData.downPaymentCurrency || 'USD');
      setSelectedVehicleId(initialData.vehicleId || '');
      setSelectedTemplateId(initialData.templateId || '');
    }
  }, [isOpen, initialData]);

  // Filter for quote templates
  const quoteTemplates = useMemo(() => templates.filter(t => t.category === 'quote'), [templates]);

  // Auto-fill price when vehicle selected
  useEffect(() => {
    if (selectedVehicleId) {
      // Loose equality to handle potential type mismatch
      const v = inventory.find(i => String(i.id) === String(selectedVehicleId));
      if (v) {
        const autoPrice = v.price_dop > 0 ? v.price_dop : (v.price || '');
        setPrice(autoPrice);
      }
    }
  }, [selectedVehicleId, inventory]);

  // Auto-select first quote template if available and none selected
  useEffect(() => {
    if (quoteTemplates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(quoteTemplates[0].id);
    }
  }, [quoteTemplates, selectedTemplateId]);

  if (!isOpen) return null;

  const availableVehicles = inventory.filter(v => v.status !== 'sold');

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    // VALIDACIÓN MANUAL EXPLICITA
    if (!selectedVehicleId) {
      if (showToast) showToast(t('toast_error_select_vehicle'), "error");
      return;
    }
    if (!name || !lastname) {
      if (showToast) showToast(t('toast_error_required_name'), "error");
      return;
    }
    if (!phone) {
      if (showToast) showToast(t('toast_error_required_phone'), "error");
      return;
    }
    if (!price || price <= 0) {
      if (showToast) showToast(t('toast_error_required_price'), "error");
      return;
    }

    setLoading(true);
    const vehicle = inventory.find(v => String(v.id) === String(selectedVehicleId));
    if (!vehicle) {
      if (showToast) showToast(t('toast_error_vehicle_not_found'), "error");
      setLoading(false);
      return;
    }

    // Find selected template data
    const templateObj = templates.find(t => t.id === selectedTemplateId);

    setTimeout(() => {
      onSave({
        name,
        lastname,
        phone,
        cedula,
        email,
        bank,
        price,
        inicial,
        priceCurrency,
        inicialCurrency,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        vehicleId: vehicle.id,
        year: vehicle.year || '',
        color: vehicle.color || '',
        version: vehicle.version || '',
        vin: vehicle.vin || '',
        mileage: vehicle.mileage || '',
        fuel: vehicle.fuel || '',
        transmission: vehicle.transmission || '',
        drivetrain: vehicle.drivetrain || '',
        passengers: vehicle.passengers || '',
        template: templateObj?.name || null,
        templateId: templateObj?.id || null,
        templateContent: templateObj?.content || null,
        category: 'quote',
        createdAt: new Date().toISOString()
      });

      // Success Data for celebration
      setSuccessData({
        clientName: `${name} ${lastname}`,
        vehicleYear: vehicle.year || '',
        vehicleMake: vehicle.make || '',
        vehicleModel: vehicle.model || '',
        vehicleTrim: vehicle.trim || vehicle.version || '',
        vehicleColor: vehicle.color || '',
        vehicleVinLast4: (vehicle.vin || '').slice(-4),
        documentType: 'Cotización'
      });

      // Confetti
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };
      const randomInRange = (min, max) => Math.random() * (max - min) + min;

      const interval = setInterval(function () {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
      }, 250);

      setLoading(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/20 transition-opacity duration-300">
      <div className="w-full h-full sm:h-auto sm:max-w-4xl animate-in zoom-in-95 duration-200 relative">
        {/* LOADING OVERLAY */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-white rounded-none sm:rounded-[24px] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300 shadow-2xl">
            <div className="mb-8 animate-bounce">
              <AppLogo size={120} className="drop-shadow-2xl" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Preparando Cotización...</h3>
            <p className="text-base text-slate-400 font-bold mb-10">Generando documento premium</p>
            <div className="w-full max-w-[300px] h-3 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
              <div className="h-full bg-gradient-to-r from-red-500 via-red-400 to-red-600 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          </div>
        )}

        {/* SUCCESS OVERLAY */}
        {successData && (
          <div className="absolute inset-0 z-[60] bg-white rounded-none sm:rounded-[24px] flex flex-col items-center justify-center p-6 sm:p-10 text-center animate-in zoom-in-95 duration-500 shadow-2xl overflow-y-auto">
            <div className="mb-6 scale-110">
              <AppLogo size={140} className="drop-shadow-xl" />
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-2 uppercase tracking-tight">FELICIDADES</h2>
            <div className="text-slate-500 font-black text-xs uppercase tracking-[0.2em] mb-8">Acabas de generar una nueva cotización para:</div>

            <div className="w-full max-w-xl bg-slate-50 p-8 sm:p-12 rounded-[40px] border-2 border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] mb-10 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>
              <h3 className="text-3xl sm:text-5xl font-black text-red-600 uppercase mb-6 leading-none tracking-tighter">{successData.clientName}</h3>
              <div className="space-y-2">
                <div className="text-lg sm:text-2xl font-black text-slate-800 uppercase tracking-tight">{successData.vehicleYear} {successData.vehicleMake} {successData.vehicleModel}</div>
                <div className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-[0.15em]">{successData.vehicleTrim} • {successData.vehicleColor}</div>
                <div className="inline-block mt-4 px-4 py-1.5 bg-slate-200/50 rounded-full text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">VIN: {successData.vehicleVinLast4}</div>
              </div>
            </div>

            <Button onClick={onClose} className="w-full max-w-sm bg-slate-900 hover:bg-black text-white font-black py-5 px-8 text-sm rounded-[20px] shadow-xl uppercase tracking-widest border-none">
              {t('close_window')}
            </Button>
          </div>
        )}

        <Card className="h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-[24px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center">
              <div className="p-2 bg-red-50 rounded-lg mr-3"><Send size={20} className="text-red-600" /></div>
              {t('manual_quote')}
            </h3>
            <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500 transition-colors" /></button>
          </div>

          <div className="space-y-6">
            {/* 1. SELECCION VEHICULO */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Car size={16} /> 1. Vehículo de Interés</label>
              {(() => {
                const displayVehicle = selectedVehicleId ? availableVehicles.find(v => String(v.id) === String(selectedVehicleId)) : null;

                if (displayVehicle) {
                  return (
                    <div className="relative flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl transition-all">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Lock size={18} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0 pr-20">
                        <p className="text-lg font-black text-emerald-800 uppercase tracking-wide truncate">
                          {displayVehicle.make || displayVehicle.marca} {displayVehicle.model || displayVehicle.modelo} ({displayVehicle.year || displayVehicle.ano})
                        </p>
                        <p className="text-sm font-bold text-emerald-600">
                          {formatVehiclePrice(displayVehicle)} • {displayVehicle.color || 'N/A'}
                        </p>
                      </div>
                      <button onClick={() => setSelectedVehicleId("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white bg-slate-900 hover:bg-red-600 px-4 py-2 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-slate-900/10 active:scale-95">
                        Cambiar
                      </button>
                    </div>
                  );
                }

                return (
                  <select
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-bold text-slate-700 uppercase"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="">-- Seleccionar vehículo --</option>
                    {availableVehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.make} {v.model} ({v.year}) - {formatVehiclePrice(v)}</option>
                    ))}
                  </select>
                );
              })()}
            </div>

            {/* 2. PLANTILLA */}
            {quoteTemplates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><FilePlus size={16} /> 2. Plantilla de Cotización</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {quoteTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${selectedTemplateId === t.id ? 'bg-red-50 border-red-500 text-red-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* 3. DATOS PROSPECTO */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2"><User size={16} /> 3. Datos del Prospecto</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <Input label="Nombre" placeholder="Ej. Juan" value={name} onChange={(e) => setName(e.target.value)} />
                  <Input label="Apellido" placeholder="Ej. Pérez" value={lastname} onChange={(e) => setLastname(e.target.value)} />
                  <Input label="Cédula / Pasaporte" placeholder="001-0000000-0" value={cedula} onChange={(e) => setCedula(e.target.value)} />
                  <Input label="Teléfono" placeholder="809-555-5555" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <Input label="Email" type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              {/* 4. TERMINOS FINANCIEROS */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2"><DollarSign size={16} /> 4. Términos Financieros</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input label="Banco / Financiera" placeholder="Ej. Banco Popular" value={bank} onChange={(e) => setBank(e.target.value)} />
                  <div className="flex flex-col">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 ml-1">Precio Final de Venta</label>
                    <div className="flex items-stretch rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 bg-white shadow-sm">
                      <input type="text" value={price ? Number(price).toLocaleString() : ''} onChange={(e) => setPrice(e.target.value.replace(/,/g, ''))} className="flex-1 min-w-0 px-3 py-2.5 bg-transparent focus:outline-none font-bold text-slate-800 text-sm" placeholder="850,000" />
                      <div className="bg-slate-50 flex items-center border-l border-slate-200 shrink-0">
                        {CURRENCY_CODES.map(c => (
                          <button key={c} type="button" onClick={() => setPriceCurrency(c)} className={`px-3 py-2.5 text-[10px] font-black transition-colors ${priceCurrency === c ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>{getSymbol(c)}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 ml-1">Inicial / Avance</label>
                    <div className="flex items-stretch rounded-xl overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500 bg-white shadow-sm">
                      <input type="text" value={inicial ? Number(inicial).toLocaleString() : ''} onChange={(e) => setInicial(e.target.value.replace(/,/g, ''))} className="flex-1 min-w-0 px-3 py-2.5 bg-transparent focus:outline-none font-bold text-slate-800 text-sm" placeholder="100,000" />
                      <div className="bg-slate-50 flex items-center border-l border-slate-200 shrink-0">
                        {CURRENCY_CODES.map(c => (
                          <button key={c} type="button" onClick={() => setInicialCurrency(c)} className={`px-3 py-2.5 text-[10px] font-black transition-colors ${inicialCurrency === c ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>{getSymbol(c)}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
              <Button type="button" onClick={handleSubmit} disabled={loading} className="bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200">
                {loading ? t('saving') : t('save_quote')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const GenerateContractModal = ({ isOpen, onClose, inventory, onGenerate, templates = [], initialVehicle, showToast, userProfile, initialDocumentType = 'contrato', resolvedDealerId, ghlContacts = [] }) => {
  const { t } = useI18n();
  const { selected: selectedCurrencies, getSymbol } = useCurrency();
  const [selectedTemplates, setSelectedTemplates] = useState([]); // Ahora es array
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialVehicle ? initialVehicle.vehicleId || initialVehicle.id : '');
  const [clientName, setClientName] = useState('');
  const [clientLastName, setClientLastName] = useState('');
  const [clientCedula, setClientCedula] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [priceCurrency, setPriceCurrency] = useState('USD');
  const [inicialCurrency, setInicialCurrency] = useState('USD');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [warrantyValue, setWarrantyValue] = useState(12);
  const [warrantyUnit, setWarrantyUnit] = useState('meses');
  const [loading, setLoading] = useState(false);
  const [ghlTemplates, setGhlTemplates] = useState([]);
  const [ghlToken, setGhlToken] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const persistedRef = useRef(false); // evita doble persistencia (generar + cerrar)
  const documentType = initialDocumentType; // Viene del modal de acción: 'cotizacion' | 'contrato'



  // ── Vehicle dropdown ──
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const vehicleDropdownRef = useRef(null);

  // Close vehicle dropdown on outside click
  useEffect(() => {
    if (!vehicleDropdownOpen) return;
    function handler(e) {
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target)) {
        setVehicleDropdownOpen(false);
        setVehicleSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vehicleDropdownOpen]);

  // ── Contact autocomplete ──
  const [contactSuggestions, setContactSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const suggestionsRef = React.useRef(null);
  const contactSearchDebounceRef = React.useRef(null);

  // Search contacts via server-side API (searches ALL contacts, not just loaded ones)
  function searchContacts(query) {
    if (contactSearchDebounceRef.current) clearTimeout(contactSearchDebounceRef.current);
    if (!query || query.trim().length < 2) {
      setContactSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    contactSearchDebounceRef.current = setTimeout(async () => {
      const dealerUuid = userProfile?.supabaseDealerId || userProfile?.dealerId;
      if (!dealerUuid) return;
      setContactSearchLoading(true);
      try {
        const r = await fetch(`/api/ghlContacts?dealerId=${dealerUuid}&limit=8&query=${encodeURIComponent(query.trim())}`);
        if (!r.ok) throw new Error('search failed');
        const data = await r.json();
        const results = data.contacts || [];
        setContactSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setContactSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setContactSearchLoading(false);
      }
    }, 350);
  }

  function applyContact(c) {
    setClientName((c.firstName || '').toUpperCase());
    setClientLastName((c.lastName || '').toUpperCase());
    setClientPhone(c.phone || '');
    setClientEmail(c.email || '');
    // Extract cedula — check annotated fieldKey (set by Cloud Function) with same keywords as ContactsView
    const CEDULA_KW = ['cedula', 'c_dula', 'cdula', 'cedula_pasaporte', 'identification', 'id_number', 'pasaporte', 'passport', 'documento', 'dni'];
    const cf = c.customFields || [];
    for (const f of cf) {
      if (!f.value) continue;
      const k = (f.fieldKey || f.key || f.id || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_');
      if (CEDULA_KW.some(kw => k === kw || k.includes(kw))) {
        setClientCedula(f.value);
        break;
      }
    }
    setShowSuggestions(false);
    setContactSuggestions([]);
  }

  // Close suggestions on outside click
  React.useEffect(() => {
    function handleClickOutside(e) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && userProfile?.dealerId) {
      const fetchTemplates = async () => {
        setLoading(true);
        try {
          let token = '';
          let locId = '';

          const dealerIdToFetch = resolvedDealerId || userProfile?.supabaseDealerId || userProfile?.dealerId;
          if (dealerIdToFetch) {
            const { data: dealerData, error: dealerError } = await supabase
              .from('dealers')
              .select('ghl_access_token, ghl_location_id')
              .eq('id', dealerIdToFetch)
              .single();

            if (!dealerError && dealerData) {
              token = dealerData.ghl_access_token || userProfile?.ghl_access_token || '';
              locId = dealerData.ghl_location_id || userProfile?.ghlLocationId || '';
            } else {
              token = userProfile?.ghl_access_token || '';
              locId = userProfile?.ghlLocationId || '';
            }
          } else {
            token = userProfile?.ghl_access_token || '';
            locId = userProfile?.ghlLocationId || '';
          }

          setGhlToken(token);

          const params = new URLSearchParams({
            dealerId: resolvedDealerId || userProfile?.dealerId || '',
            locationId: locId || userProfile?.ghlLocationId || ''
          });

          if (token) {
            params.append('ghl_access_token', token);
          }

          const res = await fetch(`/api/ghl/templates?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            setGhlTemplates(data);
          } else {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || errData.message || "Error al obtener plantillas de CarBotSystem (" + res.status + ")");
          }
        } catch (error) {
          console.error("Error loading GHL templates:", error);
          if (showToast) {
            showToast(`Error cargando plantillas CarBotSystem: ${error.message}`, "error");
          }
        } finally {
          setLoading(false);
        }
      };
      fetchTemplates();
    }
  }, [isOpen, userProfile?.dealerId, userProfile?.supabaseDealerId, resolvedDealerId]);

  useEffect(() => {
    if (initialVehicle) {
      // When coming from Contacts ("Vender nuevo auto"), initialVehicle only has contact fields — no vehicleId
      if (!initialVehicle.isContactData) {
        setSelectedVehicleId(initialVehicle.vehicleId || initialVehicle.id);
      } else {
        setSelectedVehicleId('');
      }

      // Handle client name/lastname more robustly
      if (initialVehicle.client) {
        const parts = initialVehicle.client.trim().toUpperCase().split(' ');
        if (parts.length > 1) {
          setClientName(parts[0]);
          setClientLastName(parts.slice(1).join(' '));
        } else {
          setClientName(parts[0] || '');
          setClientLastName('');
        }
      } else {
        setClientName((initialVehicle.name || initialVehicle.first_name || '').toUpperCase());
        setClientLastName((initialVehicle.lastname || initialVehicle.last_name || '').toUpperCase());
      }

      setClientCedula(initialVehicle.cedula || initialVehicle.id_number || '');
      setClientPhone(String(initialVehicle.phone || initialVehicle.tel || ''));
      setClientEmail(initialVehicle.email || initialVehicle.mail || '');
      setBankName(initialVehicle.bankName || initialVehicle.bank || initialVehicle.banco || '');
      setWarrantyValue(Number(initialVehicle.warrantyValue || initialVehicle.tiempo_garantia_valor) || 12);
      setWarrantyUnit(initialVehicle.warrantyUnit || initialVehicle.tiempo_garantia_unidad || 'meses');

      // Auto-fill price/downPayment from initial data or the vehicle in inventory
      const v = inventory.find(i => String(i.id) === String(initialVehicle.vehicleId || initialVehicle.id));
      const vPrice = v ? (v.price_dop > 0 ? v.price_dop : (v.price || 0)) : 0;
      const vInitial = v ? (v.initial_payment_dop > 0 ? v.initial_payment_dop : (v.initial_payment || 0)) : 0;

      // Use values from initialVehicle (quote) if present, otherwise from inventory vehicle
      const qPrice = initialVehicle.finalPrice || initialVehicle.precioFinal || initialVehicle.price || initialVehicle.precio;
      const qInitial = initialVehicle.downPayment || initialVehicle.initial_payment || initialVehicle.inicial || initialVehicle.pago_inicial;

      setFinalPrice(qPrice || vPrice || '');
      setDownPayment(qInitial || vInitial || '');

      setPriceCurrency(initialVehicle.monedaVenta || initialVehicle.currency || initialVehicle.moneda || v?.currency || 'USD');
      setInicialCurrency(initialVehicle.monedaInicial || initialVehicle.downPaymentCurrency || initialVehicle.moneda_inicial || v?.downPaymentCurrency || 'USD');

      // Auto-select template if specified
      const tName = initialVehicle.template || initialVehicle.plantilla;
      const template = templates.find(t => t.name === tName || t.id === initialVehicle.templateId);
      if (template) setSelectedTemplates([template.id]);
    } else {
      setSelectedTemplates([]);
      setSelectedVehicleId('');
      setClientName('');
      setClientLastName('');
      setClientPhone('');
      setClientEmail('');
      setClientCedula('');
      setBankName('');
      setWarrantyValue(12);
      setWarrantyUnit('meses');
      setFinalPrice('');
      setDownPayment('');
      setSuccessData(null);
      setSubmitted(false);
    }
  }, [initialVehicle, isOpen, inventory, templates]);

  // When vehicle selected, auto-fill price if empty and NOT editing (or coming from contact)
  useEffect(() => {
    if (selectedVehicleId && (!initialVehicle || initialVehicle?.isContactData)) {
      const v = inventory.find(i => i.id === selectedVehicleId);
      if (v) {
        setFinalPrice(v.price_dop > 0 ? v.price_dop : (v.price || 0));
        setDownPayment(v.initial_payment_dop > 0 ? v.initial_payment_dop : (v.initial_payment || 0));
        setPriceCurrency(v.currency || 'USD');
        setInicialCurrency(v.downPaymentCurrency || 'USD');
      }
    }
  }, [selectedVehicleId, inventory, initialVehicle]);

  if (!isOpen) return null;

  const availableVehicles = inventory.filter(v => v.status !== 'sold' || (initialVehicle && v.id === initialVehicle.id));

  const toggleTemplate = (tId) => {
    if (selectedTemplates.includes(tId)) {
      setSelectedTemplates(prev => prev.filter(id => id !== tId));
    } else {
      setSelectedTemplates(prev => [...prev, tId]);
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading || submitted) return; // Prevent double execution
    setSubmitted(true);
    // VALIDACIÓN MANUAL EXPLICITA
    if (!selectedVehicleId) {
      showToast(t('toast_error_select_vehicle'), "error");
      return;
    }
    if (selectedTemplates.length === 0) {
      showToast(t('toast_error_select_documents'), "error");
      return;
    }
    if (!clientName || !clientLastName || !clientCedula || !clientPhone || !clientEmail || !finalPrice || finalPrice <= 0) {
      showToast(t('toast_error_complete_fields'), "error");
      return;
    }

    setLoading(true);
    try {
      console.log("Submit Document Generation:", { selectedVehicleId, selectedTemplates });

      // Usamos loose equality (==) por si el ID es numérico en inventory pero string en selectedVehicleId
      const vehicle = inventory.find(v => String(v.id) === String(selectedVehicleId));
      if (!vehicle) throw new Error("Vehículo no encontrado en el inventario actual");

      const warrantyUnitLabel = { dias: warrantyValue === 1 ? 'Día' : 'Días', meses: warrantyValue === 1 ? 'Mes' : 'Meses', anos: warrantyValue === 1 ? 'Año' : 'Años' }[warrantyUnit] || 'Meses';

      const cliente = {
        nombre: clientName,
        apellido: clientLastName,
        telefono: clientPhone,
        email: clientEmail,
        cedula: clientCedula,
        banco: bankName,
        precioFinal: finalPrice,
        inicial: downPayment,
        monedaVenta: priceCurrency,
        monedaInicial: inicialCurrency,
        tiempoGarantia: `${warrantyValue} ${warrantyUnitLabel}`
      };

      // GHL Location ID resolution
      const locationId = userProfile?.ghlLocationId || resolvedDealerId || userProfile?.dealerId || 'DURAN-FERNANDEZ-AUTO-SRL';

      // Validar Email (stricter regex)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (clientEmail && !emailRegex.test(clientEmail)) {
        throw new Error("Por favor ingresa un email válido (ejemplo@dominio.com).");
      }

      console.log(`🚀 Generando contrato(s) en GHL para: ${clientName} ${clientLastName}`);

      const results = [];
      const errors = [];
      for (const templateId of selectedTemplates) {
        try {
          const docResult = await generarContratoEnGHL(cliente, vehicle, locationId, templateId, resolvedDealerId || userProfile?.dealerId, ghlToken, documentType);
          results.push(docResult);
        } catch (e) {
          console.error(`⚠️ Error GHL Generate para template ${templateId}:`, e);
          errors.push(e.message || "Error GHL");
        }
      }

      // 1. Mostrar éxito — el PDF ya puede estar en Supabase si el backend lo procesó
      if (results.length > 0) {
        const fullClientName = `${clientName} ${clientLastName}`.trim();
        const firstResult = results[0];

        setSuccessData({
          clientName: fullClientName,
          vehicleDamages: vehicle.condition || vehicle.condicion || 'Sin daños',
          vehicleYear: vehicle.year || '',
          vehicleMake: vehicle.make || '',
          vehicleModel: vehicle.model || '',
          vehicleTrim: vehicle.trim || vehicle.edition || '',
          vehicleColor: vehicle.color || '',
          vehicleVinLast4: (vehicle.vin || vehicle.chasis_vin || vehicle.chasis || '').slice(-4),
          documentUrls: results.map(r => r?.documentUrl || r),
        });


        // Trigger confetti gigante
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

        function randomInRange(min, max) {
          return Math.random() * (max - min) + min;
        }

        const interval = setInterval(function () {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
          confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);

        showToast(`${results.length} documento(s) generado(s) con éxito en CarBotSystem`, "success");
      }

      if (errors.length > 0) {
        showToast(`Se guardó el contrato localmente. Problema en CarBotSystem: ${errors[0]}`, "warning");
      }

      // PERSISTENCIA INMEDIATA: guardar el documento + marcar el vehículo como
      // Vendido/Cotizado en cuanto la generación es exitosa, NO al cerrar el modal.
      // (Antes se posponía al botón "Cerrar"; en móvil, cerrar con la X o salir tras
      //  "Ver Documento" dejaba la venta sin guardar.)
      if (results.length > 0 && onGenerate && !persistedRef.current) {
        persistedRef.current = true;
        onGenerate({
          vehicleId: selectedVehicleId,
          documentType,
          clientData: { name: clientName, lastName: clientLastName, cedula: clientCedula, phone: clientPhone, email: clientEmail },
          templateIds: selectedTemplates,
          bankName,
          warrantyValue,
          warrantyUnit,
          finalPrice: finalPrice,
          ghlDocumentUrls: results.map(r => r?.documentUrl || r),
        });
      }

      if (results.length === 0) {
        onClose();
      }
    } catch (error) {
      console.error("❌ Error GHL integration:", error);
      showToast(`Error: ${error.message}`, "error");
      setLoading(false);
    } finally {
      // Only turn off loading — success screen will show if successData is set
      setLoading(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div className="w-full h-full sm:h-auto sm:max-w-3xl animate-in zoom-in-95 duration-200 relative">
        {/* LOADING OVERLAY — Estilo Premium */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-white rounded-none sm:rounded-[24px] flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-300 shadow-2xl">
            <style>{`
              @keyframes bounce-subtle {
                0%, 100% { transform: translateY(0) scale(1.05); }
                50% { transform: translateY(-15px) scale(0.95); }
              }
              @keyframes shimmer-fast {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
              }
            `}</style>
            <div className="mb-8" style={{ animation: 'bounce-subtle 2s ease-in-out infinite' }}>
              <AppLogo size={120} className="drop-shadow-2xl" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Generando Documento...</h3>
            <p className="text-base text-slate-400 font-bold mb-10">Conectando con CarBotSystem AI</p>

            {/* Progress bar animada con Shimmer */}
            <div className="w-full max-w-[300px] h-3 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-red-400 to-red-600 rounded-full"
                style={{
                  width: '100%',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer-fast 1.5s linear infinite'
                }}
              />
            </div>
          </div>
        )}

        {/* SUCCESS OVERLAY — Celebration */}
        {successData && !loading && (
          <div className="absolute inset-0 z-[60] bg-white rounded-none sm:rounded-[24px] flex flex-col items-center justify-center p-6 sm:p-10 text-center animate-in zoom-in-95 duration-500 shadow-2xl overflow-y-auto">
            <style>{`
              @keyframes celebratePulse {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(220, 38, 38, 0)); }
                50% { transform: scale(1.15); filter: drop-shadow(0 0 20px rgba(220, 38, 38, 0.4)); }
              }
              @keyframes fadeSlideUp {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>

            <div className="mb-6" style={{ animation: 'celebratePulse 2s ease-in-out infinite' }}>
              <AppLogo size={140} className="drop-shadow-xl" />
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-2 uppercase tracking-tight" style={{ animation: 'fadeSlideUp 0.6s ease-out 0.2s both' }}>
              FELICIDADES
            </h2>

            <div className="text-slate-500 font-black text-xs uppercase tracking-[0.2em] mb-8" style={{ animation: 'fadeSlideUp 0.6s ease-out 0.3s both' }}>
              Acabas de generar un nuevo documento para:
            </div>

            <div className="w-full max-w-xl bg-slate-50 p-8 sm:p-12 rounded-[40px] border-2 border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] mb-10 text-center relative overflow-hidden group" style={{ animation: 'fadeSlideUp 0.6s ease-out 0.5s both' }}>
              <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600"></div>

              <h3 className="text-3xl sm:text-5xl font-black text-red-600 uppercase mb-6 leading-none tracking-tighter">
                {successData.clientName}
              </h3>

              <div className="space-y-2">
                <div className="text-lg sm:text-2xl font-black text-slate-800 uppercase tracking-tight">
                  {successData.vehicleYear} {successData.vehicleMake} {successData.vehicleModel}
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-[0.15em]">
                  {successData.vehicleTrim} • {successData.vehicleColor}
                </div>
                <div className="inline-block mt-4 px-4 py-1.5 bg-slate-200/50 rounded-full text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">
                  CHASSIS: {successData.vehicleVinLast4}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg" style={{ animation: 'fadeSlideUp 0.6s ease-out 0.7s both' }}>
              {successData.documentUrls && successData.documentUrls.length > 0 && (
                <button
                  onClick={() => window.open(successData.documentUrls[0], '_blank', 'noopener,noreferrer')}
                  className="bg-red-600 hover:bg-red-700 text-white font-black py-5 px-8 text-sm rounded-[20px] shadow-xl shadow-red-600/30 transition-all hover:scale-105 active:scale-95 flex-1 flex items-center justify-center uppercase tracking-widest text-center"
                >
                  <Eye className="mr-2" size={20} /> Ver Documento
                </button>
              )}
              <Button
                onClick={() => {
                  // La persistencia ya ocurrió al generar (persistedRef). Fallback defensivo
                  // por si por alguna razón no se ejecutó: garantizar el guardado al cerrar.
                  if (onGenerate && successData && !persistedRef.current) {
                    persistedRef.current = true;
                    onGenerate({
                      vehicleId: selectedVehicleId,
                      documentType,
                      clientData: { name: clientName, lastName: clientLastName, cedula: clientCedula, phone: clientPhone, email: clientEmail },
                      templateIds: selectedTemplates,
                      bankName,
                      warrantyValue,
                      warrantyUnit,
                      finalPrice: finalPrice,
                      ghlDocumentUrls: successData.documentUrls
                    });
                  }
                  onClose();
                }}
                className="bg-slate-900 hover:bg-black text-white font-black py-5 px-8 text-sm rounded-[20px] shadow-xl shadow-slate-900/10 transition-all hover:scale-105 active:scale-95 flex-1 uppercase tracking-widest border-none"
              >
                {t('close_window')}
              </Button>
            </div>
          </div>
        )}

        <Card className="h-full sm:h-auto sm:max-h-[95vh] overflow-y-auto rounded-none sm:rounded-[32px] border-none shadow-2xl p-0" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="p-8 sm:p-10">
            {/* Elegant Header */}
            <div className="flex justify-between items-start mb-10">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-2xl ${initialVehicle ? 'bg-white shadow-xl ring-1 ring-slate-100' : 'bg-red-600 shadow-xl'}`}>
                    <AppLogo size={initialVehicle ? 48 : 32} invert={!initialVehicle} className="relative z-10" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">
                    {t('generate_docs')}
                  </h3>
                </div>
                <p className="text-slate-400 font-bold text-sm ml-1 uppercase">
                  {initialVehicle ? 'Finalizando venta desde cotización' : 'Prepara la documentación legal para la venta'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-300 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-10">
              {/* 1. Vehicle Selection */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">1</span>
                  <label className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    VEHÍCULO SELECCIONADO
                  </label>
                </div>

                {(() => {
                  const isContactPrefill = !!initialVehicle?.isContactData;
                  const selectedObj = selectedVehicleId ? inventory.find(v => String(v.id) === String(selectedVehicleId)) : null;
                  // Prefer selectedObj (inventory data) when initialVehicle is a quote/contract doc without vehicle specs
                  const displayVehicle = isContactPrefill
                    ? selectedObj
                    : (selectedObj || initialVehicle);

                  if (displayVehicle) {
                    const isFromQuote = !isContactPrefill && !!initialVehicle && (initialVehicle.vehicleId || initialVehicle.template);
                    const vinValue = displayVehicle.vin || displayVehicle.chasis_vin || displayVehicle.chassis || displayVehicle.chasis || displayVehicle.VIN || '';

                    return (
                      <div className={`relative flex items-center gap-5 p-6 rounded-[2rem] transition-all duration-500 border-2 ${isFromQuote ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${isFromQuote ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-400'}`}>
                          {isFromQuote ? <ShieldCheck size={28} /> : <Car size={28} />}
                        </div>
                        <div className="flex-1 min-w-0 pr-24">
                          <p className={`text-xl font-black uppercase tracking-tight truncate ${isFromQuote ? 'text-emerald-900' : 'text-slate-900'}`}>
                            {displayVehicle.make || displayVehicle.marca} {displayVehicle.model || displayVehicle.modelo} {displayVehicle.edition || displayVehicle.edicion || ''}
                          </p>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold uppercase ${isFromQuote ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {displayVehicle.year || displayVehicle.ano} • <span className="text-red-600 font-black">{String(displayVehicle.color || 'N/A').toUpperCase()}</span>{vinValue && <> • VIN: <span className="text-red-600 font-black">{vinValue.slice(-4).toUpperCase()}</span></>}
                            </span>
                          </div>
                        </div>
                        {(!initialVehicle || isContactPrefill) && (
                          <button
                            onClick={() => setSelectedVehicleId("")}
                            className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-white bg-slate-900 hover:bg-red-600 px-5 py-3 rounded-2xl transition-all uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-95"
                          >
                            CAMBIAR
                          </button>
                        )}
                      </div>
                    );
                  }

                  // Custom vehicle picker — replaces native <select>
                  const filteredVehicles = vehicleSearch.trim()
                    ? availableVehicles.filter(v =>
                        `${v.make} ${v.model} ${v.year}`.toLowerCase().includes(vehicleSearch.toLowerCase())
                      )
                    : availableVehicles;

                  return (
                    <div className="relative" ref={vehicleDropdownRef}>
                      {/* Trigger button */}
                      <button
                        type="button"
                        onClick={() => { setVehicleDropdownOpen(o => !o); setVehicleSearch(''); }}
                        className={`w-full flex items-center gap-3 pl-4 pr-4 py-4 border-2 rounded-3xl transition-all duration-200 text-left ${
                          vehicleDropdownOpen
                            ? 'border-red-400 bg-white shadow-[0_0_0_4px_rgba(239,68,68,0.08)]'
                            : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${vehicleDropdownOpen ? 'bg-red-50' : 'bg-white'}`}>
                          <Car size={17} className={vehicleDropdownOpen ? 'text-red-500' : 'text-slate-400'} />
                        </div>
                        <span className="flex-1 font-bold text-slate-400 text-sm uppercase tracking-wide">
                          Seleccionar vehículo del inventario
                        </span>
                        <ChevronDown size={16} className={`text-slate-300 transition-transform duration-200 ${vehicleDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown panel */}
                      <AnimatePresence>
                        {vehicleDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                            className="absolute z-50 top-full mt-2 left-0 right-0 bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden"
                          >
                            {/* Search inside dropdown */}
                            <div className="p-3 border-b border-slate-100">
                              <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={vehicleSearch}
                                  onChange={e => setVehicleSearch(e.target.value)}
                                  placeholder="Buscar marca, modelo, año..."
                                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 rounded-2xl text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:bg-white transition-all"
                                />
                              </div>
                            </div>

                            {/* Vehicle list */}
                            <div className="max-h-72 overflow-y-auto overscroll-contain">
                              {filteredVehicles.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-slate-400 font-medium">Sin resultados</div>
                              ) : (
                                filteredVehicles.map((v, i) => {
                                  const priceStr = formatVehiclePrice(v);
                                  const img = v.image || (v.images && v.images[0]) || (v.fotos && v.fotos[0]) || null;
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedVehicleId(v.id);
                                        setVehicleDropdownOpen(false);
                                        setVehicleSearch('');
                                      }}
                                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors duration-150 ${i < filteredVehicles.length - 1 ? 'border-b border-slate-50' : ''}`}
                                    >
                                      {/* Thumbnail or icon */}
                                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                                        {img
                                          ? <img src={img} alt="" className="w-full h-full object-cover" />
                                          : <Car size={16} className="text-slate-300" />
                                        }
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">
                                          {v.make} {v.model} <span className="text-slate-400 font-bold">({v.year})</span>
                                        </p>
                                        <p className="text-xs font-bold text-red-500 mt-0.5">{priceStr}</p>
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}
              </section>

              {/* 2. Client Profile */}
              <section className="space-y-6">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">2</span>
                  <label className="text-xs font-black text-slate-900 uppercase tracking-widest">DATOS DEL COMPRADOR</label>
                </div>

                {/* Contact autocomplete search — server-side, searches all contacts */}
                <div ref={suggestionsRef} className="relative mb-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar contacto existente..."
                      className="glass-input w-full pl-9 pr-9 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-300 transition-all"
                      onChange={e => searchContacts(e.target.value)}
                      onFocus={e => { if (e.target.value.trim().length >= 2) searchContacts(e.target.value); }}
                    />
                    {contactSearchLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  {showSuggestions && (
                    <div className="absolute z-50 w-full mt-1 rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
                      {contactSuggestions.map((c, i) => {
                        const fn = (s) => (s || '').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
                        const fullName = `${fn(c.firstName)} ${fn(c.lastName)}`.trim();
                        const tags = (c.tags || []).filter(t => ['compró', 'vendido', 'cotizó', 'cotizado'].includes(t.toLowerCase()));
                        return (
                          <button
                            key={c.id || i}
                            type="button"
                            onClick={() => applyContact(c)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-80 transition-colors text-left last:border-0"
                            style={{ borderBottom: '1px solid var(--divider)' }}
                          >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                              {(c.firstName || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{fullName || 'Sin nombre'}</p>
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-tertiary)' }}>{c.phone || c.email || ''}</p>
                            </div>
                            {tags.length > 0 && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                                {tags[0]}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="NOMBRE"
                    placeholder="NOMBRES"
                    icon={User}
                    value={clientName}
                    onChange={(e) => { setClientName(e.target.value.toUpperCase()); }}
                    error={submitted && !clientName ? "OBLIGATORIO" : ""}
                    required
                  />
                  <Input
                    label="APELLIDOS"
                    placeholder="APELLIDOS"
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value.toUpperCase())}
                    error={submitted && !clientLastName ? "OBLIGATORIO" : ""}
                    required
                  />
                  <Input
                    label="CÉDULA / PASAPORTE"
                    placeholder="001-0000000-0"
                    icon={IdCard}
                    value={clientCedula}
                    onChange={(e) => { setClientCedula(e.target.value); }}
                    error={submitted && !clientCedula ? "OBLIGATORIO" : ""}
                    required
                  />
                  <Input
                    label="TELÉFONO"
                    placeholder="809-000-0000"
                    icon={Phone}
                    value={clientPhone}
                    onChange={(e) => { setClientPhone(e.target.value); }}
                    error={submitted && !clientPhone ? "OBLIGATORIO" : ""}
                    required
                  />
                  <div className="col-span-1 sm:col-span-2">
                    <Input
                      label="CORREO ELECTRÓNICO"
                      type="email"
                      placeholder="CLIENTE@EJEMPLO.COM"
                      icon={Mail}
                      value={clientEmail}
                      onChange={(e) => { setClientEmail(e.target.value.toUpperCase()); }}
                      error={submitted && !clientEmail ? "OBLIGATORIO" : ""}
                      required
                    />
                  </div>
                </div>
              </section>

              {/* 3. Financial Summary */}
              <section className="space-y-6">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">3</span>
                  <label className="text-xs font-black text-slate-900 uppercase tracking-widest">CONDICIONES DE VENTA</label>
                </div>

                <div className="p-6 sm:p-10 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full -mr-10 -mt-10 blur-3xl group-hover:bg-red-600/10 transition-all duration-700" />
                  <div className="relative space-y-6">
                    <Input
                      label="INSTITUCIÓN BANCARIA"
                      labelClassName="text-slate-500"
                      className="!gap-1 mb-4"
                      placeholder="EJ. BANCO POPULAR"
                      icon={Building2}
                      inputClassName="bg-white border-slate-200 text-slate-900 focus:bg-white focus:border-red-500 placeholder:text-slate-300 shadow-sm"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value.toUpperCase())}
                    />

                    <div className="space-y-2 mb-4">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center justify-center gap-1.5">
                        <Clock size={12} /> TIEMPO DE GARANTÍA
                      </label>
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex items-center h-9 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setWarrantyValue(v => Math.max(1, v - 1))}
                            className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-slate-50 transition-colors text-sm font-black"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={warrantyValue}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setWarrantyValue(Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1);
                            }}
                            className="w-9 h-full text-center bg-transparent focus:outline-none font-black text-sm text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setWarrantyValue(v => Math.min(100, v + 1))}
                            className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-slate-50 transition-colors text-sm font-black"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center h-9 rounded-full border border-slate-200 bg-slate-50 p-0.5 shadow-sm">
                          {[
                            { value: 'dias', label: 'Días' },
                            { value: 'meses', label: 'Meses' },
                            { value: 'anos', label: 'Años' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setWarrantyUnit(opt.value)}
                              className={`h-full px-3 rounded-full text-[10px] font-black uppercase tracking-wide transition-all ${warrantyUnit === opt.value ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${submitted && (!finalPrice || finalPrice <= 0) ? 'text-red-500' : 'text-slate-500'}`}>
                          PRECIO DE VENTA
                        </label>
                        <div className={`flex items-stretch h-14 rounded-2xl overflow-hidden border-2 transition-all ${submitted && (!finalPrice || finalPrice <= 0) ? 'border-red-500 bg-white shadow-xl shadow-red-500/10' : 'border-slate-100 bg-white focus-within:border-red-500 shadow-sm'}`}>
                          <input
                            type="text"
                            value={finalPrice ? Number(finalPrice).toLocaleString() : ''}
                            onChange={(e) => setFinalPrice(e.target.value.replace(/,/g, ''))}
                            className="flex-1 min-w-0 px-4 bg-transparent focus:outline-none font-bold text-slate-900 text-base uppercase"
                            placeholder="0.00"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const idx = CURRENCY_CODES.indexOf(priceCurrency);
                              const next = CURRENCY_CODES[(idx + 1) % CURRENCY_CODES.length];
                              setPriceCurrency(next);
                            }}
                            className="px-5 text-[10px] font-black bg-red-600 text-white border-l border-red-700 transition-colors uppercase hover:bg-red-700 shadow-inner"
                          >
                            {priceCurrency}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          INICIAL ACORDADO
                        </label>
                        <div className="flex items-stretch h-14 rounded-2xl overflow-hidden border-2 border-slate-100 bg-white focus-within:border-red-500 shadow-sm transition-all">
                          <input
                            type="text"
                            value={downPayment ? Number(downPayment).toLocaleString() : ''}
                            onChange={(e) => setDownPayment(e.target.value.replace(/,/g, ''))}
                            className="flex-1 min-w-0 px-4 bg-transparent focus:outline-none font-bold text-slate-900 text-base uppercase"
                            placeholder="0.00"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const idx = CURRENCY_CODES.indexOf(inicialCurrency);
                              const next = CURRENCY_CODES[(idx + 1) % CURRENCY_CODES.length];
                              setInicialCurrency(next);
                            }}
                            className="px-5 text-[10px] font-black bg-red-600 text-white border-l border-red-700 transition-colors uppercase hover:bg-red-700 shadow-inner"
                          >
                            {inicialCurrency}
                          </button>
                        </div>
                      </div>
                    </div>
                    {submitted && (!finalPrice || finalPrice <= 0) && (
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center">
                        EL PRECIO FINAL NO PUEDE ESTAR VACÍO
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* 4. Document Selection */}
              <section className="pt-4">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">4</span>
                    <label className="text-xs font-black text-slate-900 uppercase tracking-widest">DOCUMENTOS A GENERAR</label>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {selectedTemplates.length} SELECCIONADOS
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {ghlTemplates.map(template => {
                    const isSelected = selectedTemplates.includes(template.id);
                    return (
                      <div
                        key={template.id}
                        onClick={() => toggleTemplate(template.id)}
                        className={`group cursor-pointer p-5 rounded-3xl border-2 transition-all duration-300 relative flex flex-col gap-3 ${isSelected
                          ? 'border-red-600 shadow-xl shadow-red-600/5'
                          : 'border-slate-100 hover:border-slate-200 hover:shadow-lg'
                          }`}
                        style={isSelected
                          ? { backgroundColor: 'rgba(227, 28, 37, 0.12)' }
                          : { backgroundColor: 'var(--bg-elevated)' }
                        }
                      >
                        <div className="flex justify-between items-start">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${isSelected ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 scale-110' : 'group-hover:opacity-80'}`} style={!isSelected ? { backgroundColor: 'var(--input-bg)', color: 'var(--text-tertiary)' } : {}}>
                            {isSelected ? <Check size={20} strokeWidth={3} /> : <FileText size={20} />}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black text-xs leading-tight uppercase tracking-tight" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {template.name}
                          </h4>
                        </div>
                      </div>
                    );
                  })}
                  {ghlTemplates.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-400">
                      <Loader2 className="animate-spin mb-4" size={32} />
                      <p className="text-xs font-black uppercase tracking-widest">{t('getting_templates')}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Action Buttons */}
              <div className="pt-8 flex flex-col sm:flex-row gap-4 border-t border-slate-100">
                <button
                  onClick={onClose}
                  type="button"
                  disabled={loading}
                  className="px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all border-none outline-none disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || selectedTemplates.length === 0}
                  className={`flex-1 relative group px-8 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-2xl overflow-hidden outline-none ${(loading || selectedTemplates.length === 0 || !selectedVehicleId)
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] shadow-red-600/30'
                    }`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="animate-spin" size={20} />
                      <span>PROCESANDO...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      GENERAR {selectedTemplates.length} DOCUMENTO{selectedTemplates.length !== 1 ? 'S' : ''}
                      <ChevronRight className="group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>

    </>
  );
};

// --- HELPER: RENDER CONTRACT WITH DATA ---
// Helper for formatting currency in documents — supports DOP, USD, EUR, COP
const fmtCurr = (amount, currency) => {
  if (!amount) return '';
  const val = Number(amount);
  if (isNaN(val) || val === 0) return '';
  const f = val.toLocaleString();
  const map = { DOP: `RD$ ${f} Pesos`, USD: `US$ ${f} Dólares`, EUR: `€ ${f} Euros`, COP: `COP$ ${f} Pesos Colombianos` };
  return map[currency] || `RD$ ${f}`;
};

const renderContract = (html, data) => {
  if (!html) return '';
  let content = html;

  // Normalizar datos para asegurar que no falte nada
  const clientParts = (data.client || '').split(' ');
  const clientFirstName = data.nombre || clientParts[0] || '';
  const clientLastName = data.apellido || clientParts.slice(1).join(' ') || '';

  const vehicleParts = (data.vehicle || '').split(' ');
  const vehicleMake = data.marca || vehicleParts[0] || '';
  const vehicleModel = data.modelo || vehicleParts.slice(1).join(' ') || '';

  // 1. DICCIONARIO DE DATOS (Data Object) - Estructura exacta solicitada
  const contratoData = {
    // Datos del Cliente
    'nombre': clientFirstName,
    'apellido': clientLastName,
    'cedula': data.cedula || '',
    'telefono': data.telefono || data.phone || '',
    'direccion': data.direccion || data.address || '',

    // Ficha Principal
    'marca': vehicleMake,
    'modelo': vehicleModel,
    'edicion': data.version || data.edicion || '', // Added edicion mapping
    'version': data.version || '',
    'año': data.año || data.year || '',
    'color': data.color || '',
    'chasis': data.chasis || data.vin || '',
    'vin': data.vin || data.chasis || '', // Alias
    'placa': data.placa || data.plate || '',

    // Finanzas
    'precio': data.precio || fmtCurr(data.price, data.priceCurrency || data.currency || 'DOP'),
    'inicial': data.inicial || fmtCurr(data.downPayment, data.inicialCurrency || data.priceCurrency || data.currency || 'DOP'),
    'banco': data.banco || data.bank || '',

    // Detalles Extra
    'millaje': data.mileage ? `${Number(data.mileage).toLocaleString('en-US')} ${data.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
    'kilometraje': data.mileage ? `${Number(data.mileage).toLocaleString('en-US')} ${data.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
    'carfax': data.carfax || '',
    'condicion': data.condicion || data.condition || 'Excelentes condiciones',
    'asientos': data.asientos || data.seats || '',
    'motor': data.motor || data.details_engine || data.engineDescription || 'Motor no especificado',
    'transmision': data.transmission || '',
    'combustible': data.fuel || '',

    // Documento
    'fecha': data.date ? new Date(data.date).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),

    // Bloques de Firma
    'firma_cliente': `
      <div style="width:100%; max-width:350px; margin-top:60px; text-align:center; font-family:sans-serif;">
        <div style="border-top:2px solid #000; width:100%; margin-bottom:8px;"></div>
        <div style="font-weight:bold; font-size:14px; text-transform:uppercase; margin-bottom:4px;">
          ${(clientFirstName).toUpperCase()} ${(clientLastName).toUpperCase()}
        </div>
        <div style="font-weight:bold; font-size:11px; text-transform:uppercase;">CLIENTE/CEDULA/FECHA.</div>
      </div>
    `,
    'firma_vendedor': `
      <div style="width:100%; max-width:350px; margin-top:60px; text-align:center; font-family:sans-serif;">
        <div style="border-top:2px solid #000; width:100%; margin-bottom:8px;"></div>
        <div style="font-weight:bold; font-size:14px; text-transform:uppercase; margin-bottom:4px;">
          ${(data.dealerName || 'AGENTE AUTORIZADO').toUpperCase()}
        </div>
        <div style="font-weight:bold; font-size:11px; text-transform:uppercase;">VENDEDOR AUTORIZADO</div>
      </div>
    `,

    // LEGACY / COMPATIBILIDAD
    'CLIENTE_NOMBRE': clientFirstName,
    'CLIENTE_APELLIDO': clientLastName,
    'CLIENTE_CEDULA': data.cedula || '',
    'VEHICULO_MARCA': vehicleMake,
    'VEHICULO_MODELO': vehicleModel,
    'VEHICULO_VIN': data.chasis || data.vin || '',
  };

  // 2. FUNCIÓN DE REEMPLAZO CORREGIDA (Lógica del usuario)
  let resultado = content;

  Object.keys(contratoData).forEach(key => {
    // Esta Regex busca {{key}} con cualquier cantidad de llaves y espacios
    // Ej: {{nombre}}, {{{ nombre }}}, {{{{nombre}}}}
    const regex = new RegExp(`{+\\s*${key}\\s*}+`, 'gi');
    const valorReal = contratoData[key] !== undefined && contratoData[key] !== null ? contratoData[key] : '';

    // Solo reemplazar si hay valor, o si es explícitamente vacío, pero mantener lógica de reemplazo
    resultado = resultado.replace(regex, valorReal);
  });

  // Limpieza de estilos rojos (legacy)
  resultado = resultado.replace(/<span[^>]*style="[^"]*color:\s*#dc2626[^"]*"[^>]*>(.*?)<\/span>/gi, '$1');

  // 3. LIMPIEZA FINAL DE CUALQUIER ETIQUETA HUÉRFANA
  // Elimina cualquier cosa que parezca un placeholder no reemplazado {{...}}
  return resultado.replace(/{+.*?}+/g, '');
};

// Helper para limpieza quirúrgica de estilos (mismo logic que PlantillaEditor)
const cleanHtmlStyles = (htmlContent) => {
  if (!htmlContent) return '';
  let processed = htmlContent;

  // 1. Convert variable-chip class to inline style (optional, but keep for basic cleanup)
  // We remove the aggressive style regex to preserve bold/italics
  processed = processed.replace(/class=["']variable-chip["']/gi, 'style="color: #000000; display: inline;"');
  processed = processed.replace(/contenteditable=["']false["']/gi, '');

  return processed;
};

// Función de Sanitización Selectiva para PDF (DOM-based)
const prepareElementForPDF = (originalElement) => {
  // 1. Clonamos para no afectar el DOM visible
  const clone = originalElement.cloneNode(true);

  // 2. Buscamos variables (chips), spans con estilos, o divs con fondo de variable
  // Ajustamos el selector para atrapar todo lo que parezca un "chip"
  const variables = clone.querySelectorAll('span, .variable-chip, span[style*="background"], span[style*="border"]');

  variables.forEach(el => {
    // A. ELIMINAR LA CAJA (Estética de editor)
    el.style.backgroundColor = 'transparent';
    el.style.border = 'none';
    el.style.boxShadow = 'none';
    el.style.padding = '0';
    el.style.margin = '0';
    el.style.borderRadius = '0';

    // B. FORZAR APARIENCIA DE TEXTO
    el.style.display = 'inline';
    el.style.color = '#000000'; // Negro puro

    // C. Importante: NO tocamos font-weight ni font-style
    // el.style.fontWeight se mantiene si estaba definido o heredado
  });

  return clone;
};

const generateContractHtml = (contract, userProfile, isPreview = false) => {
  // Merge contract data + userProfile for the renderer
  const fullData = {
    ...contract,
    dealerName: userProfile.dealerName,
    dealerAddress: userProfile.address,
    dealerPhone: userProfile.phone
  };

  // CSS EXTRA PARA IMÁGENES Y CAPAS
  const EXTRA_CSS = `
    /* Capas de imagen (mismas que en el editor) */
    .img-behind {
      position: absolute !important;
      z-index: -1 !important;
      opacity: 0.6;
    }
    .img-front {
      position: absolute !important;
      z-index: 10 !important;
    }
    /* Página estilo Carta */
    .contract-page {
      width: 215.9mm;
      height: 279.4mm;
      position: relative;
      background-color: white;
      page-break-after: always;
      overflow: hidden;
    }
    .contract-page:last-child {
      page-break-after: auto;
    }
    .contract-bg {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 1;
      object-fit: fill; /* Estira el fondo al tamaño carta completo */
    }
    .contract-content {
      position: absolute;
      top: 25mm; left: 25mm; right: 25mm; bottom: 25mm;
      z-index: 10;
      font-family: 'Calibri', 'Carlito', sans-serif;
      line-height: 1.15;
      font-size: 11pt;
      color: black;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .contract-floating-img {
      position: absolute;
    }
    /* Ajuste de impresión */
    @media print {
      .img-behind {
         z-index: -1 !important;
         position: absolute !important; 
      }
      body { -webkit-print-color-adjust: exact; }
    }
    /* Reset básico para el contenido */
    #contract-body img {
      display: inline-block;
    }
  `;

  // NUEVO: Si hay páginas estructuradas (del nuevo editor), renderizarlas con fondos
  if (contract.pages && contract.pages.length > 0) {
    const pagesHtml = contract.pages.map((page, idx) => {
      const processedContent = cleanHtmlStyles(renderContract(page.content || '', fullData));
      const bgImage = page.backgroundImage || contract.backgroundImage;

      // Renderizar imágenes flotantes de esta página
      const floatingImages = (contract.images || [])
        .filter(img => img.pageId === page.id)
        .map(img => `<img src="${img.src}" class="contract-floating-img" style="left:${img.x}px; top:${img.y}px; width:${img.width}px; height:${img.height}px; z-index:20;">`)
        .join('');

      return `
        <div class="contract-page">
          ${bgImage ? `<img src="${bgImage}" class="contract-bg" />` : ''}
          ${floatingImages}
          <div class="contract-content">
            ${processedContent}
          </div>
        </div>
      `;
    }).join('');

    return `
        <style>${SHARED_QUILL_STYLES}${EXTRA_CSS}</style>
        ${pagesHtml}
      `;
  }

  // 1. Si hay contenido personalizado legacy (templateContent o content), usarlo
  const legacyContent = contract.templateContent || contract.content;
  if (legacyContent) {
    const content = cleanHtmlStyles(renderContract(legacyContent, fullData));

    return `
      <style>${SHARED_QUILL_STYLES}${EXTRA_CSS}</style>
      <div id="contract-content" class="ql-editor" style="
        font-family: 'Helvetica', 'Arial', sans-serif; 
        padding: 0; 
        background: white;
        ${contract.backgroundImage ? `background-image: url(${contract.backgroundImage}); background-size: 100% 100%; background-repeat: no-repeat;` : ''}
        width: 215.9mm; 
        min-height: 279.4mm;
        margin: 0 auto;
        box-sizing: border-box;
        position: relative;
      ">
        <div id="contract-body" class="contract-body ql-editor" style="padding: 20mm 20mm; overflow-wrap: break-word; word-wrap: break-word; position: relative; z-index: 1;">
          ${content}
        </div>
      </div>
      `;
  }

  // 2. Fallback: Plantilla Hardcoded (Legacy)
  return `
      <style>${SHARED_QUILL_STYLES}</style>
      <div id="contract-content" style="
        font-family: 'Times New Roman', serif; 
        padding: 0; 
        background: white;
        width: 215.9mm; 
        min-height: 279.4mm;
        margin: 0 auto;
        box-sizing: border-box;
        position: relative;
      ">
        <div id="contract-body" style="padding: 15mm 20mm;">
          <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
            <h1 style="margin: 0; color: #1a202c; font-size: 28px;">${userProfile.dealerName}</h1>
            <p style="margin: 5px 0; color: #4a5568; font-size: 14px;">RNC: 1-0000000-1 | Tel: 809-555-5555</p>
            <p style="margin: 0; color: #718096; font-size: 12px; font-style: italic;">Calidad y Confianza sobre Ruedas</p>
          </div>

          <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; text-transform: uppercase; text-decoration: underline;">${(contract.templateType || contract.template || 'Documento').toUpperCase()}</h1>

          <p style="margin-bottom: 20px; text-align: justify;">En la ciudad de Punta Cana, Provincia La Altagracia, República Dominicana, a los <strong>${contract.date ? new Date(contract.date).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>

          <p style="margin-bottom: 25px; text-align: justify;">
            <strong>DE UNA PARTE:</strong> El señor(a) <strong>${userProfile.name}</strong>, de nacionalidad Dominicana, mayor de edad, actuando en nombre y representación legal de la empresa <strong>${userProfile.dealerName}</strong> (en lo adelante denominado como <strong>EL VENDEDOR</strong>).
            <br /><br />
            <strong>DE LA OTRA PARTE:</strong> El señor(a) <strong>${contract.client}</strong>, portador del documento de identidad No. <strong>${contract.cedula || 'N/A'}</strong> (en lo adelante denominado como <strong>EL COMPRADOR</strong>).
          </p>

          <h2 style="font-size: 16px; margin-top: 30px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase;">PRIMERO: OBJETO DEL CONTRATO</h2>
          <p style="margin-bottom: 15px; text-align: justify;">EL VENDEDOR, por medio del presente acto, vende, cede y traspasa con todas las garantías de derecho al COMPRADOR, quien acepta, el siguiente vehículo de motor:</p>
          <div style="background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #edf2f7;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr><td style="padding: 4px 0; font-weight: bold; width: 30%;">Vehículo:</td><td>${contract.vehicle}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Condición:</td><td>Usado / Certificado</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Identificación (VIN):</td><td>${contract.vin || 'Verificado en Chasis'}</td></tr>
            </table>
          </div>

          <h2 style="font-size: 16px; margin-top: 30px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase;">SEGUNDO: PRECIO Y FORMA DE PAGO</h2>
          <p style="margin-bottom: 15px; text-align: justify;">El precio total convenido para la presente venta es de <strong>${fmtCurr(contract.price, contract.priceCurrency || contract.currency || 'DOP')}</strong>, el cual se compromete a pagar de la siguiente manera:
            ${contract.downPayment && Number(contract.downPayment) > 0
      ? `un pago inicial de <strong>${fmtCurr(contract.downPayment, contract.inicialCurrency || contract.priceCurrency || contract.currency || 'DOP')}</strong> y el balance restante mediante las condiciones acordadas.`
      : `en un único pago al momento de la firma.`}
            El VENDEDOR declara haber recibido conforme a lo pactado, sirviendo el presente documento como carta de pago y descargo legal por los montos recibidos.
          </p>

          <h2 style="font-size: 16px; margin-top: 30px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase;">TERCERO: ESTADO Y GARANTÍA</h2>
          <p style="margin-bottom: 15px; text-align: justify;">El COMPRADOR declara haber revisado minuciosamente el vehículo y aceptarlo en el estado mecánico y de carrocería en que se encuentra ("AS IS"). EL VENDEDOR otorga una garantía limitada de treinta (30) días sobre motor y transmisión, sujeto a uso normal.</p>

          <h2 style="font-size: 16px; margin-top: 30px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase;">CUARTO: JURISDICCIÓN Y LEY APLICABLE</h2>
          <p style="margin-bottom: 40px; text-align: justify;">Para todo lo no previsto en el presente contrato, las partes se remiten al derecho común y eligen domicilio en la jurisdicción de Punta Cana para cualquier proceso derivado del mismo.</p>

          <div style="margin-top: 60px; display: flex; justify-content: space-between; gap: 40px;">
            <div style="width: 45%; border-top: 1px solid #000; padding-top: 10px; text-align: center;">
              <p style="margin: 0; font-weight: bold;">EL VENDEDOR</p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #4a5568;">${userProfile.dealerName}</p>
            </div>
            <div style="width: 45%; border-top: 1px solid #000; padding-top: 10px; text-align: center;">
              <p style="margin: 0; font-weight: bold;">EL COMPRADOR</p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #4a5568;">${contract.client}</p>
            </div>
          </div>
        </div>
      </div>
      `;
};

// Helper for formatting currency in documents
const generateQuoteHtml = (quote, userProfile, isPreview = false) => {
  // If quote has templateContent, use it with variable replacements
  if (quote.templateContent) {
    const replacements = {
      // Cliente
      '{{CLIENTE_NOMBRE}}': quote.name || '',
      '{{ CLIENTE_APELLIDO }}': quote.lastname || '',
      '{{ CLIENTE_DOC }}': quote.cedula || '',
      '{{ CLIENTE_TEL }}': quote.phone || '',
      '{{ CLIENTE_CEDULA }}': quote.cedula || '',

      // Vehículo
      '{{ VEHICULO_MARCA }}': quote.vehicle?.split(' ')[0] || '',
      '{{ VEHICULO_MODELO }}': quote.vehicle?.split(' ').slice(1).join(' ') || '',
      '{{ VEHICULO_COMPLETO }}': quote.vehicle || '',
      '{{ VEHICULO_ANO }}': quote.year || '',
      '{{ VEHICULO_ANIO }}': quote.year || '',
      '{{ VEHICULO_COLOR }}': quote.color || '',
      '{{ VEHICULO_VIN }}': quote.vin || '',
      '{{ VEHICULO_VERSION }}': quote.version || '',
      '{{ VEHICULO_MILLAJE }}': quote.mileage ? `${Number(quote.mileage).toLocaleString('en-US')} ${quote.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
      '{{ VEHICULO_KILOMETRAJE }}': quote.mileage ? `${Number(quote.mileage).toLocaleString('en-US')} ${quote.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
      '{{ VEHICULO_COMBUSTIBLE }}': quote.fuel || '',
      '{{ VEHICULO_TRANSMISION }}': quote.transmission || '',
      '{{ VEHICULO_TRACCION }}': quote.drivetrain || '',
      '{{ VEHICULO_PASAJEROS }}': quote.passengers || '',

      // Negocio
      '{{ PRECIO_VENTA }}': quote.price ? fmtCurr(quote.price, quote.priceCurrency) : '',
      '{{ MONTO_INICIAL }}': quote.initial ? fmtCurr(quote.initial, quote.inicialCurrency) : '',
      '{{ BANCO }}': quote.bank || '',
      '{{ FECHA_VENTA }}': quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
      '{{ FECHA_COTIZACION }}': quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
      '{{ DEALER_NOMBRE }}': userProfile.dealerName || '',
      '{{ FOLIO }}': `Q-${quote.id?.slice(-6).toUpperCase() || 'TEMP'}`,

      // Legacy
      '{{ client }}': `${quote.name || ''} ${quote.lastname || ''}`.trim(),
      '{{ vehicle }}': quote.vehicle || '',
      '{{ price }}': quote.price ? fmtCurr(quote.price, quote.priceCurrency) : '',
    };

    let content = quote.templateContent;
    Object.keys(replacements).forEach(key => {
      const escapedKey = key.replace(/[.*+?^${ }()|[\]\\]/g, '\\$&');
      content = content.replace(new RegExp(escapedKey, 'g'), replacements[key]);
    });

    return `
      <style>${SHARED_QUILL_STYLES}</style>
      <div id="quote-content" style="
        font-family: 'Helvetica', 'Arial', sans-serif; 
        padding: 0; 
        background: white;
        width: 215.9mm; 
        min-height: 279.4mm;
        margin: 0 auto;
        box-sizing: border-box;
        position: relative;
      ">
        <div id="quote-body" style="padding: 15mm 20mm; overflow-wrap: break-word; word-wrap: break-word;">${content}</div>
      </div>
      `;
  }

  // Default format (fallback)
  return `
      <style>${SHARED_QUILL_STYLES}</style>
      <div id="quote-content" style="
        font-family: 'Helvetica', 'Arial', sans-serif; 
        padding: 0; 
        background: white;
        width: 215.9mm; 
        min-height: 279.4mm;
        margin: 0 auto;
        box-sizing: border-box;
        position: relative;
      ">
        <div id="quote-body" style="padding: 15mm 20mm;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 4px solid #b91c1c; padding-bottom: 20px;">
            <div>
              <h1 style="font-size: 28px; margin: 0; color: #0f172a; font-weight: 800;">${userProfile.dealerName}</h1>
              <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Ficha de Cotización de Vehículo</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-weight: bold; color: #b91c1c;">FOLIO: Q-${quote.id?.slice(-6).toUpperCase() || 'PREVIEW'}</p>
              <p style="margin: 5px 0 0; font-size: 12px;">${new Date().toLocaleDateString('es-DO', { long: true })}</p>
            </div>
          </div>

          <div style="margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="font-size: 14px; text-transform: uppercase; color: #b91c1c; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Información del Cliente</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold;">NOMBRE COMPLETO:</td>
                <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.name} ${quote.lastname}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold;">TELÉFONO:</td>
                <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.phone}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold;">CÉDULA/ID:</td>
                <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.cedula || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom: 30px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="font-size: 14px; text-transform: uppercase; color: #b91c1c; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Vehículo de Interés</h2>
            <p style="font-size: 24px; font-weight: 900; margin: 0; color: #0f172a;">${quote.vehicle}</p>
            <div style="margin-top: 15px; display: flex; gap: 20px;">
              <div style="padding: 10px 20px; background: #fff1f2; border-radius: 8px; text-align: center; flex: 1;">
                <p style="margin: 0; font-size: 10px; color: #b91c1c; font-weight: bold; text-transform: uppercase;">Estado</p>
                <p style="margin: 5px 0 0; font-weight: 800;">Cotizado</p>
              </div>
            </div>
          </div>

          ${quote.bank ? `
        <div style="margin-bottom: 40px; background: #eff6ff; padding: 20px; border-radius: 12px; border: 1px solid #dbeafe;">
            <h2 style="font-size: 14px; text-transform: uppercase; color: #2563eb; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Pre-Aprobación Bancaria</h2>
            <table style="width: 100%;">
              <tr>
                <td style="padding: 5px 0; color: #60a5fa; font-size: 12px; font-weight: bold; width: 30%;">INSTITUCIÓN:</td>
                <td style="padding: 5px 0; color: #1e3a8a; font-weight: 800;">${quote.bank}</td>
              </tr>
            </table>
        </div>
        ` : ''}

          <div style="margin-top: 60px; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6;">
            <p>Esta es una ficha de cotización informativa generada por Carbot para ${userProfile.dealerName}.<br />
              Los precios y la disponibilidad están sujetos a cambios sin previo aviso.</p>
          </div>
        </div>
      </div>
      `;
};

const ContractPreviewModal = ({ isOpen, onClose, contract, userProfile }) => {
  if (!isOpen || !contract) return null;

  const handleDownloadPDF = async () => {
    const element = document.createElement('div');
    element.innerHTML = generateContractHtml(contract, userProfile, false);
    document.body.appendChild(element);

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      // Use contract ID if it adheres to the new format, or fallback to generated name
      filename: contract.id && contract.id.startsWith('Contrato_') ? `${contract.id}.pdf` : `Contrato_${contract.client.replace(/\s+/g, '_')}_${contract.id.slice(0, 5)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    const html2pdf = (await import('html2pdf.js')).default;
    const cleanElement = prepareElementForPDF(element);
    html2pdf().set(opt).from(cleanElement).save().then(() => {
      document.body.removeChild(element);
    });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Contrato</title>
          <style>@page {size: letter; margin: 0; }</style>
        </head>
        <body style="margin: 0;">${generateContractHtml(contract, userProfile)}</body>
      </html>
      `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-black/20 transition-opacity duration-300">
      <div className="w-full max-w-4xl h-[100dvh] sm:h-[90vh] animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Replaced Card with simple div to ensure full height scaling */}
        <div className="flex flex-col h-full bg-slate-50 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b bg-white sm:rounded-t-2xl shrink-0 safe-top">
            <h3 className="text-sm sm:text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText size={18} className="text-red-600 sm:w-[20px] sm:h-[20px]" /> <span className="truncate max-w-[200px]">Contrato: {contract.client}</span>
            </h3>
            <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-red-500 transition-colors" /></button>
          </div>

          <div className="flex-1 bg-white overflow-hidden relative">
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Vista Previa del Contrato</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                      html { 
                        height: 100%;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                      }
                      body {
                        margin: 0;
                        padding: 0;
                        background: #cbd5e1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        min-height: 100%;
                      }
                      .sheet-container {
                        width: 215.9mm;
                        background: white;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 5px 15px rgba(0,0,0,0.1);
                        margin: 40px auto;
                        min-height: 279.4mm;
                        position: relative;
                        transform-origin: top center;
                        transition: transform 0.2s ease-out;
                      }
                      @media print {
                        body { background: white !important; padding: 0 !important; }
                        .sheet-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; transform: none !important; zoom: 1 !important; }
                      }
                    </style>
                    <script>
                      function updatePreviewScale() {
                        const container = document.querySelector('.sheet-container');
                        if (!container) return;
                        const iw = window.innerWidth;
                        const sw = 215.9 * (96/25.4); // 816px approx
                        const padding = 32; // side padding
                        
                        if (iw < sw + padding) {
                          const scale = (iw - padding) / sw;
                          container.style.transform = 'scale(' + scale + ')';
                          container.style.transformOrigin = 'top center';
                          container.style.margin = '20px 0 ' + (279.4 * (96/25.4) * (scale - 1) + 20) + 'px 0';
                        } else {
                          container.style.transform = 'none';
                          container.style.margin = '40px auto';
                        }
                      }
                      window.addEventListener('load', updatePreviewScale);
                      window.addEventListener('resize', updatePreviewScale);
                    </script>
                  </head>
                  <body>
                    <div class="sheet-container">
                      ${generateContractHtml(contract, userProfile, true)}
                    </div>
                  </body>
                </html>
              `}
              className="w-full h-full border-none"
              title="Vista Previa del Contrato"
            />
          </div>

          <div className="p-4 bg-white/40 backdrop-blur-2xl border-t border-white/20 sm:rounded-b-2xl flex flex-wrap gap-3 justify-center sm:justify-end shrink-0 safe-bottom">
            {contract.ghlDocumentUrls && contract.ghlDocumentUrls.length > 0 && (
              <Button
                onClick={() => window.open(contract.ghlDocumentUrls[0], '_blank')}
                className="btn-liquid flex-1 sm:flex-none bg-blue-500/20 text-blue-600 border-none shadow-glass-blue"
                title="Ver Documento Oficial generado en CarBotSystem"
                icon={FileText}
              >
                Oficial (CarBotSystem)
              </Button>
            )}
            <Button
              onClick={handlePrint}
              className="btn-liquid flex-1 sm:flex-none bg-slate-500/10 text-slate-600 border-none shadow-glass-slate"
              icon={Printer}
            >
              Imprimir Local
            </Button>
            <Button
              onClick={handleDownloadPDF}
              className="btn-liquid flex-1 sm:flex-none bg-red-600 text-white shadow-glow-red-sm border-none"
              icon={Download}
            >
              Descargar Local
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuotePreviewModal = ({ isOpen, onClose, quote, userProfile }) => {
  if (!isOpen || !quote) return null;

  const getQuoteHtml = (isPreview = false) => {
    // If quote has templateContent, use it with variable replacements
    if (quote.templateContent) {
      const replacements = {
        // Cliente
        '{{CLIENTE_NOMBRE}}': quote.name || '',
        '{{ CLIENTE_APELLIDO }}': quote.lastname || '',
        '{{ CLIENTE_DOC }}': quote.cedula || '',
        '{{ CLIENTE_TEL }}': quote.phone || '',
        '{{ CLIENTE_CEDULA }}': quote.cedula || '',

        // Vehículo
        '{{ VEHICULO_MARCA }}': quote.vehicle?.split(' ')[0] || '',
        '{{ VEHICULO_MODELO }}': quote.vehicle?.split(' ').slice(1).join(' ') || '',
        '{{ VEHICULO_COMPLETO }}': quote.vehicle || '',
        '{{ VEHICULO_ANO }}': quote.year || '',
        '{{ VEHICULO_ANIO }}': quote.year || '',
        '{{ VEHICULO_COLOR }}': quote.color || '',
        '{{ VEHICULO_VIN }}': quote.vin || '',
        '{{ VEHICULO_VERSION }}': quote.version || '',
        '{{ VEHICULO_MILLAJE }}': quote.mileage ? `${Number(quote.mileage).toLocaleString('en-US')} ${quote.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
        '{{ VEHICULO_KILOMETRAJE }}': quote.mileage ? `${Number(quote.mileage).toLocaleString('en-US')} ${quote.mileage_unit === 'KM' ? 'KM' : 'Millas'}` : '',
        '{{ VEHICULO_COMBUSTIBLE }}': quote.fuel || '',
        '{{ VEHICULO_TRANSMISION }}': quote.transmission || '',
        '{{ VEHICULO_TRACCION }}': quote.drivetrain || '',
        '{{ VEHICULO_PASAJEROS }}': quote.passengers || '',

        // Negocio
        '{{ PRECIO_VENTA }}': quote.price ? fmtCurr(quote.price, quote.priceCurrency) : '',
        '{{ MONTO_INICIAL }}': quote.initial ? fmtCurr(quote.initial, quote.inicialCurrency) : '',
        '{{ BANCO }}': quote.bank || '',
        '{{ FECHA_VENTA }}': quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
        '{{ FECHA_COTIZACION }}': quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }),
        '{{ DEALER_NOMBRE }}': userProfile.dealerName || '',
        '{{ FOLIO }}': `Q-${quote.id?.slice(-6).toUpperCase() || 'TEMP'}`,

        // Legacy
        '{{ client }}': `${quote.name || ''} ${quote.lastname || ''}`.trim(),
        '{{ vehicle }}': quote.vehicle || '',
        '{{ price }}': quote.price ? fmtCurr(quote.price, quote.priceCurrency) : '',
      };

      let content = quote.templateContent;
      Object.keys(replacements).forEach(key => {
        const escapedKey = key.replace(/[.*+?^${ }()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escapedKey, 'g'), replacements[key]);
      });

      return `
      <style>${SHARED_QUILL_STYLES}</style>
      <div id="quote-content" style="
          font-family: 'Helvetica', 'Arial', sans-serif; 
          padding: 0; 
          background: white;
          width: 215.9mm; 
          min-height: 279.4mm;
          margin: 0 auto;
          box-sizing: border-box;
          position: relative;
        ">
        <div id="quote-body" style="padding: 15mm 20mm; overflow-wrap: break-word; word-wrap: break-word;">${content}</div>
      </div>
      `;
    }

    // Default format (fallback)
    return `
      <style>${SHARED_QUILL_STYLES}</style>
      <div id="quote-content" style="
          font-family: 'Helvetica', 'Arial', sans-serif; 
          padding: 0; 
          background: white;
          width: 215.9mm; 
          min-height: 279.4mm;
          margin: 0 auto;
          box-sizing: border-box;
          position: relative;
        ">
        <div id="quote-body" style="padding: 15mm 20mm;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; border-bottom: 4px solid #b91c1c; padding-bottom: 20px;">
            <div>
              <h1 style="font-size: 28px; margin: 0; color: #0f172a; font-weight: 800;">${userProfile.dealerName}</h1>
              <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">Ficha de Cotización de Vehículo</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-weight: bold; color: #b91c1c;">FOLIO: Q-${quote.id?.slice(-6).toUpperCase() || 'PREVIEW'}</p>
              <p style="margin: 5px 0 0; font-size: 12px;">${new Date().toLocaleDateString('es-DO', { long: true })}</p>
            </div>
          </div>

          <div style="margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="font-size: 14px; text-transform: uppercase; color: #b91c1c; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Información del Cliente</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold; width: 30%;">NOMBRE COMPLETO:</td>
                <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.name} ${quote.lastname}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold;">TELÉFONO:</td>
                <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.phone}</td>
              </tr>
              ${quote.cedula ? `
                  <tr>
                    <td style="padding: 5px 0; color: #64748b; font-size: 12px; font-weight: bold;">CÉDULA:</td>
                    <td style="padding: 5px 0; color: #0f172a; font-weight: bold;">${quote.cedula}</td>
                  </tr>
                  ` : ''
      }
            </table>
          </div>

          <div style="margin-bottom: 30px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="font-size: 14px; text-transform: uppercase; color: #b91c1c; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Vehículo de Interés</h2>
            <p style="font-size: 24px; font-weight: 900; margin: 0; color: #0f172a;">${quote.vehicle}</p>
            <div style="margin-top: 15px; display: flex; gap: 20px;">
              <div style="padding: 10px 20px; background: #fff1f2; border-radius: 8px; text-align: center; flex: 1;">
                <p style="margin: 0; font-size: 10px; color: #b91c1c; font-weight: bold; text-transform: uppercase;">Estado</p>
                <p style="margin: 5px 0 0; font-weight: 800;">Cotizado</p>
              </div>
            </div>
          </div>

          ${quote.bank ? `
          <div style="margin-bottom: 40px; background: #eff6ff; padding: 20px; border-radius: 12px; border: 1px solid #dbeafe;">
              <h2 style="font-size: 14px; text-transform: uppercase; color: #2563eb; margin-top: 0; margin-bottom: 15px; letter-spacing: 1px; font-weight: 800;">Pre-Aprobación Bancaria</h2>
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 5px 0; color: #60a5fa; font-size: 12px; font-weight: bold; width: 30%;">INSTITUCIÓN:</td>
                  <td style="padding: 5px 0; color: #1e3a8a; font-weight: 800;">${quote.bank}</td>
                </tr>
              </table>
          </div>
          ` : ''
      }

          <div style="margin-top: 60px; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6;">
            <p>Esta es una ficha de cotización informativa generada por Carbot para ${userProfile.dealerName}.<br />
              Los precios y la disponibilidad están sujetos a cambios sin previo aviso.</p>
          </div>
        </div>
      </div>
      `;
  };

  const handleDownloadPDF = async () => {
    const element = document.createElement('div');
    element.innerHTML = getQuoteHtml(false);
    document.body.appendChild(element);

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: quote.id && quote.id.startsWith('Cotizacion_') ? `${quote.id}.pdf` : `Cotizacion_${quote.name}_${quote.lastname}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    const html2pdf = (await import('html2pdf.js')).default;
    const cleanElement = prepareElementForPDF(element);
    html2pdf().set(opt).from(cleanElement).save().then(() => {
      document.body.removeChild(element);
    });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html >
        <head>
          <title>Imprimir Cotización</title>
          <style>@page {size: letter; margin: 0; }</style>
        </head>
        <body style="margin: 0;">${getQuoteHtml()}</body>
      </html>
      `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/20 transition-opacity duration-300">
      <div className="w-full max-w-4xl h-[100dvh] sm:h-[90vh] animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="flex flex-col h-full bg-slate-50 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b bg-white sm:rounded-t-2xl shrink-0 safe-top">
            <h3 className="text-sm sm:text-xl font-bold text-slate-800 flex items-center gap-2">
              <Send size={18} className="text-red-600 sm:w-[20px] sm:h-[20px]" /> <span className="truncate max-w-[200px]">Cotización: {quote.name} {quote.lastname}</span>
            </h3>
            <button onClick={onClose}><X size={24} className="text-gray-400 hover:text-red-500 transition-colors" /></button>
          </div>

          <div className="flex-1 bg-white overflow-hidden relative">
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Vista Previa de la Cotización</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                      html {
                        height: 100%;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                      }
                      body {
                        margin: 0;
                        padding: 0;
                        background: #cbd5e1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        min-height: 100%;
                      }
                      .sheet-container {
                        width: 215.9mm;
                        background: white;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 5px 15px rgba(0,0,0,0.1);
                        margin: 40px auto;
                        min-height: 279.4mm;
                        position: relative;
                        transform-origin: top center;
                        transition: transform 0.2s ease-out;
                      }
                      @media print {
                        body { background: white !important; padding: 0 !important; }
                        .sheet-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; transform: none !important; zoom: 1 !important; }
                      }
                    </style>
                    <script>
                      function updatePreviewScale() {
                        const container = document.querySelector('.sheet-container');
                        if (!container) return;
                        const iw = window.innerWidth;
                        const sw = 215.9 * (96/25.4); // 816px approx
                        const padding = 32; // side padding
                        
                        if (iw < sw + padding) {
                          const scale = (iw - padding) / sw;
                          container.style.transform = 'scale(' + scale + ')';
                          container.style.transformOrigin = 'top center';
                          // Compensation for height transform
                          container.style.margin = '20px 0 ' + (279.4 * (96/25.4) * (scale - 1) + 20) + 'px 0';
                        } else {
                          container.style.transform = 'none';
                          container.style.margin = '40px auto';
                        }
                      }
                      window.addEventListener('load', updatePreviewScale);
                      window.addEventListener('resize', updatePreviewScale);
                    </script>
                  </head>
                  <body>
                    <div class="sheet-container">
                      ${generateQuoteHtml(quote, userProfile, true)}
                    </div>
                  </body>
                </html>
              `}
              className="w-full h-full border-none"
              title="Vista Previa de la Cotización"
            />
          </div>

          <div className="p-4 bg-white/40 backdrop-blur-2xl border-t border-white/20 sm:rounded-b-2xl flex flex-wrap gap-3 justify-center sm:justify-end shrink-0 safe-bottom">
            {quote.ghlDocumentUrls && quote.ghlDocumentUrls.length > 0 && (
              <Button
                onClick={() => window.open(quote.ghlDocumentUrls[0], '_blank')}
                className="btn-liquid flex-1 sm:flex-none bg-blue-500/20 text-blue-600 border-none shadow-glass-blue"
                title="Ver Documento Oficial generado en CarBotSystem"
                icon={FileText}
              >
                Oficial (CarBotSystem)
              </Button>
            )}
            <Button
              onClick={handlePrint}
              className="btn-liquid flex-1 sm:flex-none bg-slate-500/10 text-slate-600 border-none shadow-glass-slate"
              icon={Printer}
            >
              Imprimir Local
            </Button>
            <Button
              onClick={handleDownloadPDF}
              className="btn-liquid flex-1 sm:flex-none bg-red-600 text-white shadow-glow-red-sm border-none"
              icon={Download}
            >
              Descargar Local
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- VISTAS PRINCIPALES ---

const TrashView = ({ trash, contracts, quotes, onRestore, onPermanentDelete, onRestoreDocument, onPermanentDeleteDocument, onEmptyTrash, userProfile }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' or 'documents'
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Filtrar documentos eliminados
  const deletedDocuments = useMemo(() => {
    const deletedContracts = (contracts || []).filter(c => c.status === 'deleted').map(c => ({ ...c, docType: 'contract' }));
    const deletedQuotes = (quotes || []).filter(q => q.status === 'deleted').map(q => ({ ...q, docType: 'quote' }));
    return [...deletedContracts, ...deletedQuotes].sort((a, b) => new Date(b.deletedAt || b.createdAt) - new Date(a.deletedAt || a.createdAt));
  }, [contracts, quotes]);

  const activeList = activeTab === 'vehicles' ? trash : deletedDocuments;

  // Reset selection when tab changes
  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedItems([]);
  }, [activeTab]);

  const toggleSelection = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkRestore = async () => {
    if (activeTab === 'vehicles') {
      for (const id of selectedItems) await onRestore(id);
    } else {
      const itemsToRestore = activeList.filter(i => selectedItems.includes(i.id));
      for (const item of itemsToRestore) await onRestoreDocument(item);
    }
    setSelectedItems([]);
    setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    if (confirm(`¿Estás seguro de eliminar permanentemente ${selectedItems.length} ítems? Esta acción NO se puede deshacer.`)) {
      if (activeTab === 'vehicles') {
        await Promise.all(selectedItems.map(id => onPermanentDelete(id, true)));
      } else {
        const itemsToDelete = activeList.filter(i => selectedItems.includes(i.id));
        await Promise.all(itemsToDelete.map(item => onPermanentDeleteDocument(item, true)));
      }
      setSelectedItems([]);
      setIsSelectionMode(false);
    }
  };

  const handleEmptyDocumentsTrash = async () => {
    if (confirm("¿Estás seguro de vaciar TODA la papelera de documentos? Esta acción NO se puede deshacer.")) {
      await Promise.all(deletedDocuments.map(item => onPermanentDeleteDocument(item, true)));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>{t('trash_title')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Los ítems se eliminan permanentemente después de 15 días.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
          {/* Tabs */}
          <div className="flex p-1 rounded-xl" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
            <button
              onClick={() => setActiveTab('vehicles')}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all"
              style={activeTab === 'vehicles' ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--text-secondary)' }}
            >
{t('nav_inventory')} ({trash.length})
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all"
              style={activeTab === 'documents' ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--text-secondary)' }}
            >
{t('documents')} ({deletedDocuments.length})
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {activeList.length > 0 && (
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedItems([]);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
                style={isSelectionMode ? { background: 'var(--bg-glass-heavy)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } : { background: 'var(--bg-glass)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}
              >
{isSelectionMode ? t('cancel_selection') : t('select_multiple')}
              </button>
            )}

            {activeList.length > 0 && activeTab === 'vehicles' && (
              <Button variant="danger" icon={Trash2} onClick={onEmptyTrash} className="bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 border-transparent shadow-none whitespace-nowrap">
                {t('empty_vehicles')}
              </Button>
            )}
            {activeList.length > 0 && activeTab === 'documents' && (
              <Button variant="danger" icon={Trash2} onClick={handleEmptyDocumentsTrash} className="bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 border-transparent shadow-none whitespace-nowrap">
                {t('empty_documents')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {activeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-gray-200">
          <Trash2 size={48} className="mb-4 text-slate-300" />
          <p className="text-lg font-medium">{activeTab === 'vehicles' ? t('trash_no_vehicles') : t('trash_no_documents')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {activeList.map(item => (
            <div key={item.id} className={`relative group transition-all duration-300 ${isSelectionMode && selectedItems.includes(item.id) ? 'active-card-selection ring-2 ring-blue-500 rounded-2xl transform scale-[1.02]' : 'opacity-80 hover:opacity-100'}`}>

              {/* Checkbox Overlay */}
              {isSelectionMode && (
                <div
                  className="absolute inset-0 z-20 cursor-pointer"
                  onClick={() => toggleSelection(item.id)}
                >
                  <div className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedItems.includes(item.id) ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-slate-300'}`}>
                    {selectedItems.includes(item.id) && <Check size={14} className="text-white" />}
                  </div>
                </div>
              )}

              <Card noPadding className="flex flex-col h-full border-red-100 bg-red-50/30">
                {activeTab === 'vehicles' ? (
                  <>
                    <div className="relative aspect-[16/10] bg-gray-200 overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-500">
                      {item.image && !item.image.includes('unsplash') ? (
                        <img src={item.image} alt={item.model} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 p-8 group-hover:scale-110 transition-transform duration-700">
                          {userProfile?.dealer_logo ? (
                            <img src={userProfile.dealer_logo} alt="Dealer Logo" className="w-full h-full object-contain opacity-60 drop-shadow-sm" />
                          ) : (
                            <div className="flex flex-col items-center text-slate-400">
                              <Car size={48} className="mb-2 opacity-50" />
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Sin Foto</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-red-900/10 mix-blend-multiply"></div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="font-bold text-slate-800 text-lg line-through decoration-red-500/50">{item.make} {item.model}</h3>
                      <p className="text-xs font-semibold text-red-400 mb-4">{t('trash_deleted_on')} {item.deletedAt || item.detalles?._deleted_at ? new Date(item.deletedAt || item.detalles?._deleted_at).toLocaleDateString() : t('trash_unknown')}</p>

                      {!isSelectionMode && (
                        <div className="mt-auto grid grid-cols-2 gap-3">
                          <Button variant="secondary" onClick={() => onRestore(item.id)} className="w-full text-xs font-bold border-green-200 text-green-700 hover:bg-green-50 flex items-center justify-center gap-1 active:scale-95 hover:scale-[1.02] transition-all"><Undo size={14} /> RESTAURAR</Button>
                          <Button variant="secondary" onClick={() => onPermanentDelete(item.id)} className="w-full text-xs font-bold border-red-200 text-red-700 hover:bg-red-50 flex items-center justify-center gap-1 active:scale-95 hover:scale-[1.02] transition-all"><X size={14} /> BORRAR</Button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-5 flex flex-col flex-1 h-full min-h-[200px]">
                    <div className="mb-4">
                      <span className={`inline-block px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider mb-2 ${item.docType === 'contract' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'} `}>
{item.docType === 'contract' ? t('contracts') : t('quotes')}
                      </span>
                      <h3 className="font-bold text-slate-800 text-lg w-full truncate" title={item.client || item.name}>{item.client || `${item.name || ''} ${item.lastname || ''} `}</h3>
                      <p className="text-xs text-slate-500 font-medium truncate">{item.vehicle || 'Vehículo desconocido'}</p>
                    </div>

                    <p className="text-xs font-semibold text-red-400 mb-6 mt-auto">{t('trash_deleted_on')} {item.deletedAt || item.detalles?._deleted_at ? new Date(item.deletedAt || item.detalles?._deleted_at).toLocaleDateString() : t('trash_unknown')}</p>

                    {!isSelectionMode && (
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="secondary" onClick={() => onRestoreDocument(item)} className="w-full text-xs font-bold border-green-200 text-green-700 hover:bg-green-50 flex items-center justify-center gap-1 active:scale-95 hover:scale-[1.02] transition-all"><Undo size={14} /> RESTAURAR</Button>
                        <Button variant="secondary" onClick={() => onPermanentDeleteDocument(item)} className="w-full text-xs font-bold border-red-200 text-red-700 hover:bg-red-50 flex items-center justify-center gap-1 active:scale-95 hover:scale-[1.02] transition-all"><X size={14} /> BORRAR</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Bar for Selection */}
      {isSelectionMode && selectedItems.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-2 rounded-2xl shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-bold text-sm px-4 border-r border-slate-700">{selectedItems.length} seleccionados</span>

          <button onClick={handleBulkRestore} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-black uppercase tracking-wide transition-all flex items-center gap-2">
            <Undo size={16} /> Restaurar
          </button>

          <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-black uppercase tracking-wide transition-all flex items-center gap-2">
            <Trash2 size={16} /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
};
// --- CONFIRMATION MODAL ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", isDestructive = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 animate-in fade-in duration-300">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-[400px] relative overflow-hidden scale-100 animate-in zoom-in-95 duration-300 border-none p-10 flex flex-col items-center text-center">

        {/* Logo Section */}
        <div className="mb-6 flex flex-col items-center">
          <AppLogo size={90} className="mb-2 drop-shadow-md" />
        </div>

        <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-wide leading-tight">{title}</h3>
        <p className="text-base text-slate-500 font-bold mb-8 max-w-[80%] leading-relaxed">{message}</p>

        <div className="w-full space-y-4">
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="w-full py-4 rounded-full bg-[#E31C25] hover:bg-red-700 text-white font-black text-sm tracking-widest uppercase shadow-xl shadow-red-600/30 transition-all active:scale-[0.98]"
          >
            {confirmText || 'CONFIRMAR ACCIÓN'}
          </button>
          {cancelText && (
            <button
              onClick={onClose}
              className="w-full py-2 text-slate-400 hover:text-slate-600 font-black text-xs tracking-widest uppercase transition-colors"
            >
              {cancelText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


// --- SETTINGS VIEW ---
const ChangePasswordCard = ({ userProfile, showToast, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setIsOpen(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    if (!currentPw) return setError('Ingresa tu contraseña actual.');
    if (newPw.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (newPw !== confirmPw) return setError('Las contraseñas nuevas no coinciden.');

    setLoading(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: userProfile?.email,
        password: currentPw,
      });
      if (verifyErr) throw new Error('La contraseña actual es incorrecta.');

      const { error: updErr } = await supabase.auth.updateUser({ password: newPw });
      if (updErr) throw updErr;

      showToast?.('Contraseña actualizada.');
      reset();
    } catch (err) {
      setError(err.message || 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="glass-card rounded-2xl p-5 flex items-center justify-between" style={{ borderRadius: '20px' }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
            <ShieldCheck size={18} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>{t('password_label')}</p>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>••••••••</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95"
          style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3" style={{ borderRadius: '20px' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>{t('changePassword')}</p>
        <button onClick={reset} className="p-1 rounded-lg" style={{ color: 'var(--text-tertiary)' }}><X size={16} /></button>
      </div>
      <input
        type="password"
        placeholder="Contraseña actual"
        value={currentPw}
        onChange={(e) => setCurrentPw(e.target.value)}
        className="glass-input w-full px-4 py-3 text-sm font-bold"
        autoComplete="current-password"
      />
      <input
        type="password"
        placeholder="Nueva contraseña (mínimo 8 caracteres)"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        className="glass-input w-full px-4 py-3 text-sm font-bold"
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Confirmar nueva contraseña"
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        className="glass-input w-full px-4 py-3 text-sm font-bold"
        autoComplete="new-password"
      />
      {error && <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }}
      >
        {loading ? 'Guardando…' : 'Actualizar Contraseña'}
      </button>
    </div>
  );
};

const FINANCING_TERM_OPTIONS = [6, 12, 24, 36, 48, 72];

const FinancingBanksCard = ({ userProfile, showToast, embedded }) => {
  const dealerId = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { banco: '', tasa_anual: '', max_financiamiento_pct: '80', plazo_maximo_meses: '48' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const loadBanks = useCallback(async () => {
    if (!dealerId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('dealer_financing_banks')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('orden', { ascending: true });
    if (error) {
      console.error('Error cargando bancos de financiamiento:', error);
    } else {
      setBanks(data || []);
    }
    setLoading(false);
  }, [dealerId]);

  useEffect(() => { loadBanks(); }, [loadBanks]);

  const resetForm = () => { setForm(emptyForm); setShowForm(false); };

  const handleAddBank = async () => {
    const tasa = parseFloat(form.tasa_anual);
    const maxPct = parseFloat(form.max_financiamiento_pct);
    const plazo = parseInt(form.plazo_maximo_meses, 10);
    if (!form.banco.trim()) return showToast('Ingresa el nombre del banco.');
    if (!(tasa > 0 && tasa < 100)) return showToast('La tasa anual debe ser un número entre 0 y 100.');
    if (!(maxPct > 0 && maxPct <= 100)) return showToast('El % máximo a financiar debe estar entre 1 y 100.');

    setSaving(true);
    const { error } = await supabase.from('dealer_financing_banks').insert({
      dealer_id: dealerId,
      banco: form.banco.trim(),
      tasa_anual: tasa,
      max_financiamiento_pct: maxPct,
      plazo_maximo_meses: plazo,
      orden: banks.length,
    });
    setSaving(false);
    if (error) {
      console.error('Error guardando banco:', error);
      showToast('No se pudo guardar el banco.');
      return;
    }
    showToast('Banco agregado.');
    resetForm();
    loadBanks();
  };

  const handleToggleActivo = async (bank) => {
    const { error } = await supabase.from('dealer_financing_banks').update({ activo: !bank.activo }).eq('id', bank.id);
    if (error) { showToast('No se pudo actualizar el banco.'); return; }
    setBanks(prev => prev.map(b => b.id === bank.id ? { ...b, activo: !b.activo } : b));
  };

  const startEdit = (bank) => {
    setShowForm(false);
    setEditingId(bank.id);
    setEditForm({
      banco: bank.banco,
      tasa_anual: String(bank.tasa_anual),
      max_financiamiento_pct: String(bank.max_financiamiento_pct),
      plazo_maximo_meses: String(bank.plazo_maximo_meses),
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };

  const handleUpdateBank = async () => {
    const tasa = parseFloat(editForm.tasa_anual);
    const maxPct = parseFloat(editForm.max_financiamiento_pct);
    const plazo = parseInt(editForm.plazo_maximo_meses, 10);
    if (!editForm.banco.trim()) return showToast('Ingresa el nombre del banco.');
    if (!(tasa > 0 && tasa < 100)) return showToast('La tasa anual debe ser un número entre 0 y 100.');
    if (!(maxPct > 0 && maxPct <= 100)) return showToast('El % máximo a financiar debe estar entre 1 y 100.');

    setSaving(true);
    const { error } = await supabase.from('dealer_financing_banks').update({
      banco: editForm.banco.trim(),
      tasa_anual: tasa,
      max_financiamiento_pct: maxPct,
      plazo_maximo_meses: plazo,
    }).eq('id', editingId);
    setSaving(false);
    if (error) {
      console.error('Error actualizando banco:', error);
      showToast('No se pudo actualizar el banco.');
      return;
    }
    setBanks(prev => prev.map(b => b.id === editingId ? { ...b, banco: editForm.banco.trim(), tasa_anual: tasa, max_financiamiento_pct: maxPct, plazo_maximo_meses: plazo } : b));
    showToast('Banco actualizado.');
    cancelEdit();
  };

  const handleDelete = async (bank) => {
    if (!window.confirm(`¿Eliminar ${bank.banco} de las opciones de financiamiento?`)) return;
    const { error } = await supabase.from('dealer_financing_banks').delete().eq('id', bank.id);
    if (error) { showToast('No se pudo eliminar el banco.'); return; }
    setBanks(prev => prev.filter(b => b.id !== bank.id));
    showToast('Banco eliminado.');
  };

  if (!dealerId) return null;

  return (
    <div className={embedded ? '' : 'glass-card rounded-2xl p-5'} style={embedded ? undefined : { borderRadius: '20px' }}>
      <div className="flex items-center justify-between mb-1">
        {embedded ? (
          <p className="text-[11px] font-medium flex-1" style={{ color: 'var(--text-tertiary)' }}>
            Bancos y tasas reales que ven tus clientes en la calculadora de cuotas de cada vehículo.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
              <CreditCard size={18} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>Financiamiento</p>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Bancos y Tasas</p>
            </div>
          </div>
        )}
        {!showForm && (
          <button
            onClick={() => { cancelEdit(); setShowForm(true); }}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 shrink-0"
            style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
          >
            + Banco
          </button>
        )}
      </div>
      {!embedded && (
        <p className="text-[11px] font-medium mt-2 mb-4" style={{ color: 'var(--text-tertiary)' }}>
          Estos bancos y tasas reales aparecen en la calculadora de cuotas que ven tus clientes en la ficha pública de cada vehículo.
        </p>
      )}
      {embedded && <div className="mt-3" />}

      {loading ? (
        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Cargando…</p>
      ) : (
        <div className="space-y-2">
          {banks.length === 0 && !showForm && (
            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Aún no has agregado bancos. Sin bancos, tus clientes no verán la calculadora de cuotas.</p>
          )}
          {banks.map(bank => (
            editingId === bank.id ? (
              <div key={bank.id} className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--input-bg)', border: '1px solid var(--accent)' }}>
                <input
                  placeholder="Nombre del banco"
                  value={editForm.banco}
                  onChange={(e) => setEditForm(f => ({ ...f, banco: e.target.value }))}
                  className="glass-input w-full px-4 py-3 text-sm font-bold"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Tasa Anual %</label>
                    <input
                      type="number" step="0.01" placeholder="16.50"
                      value={editForm.tasa_anual}
                      onChange={(e) => setEditForm(f => ({ ...f, tasa_anual: e.target.value }))}
                      className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>% Máx. Financiar</label>
                    <input
                      type="number" step="1" placeholder="80"
                      value={editForm.max_financiamiento_pct}
                      onChange={(e) => setEditForm(f => ({ ...f, max_financiamiento_pct: e.target.value }))}
                      className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Plazo Máx.</label>
                    <select
                      value={editForm.plazo_maximo_meses}
                      onChange={(e) => setEditForm(f => ({ ...f, plazo_maximo_meses: e.target.value }))}
                      className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                    >
                      {FINANCING_TERM_OPTIONS.map(m => <option key={m} value={m}>{m} meses</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelEdit} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'var(--input-border)', color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdateBank}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {saving ? 'Guardando…' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            ) : (
              <div key={bank.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--input-bg)', opacity: bank.activo ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{bank.banco}</p>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {bank.tasa_anual}% anual · hasta {bank.max_financiamiento_pct}% financiado · máx. {bank.plazo_maximo_meses} meses
                  </p>
                </div>
                <button
                  onClick={() => handleToggleActivo(bank)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide"
                  style={bank.activo ? { background: 'rgba(16,185,129,0.12)', color: '#10B981' } : { background: 'var(--input-border)', color: 'var(--text-tertiary)' }}
                >
                  {bank.activo ? 'Activo' : 'Inactivo'}
                </button>
                <button onClick={() => startEdit(bank)} className="p-2 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(bank)} className="p-2 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
                  <Trash size={14} />
                </button>
              </div>
            )
          ))}

          {showForm && (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)' }}>
              <input
                placeholder="Nombre del banco (ej. Banco Popular)"
                value={form.banco}
                onChange={(e) => setForm(f => ({ ...f, banco: e.target.value }))}
                className="glass-input w-full px-4 py-3 text-sm font-bold"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Tasa Anual %</label>
                  <input
                    type="number" step="0.01" placeholder="16.50"
                    value={form.tasa_anual}
                    onChange={(e) => setForm(f => ({ ...f, tasa_anual: e.target.value }))}
                    className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>% Máx. Financiar</label>
                  <input
                    type="number" step="1" placeholder="80"
                    value={form.max_financiamiento_pct}
                    onChange={(e) => setForm(f => ({ ...f, max_financiamiento_pct: e.target.value }))}
                    className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Plazo Máx.</label>
                  <select
                    value={form.plazo_maximo_meses}
                    onChange={(e) => setForm(f => ({ ...f, plazo_maximo_meses: e.target.value }))}
                    className="glass-input w-full px-3 py-2.5 text-sm font-bold"
                  >
                    {FINANCING_TERM_OPTIONS.map(m => <option key={m} value={m}>{m} meses</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'var(--input-border)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button
                  onClick={handleAddBank}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {saving ? 'Guardando…' : 'Guardar Banco'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WhatsAppContactCard = ({ userProfile, showToast }) => {
  const dealerId = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
  const [value, setValue] = useState('');
  const [savedValue, setSavedValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dealerId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.from('dealers').select('phone, whatsapp_link').eq('id', dealerId).single();
      if (!error && data) {
        const current = data.whatsapp_link || data.phone || '';
        setValue(current);
        setSavedValue(current);
      }
      setLoading(false);
    })();
  }, [dealerId]);

  const isDirty = value.trim() !== savedValue.trim();

  const handleSave = async () => {
    if (!dealerId) return;
    const trimmed = value.trim();
    let update;
    if (!trimmed) {
      update = { phone: null, whatsapp_link: null };
    } else if (/^https?:\/\//i.test(trimmed)) {
      update = { whatsapp_link: trimmed, phone: null };
    } else {
      update = { phone: trimmed.replace(/[^\d+]/g, ''), whatsapp_link: null };
    }

    setSaving(true);
    // .select() para poder distinguir "RLS bloqueó el UPDATE" (0 filas, sin error)
    // de un guardado real — sin esto, un bloqueo de permisos pasa desapercibido.
    const { data, error } = await supabase.from('dealers').update(update).eq('id', dealerId).select();
    if (userProfile?.dealerId) {
      try {
        const dealerRef = doc(db, "Dealers", userProfile.dealerId);
        await setDoc(dealerRef, update, { merge: true });
      } catch (err) {
        console.warn('Firestore WhatsApp sync omitido:', err);
      }
    }
    setSaving(false);
    if (error || !data?.length) {
      showToast('No se pudo guardar el WhatsApp.');
      return;
    }
    const normalized = update.whatsapp_link || update.phone || '';
    setValue(normalized);
    setSavedValue(normalized);
    showToast('WhatsApp actualizado.');
  };

  if (!dealerId) return null;

  return (
    <div className="glass-card rounded-2xl p-5" style={{ borderRadius: '20px' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366' }}>
          <MessageCircle size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>Contacto</p>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp</p>
        </div>
      </div>
      <p className="text-[11px] font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Número (ej. 8095551234) o link completo (ej. https://wa.me/18095551234). Se usa en el botón "Contacta por WhatsApp" de cada vehículo.
      </p>
      {loading ? (
        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Cargando…</p>
      ) : (
        <div className="flex gap-2">
          <input
            placeholder="8095551234 o https://wa.me/..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="glass-input flex-1 px-4 py-3 text-sm font-bold"
          />
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {saving ? '...' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
};

const DEALER_API_ENDPOINT = 'https://lpiwkennlavpzisdvnnh.supabase.co/functions/v1/inventory-search';

const DealerApiKeyCard = ({ userProfile, showToast }) => {
  const dealerId = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [lastUsedAt, setLastUsedAt] = useState(null);
  const [revealedKey, setRevealedKey] = useState('');

  const callDealerApiKey = async (action) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no disponible.');
    const res = await fetch('https://lpiwkennlavpzisdvnnh.supabase.co/functions/v1/dealer-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Error de servidor.');
    return data;
  };

  useEffect(() => {
    if (!dealerId) { setLoading(false); return; }
    (async () => {
      try {
        const data = await callDealerApiKey('status');
        setHasKey(!!data.has_key);
        setLastUsedAt(data.last_used_at || null);
      } catch (err) {
        console.warn('No se pudo cargar el estado de la API key:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [dealerId]);

  const handleRotate = async () => {
    const confirmMsg = hasKey
      ? '¿Regenerar la llave? La anterior dejará de funcionar de inmediato — tendrás que actualizarla donde la estés usando.'
      : '¿Generar una llave de API para este dealer?';
    if (!window.confirm(confirmMsg)) return;
    setRotating(true);
    try {
      const data = await callDealerApiKey('rotate');
      setRevealedKey(data.api_key);
      setHasKey(true);
      setLastUsedAt(null);
      showToast('Llave generada.');
    } catch (err) {
      showToast(err.message || 'No se pudo generar la llave.');
    } finally {
      setRotating(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado.`);
  };

  if (!dealerId) return null;

  const curlSnippet = `curl -X POST '${DEALER_API_ENDPOINT}' \\\n  -H 'Authorization: Bearer ${revealedKey || 'TU_LLAVE_AQUI'}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"dealer_id":"${dealerId}"}'`;

  return (
    <div>
      <p className="text-[11px] font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Genera una llave para consultar tu inventario disponible (con fotos y detalles) desde tu propia web u otra herramienta.
      </p>

      <div className="p-3 rounded-xl mb-3 space-y-1" style={{ background: 'var(--input-bg)' }}>
        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Endpoint (POST)</p>
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{DEALER_API_ENDPOINT}</code>
          <button onClick={() => copyToClipboard(DEALER_API_ENDPOINT, 'Endpoint')} className="p-1.5 rounded-lg shrink-0" style={{ color: 'var(--text-tertiary)' }}><Copy size={13} /></button>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wide pt-2" style={{ color: 'var(--text-tertiary)' }}>Tu dealer_id</p>
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{dealerId}</code>
          <button onClick={() => copyToClipboard(dealerId, 'dealer_id')} className="p-1.5 rounded-lg shrink-0" style={{ color: 'var(--text-tertiary)' }}><Copy size={13} /></button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Cargando…</p>
      ) : (
        <>
          {revealedKey && (
            <div className="p-3 rounded-xl mb-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <p className="text-[10px] font-bold mb-2" style={{ color: '#10B981' }}>Cópiala ahora — no se volverá a mostrar completa.</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] font-mono flex-1 break-all" style={{ color: 'var(--text-primary)' }}>{revealedKey}</code>
                <button onClick={() => copyToClipboard(revealedKey, 'Llave')} className="p-1.5 rounded-lg shrink-0" style={{ color: '#10B981' }}><Copy size={13} /></button>
              </div>
              <button onClick={() => setRevealedKey('')} className="mt-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Ya la copié, ocultar</button>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-medium" style={{ color: hasKey ? '#10B981' : 'var(--text-tertiary)' }}>
              {hasKey ? `Llave activa${lastUsedAt ? ` · último uso ${new Date(lastUsedAt).toLocaleDateString('es-DO')}` : ' · sin uso todavía'}` : 'Aún no has generado una llave.'}
            </span>
          </div>

          <button
            onClick={handleRotate}
            disabled={rotating}
            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
            style={hasKey ? { background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } : { background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }}
          >
            {rotating ? 'Generando…' : hasKey ? 'Regenerar Llave' : 'Generar Llave'}
          </button>

          <details className="mt-4">
            <summary className="text-[10px] font-bold uppercase tracking-wide cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>Ejemplo de uso (curl)</summary>
            <pre className="mt-2 p-3 rounded-xl text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>{curlSnippet}</pre>
          </details>
        </>
      )}
    </div>
  );
};

const CurrencyDropdownField = ({ label, value, onChange, excludeCode, CURR_MAP, CURR_CODES }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const c = CURR_MAP[value];

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <label className="block text-[9px] font-bold tracking-wider uppercase mb-2 px-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="glass-card w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all"
        style={{ borderRadius: '16px', border: `2px solid ${open ? 'var(--accent)' : 'transparent'}` }}
      >
        <span className="text-xl">{c?.flag}</span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{c ? `${c.symbol} ${value}` : 'Seleccionar'}</p>
        </div>
        <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full glass-card rounded-2xl overflow-hidden shadow-xl" style={{ borderRadius: '16px' }}>
          {CURR_CODES.filter(code => code !== excludeCode).map(code => {
            const opt = CURR_MAP[code];
            const isSel = code === value;
            return (
              <button
                key={code}
                type="button"
                onClick={() => { onChange(code); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                style={{ background: isSel ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span className="text-lg">{opt.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{opt.symbol} {code}</p>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{opt.name}</p>
                </div>
                {isSel && <Check size={14} strokeWidth={3} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CurrencyPairCard = ({ CURR_MAP, CURR_CODES, selectedCurrencies, setPrimarySecondary, showToast, t, userProfile, requestConfirmation, onInventoryRecalculated }) => {
  const dealerId = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
  const fallbackSecondary = (p) => CURR_CODES.find(code => code !== p) || p;
  const [primary, setPrimary] = useState(selectedCurrencies[0] || 'DOP');
  const [secondary, setSecondary] = useState(selectedCurrencies[1] || fallbackSecondary(selectedCurrencies[0] || 'DOP'));
  const [manualRate, setManualRate] = useState('');
  const [savedManualRate, setSavedManualRate] = useState('');
  const [loadingRate, setLoadingRate] = useState(true);
  const [savingRate, setSavingRate] = useState(false);
  const [autoInitialPct, setAutoInitialPct] = useState(DEFAULT_AUTO_INITIAL_PCT);
  const [savedAutoInitialPct, setSavedAutoInitialPct] = useState(DEFAULT_AUTO_INITIAL_PCT);
  const [savingPct, setSavingPct] = useState(false);
  const [autoDaily, setAutoDaily] = useState(false);
  const [savingAutoDaily, setSavingAutoDaily] = useState(false);
  const [liveQuote, setLiveQuote] = useState(null);

  useEffect(() => {
    setPrimary(selectedCurrencies[0] || 'DOP');
    setSecondary(selectedCurrencies[1] || fallbackSecondary(selectedCurrencies[0] || 'DOP'));
  }, [selectedCurrencies]);

  useEffect(() => {
    if (!dealerId) { setLoadingRate(false); return; }
    (async () => {
      const config = await fetchDealerRateConfig(supabase, dealerId);
      const rate = config?.manualRate ? String(config.manualRate) : '';
      setManualRate(rate);
      setSavedManualRate(rate);
      setAutoDaily(config?.autoDaily === true);
      const pct = config?.autoInitialPct ?? DEFAULT_AUTO_INITIAL_PCT;
      setAutoInitialPct(pct);
      setSavedAutoInitialPct(pct);
      setLoadingRate(false);
      // Trae la cotización del día para mostrarla junto al interruptor.
      await resolveExchangeRate({ primary: config?.primary || DEFAULT_PRIMARY_CURRENCY, secondary: config?.secondary || DEFAULT_SECONDARY_CURRENCY, manualRate: null });
      setLiveQuote(getLastRateMeta());
    })();
  }, [dealerId]);

  const isDirty = primary !== (selectedCurrencies[0] || '') || secondary !== (selectedCurrencies[1] || '');
  const isRateDirty = manualRate.trim() !== savedManualRate.trim();

  const handlePrimaryChange = (code) => {
    setPrimary(code);
    if (code === secondary) setSecondary(fallbackSecondary(code));
  };

  const handleSave = () => {
    const doSave = async () => {
      setPrimarySecondary(primary, secondary);
      if (dealerId) {
        // .select() para poder distinguir "RLS bloqueó el UPDATE" (0 filas, sin error)
        // de un guardado real — sin esto, un bloqueo de permisos pasa desapercibido.
        const { data, error } = await supabase.from('dealers').update({ moneda_principal: primary, moneda_secundaria: secondary }).eq('id', dealerId).select();
        if (error || !data?.length) {
          console.warn('No se pudo sincronizar moneda_principal/secundaria en Supabase:', error?.message || 'RLS bloqueó el update (0 filas).');
          showToast('No se pudo guardar en el servidor (permisos). Contacta soporte.');
          return;
        }
      }
      showToast('Monedas actualizadas.');
    };
    if (requestConfirmation) {
      requestConfirmation({ title: '¿Cambiar Moneda?', message: '¿Seguro que quieres cambiar la moneda principal/secundaria?', confirmText: 'Cambiar', onConfirm: doSave });
    } else if (window.confirm('¿Seguro que quieres cambiar la moneda?')) {
      doSave();
    }
  };

  const handleSaveRate = async () => {
    if (!dealerId) return;
    const trimmed = manualRate.trim();
    if (trimmed && (isNaN(Number(trimmed)) || Number(trimmed) <= 0)) {
      showToast('La tasa debe ser un número mayor a 0.');
      return;
    }
    setSavingRate(true);
    const { data, error } = await supabase.from('dealers').update({ tasa_cambio_manual: trimmed ? Number(trimmed) : null }).eq('id', dealerId).select();
    if (error || !data?.length) {
      setSavingRate(false);
      showToast('No se pudo guardar la tasa de cambio.');
      return;
    }
    setSavedManualRate(trimmed);
    // La tasa cambia el valor convertido, así que los iniciales automáticos se
    // recalculan igual que al mover el %.
    const okCount = await recalcAutoIniciales(Number(savedAutoInitialPct));
    setSavingRate(false);
    if (okCount) onInventoryRecalculated?.();
    showToast(trimmed ? `Tasa guardada — ${okCount || 0} inicial${okCount === 1 ? '' : 'es'} actualizado${okCount === 1 ? '' : 's'}.` : 'Tasa manual eliminada — se usará la tasa en vivo.');
  };

  // Interruptor tasa automática diaria / tasa fija. Al apagarlo se congela la
  // cotización del día en el campo manual, para que "no cambie hasta que el
  // dealer la cambie" sea literal y quede un número editable a la vista.
  const handleToggleAutoDaily = async (next) => {
    if (!dealerId || savingAutoDaily) return;
    setSavingAutoDaily(true);
    try {
      const patch = { tasa_auto_diaria: next };
      let frozen = manualRate.trim();
      if (!next && !(Number(frozen) > 0)) {
        const { rate } = await resolveExchangeRate({ primary, secondary, manualRate: null });
        if (rate > 0) {
          frozen = rate.toFixed(2);
          patch.tasa_cambio_manual = Number(frozen);
        }
      }
      const { data, error } = await supabase.from('dealers').update(patch).eq('id', dealerId).select();
      if (error || !data?.length) {
        showToast('No se pudo cambiar el modo de tasa.');
        return;
      }
      setAutoDaily(next);
      if (patch.tasa_cambio_manual != null) {
        setManualRate(frozen);
        setSavedManualRate(frozen);
      }
      const okCount = await recalcAutoIniciales(Number(savedAutoInitialPct));
      if (okCount) onInventoryRecalculated?.();
      showToast(next
        ? `Tasa automática activada — ${okCount || 0} inicial${okCount === 1 ? '' : 'es'} actualizado${okCount === 1 ? '' : 's'}.`
        : 'Tasa fija activada — no cambiará hasta que la edites.');
    } finally {
      setSavingAutoDaily(false);
    }
  };

  // Recalcula el inicial de los vehículos con inicial autogenerado usando el %
  // recibido. Devuelve la cantidad actualizada, o null si algo falló.
  const recalcAutoIniciales = async (pctNum) => {
    try {
      const config = await fetchDealerRateConfig(supabase, dealerId);
      const primaryCur = config?.primary || DEFAULT_PRIMARY_CURRENCY;
      const secondaryCur = config?.secondary || DEFAULT_SECONDARY_CURRENCY;
      const pct = pctNum / 100;
      const { ratesToPrimary } = await resolveExchangeRate({ primary: primaryCur, secondary: secondaryCur, manualRate: config?.manualRate });

      // Elegibles: los ya marcados como automáticos, más los heredados sin marca
      // que están vacíos (nunca tuvieron un inicial escrito por el dealer). Un
      // inicial con valor y sin marca se considera manual y no se toca.
      const { data: rows, error: fetchErr } = await supabase
        .from('vehiculos')
        .select('id, precio, moneda_precio, inicial, inicial_automatico')
        .eq('dealer_id', dealerId)
        .is('deleted_at', null)
        .gt('precio', 0)
        .or('inicial_automatico.is.true,and(inicial_automatico.is.null,inicial.is.null),and(inicial_automatico.is.null,inicial.eq.0)');
      if (fetchErr) throw fetchErr;
      if (!rows?.length) return 0;

      let okCount = 0;
      const CHUNK = 8;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const results = await Promise.all(rows.slice(i, i + CHUNK).map(async (v) => {
          const priceInPrimary = convertAmount(Number(v.precio), v.moneda_precio || secondaryCur, primaryCur, ratesToPrimary);
          const newInicial = Math.round(priceInPrimary * pct);
          const { error: updErr } = await supabase
            .from('vehiculos')
            .update({ inicial: newInicial, moneda_inicial: primaryCur, inicial_automatico: true })
            .eq('id', v.id);
          return !updErr;
        }));
        okCount += results.filter(Boolean).length;
      }
      return okCount;
    } catch (err) {
      console.error('Error recalculando inventario:', err);
      return null;
    }
  };

  // El % se guarda y propaga solo: sin botón de guardar ni de recalcular. Se
  // espera a que el usuario suelte la barra (debounce) para no escribir en cada
  // pixel del arrastre, y una secuencia descarta respuestas de un % ya viejo.
  const pctSyncSeqRef = useRef(0);
  const [pctSyncMsg, setPctSyncMsg] = useState('');

  useEffect(() => {
    if (!dealerId || loadingRate) return;
    const pctNum = Number(autoInitialPct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) return;
    if (pctNum === Number(savedAutoInitialPct)) return;

    const seq = ++pctSyncSeqRef.current;
    const timer = setTimeout(async () => {
      setSavingPct(true);
      setPctSyncMsg('Guardando…');
      const { data, error } = await supabase.from('dealers').update({ porcentaje_inicial_auto: pctNum }).eq('id', dealerId).select();
      if (seq !== pctSyncSeqRef.current) return;
      if (error || !data?.length) {
        setSavingPct(false);
        setPctSyncMsg('');
        showToast('No se pudo guardar el porcentaje.');
        return;
      }
      setSavedAutoInitialPct(pctNum);

      setPctSyncMsg('Actualizando inventario…');
      const okCount = await recalcAutoIniciales(pctNum);
      if (seq !== pctSyncSeqRef.current) return;
      // Refresca el inventario en memoria: sin esto los números nuevos quedan
      // solo en la base y la pantalla sigue mostrando los viejos hasta recargar.
      if (okCount) onInventoryRecalculated?.();
      setSavingPct(false);
      if (okCount === null) {
        setPctSyncMsg('Guardado, pero no se pudo actualizar el inventario.');
      } else if (okCount === 0) {
        setPctSyncMsg(`Guardado en ${pctNum}% — no hay vehículos con inicial automático.`);
      } else {
        setPctSyncMsg(`Guardado en ${pctNum}% — ${okCount} vehículo${okCount === 1 ? '' : 's'} actualizado${okCount === 1 ? '' : 's'}.`);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [autoInitialPct, savedAutoInitialPct, dealerId, loadingRate]);

  return (
    <div>
      <h3 className="text-[10px] font-bold tracking-[0.2em] mb-2 uppercase px-1" style={{ color: 'var(--text-tertiary)' }}>{t('currencies_label')}</h3>
      <p className="text-[10px] font-medium mb-4 px-1" style={{ color: 'var(--text-tertiary)' }}>Moneda principal y secundaria para mostrar precios en la app</p>
      <div className="flex gap-3">
        <CurrencyDropdownField label="Moneda Principal" value={primary} onChange={handlePrimaryChange} excludeCode={secondary} CURR_MAP={CURR_MAP} CURR_CODES={CURR_CODES} />
        <CurrencyDropdownField label="Moneda Secundaria" value={secondary} onChange={setSecondary} excludeCode={primary} CURR_MAP={CURR_MAP} CURR_CODES={CURR_CODES} />
      </div>
      <button
        onClick={handleSave}
        disabled={!isDirty}
        className="mt-3 w-full py-3 rounded-2xl text-xs font-black uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff', boxShadow: isDirty ? 'var(--accent-glow)' : 'none' }}
      >
        Guardar
      </button>

      {dealerId && (
        <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--divider)' }}>
          <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>Tasa de Cambio</p>
          <p className="text-[10px] font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
            1 {secondary} = ___ {primary}. Se usa en el catálogo público, la calculadora de financiamiento y el cálculo del inicial automático.
          </p>
          {loadingRate ? (
            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Cargando…</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleToggleAutoDaily(!autoDaily)}
                disabled={savingAutoDaily}
                aria-pressed={autoDaily}
                className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.99] disabled:opacity-60"
                style={{ background: 'var(--input-bg)', border: `1px solid ${autoDaily ? 'var(--accent)' : 'var(--input-border)'}` }}
              >
                <span
                  className="w-10 h-6 rounded-full shrink-0 relative transition-colors"
                  style={{ background: autoDaily ? 'var(--accent)' : 'var(--divider)' }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: autoDaily ? '1.125rem' : '0.125rem' }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                    Actualizar la tasa automáticamente cada día
                  </span>
                  <span className="block text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {autoDaily
                      ? 'Usa la tasa del día y recalcula tus iniciales automáticos solo.'
                      : 'Tasa fija: no cambia hasta que tú la edites aquí abajo.'}
                  </span>
                </span>
              </button>

              {liveQuote?.venta > 0 && (
                <p className="text-[10px] font-medium mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  Tasa de venta: <strong style={{ color: 'var(--text-primary)' }}>1 US$ = RD$ {Number(liveQuote.venta).toFixed(2)}</strong>
                  {liveQuote.source === 'bcrd'
                    ? ` · Banco Central${liveQuote.date ? `, ${liveQuote.date}` : ''}`
                    : ' · tasa de referencia internacional'}
                </p>
              )}

              {!autoDaily && (
                <div className="flex gap-2 mt-3">
                  <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                    <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-tertiary)' }}>1 {secondary} =</span>
                    <input
                      type="number" step="0.01" min="0" placeholder="Ej. 60.00"
                      value={manualRate}
                      onChange={(e) => setManualRate(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-sm font-bold outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{primary}</span>
                  </div>
                  <button
                    onClick={handleSaveRate}
                    disabled={savingRate || !isRateDirty}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-40 shrink-0"
                    style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
                  >
                    {savingRate ? '...' : 'Guardar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {dealerId && !loadingRate && (
        <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--divider)' }}>
          <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>% Inicial Automático</p>
          <p className="text-[10px] font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Cuando el cliente no da un inicial, se autorellena con este % del precio (convertido a {primary}).
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range" min="0" max="100" step="1"
              value={autoInitialPct}
              onChange={(e) => setAutoInitialPct(Number(e.target.value))}
              className="flex-1 accent-red-600"
              style={{ accentColor: 'var(--accent)' }}
            />
            <div className="flex items-center gap-1 px-3 py-2 rounded-xl shrink-0" style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
              <input
                type="number" min="0" max="100" step="1"
                value={autoInitialPct}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setAutoInitialPct(isNaN(n) ? 0 : Math.min(100, Math.max(0, n)));
                }}
                className="w-10 bg-transparent text-sm font-black text-right outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <span className="text-sm font-black" style={{ color: 'var(--text-tertiary)' }}>%</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 min-h-[14px]">
            {savingPct && (
              <span className="w-2.5 h-2.5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            )}
            <p className="text-[9px] font-bold" style={{ color: savingPct ? 'var(--accent)' : 'var(--text-tertiary)' }}>
              {pctSyncMsg || 'Se guarda y aplica automáticamente a tu inventario.'}
            </p>
          </div>
          <p className="text-[9px] font-medium mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Solo actualiza vehículos cuyo inicial fue autogenerado — nunca sobreescribe uno que hayas escrito tú mismo.
          </p>
        </div>
      )}
    </div>
  );
};

const SettingsView = ({ userProfile, onLogout, onUpdateProfile, showToast, onDisconnectGhl, onShowDealerSwitcher, isSuperAdmin, isPlatformAdminUser, requestConfirmation, onInventoryRecalculated }) => {
  const { t, locale, changeLocale, SUPPORTED_LOCALES, LOCALE_LABELS } = useI18n();
  const { theme, isDark, toggleTheme } = useTheme();
  const { selected: selectedCurrencies, setPrimarySecondary, CURRENCIES: CURR_MAP, CURRENCY_CODES: CURR_CODES } = useCurrency();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: userProfile?.name || '',
    jobTitle: userProfile?.jobTitle || 'Vendedor',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const [openToolIdx, setOpenToolIdx] = useState(null);

  useEffect(() => {
    if (userProfile) {
      setFormData({
        name: (userProfile.email?.toLowerCase() === 'jeancarlosgf13@gmail.com') ? 'Jean Gomez' : (userProfile.name || ''),
        jobTitle: userProfile.jobTitle || 'Vendedor',
      });
    }
  }, [userProfile]);

  const handleSave = async () => {
    setIsLoading(true);
    await onUpdateProfile(formData);
    setIsEditing(false);
    setIsLoading(false);
    showToast(t('toast_profile_updated'));
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    const uploadUserId = userProfile?.id || userProfile?.uid || userProfile?.email?.replace(/\./g, '_');
    if (!file || !uploadUserId) return;

    // Validar tipo de imagen
    if (!file.type.startsWith('image/')) {
      showToast(t('toast_error_select_image'));
      return;
    }

    try {
      setIsUploading(true);
      const storagePath = `fotos_perfil/${uploadUserId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      await onUpdateProfile({ ...formData, photoURL });
      showToast(t('toast_photo_updated'));
    } catch (error) {
      console.error("Error al subir foto:", error);
      showToast(t('toast_error_upload_photo'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile?.dealerId) return;

    if (!file.type.startsWith('image/')) {
      showToast(t('toast_error_select_image'));
      return;
    }

    try {
      setIsUploadingLogo(true);
      const storagePath = `logos/${userProfile.dealerId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const logoURL = await getDownloadURL(storageRef);

      // Sincronizar Firebase Dealer (que todos los usuarios locales ven)
      const idBusqueda = userProfile.dealerName ? userProfile.dealerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "") : '';
      const dealerRef = doc(db, "Dealers", userProfile.dealerId);
      await setDoc(dealerRef, { logo_url: logoURL, ...(idBusqueda ? { id_busqueda: idBusqueda } : {}) }, { merge: true });

      // Update Supabase (por si acaso o para GHL/Bot - no critical for read)
      try {
        await supabase.from('dealers').update({ logo_url: logoURL }).eq('id', userProfile.dealerId);
      } catch (err) {
        console.warn("Supabase logo update skipped or failed due to RLS, but Firebase updated:", err);
      }

      // Update Local userProfile to reflect it immediately
      await onUpdateProfile({ ...formData, dealer_logo: logoURL });

      showToast(t('toast_logo_updated'));
    } catch (error) {
      console.error("Error al subir logo:", error);
      showToast(t('toast_error_upload_logo'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleOpenBotLink = () => {
    if (!userProfile?.dealerId) return;
    const catLinkDealerId = userProfile.supabaseDealerId || userProfile.dealerId;
    const link = `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealer=${encodeURIComponent(catLinkDealerId)}`;
    window.open(link, '_blank');
  };

  const isDuranFernandezDealer = (() => {
    const dn = (userProfile?.dealerName || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return dn.includes('DURAN') && dn.includes('FERNANDEZ');
  })();

  const dealerSlugForTools = (() => {
    const dealerName = userProfile?.dealerName || 'default';
    if (isDuranFernandezDealer) return 'duran-fernandez-auto-srl';
    return dealerName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  })();

  const toolItems = [
    {
      // Link liviano con datos b\u00e1sicos + etiquetas para respuestas r\u00e1pidas del bot
      title: t('bot_carbot'),
      description: 'Copia el enlace del bot con datos b\u00e1sicos para respuestas r\u00e1pidas.',
      icon: Sparkles,
      iconColor: '#A855F7',
      iconBg: 'rgba(168, 85, 247, 0.12)',
      actionLabel: 'Copiar enlace',
      action: () => {
        const link = `https://carbotsystem.com/inventario/${dealerSlugForTools}/carbot-simple`;
        navigator.clipboard.writeText(link);
        showToast(t('toast_link_copied_bot'));
      }
    },
    {
      // Especificaciones completas + fotos
      title: t('bot_specs'),
      description: 'Copia el enlace con especificaciones completas y fotos del inventario.',
      icon: Sparkles,
      iconColor: '#A855F7',
      iconBg: 'rgba(168, 85, 247, 0.12)',
      actionLabel: 'Copiar enlace',
      action: () => {
        const linkJson = `https://carbotsystem.com/inventario/${dealerSlugForTools}/bot`;
        navigator.clipboard.writeText(linkJson);
        showToast(t('toast_link_copied_specs'));
      }
    },
    {
      title: t('public_catalog'),
      description: 'Copia el enlace del cat\u00e1logo p\u00fablico de tu inventario.',
      icon: LayoutGrid,
      iconColor: '#F97316',
      iconBg: 'rgba(249, 115, 22, 0.12)',
      actionLabel: 'Copiar enlace',
      action: () => {
        const link = userProfile?.catalogo_url || (() => {
          const dn = userProfile?.dealerName || 'default';
          const s = dn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          return `https://carbotsystem.com/inventario/${s}/catalogo`;
        })();
        navigator.clipboard.writeText(link);
        showToast(t('toast_link_copied_catalog'));
      }
    },
    ...(() => {
      if (isDuranFernandezDealer) {
        return [{
          title: 'Cat\u00e1logo Meta',
          description: 'Copia el enlace del feed de cat\u00e1logo para Meta (Facebook/Instagram).',
          icon: FileSpreadsheet,
          iconColor: '#1877F2',
          iconBg: 'rgba(24, 119, 242, 0.12)',
          actionLabel: 'Copiar enlace',
          action: () => {
            navigator.clipboard.writeText('https://us-central1-carbot-5d709.cloudfunctions.net/metaFeedDuran');
            showToast('Link de Cat\u00e1logo Meta copiado');
          }
        }];
      }
      return [];
    })(),
    {
      title: t('platform_status'),
      description: !!userProfile?.ghlLocationId ? 'Tu cuenta de GoHighLevel est\u00e1 conectada.' : 'Conecta tu cuenta de GoHighLevel para sincronizar contactos.',
      icon: Link,
      isDisconnectable: true,
      iconColor: !!userProfile?.ghlLocationId ? '#3B82F6' : 'var(--text-tertiary)',
      iconBg: !!userProfile?.ghlLocationId ? 'rgba(59, 130, 246, 0.12)' : 'var(--input-bg)',
      isConnected: !!userProfile?.ghlLocationId,
      actionLabel: !!userProfile?.ghlLocationId ? 'Desconectar' : 'Conectar',
      action: () => {
        if (!!userProfile?.ghlLocationId) {
          if (onDisconnectGhl) onDisconnectGhl();
        } else {
          const dealerUuid = userProfile?.supabaseDealerId || userProfile?.dealerId || '';
          const stateParam = dealerUuid ? `&state=${encodeURIComponent(dealerUuid)}` : '';
          window.open(`${GHL_INSTALL_URL}${stateParam}`, '_blank');
        }
      }
    },
    {
      title: 'Financiamiento',
      icon: CreditCard,
      iconColor: '#10B981',
      iconBg: 'rgba(16, 185, 129, 0.12)',
      render: () => <FinancingBanksCard userProfile={userProfile} showToast={showToast} embedded />,
    },
    {
      title: 'API de Inventario',
      icon: Key,
      iconColor: '#0EA5E9',
      iconBg: 'rgba(14, 165, 233, 0.12)',
      render: () => <DealerApiKeyCard userProfile={userProfile} showToast={showToast} />,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full h-full flex flex-col lg:flex-row gap-0 lg:gap-6 overflow-y-auto lg:overflow-hidden"
    >
      {/* ─── LEFT COLUMN: Profile Hero ─── */}
      <div className="w-full lg:w-[380px] xl:w-[420px] lg:h-full lg:overflow-y-auto shrink-0 flex flex-col items-center relative lg:sticky lg:top-0 glass-card rounded-none lg:rounded-3xl p-6 sm:p-8 lg:p-10" style={{ boxShadow: 'none', border: 'none', borderRight: '1px solid var(--divider)' }}>

        {/* Logout button */}
        {!isEditing && (
          <button
            onClick={onLogout}
            className="absolute top-5 right-5 z-30 flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95"
            style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}
            title={t('logout')}
          >
            <LogOut size={18} />
          </button>
        )}

        {/* Dealer logo + name */}
        <div className="flex items-center gap-3 self-start mb-8 group/dealer cursor-pointer">
          <div className="w-11 h-11 rounded-xl p-1 flex items-center justify-center relative transition-all duration-300 group-hover/dealer:shadow-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }} onClick={() => userProfile?.role === 'Admin' && !isUploadingLogo && logoInputRef.current?.click()}>
            <img src={userProfile?.dealer_logo || '/default-logo.png'} alt="Dealer" className="w-full h-full object-contain" />
            {userProfile?.role === 'Admin' && (
              <div className={`absolute inset-0 rounded-[10px] backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 ${isUploadingLogo ? 'opacity-100 z-10' : 'opacity-0 z-[-1] group-hover/dealer:z-10 group-hover/dealer:opacity-100'}`} style={{ background: 'rgba(0,0,0,0.4)' }}>
                {isUploadingLogo ? <Loader2 size={16} className="animate-spin text-white" /> : <Camera size={14} className="text-white" />}
              </div>
            )}
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-tertiary)' }}>{t('dealer_label')}</p>
            <p className="text-sm font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{userProfile?.dealerName || userProfile?.dealer_name || 'Dealer'}</p>
          </div>
          <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
        </div>

        {/* Avatar */}
        <div className="relative w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] flex items-center justify-center group/profile mb-6">
          <div className="absolute w-[116px] h-[116px] sm:w-[136px] sm:h-[136px] rounded-[32px] sm:rounded-[36px] transition-transform duration-500 group-hover/profile:scale-105" style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}></div>
          <div
            className="relative w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-[28px] sm:rounded-[32px] overflow-hidden cursor-pointer transition-all duration-500 group-hover/profile:scale-[1.02] z-10"
            style={{ background: 'var(--bg-tertiary)', boxShadow: 'var(--shadow-card)' }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {(userProfile?.photoURL || userProfile?.avatar_url || userProfile?.foto_url) ? (
              <img src={userProfile.photoURL || userProfile.avatar_url || userProfile.foto_url} alt="Profile" className="w-full h-full object-cover transition-transform duration-500 group-hover/profile:scale-110" />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-4xl font-black" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-elevated)' }}>{userProfile?.name?.charAt(0) || 'U'}</span>
            )}
            <div className={`absolute inset-0 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 ${isUploading ? 'opacity-100 z-20' : 'opacity-0 z-[-1] group-hover/profile:z-20 group-hover/profile:opacity-100'}`} style={{ background: 'rgba(0,0,0,0.4)' }}>
              {isUploading ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
            </div>
          </div>
          <div className="absolute top-[4px] left-[4px] sm:top-[6px] sm:left-[6px] w-10 h-10 sm:w-11 sm:h-11 rounded-[14px] flex items-center justify-center text-white z-20 transition-transform duration-500 group-hover/profile:-translate-x-1 group-hover/profile:-translate-y-1" style={{ background: '#2563EB', boxShadow: '0 6px 16px rgba(37,99,235,0.35)', border: '3px solid var(--bg-primary)' }}>
            <ShieldCheck size={18} strokeWidth={2.5} />
          </div>
          <div
            className="absolute bottom-[4px] right-[4px] sm:bottom-[6px] sm:right-[6px] w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] flex items-center justify-center text-white z-30 cursor-pointer transition-all duration-500 group-hover/profile:translate-x-1 group-hover/profile:translate-y-1 group-hover/profile:scale-110 active:scale-95"
            style={{ background: 'var(--accent)', boxShadow: '0 6px 16px rgba(239,68,68,0.35)', border: '3px solid var(--bg-primary)' }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <Camera size={18} strokeWidth={2.5} />
          </div>
        </div>
        <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />

        {/* Name & Role */}
        {isEditing ? (
          <div className="flex flex-col items-center gap-2 mb-4 w-full max-w-[260px]">
            <input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="text-xl font-black bg-transparent text-center border-b-2 outline-none px-2 py-1 w-full transition-all"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--accent)' }}
              autoFocus
            />
            <input
              value={formData.jobTitle}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
              className="text-sm font-bold bg-transparent text-center border-b-2 outline-none px-2 py-1 w-full transition-all"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-glass)' }}
            />
          </div>
        ) : (
          <>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight font-display" style={{ color: 'var(--text-primary)' }}>{userProfile?.name || 'Admin'}</h2>
            <div className="mt-2 mb-4 flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
              <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>{userProfile?.role || 'ADMIN'}</span>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-white rounded-2xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}
            >
              <User size={16} /> {t('configure_profile')}
            </button>
          ) : (
            <>
              <button
                onClick={() => { setIsEditing(false); setFormData({ name: userProfile?.name || '', jobTitle: userProfile?.jobTitle || 'Vendedor' }); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
              >
                {t('cancel').toUpperCase()}
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 text-white rounded-2xl text-sm font-bold transition-all disabled:opacity-50 active:scale-95"
                style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> {t('save').toUpperCase()}</>}
              </button>
            </>
          )}
          {(isSuperAdmin || isPlatformAdminUser) && !isEditing && (
            <button
              onClick={onShowDealerSwitcher}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', boxShadow: 'var(--shadow-card)' }}
            >
              <LayoutGrid size={16} /> {t('panel_master')}
            </button>
          )}
        </div>

        {/* Quick info rows (mobile visible, desktop below avatar) */}
        <div className="w-full mt-8 space-y-2">
          {[
            { icon: AtSign, label: t('email'), value: userProfile?.email || 'usuario@dealer.com', color: 'var(--accent-secondary)' },
            { icon: Building2, label: t('dealer_label'), value: userProfile?.dealerName || userProfile?.dealer_name || 'Dealer', color: 'var(--accent)' },
            { icon: Lock, label: t('password_label'), value: '••••••••', color: 'var(--accent)' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 hover:scale-[1.01]" style={{ background: 'var(--input-bg)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: row.color }}>
                <row.icon size={16} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>{row.label}</p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{row.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── RIGHT COLUMN: Settings Sections ─── */}
      <div className="flex-1 lg:h-full lg:overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-4 space-y-6">

        {/* Appearance: Language + Theme */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.2em] mb-4 uppercase px-1" style={{ color: 'var(--text-tertiary)' }}>{t('appearance')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Language */}
            <div className="glass-card rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5" style={{ borderRadius: '20px' }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(10, 132, 255, 0.12)', color: 'var(--accent-secondary)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>{t('language')}</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{LOCALE_LABELS[locale]}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {SUPPORTED_LOCALES.map(loc => (
                  <button
                    key={loc}
                    onClick={() => changeLocale(loc)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all duration-300 active:scale-95"
                    style={locale === loc ? { background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' } : { background: 'var(--input-bg)', color: 'var(--text-secondary)' }}
                  >
                    {LOCALE_LABELS[loc]}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="glass-card rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5" style={{ borderRadius: '20px' }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: isDark ? '#FBBF24' : 'var(--text-secondary)' }}>
                  {isDark ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>{t('theme')}</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isDark ? t('darkMode') : t('lightMode')}</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className="w-full py-2 rounded-xl text-xs font-bold transition-all duration-300 active:scale-95"
                style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}
              >
                {isDark ? `☀️ ${t('lightMode')}` : `🌙 ${t('darkMode')}`}
              </button>
            </div>
          </div>
        </div>

        {/* Currencies: Primary + Secondary */}
        <CurrencyPairCard
          CURR_MAP={CURR_MAP}
          CURR_CODES={CURR_CODES}
          selectedCurrencies={selectedCurrencies}
          setPrimarySecondary={setPrimarySecondary}
          showToast={showToast}
          t={t}
          userProfile={userProfile}
          requestConfirmation={requestConfirmation}
          onInventoryRecalculated={onInventoryRecalculated}
        />

        {/* Security: Password */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.2em] mb-4 uppercase px-1" style={{ color: 'var(--text-tertiary)' }}>{t('account_security')}</h3>
          <ChangePasswordCard userProfile={userProfile} showToast={showToast} t={t} />
        </div>

        {/* Contact: WhatsApp number/link used by the public vehicle page */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.2em] mb-4 uppercase px-1" style={{ color: 'var(--text-tertiary)' }}>Contacto</h3>
          <WhatsAppContactCard userProfile={userProfile} showToast={showToast} />
        </div>

        {/* Tools */}
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.2em] mb-4 uppercase px-1" style={{ color: 'var(--text-tertiary)' }}>{t('tools')}</h3>
          <div className="grid grid-cols-2 gap-3">
            {toolItems.map((tool, idx) => {
              const isExpandable = !!tool.render || tool.isDisconnectable;
              const isOpen = isExpandable && openToolIdx === idx;
              return (
                <div key={idx} className={isOpen ? 'col-span-2' : 'col-span-1'}>
                  <button
                    type="button"
                    onClick={() => isExpandable ? setOpenToolIdx(isOpen ? null : idx) : tool.action()}
                    className="glass-card w-full rounded-2xl px-4 py-4 flex items-center gap-3 text-left transition-all duration-300 hover:-translate-y-0.5 group active:scale-[0.99]"
                    style={{ borderRadius: '18px', border: `2px solid ${isOpen ? 'var(--accent)' : 'transparent'}` }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110" style={{ background: tool.isDisconnectable && !tool.isConnected ? 'rgba(255,59,48,0.12)' : tool.iconBg, color: tool.isDisconnectable && !tool.isConnected ? 'var(--accent)' : tool.iconColor }}>
                      <tool.icon size={18} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{tool.title}</span>
                      {tool.isConnected !== undefined && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] mt-0.5 block" style={{ color: tool.isConnected ? '#10B981' : 'var(--accent)' }}>
                          {tool.isConnected ? t('connected') : t('disconnected')}
                        </span>
                      )}
                    </div>
                    {isExpandable ? (
                      <ChevronDown size={16} className="shrink-0 transition-transform duration-300" style={{ color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    ) : (
                      <Copy size={16} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    )}
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="glass-card rounded-2xl px-5 py-4 mt-2" style={{ borderRadius: '18px' }}>
                          {tool.render ? tool.render() : (
                          <>
                          <p className="text-[11px] font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>{tool.description}</p>
                          <button
                            type="button"
                            onClick={() => { tool.action(); if (!tool.isDisconnectable) setOpenToolIdx(null); }}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95"
                            style={tool.isDisconnectable && tool.isConnected ? { background: 'rgba(255,59,48,0.12)', color: 'var(--accent)' } : { background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }}
                          >
                            {tool.actionLabel}
                          </button>
                          </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom spacer for mobile nav */}
        <div className="h-24 sm:h-6 shrink-0" />
      </div>
    </motion.div>
  );
};

const DashboardView = ({ inventory, contracts, onNavigate, userProfile }) => {
  const { t } = useI18n();
  const { getTotals, formatPrice } = useCurrency();
  // Stats Calculations
  const availableInventory = inventory.filter(i => i.status === 'available' || i.status === 'quoted');
  const soldInventory = inventory.filter(i => i.status === 'sold');

  const activeInventory = (inventory || []).filter(i => i && i.status !== 'trash');
  const totals = getTotals(inventory);

  const recentContracts = contracts.slice(0, 5);

  // Determine names from verified backend profile first, fallback to GHL iframe parameters if missing
  const params = new URLSearchParams(window.location.search);
  const rawDealerName = userProfile?.dealerName || params.get('location_name') || 'Tu Dealer';
  const displayDealerName = rawDealerName.trim().replace(/[*_~\`]/g, '').toUpperCase();
  const displayUserName = userProfile?.name || params.get('user_name') || 'Usuario';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4 sm:space-y-6"
    >

      {/* Welcome Banner — premium glass with accent gradient */}
      <Card className="relative overflow-hidden border-none text-white shadow-xl banner-gradient" style={{ borderRadius: '28px' }}>
        <div className="relative z-10 p-5 sm:p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-5 sm:gap-6">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black mb-1 tracking-tight font-display">
              {t('welcome_banner')}
            </h1>
            <h2 className="text-lg sm:text-2xl md:text-3xl font-black italic text-white/70 tracking-wide mb-3 sm:mb-4">
              {displayDealerName}
            </h2>
            <p className="text-white/70 text-sm sm:text-base md:text-lg font-medium">
              {t('hello_user')} <span className="font-bold text-white">{displayUserName.split(' ')[0]}</span>.
              {' '}{t('ready_to_sell')}
            </p>
          </div>

          <div className="flex flex-row gap-3 w-full md:w-auto">
            <button
              onClick={() => onNavigate('contacts')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 text-white font-bold rounded-2xl backdrop-blur-sm border border-white/20 transition-all shadow-lg active:scale-95 text-xs sm:text-base"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <Users size={18} className="sm:w-[20px] sm:h-[20px]" />
              <span>{t('view_contacts')}</span>
            </button>
            <button
              onClick={() => onNavigate('inventory')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 font-bold rounded-2xl shadow-lg transition-all active:scale-95 text-xs sm:text-base"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--accent)' }}
            >
              <PlusCircle size={18} className="sm:w-[20px] sm:h-[20px]" />
              <span>{t('new_vehicle')}</span>
            </button>

          </div>
        </div>
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-24 -mb-24 pointer-events-none"></div>
      </Card>

      {/* Row 1: Key Stats-Side by Side on Mobile */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-6">
        {/* Inventario Card */}
        <Card className="glass-card p-4 sm:p-8 border-none relative overflow-hidden group cursor-pointer transition-all" onClick={() => onNavigate('inventory', 'available')}>
          <div className="flex justify-between items-start">
            <div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-4 group-hover:scale-110 group-hover:rotate-12 transition-transform" style={{ background: 'var(--accent-soft)', color: 'var(--accent-secondary)' }}>
                <Box size={16} className="sm:w-[24px] sm:h-[24px]" />
              </div>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest mb-0.5 sm:mb-1" style={{ color: 'var(--text-secondary)' }}>{t('inventory_label')}</p>
              <h2 className="text-2xl sm:text-4xl font-black" style={{ color: 'var(--text-primary)' }}>{availableInventory.length}</h2>
            </div>
          </div>
          <Box className="absolute -bottom-4 -right-4 sm:-bottom-6 sm:-right-6 opacity-[0.06] group-hover:opacity-[0.12] group-hover:scale-125 group-hover:-rotate-12 transition-all duration-500 w-[60px] h-[60px] sm:w-[120px] sm:h-[120px]" style={{ color: 'var(--text-primary)' }} />
        </Card>

        {/* Vendidos Card */}
        <Card className="glass-card p-4 sm:p-8 border-none relative overflow-hidden group cursor-pointer transition-all" onClick={() => onNavigate('inventory', 'sold')}>
          <div className="flex justify-between items-start">
            <div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-4 group-hover:scale-110 group-hover:rotate-12 transition-transform" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <DollarSign size={16} className="sm:w-[24px] sm:h-[24px]" />
              </div>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest mb-0.5 sm:mb-1" style={{ color: 'var(--text-secondary)' }}>{t('sold_label')}</p>
              <h2 className="text-2xl sm:text-4xl font-black" style={{ color: 'var(--text-primary)' }}>{soldInventory.length}</h2>

            </div>
            <span className="text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>OK</span>
          </div>
          <DollarSign className="absolute -bottom-6 -right-6 opacity-[0.06] group-hover:opacity-[0.12] group-hover:scale-125 group-hover:-rotate-12 transition-all duration-500" style={{ color: 'var(--accent)' }} size={120} />
        </Card>
      </div>

      {/* Row 2: Global Figures */}
      <Card className="glass-card p-8 border-none">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center" style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}>
              <DollarSign size={32} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{t('total_value')}</p>
              <h2 className="text-2xl sm:text-3xl font-black leading-none font-display" style={{ color: 'var(--text-primary)' }}>{t('global_figures')}</h2>
            </div>
          </div>
          <span className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border-glass)' }}>
            +5.4% {t('this_month')}
          </span>
        </div>

        <div className={`grid grid-cols-1 ${totals.length > 1 ? 'md:grid-cols-2' : ''} gap-8`} style={{ borderColor: 'var(--divider)' }}>
          {totals.map((t_item, idx) => (
            <div key={t_item.code} className={idx === 0 && totals.length > 1 ? 'md:pr-8' : idx === 1 ? 'md:pl-8' : ''} style={idx === 0 && totals.length > 1 ? { borderRight: '1px solid var(--divider)' } : {}}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>{t(`currency_${t_item.code}`)}</p>
              <p className="text-3xl sm:text-4xl font-black" style={{ color: idx === 0 ? 'var(--text-primary)' : 'var(--accent)' }}>{t_item.symbol} {t_item.total.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Row 3: Contracts & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Contratos Recientes */}
        <Card className="lg:col-span-2 glass-card p-8 border-none h-full">
          <div className="flex justify-between items-start mb-1">
            <h3 className="text-lg font-black font-display" style={{ color: 'var(--text-primary)' }}>{t('recent_contracts')}</h3>
            <button onClick={() => onNavigate('contacts')} className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors" style={{ color: 'var(--accent)' }}>
              VER CONTACTOS <ArrowUpRight size={14} />
            </button>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-8" style={{ color: 'var(--text-secondary)' }}>{t('last_transactions')}</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--divider)' }}>
                <tr>
                  <th className="pb-4 pl-2">{t('vehicle_product')}</th>
                  <th className="pb-4">{t('client_label')}</th>
                  <th className="pb-4">{t('date_label')}</th>
                  <th className="pb-4 text-right pr-2">{t('amount_label')}</th>
                </tr>
              </thead>
              <tbody>
                {recentContracts.length > 0 ? recentContracts.map(contract => (
                  <tr key={contract.id} className="group transition-colors" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="py-4 pl-2">
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {contract.vehicle || `${contract.make || ''} ${contract.model || ''} ${contract.year || ''}`.trim() || t('vehicle_undetermined')}
                      </p>
                      <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>{contract.template}</p>
                    </td>
                    <td className="py-4 text-xs font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>{contract.client}</td>
                    <td className="py-4 text-xs font-bold uppercase" style={{ color: 'var(--text-tertiary)' }}>{new Date(contract.createdAt).toLocaleDateString()}</td>
                    <td className="py-4 text-right pr-2 font-black text-sm" style={{ color: 'var(--text-primary)' }}>
                      {contract.price > 0 ? formatPrice(contract.price, contract.currency || 'DOP') : 'N/A'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center opacity-40">
                        <Box size={48} className="mb-3" style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>{t('no_recent_contracts')}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Actividad Reciente */}
        <Card className="glass-card p-8 border-none h-full">
          <h3 className="text-lg font-black font-display mb-1 pb-2 inline-block" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>{t('recentActivity')}</h3>

          <div className="mt-8 space-y-6">
            <div className="flex items-center gap-3 opacity-50">
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--text-tertiary)' }}></div>
              <p className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>{t('no_recent_activity')}</p>
            </div>
          </div>
        </Card>
      </div>

    </motion.div>
  );
};
// ─── CSV Import Modal ─────────────────────────────────────────────────────────
const IMPORT_COLUMNS = [
  { key: 'marca',             example: 'Toyota',              note: 'Marca del vehículo' },
  { key: 'modelo',            example: 'Corolla',             note: 'Modelo' },
  { key: 'anio',              example: '2022',                note: 'Año (número)' },
  { key: 'edicion',           example: 'XSE',                 note: 'Versión/edición' },
  { key: 'tipo_vehiculo',     example: 'Sedán',               note: 'Jeepeta | Sedán | Pick-Up | Van | Camión | Otro' },
  { key: 'color',             example: 'Blanco',              note: 'Color exterior' },
  { key: 'estado',            example: 'Disponible',          note: 'Disponible | Cotizado | Vendido | Próximamente' },
  { key: 'precio',            example: '850000',              note: 'Precio de venta (número sin comas)' },
  { key: 'moneda_precio',     example: 'DOP',                 note: 'USD o DOP' },
  { key: 'inicial',           example: '200000',              note: 'Pago inicial sugerido (número sin comas)' },
  { key: 'moneda_inicial',    example: 'DOP',                 note: 'USD o DOP' },
  { key: 'millas',            example: '35000',               note: 'Kilometraje/millaje (número sin comas)' },
  { key: 'transmision',       example: 'Automática',          note: 'Automática | Manual' },
  { key: 'combustible',       example: 'Gasolina',            note: 'Gasolina | Diesel | Híbrido | Eléctrico' },
  { key: 'motor',             example: '2.5L',                note: 'Cilindrada o descripción del motor' },
  { key: 'traccion',          example: 'AWD',                 note: 'FWD | RWD | AWD | 4x4' },
  { key: 'techo',             example: 'Panorámico',          note: 'Tipo de techo (Panorámico | Solar | Sin techo)' },
  { key: 'material_asientos', example: 'Cuero',               note: 'Cuero | Tela | Cuero sintético | etc.' },
  { key: 'cantidad_asientos', example: '5',                   note: 'Número de asientos (número)' },
  { key: 'chasis_vin',        example: '1HGBH41JXMN109186',  note: 'VIN o número de chasis' },
  { key: 'condicion_carfax',  example: 'Clean',               note: 'Clean | Salvage | Rebuilt | etc.' },
  { key: 'llave',             example: 'Smart Key',           note: 'Smart Key | Llave física | Tarjeta' },
  { key: 'camara',            example: '360°',                note: 'Trasera | 360° | Sin cámara' },
  { key: 'carplay',           example: 'true',                note: 'true o false' },
  { key: 'sensores',          example: 'true',                note: 'true o false' },
  { key: 'baul_electrico',    example: 'true',                note: 'true o false' },
  { key: 'vidrios_electricos',example: 'true',                note: 'true o false' },
];

const BOOL_KEYS = new Set(['carplay', 'sensores', 'baul_electrico', 'vidrios_electricos']);
const NUM_KEYS  = new Set(['anio', 'precio', 'inicial', 'millas', 'cantidad_asientos']);

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === 'sí' || s === 'si' || s === '1' || s === 'yes';
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
    return row;
  });
}

const ImportInventoryModal = ({ isOpen, onClose, onSave, userProfile, resolvedDealerId, showToast }) => {
  const [tab, setTab] = useState('download');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const fileRef = React.useRef(null);

  const dealerId = resolvedDealerId || userProfile?.dealerId || userProfile?.dealer_id || '';

  const downloadTemplate = () => {
    const headers = IMPORT_COLUMNS.map(c => c.key);
    const exampleRow = IMPORT_COLUMNS.map(c => c.example);
    // Escape values that contain commas
    const escapeCSV = (val) => (String(val).includes(',') ? `"${val}"` : String(val));
    const csvContent = [
      headers.map(escapeCSV).join(','),
      exampleRow.map(escapeCSV).join(','),
    ].join('\n');
    const bom = '﻿';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Plantilla Inventario CarBot.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(f, 'utf-8');
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setProgress({ done: 0, total: 0, errors: [] });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = parseCSV(ev.target.result);
      const errors = [];
      setProgress({ done: 0, total: rows.length, errors: [] });
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i];
        const vehicleData = {};
        for (const col of IMPORT_COLUMNS) {
          const val = raw[col.key];
          if (val === undefined || val === '') continue;
          if (BOOL_KEYS.has(col.key)) vehicleData[col.key] = parseBool(val);
          else if (NUM_KEYS.has(col.key)) vehicleData[col.key] = Number(val) || 0;
          else vehicleData[col.key] = val;
        }
        // Force dealer_id to the authenticated dealer, never trust CSV value
        vehicleData.dealer_id = dealerId;
        if (!vehicleData.marca && !vehicleData.modelo) {
          errors.push(`Fila ${i + 2 + skipped}: falta marca o modelo`);
          setProgress(p => ({ ...p, done: p.done + 1, errors: [...p.errors, `Fila ${i + 2 + skipped}: falta marca o modelo`] }));
          continue;
        }
        try {
          await onSave(vehicleData);
        } catch (err) {
          errors.push(`Fila ${i + 2}: ${err.message || 'error desconocido'}`);
        }
        setProgress(p => ({ ...p, done: p.done + 1, errors: errors.slice() }));
      }
      setImporting(false);
      if (errors.length === 0) {
        showToast(`${rows.length} vehículo(s) importado(s) con éxito`);
        onClose();
      } else {
        showToast(`Importación completada con ${errors.length} error(es)`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border-glass)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-600">
              <FileSpreadsheet size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.15em]" style={{ color: 'var(--text-primary)' }}>Importar Inventario</h2>
              <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-tertiary)' }}>CSV masivo de vehículos</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-red-50 dark:hover:bg-red-950/30" style={{ color: 'var(--text-tertiary)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-1 m-4 mb-0 rounded-2xl" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
          {[['download', Download, 'Descargar Plantilla'], ['upload', UploadCloud, 'Subir CSV']].map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === key ? 'shadow-md' : ''}`}
              style={tab === key ? { background: 'var(--bg-elevated)', color: 'var(--accent)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-secondary)' }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'download' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>La plantilla incluye</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {IMPORT_COLUMNS.filter(c => c.key !== '_ejemplo').map(c => (
                    <span key={c.key} className="px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{c.key}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl p-4 text-xs space-y-1" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="font-black text-red-600 uppercase tracking-widest text-[10px]">Importante</p>
                <p style={{ color: 'var(--text-secondary)' }}>La plantilla incluye una <span className="font-bold">fila de muestra</span> con todos los campos llenos — úsala como guía. Bórrala antes de subir o súbela tal cual, el sistema asignará el inventario a tu cuenta automáticamente.</p>
              </div>
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Download size={16} />
                Descargar Plantilla CSV
              </button>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              <label
                className="flex flex-col items-center justify-center gap-3 py-10 rounded-2xl cursor-pointer transition-all border-2 border-dashed hover:border-red-400"
                style={{ borderColor: file ? 'var(--accent)' : 'var(--border-glass)', background: 'var(--bg-glass)' }}
              >
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <UploadCloud size={32} className={file ? 'text-red-500' : ''} style={!file ? { color: 'var(--text-tertiary)' } : {}} />
                <div className="text-center">
                  <p className="text-sm font-bold" style={{ color: file ? 'var(--accent)' : 'var(--text-secondary)' }}>{file ? file.name : 'Selecciona el archivo CSV'}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Solo archivos .csv</p>
                </div>
              </label>

              {preview.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-glass)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest px-4 py-2.5" style={{ background: 'var(--bg-glass)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-glass)' }}>
                    Vista previa — primeras {preview.length} filas
                  </p>
                  <div className="overflow-x-auto max-h-36">
                    <table className="text-[10px] w-full">
                      <thead>
                        <tr style={{ background: 'var(--bg-tertiary)' }}>
                          {Object.keys(preview[0]).slice(0, 8).map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-black uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border-glass)' }}>
                            {Object.values(row).slice(0, 8).map((v, j) => (
                              <td key={j} className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{String(v).slice(0, 20)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                    <span>Importando...</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-glass)' }}>
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-300"
                      style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                    />
                  </div>
                  {progress.errors.length > 0 && (
                    <div className="rounded-xl p-3 text-[10px] space-y-0.5 max-h-20 overflow-y-auto" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--accent)' }}>
                      {progress.errors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ background: !file || importing ? 'var(--text-tertiary)' : 'var(--accent)', boxShadow: !file || importing ? 'none' : '0 8px 24px rgba(227,28,37,0.3)' }}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                {importing ? 'Importando...' : 'Importar Vehículos'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const InventoryView = ({ inventory, setInventory, quotes = [], contracts = [], showToast, onGenerateContract, onGenerateQuote, onVehicleSelect, onSellQuoted, onSave, onDelete, onDeleteQuote, onRedoSale, activeTab, setActiveTab, userProfile, searchTerm, requestConfirmation, templates = [], resolvedDealerId, isLoading, readOnly, ghlContacts = [] }) => {
  const { t } = useI18n();
  const { formatVehiclePrice, formatPrice, selected: selectedCurrencies } = useCurrency();
  const [localSearch, setLocalSearch] = useState(''); // Search inside the view
  const [sortConfig, setSortConfig] = useState('brand_asc'); // Default alphabetical by Make
  // const [activeTab, setActiveTab] = useState('available'); // Levantado al padre
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = React.useRef(null);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      setOpenMenuId(null);
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setShowHeaderMenu(false);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleDuplicate = async (e, vehicle) => {
    e.stopPropagation();
    setOpenMenuId(null);

    // Preparar el duplicado sin fotos ni datos propios de la unidad física
    // (VIN/chasis, placa, millaje): esos deben quedar vacíos hasta que el
    // usuario los complete manualmente para la nueva unidad.
    const {
      id, images, image, createdAt, updatedAt,
      vin, chassis, chasis_vin,
      plate, placa,
      mileage, millas,
      ...rest
    } = vehicle;

    const duplicatedData = {
      ...rest,
      vin: '',
      chassis: '',
      chasis_vin: null,
      plate: '',
      placa: '',
      mileage: 0,
      millas: 0,
      images: [],
      image: '',
      status: 'available',
      estado: 'Disponible' // Asegurar que el estado sea 'Disponible' al duplicar
    };

    requestConfirmation({
      title: 'Duplicar Vehículo',
      message: `¿Deseas duplicar los datos de ${vehicle.make} ${vehicle.model}? Se creará una copia sin fotos, VIN/chasis, placa ni millaje.`,
      confirmText: 'Duplicar Ahora',
      onConfirm: async () => {
        try {
          await onSave(duplicatedData);
          showToast(`¡Copia de ${vehicle.model} creada con éxito!`);
        } catch (err) {
          showToast("Error al duplicar el vehículo", "error");
        }
      }
    });
  };

  // Marca el vehículo como vendido directamente (sin generar contrato ni pedir
  // datos del cliente) — solo cambia el estado en Supabase para casos donde
  // el dealer ya vendió por fuera del flujo de documentos.
  const handleMarkSoldDirect = (e, vehicle) => {
    e.stopPropagation();
    setOpenMenuId(null);
    requestConfirmation({
      title: 'Marcar como Vendido',
      message: `¿Deseas marcar ${vehicle.make} ${vehicle.model} como vendido? No se generará ningún documento ni se pedirán datos del cliente.`,
      confirmText: 'Marcar como Vendido',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('vehiculos').update({ estado: 'Vendido' }).eq('id', vehicle.id);
          if (error) throw error;
          setInventory(prev => prev.map(v => v.id === vehicle.id ? { ...v, estado: 'Vendido', status: 'sold' } : v));
          showToast(`${vehicle.make} ${vehicle.model} marcado como vendido.`);
        } catch (err) {
          console.error('Error al marcar como vendido:', err);
          showToast('No se pudo marcar como vendido.', 'error');
        }
      }
    });
  };

  const filteredInventory = useMemo(() => {
    let result = inventory.filter(item => {
      // Robust Search String Construction
      const searchContent = `
      ${item.make || ''}
      ${item.model || ''}
      ${item.year || ''}
      ${item.color || ''}
      ${item.vin || ''}
      `.toLowerCase();

      const globalMatches = !searchTerm || searchContent.includes(searchTerm.toLowerCase());
      const localMatches = !localSearch || searchContent.includes(localSearch.toLowerCase());

      let matchesTab = true;
      if (activeTab === 'available') matchesTab = item.status === 'available' || item.status === 'quoted';
      if (activeTab === 'quoted') matchesTab = item.status === 'quoted';
      if (activeTab === 'sold') matchesTab = item.status === 'sold';
      if (activeTab === 'all') matchesTab = true;

      return globalMatches && localMatches && matchesTab;
    });

    // APLICAR ORDEN
    result.sort((a, b) => {
      switch (sortConfig) {
        case 'date_desc': return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'date_asc': return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        case 'year_desc': return (b.year || 0) - (a.year || 0);
        case 'year_asc': return (a.year || 0) - (b.year || 0);
        case 'price_desc': {
          const priceA = a.currency === 'USD' ? (a.price_usd || 0) : (a.price_dop || 0);
          const priceB = b.currency === 'USD' ? (b.price_usd || 0) : (b.price_dop || 0);
          return priceB - priceA;
        }
        case 'price_asc': {
          const priceA = a.currency === 'USD' ? (a.price_usd || 0) : (a.price_dop || 0);
          const priceB = b.currency === 'USD' ? (b.price_usd || 0) : (b.price_dop || 0);
          return priceA - priceB;
        }
        case 'updated_desc': return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
        case 'name_asc': return `${a.make || ''} ${a.model || ''}`.toUpperCase().localeCompare(`${b.make || ''} ${b.model || ''}`.toUpperCase());
        case 'brand_asc':
          const brandCompare = (a.make || '').toUpperCase().localeCompare((b.make || '').toUpperCase());
          if (brandCompare !== 0) return brandCompare;
          return (a.model || '').toUpperCase().localeCompare((b.model || '').toUpperCase());
        default: return 0;
      }
    });

    return result;
  }, [inventory, searchTerm, localSearch, activeTab, sortConfig]);

  const groupedInventory = useMemo(() => {
    const groups = {};
    const isBrandSort = sortConfig === 'brand_asc';

    filteredInventory.forEach(item => {
      const groupKey = isBrandSort ? (item.make || '').toUpperCase() : "RESULTADOS";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return groups;
  }, [filteredInventory, sortConfig, activeTab]);

  const sortedBrands = sortConfig === 'brand_asc'
    ? Object.keys(groupedInventory).sort()
    : Object.keys(groupedInventory);

  const handleCreate = () => { setCurrentVehicle(null); setIsModalOpen(true); };

  const handleSaveWrapper = async (data) => {
    await onSave(data);
    setIsModalOpen(false);
    setCurrentVehicle(null);
  };

  const handleDeleteWrapper = (id) => {
    requestConfirmation({
      title: '¿Confirmar Eliminación?',
      message: '¿Seguro que deseas mover este vehículo a la papelera?',
      confirmText: 'Mover a Papelera',
      isDestructive: true,
      onConfirm: () => onDelete(id)
    });
  };

  const handleRedoSaleWrapper = (vehicle) => {
    const isQuoted = vehicle.status === 'quoted';
    requestConfirmation({
      title: isQuoted ? '¿Rehacer Cotización?' : '¿Rehacer Venta?',
      message: isQuoted
        ? `¿Deseas cancelar la cotización de ${vehicle.make} ${vehicle.model}? el vehículo volverá a estar disponible.`
        : `¿Deseas cancelar la venta de ${vehicle.make} ${vehicle.model}? El vehículo volverá a estar disponible y el contrato asociado se marcará como eliminado.`,
      confirmText: isQuoted ? 'Rehacer Cotización' : 'Rehacer Venta',
      isDestructive: true,
      onConfirm: () => onRedoSale(vehicle.id)
    });
  };

  const openActionModal = (vehicle) => { setCurrentVehicle(vehicle); setIsActionModalOpen(true); };

  const handleActionSelect = (action) => {
    setIsActionModalOpen(false);
    if (action === 'details') {
      onVehicleSelect(currentVehicle);
    } else {
      onSellQuoted(currentVehicle, action === 'quote' ? 'cotizacion' : 'contrato');
    }
  };


  const handleQuoteSent = async (quoteData) => {
    setIsQuoteModalOpen(false);
    showToast("Cotización enviada a GoHighLevel");
    // 1. Guardar la cotización en Firestore (Parent function)
    if (onGenerateQuote) onGenerateQuote(quoteData);

    // 2. Actualizar estado en Firebase a 'quoted'
    if (quoteData.vehicleId || currentVehicle?.id) {
      const vId = quoteData.vehicleId || currentVehicle.id;
      try {
        await supabase.from('vehiculos').update({ estado: 'Cotizado' }).eq('id', vId);
        // Update local state too
        setInventory(prev => prev.map(v =>
          String(v.id) === String(vId) ? { ...v, estado: 'Cotizado', status: 'quoted' } : v
        ));
      } catch (e) {
        console.error("Direct update error:", e);
      }
    }
    setCurrentVehicle(null);
  };

  const handleContractGenerated = (contractData) => {
    // Only persist data — do NOT close the modal here.
    // The modal's own success screen will stay visible, and its onClose will close it.
    onGenerateContract(contractData);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 sm:pb-6" style={{ borderBottom: '1px solid var(--divider)' }}>
        {!readOnly ? (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 font-display" style={{ color: 'var(--text-primary)' }}>
              Inventario: <span style={{ color: 'var(--accent)' }}>{(new URLSearchParams(window.location.search).get('location_name') || userProfile?.dealerName || 'Mi Dealer').trim().replace(/[*_~\`]/g, '')}</span>
              {isLoading && <Loader2 className="animate-spin" size={20} style={{ color: 'var(--text-tertiary)' }} />}
            </h1>
            <p className="text-[10px] sm:text-sm mt-0.5 sm:mt-1 font-medium tracking-tight" style={{ color: 'var(--text-secondary)' }}>
              {isLoading ? 'Sincronizando con el servidor...' : `Organizado por marcas • ${filteredInventory.length} vehículos`}
            </p>
          </div>
        ) : (
          <div className="flex-1 h-2"></div>
        )}

        {!readOnly && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button onClick={handleCreate} icon={Plus} className="flex-1 sm:flex-none shadow-lg shadow-red-600/20 py-3 sm:py-2.5">{t('addNewVehicle')}</Button>
            <div className="relative" ref={headerMenuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(v => !v); }}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}
                title="Más opciones"
              >
                <MoreVertical size={18} />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-12 z-50 rounded-2xl shadow-2xl overflow-hidden min-w-[210px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(false); setShowImportModal(true); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-left transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <UploadCloud size={16} className="text-red-500 flex-shrink-0" />
                    Importar Inventario
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex space-x-1 p-1.5 rounded-2xl w-full sm:w-fit backdrop-blur-sm overflow-x-auto no-scrollbar" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
        <button onClick={() => setActiveTab('available')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all duration-500 ${activeTab === 'available' ? 'shadow-apple-xl scale-[1.02]' : ''}`} style={activeTab === 'available' ? { background: 'var(--bg-elevated)', color: 'var(--accent)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-secondary)' }}>{t('tab_available')}</button>
        <button onClick={() => setActiveTab('quoted')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all duration-500 ${activeTab === 'quoted' ? 'shadow-apple-xl scale-[1.02]' : ''}`} style={activeTab === 'quoted' ? { background: 'var(--bg-elevated)', color: 'var(--accent)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-secondary)' }}>{t('tab_quoted')}</button>
        <button onClick={() => setActiveTab('sold')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all duration-500 ${activeTab === 'sold' ? 'shadow-apple-xl scale-[1.02]' : ''}`} style={activeTab === 'sold' ? { background: 'var(--bg-elevated)', color: 'var(--accent)', boxShadow: 'var(--shadow-card)' } : { color: 'var(--text-secondary)' }}>{t('tab_sold')}</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md group w-full">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors" size={18} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder={t('filter_in_view')}
            className="glass-input w-full pl-11 pr-4 py-3 font-semibold hover:scale-[1.01] active:scale-[0.99]"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold uppercase whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{t('sort_by')}</span>
          <select
            value={sortConfig}
            onChange={(e) => setSortConfig(e.target.value)}
            className="glass-input flex-1 sm:flex-none px-4 py-3 text-sm font-bold appearance-none cursor-pointer"
          >
            <option className="text-slate-800" value="brand_asc">{t('sort_brand_az')}</option>
            <option className="text-slate-800" value="date_desc">Más Recientes</option>
            <option className="text-slate-800" value="year_desc">{t('sort_year_newest')}</option>
            <option className="text-slate-800" value="year_asc">{t('sort_year_oldest')}</option>
            <option className="text-slate-800" value="price_desc">{t('sort_price_high')}</option>
            <option className="text-slate-800" value="price_asc">{t('sort_price_low')}</option>
            <option className="text-slate-800" value="updated_desc">Última Actualización</option>
            <option className="text-slate-800" value="name_asc">{t('sort_model_az')}</option>
          </select>
        </div>
      </div>

      <div className="space-y-6 sm:space-y-10 mt-4">
        {sortedBrands.map(brand => (
          <div key={brand}>
            <div className="flex items-center mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-black mr-2 sm:mr-3 font-display" style={{ color: 'var(--text-primary)' }}>{brand}</h2>
              <div className="h-px flex-1" style={{ background: 'var(--divider)' }}></div>
              <span className="text-[10px] font-black ml-2 sm:ml-3 px-2.5 py-1 rounded-full" style={{ color: 'var(--text-secondary)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>{groupedInventory[brand].length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {groupedInventory[brand].map(item => {
                const isSold = item.status === 'sold';
                const isQuoted = item.status === 'quoted';
                const isUpcoming = item.status === 'upcoming';
                const associatedContract = isSold ? (contracts || []).find(c => String(c.vehicleId) === String(item.id) && c.status !== 'deleted') : null;
                const associatedQuote = isQuoted ? (quotes || []).find(q => String(q.vehicleId) === String(item.id) && q.status !== 'deleted') : null;

                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onVehicleSelect(item);
                    }}
                    className="cursor-pointer"
                  >
                    <Card noPadding className={`glass-card group flex flex-col h-full !overflow-visible relative ${isSold ? 'ring-1 ring-emerald-500/20' :
                      isQuoted ? 'ring-1 ring-amber-400/20' :
                        isUpcoming ? 'ring-1 ring-indigo-400/20' : ''
                      }`}>
                      <div className="relative aspect-[16/10] overflow-hidden rounded-t-[28px]" style={{ background: 'var(--bg-tertiary)' }}>
                        {item.image && !item.image.includes('unsplash') ? (
                          <img src={item.image} alt={item.model} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-8 group-hover:scale-110 transition-transform duration-1000 ease-out" style={{ background: 'var(--bg-tertiary)' }}>
                            {userProfile?.dealer_logo ? (
                              <img src={userProfile.dealer_logo} alt="Dealer Logo" className="w-full h-full object-contain opacity-60 drop-shadow-sm" />
                            ) : (
                              <div className="flex flex-col items-center" style={{ color: 'var(--text-tertiary)' }}>
                                <Car size={48} className="mb-2 opacity-50" />
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Sin Foto</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="absolute top-4 right-4 shadow-xl"><Badge status={item.status} /></div>

                      </div>

                      <div className="p-6 flex flex-col flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-black text-lg leading-tight" style={{ color: 'var(--text-primary)' }}>{item.make} {item.model}</h3>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>{item.year} • {item.edition || 'EDICIÓN'} • {item.color || 'COLOR'}</p>
                          </div>
                        </div>

                        {/* ... (rest of the card content) ... */}

                        {isSold && associatedContract ? (
                          <div className="mb-6 p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-2">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Datos del Comprador
                            </p>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-slate-700">
                                <User size={12} className="text-emerald-600" />
                                <span className="text-xs font-bold truncate">{associatedContract.client || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <IdCard size={12} className="text-emerald-600" />
                                <span className="text-[10px] font-bold">{associatedContract.cedula || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Phone size={12} className="text-emerald-600" />
                                <span className="text-[10px] font-bold">{associatedContract.phone || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Mail size={12} className="text-emerald-600" />
                                <span className="text-[10px] font-bold truncate lowercase">{associatedContract.email || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        ) : isQuoted && associatedQuote ? (
                          <div className="mb-6 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-2">
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Datos del Comprador
                            </p>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-slate-500">
                                <User size={12} className="text-amber-600" />
                                <span className="text-[10px] font-bold truncate">{associatedQuote.client || `${associatedQuote.name || ''} ${associatedQuote.lastname || ''}`.trim() || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <IdCard size={12} className="text-amber-600" />
                                <span className="text-[10px] font-bold">{associatedQuote.cedula || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Phone size={12} className="text-amber-600" />
                                <span className="text-[10px] font-bold">{associatedQuote.phone || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Mail size={12} className="text-amber-600" />
                                <span className="text-[10px] font-bold truncate lowercase">{associatedQuote.email || 'N/A'}</span>
                              </div>
                              {(associatedQuote.bankName || associatedQuote.bank || associatedQuote.banco) && (
                                <div className="flex items-center gap-2 text-slate-500">
                                  <Building2 size={12} className="text-amber-600" />
                                  <span className="text-[10px] font-bold truncate uppercase">{associatedQuote.bankName || associatedQuote.bank || associatedQuote.banco}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mb-6">
                            <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>Precio</p>
                            <p className="text-2xl font-black tracking-tighter" style={{ color: 'var(--accent)' }}>
                              {formatVehiclePrice(item)}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                              Inicial: <span className="font-black" style={{ color: 'var(--text-primary)' }}>{formatPrice(item.inicial || item.initial_payment || item.initial_payment_dop || 0, item.moneda_inicial || item.downPaymentCurrency || item.detalles?.downPaymentCurrency || (item.initial_payment_dop > 0 ? 'DOP' : 'USD'))}</span>
                            </p>
                          </div>
                        )}

                        <div className="mt-auto space-y-2">
                          {item.status === 'quoted' ? (
                            <div className="flex gap-2 items-center">
                              <Button
                                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-emerald-600/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                                onClick={(e) => { e.stopPropagation(); onSellQuoted(item); }}
                              >
                                <FileSignature size={16} /> VENDER AHORA
                              </Button>

                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === item.id ? null : item.id);
                                  }}
                                  className="p-3.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl transition-all active:scale-90"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {openMenuId === item.id && (
                                  <div className="absolute bottom-full right-0 mb-2 w-52 bg-white rounded-[2rem] shadow-2xl border border-slate-100 py-3 z-[60] animate-in slide-in-from-bottom-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentVehicle(associatedQuote);
                                        setIsQuoteModalOpen(true);
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-3"
                                    >
                                      <Copy size={14} /> Duplicar Cotización
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRedoSaleWrapper(item);
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-3"
                                    >
                                      <RefreshCw size={14} /> Rehacer / Rechazar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        requestConfirmation({
                                          title: 'Eliminar Cotización',
                                          message: '¿Seguro que deseas eliminar esta cotización? El vehículo volverá a estar disponible.',
                                          confirmText: 'Eliminar',
                                          isDestructive: true,
                                          onConfirm: async () => {
                                            if (onDeleteQuote) await onDeleteQuote(associatedQuote.id);
                                            // Release vehicle
                                            await supabase.from('vehiculos').update({ estado: 'Disponible' }).eq('id', item.id);
                                            setInventory(prev => prev.map(v => v.id === item.id ? { ...v, estado: 'Disponible', status: 'available' } : v));
                                          }
                                        });
                                        setOpenMenuId(null);
                                      }}
                                      className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                                    >
                                      <Trash2 size={14} /> Eliminar Cotización
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 relative">
                              <Button
                                variant="secondary"
                                className={`flex-1 text-[10px] items-center justify-center font-black rounded-2xl flex gap-2 py-3 active:scale-95 transition-all ${isSold ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-none' : 'bg-slate-50 border-slate-100 text-slate-800 hover:bg-slate-900 hover:text-white'}`}
                                onClick={(e) => { e.stopPropagation(); isSold ? onVehicleSelect(item) : openActionModal(item); }}
                              >
                                {isSold ? <FileText size={14} /> : <Files size={14} />} {isSold ? 'VER EXPEDIENTE' : 'EXPEDIENTE'}
                              </Button>

                              {!isSold && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCurrentVehicle(item); setIsModalOpen(true); }}
                                  className="p-3.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-700 rounded-2xl transition-all active:scale-90"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                              )}

                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                                  className={`p-3.5 rounded-2xl transition-all active:scale-90 ${isSold ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' : 'bg-slate-50 hover:bg-slate-100 text-slate-400'}`}
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {openMenuId === item.id && (
                                  <div className="absolute bottom-full right-0 mb-2 w-60 bg-white rounded-[2rem] shadow-2xl border border-slate-100 py-3 z-[60] animate-in slide-in-from-bottom-2">
                                    {(formatVehicleTimestamp(item.createdAt) || formatVehicleTimestamp(item.updatedAt)) && (
                                      <div className="px-5 pb-3 mb-2 border-b border-slate-100">
                                        <div className="bg-slate-50 rounded-2xl px-4 py-3 space-y-2.5">
                                          {formatVehicleTimestamp(item.createdAt) && (
                                            <div className="flex items-center gap-2.5">
                                              <Calendar size={12} className="text-slate-400 shrink-0" />
                                              <div className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Agregado</span>
                                                <span className="text-[10.5px] font-bold text-slate-700 truncate">{formatVehicleTimestamp(item.createdAt)}</span>
                                              </div>
                                            </div>
                                          )}
                                          {formatVehicleTimestamp(item.updatedAt) && (
                                            <div className="flex items-center gap-2.5">
                                              <RefreshCw size={12} className="text-slate-400 shrink-0" />
                                              <div className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Actualizado</span>
                                                <span className="text-[10.5px] font-bold text-slate-700 truncate">{formatVehicleTimestamp(item.updatedAt)}</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {!isSold && (
                                      <button onClick={(e) => handleMarkSoldDirect(e, item)} className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-3">
                                        <FileSignature size={14} /> Marcar como Vendido
                                      </button>
                                    )}
                                    <button onClick={(e) => handleDuplicate(e, item)} className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-3">
                                      <Copy size={14} /> Duplicar
                                    </button>
                                    {isSold && (
                                      <button onClick={(e) => { e.stopPropagation(); handleRedoSaleWrapper(item); }} className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-3">
                                        <RefreshCw size={14} /> Rehacer Venta
                                      </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteWrapper(item.id); }} className="w-full px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3">
                                      <Trash2 size={14} /> Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}

            </div>
          </div>
        ))}
        {sortedBrands.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 bg-white/50 backdrop-blur-md rounded-[3rem] border-2 border-dashed border-slate-200 animate-in fade-in zoom-in duration-300">
            {isLoading ? (
              <div className="flex flex-col items-center gap-8">
                <div className="relative">
                  {/* Círculo Rojo Rápido solicitado */}
                  <div className="w-28 h-28 border-[8px] border-red-500/10 rounded-full border-t-red-600 shadow-[0_0_40px_rgba(239,68,68,0.2)] animate-spin-fast" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-red-100 shadow-xl">
                      <Car className="text-red-600 animate-pulse" size={24} />
                    </div>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-[0.2em] animate-pulse">Cargando...</h3>
                  <p className="text-slate-500 font-bold text-lg">Preparando tu catálogo CarBot</p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-32 h-32 bg-slate-100 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <Car size={64} className="text-slate-300 group-hover:text-red-300 transition-colors" />
                </div>
                <h3 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
                  {activeTab === 'quoted' ? 'Sin Cotizaciones' : activeTab === 'sold' ? 'Sin Ventas Registradas' : 'Inventario Vacío'}
                </h3>
                <p className="text-slate-500 font-bold text-lg mb-8 max-w-sm mx-auto leading-relaxed">
                  {activeTab === 'quoted'
                    ? 'Genera una cotización desde un vehículo disponible para verlo aquí.'
                    : activeTab === 'sold'
                      ? 'Los vehículos vendidos aparecerán aquí con los datos del comprador.'
                      : 'No se encontraron vehículos que coincidan con los criterios actuales.'}
                </p>
                {!readOnly && activeTab === 'available' && (
                  <Button onClick={handleCreate} icon={Plus} className="shadow-2xl shadow-red-600/20 px-10 py-4 text-base">{t('add_first_vehicle')}</Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isModalOpen && createPortal(
        <VehicleFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveWrapper} initialData={currentVehicle} userProfile={userProfile} />,
        document.body
      )}
      {isActionModalOpen && createPortal(
        <ActionSelectionModal isOpen={isActionModalOpen} onClose={() => setIsActionModalOpen(false)} onSelect={handleActionSelect} />,
        document.body
      )}
      {isQuoteModalOpen && createPortal(
        <GenerateQuoteModal
          isOpen={isQuoteModalOpen}
          onClose={() => { setIsQuoteModalOpen(false); setCurrentVehicle(null); }}
          inventory={inventory}
          onSave={onGenerateQuote}
          templates={templates}
          showToast={showToast}
          initialData={currentVehicle}
        />,
        document.body
      )}
      {showImportModal && createPortal(
        <ImportInventoryModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSave={onSave}
          userProfile={userProfile}
          resolvedDealerId={resolvedDealerId}
          showToast={showToast}
        />,
        document.body
      )}
    </div>
  );
};

const ContractsView = ({ contracts, quotes, inventory, onGenerateContract, onDeleteContract, onGenerateQuote, onDeleteQuote, templates, onSaveTemplate, onDeleteTemplate, userProfile, searchTerm, requestConfirmation, showToast, resolvedDealerId }) => {
  const [activeView, setActiveView] = useState('contracts'); // 'contracts', 'quotes', or 'templates'
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedContractPreview, setSelectedContractPreview] = useState(null);
  const [selectedQuotePreview, setSelectedQuotePreview] = useState(null);
  const [editingContract, setEditingContract] = useState(null);
  const [sortConfig, setSortConfig] = useState('date_desc');


  const filteredData = useMemo(() => {
    const dataToFilter = (activeView === 'contracts' ? contracts : quotes) || [];

    // 1. Filtrar por búsqueda y status
    const filtered = dataToFilter.filter(item => {

      if (item.status === 'deleted') return false; // Filter out deleted items
      const search = searchTerm.toLowerCase();


      if (activeView === 'contracts') {
        return (item?.client || '').toLowerCase().includes(search) ||
          (item?.vehicle || '').toLowerCase().includes(search) ||
          (item?.template || '').toLowerCase().includes(search);
      } else {
        return (item?.name || '').toLowerCase().includes(search) ||
          (item?.lastname || '').toLowerCase().includes(search) ||
          (item?.vehicle || '').toLowerCase().includes(search) ||
          (item?.phone || '').toLowerCase().includes(search);
      }
    });

    // 2. Ordenar
    filtered.sort((a, b) => {
      const da = new Date(a.createdAt || 0);
      const db = new Date(b.createdAt || 0);
      switch (sortConfig) {
        case 'date_desc': return db - da;
        case 'date_asc': return da - db;
        case 'client_asc': {
          const nameA = activeView === 'contracts' ? (a.client || '') : `${a.name || ''} ${a.lastname || ''}`;
          const nameB = activeView === 'contracts' ? (b.client || '') : `${b.client || ''} ${b.lastname || ''}`;
          return nameA.localeCompare(nameB);
        }
        case 'vehicle_asc': return (a.vehicle || '').localeCompare(b.vehicle || '');
        default: return 0;
      }
    });

    // 3. Agrupar por mes
    const groups = {};
    filtered.forEach(item => {
      let groupKey = "RESULTADOS DE BÚSQUEDA";
      if (sortConfig.startsWith('date')) {
        const d = item.createdAt ? new Date(item.createdAt) : new Date();
        const validDate = isNaN(d.getTime()) ? new Date() : d;
        groupKey = validDate.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }).toUpperCase();
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });
    return groups;
  }, [contracts, quotes, activeView, searchTerm, sortConfig]);

  const handleDeleteItem = (id) => {
    const isContract = activeView === 'contracts';
    requestConfirmation({
      title: '¿Confirmar Eliminación?',
      message: isContract
        ? "¿ESTÁS SEGURO? Esta acción eliminará el contrato permanentemente."
        : "¿Seguro que deseas eliminar esta cotización?",
      confirmText: 'Eliminar',
      isDestructive: true,
      onConfirm: () => {
        if (isContract) onDeleteContract(id);
        else onDeleteQuote(id);
      }
    });
  };

  const downloadContractPDF = async (contract) => {
    const tempEl = document.createElement('div');
    tempEl.innerHTML = generateContractHtml(contract, userProfile);

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: contract.id && contract.id.startsWith('Contrato_') ? `${contract.id}.pdf` : `Contrato_${contract.client}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    const html2pdf = (await import('html2pdf.js')).default;
    const cleanElement = prepareElementForPDF(tempEl);
    html2pdf().set(opt).from(cleanElement).save();
  };

  const downloadQuotePDF = async (quote) => {
    const tempEl = document.createElement('div');
    tempEl.innerHTML = generateQuoteHtml(quote, userProfile);
    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: quote.id && quote.id.startsWith('Cotizacion_') ? `${quote.id}.pdf` : `Cotizacion_${quote.name}_${quote.lastname}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    const html2pdf = (await import('html2pdf.js')).default;
    const cleanElement = prepareElementForPDF(tempEl);
    html2pdf().set(opt).from(cleanElement).save();
  };

  const printContract = (contract) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Contrato</title>
          <style>@page {size: letter; margin: 0; }</style>
        </head>
        <body style="margin: 0;">${generateContractHtml(contract, userProfile)}</body>
      </html>
      `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const printQuote = (quote) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Cotización</title>
          <style>@page {size: letter; margin: 0; }</style>
        </head>
        <body style="margin: 0;">${generateQuoteHtml(quote, userProfile)}</body>
      </html>
      `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const totalItems = Object.values(filteredData).flat().length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Documentos del Negocio</h1>
          <p className="text-slate-500 text-sm mt-1">Historial organizado • {totalItems} registros</p>
        </div>

        <div className="bg-slate-200 p-1.5 rounded-xl w-full md:w-[400px] flex relative shadow-inner h-11">
          {/* VISUAL TOGGLE BACKGROUND RED */}
          <div
            className={`absolute top-1.5 bottom-1.5 rounded-lg bg-red-600 shadow-lg shadow-red-600/20 transition-all duration-300 ease-in-out z-0`}
            style={{
              left: activeView === 'contracts' ? '6px' : 'calc(50% + 2px)',
              width: 'calc(50% - 8px)',
            }}
          />

          <button
            onClick={() => setActiveView('contracts')}
            className={`relative z-10 flex-1 text-center text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${activeView === 'contracts' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Contratos
          </button>
          <button
            onClick={() => setActiveView('quotes')}
            className={`relative z-10 flex-1 text-center text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${activeView === 'quotes' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Cotizaciones
          </button>
        </div>
      </div>

      {activeView === 'contracts' || activeView === 'quotes' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase">Ordenar:</span>
              <select
                value={sortConfig}
                onChange={(e) => setSortConfig(e.target.value)}
                className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 appearance-none cursor-pointer outline-none"
              >
                <option className="text-slate-800" value="date_desc">Más Recientes</option>
                <option className="text-slate-800" value="date_asc">Más Antiguos</option>
                <option className="text-slate-800" value="client_asc">Nombre</option>
                <option className="text-slate-800" value="vehicle_asc">Vehiculo</option>
              </select>
            </div>

            {/* DESKTOP ACTION BUTTON */}
            <div className="hidden sm:block">
              {activeView === 'contracts' ? (
                <Button icon={FilePlus} onClick={() => { setEditingContract(null); setIsGenerateModalOpen(true); }} className="w-full sm:w-auto">
                  Nuevo Contrato
                </Button>
              ) : (
                <Button icon={Send} onClick={() => setIsQuoteModalOpen(true)} className="w-full sm:w-auto" variant="primary">
                  Nueva Cotización
                </Button>
              )}
            </div>
          </div>

          {/* MOBILE FIXED ACTION BUTTON */}
          <div className="sm:hidden fixed bottom-28 right-4 left-4 z-[60]">
            {activeView === 'contracts' ? (
              <Button icon={FilePlus} onClick={() => { setEditingContract(null); setIsGenerateModalOpen(true); }} className="w-full py-3 shadow-xl shadow-red-600/30 border-2 border-white/50">
                Nuevo Contrato
              </Button>
            ) : (
              <Button icon={Send} onClick={() => setIsQuoteModalOpen(true)} className="w-full py-3 shadow-xl shadow-red-600/30 border-2 border-white/50" variant="primary">
                Nueva Cotización
              </Button>
            )}
          </div>

          <div className="space-y-12">
            {Object.keys(filteredData).map(groupName => (
              <div key={groupName} className="space-y-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-sm font-black text-slate-400 tracking-widest uppercase">{groupName}</h2>
                  <div className="h-px flex-1 bg-slate-100"></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredData[groupName].map(item => (
                    <div key={item.id} className="bg-white rounded-3xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] ring-1 ring-slate-100 group hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-300">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className={`p-3 rounded-2xl shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${activeView === 'contracts' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {activeView === 'contracts' ? <FileText size={24} /> : <Send size={24} />}
                          </div>
                          <div className="flex gap-1">
                            {activeView === 'contracts' ? (
                              <>
                                <button onClick={() => setSelectedContractPreview(item)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Ver Contrato"><Eye size={18} /></button>
                                <button onClick={() => { setEditingContract(item); setIsGenerateModalOpen(true); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Editar"><Edit size={18} /></button>
                                <button onClick={() => printContract(item)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Imprimir"><Printer size={18} /></button>
                                <button onClick={() => downloadContractPDF(item)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Descargar PDF"><Download size={18} /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setSelectedQuotePreview(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Ver Cotización"><Eye size={18} /></button>
                                <button onClick={() => printQuote(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Imprimir"><Printer size={18} /></button>
                                <button onClick={() => downloadQuotePDF(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Descargar Ficha"><Download size={18} /></button>
                              </>
                            )}
                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transform hover:scale-110 active:scale-95 transition-all" title="Eliminar"><Trash2 size={18} /></button>
                          </div>
                        </div>

                        <h3 className="text-lg font-black text-slate-900 mb-1">
                          {activeView === 'contracts' ? item.client : `${item.name} ${item.lastname}`}
                        </h3>
                        <p className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-1">
                          <Car size={12} /> {item.vehicle}
                        </p>

                        {activeView === 'quotes' && (
                          <div className="space-y-2 mt-4 pt-4 border-t border-slate-50">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase">Teléfono:</span>
                              <span className="text-slate-700 font-bold">{item.phone}</span>
                            </div>
                            {item.bank && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-bold uppercase">Banco:</span>
                                <span className="text-slate-700 font-bold">{item.bank}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            {item.createdAt && !isNaN(new Date(item.createdAt).getTime())
                              ? new Date(item.createdAt).toLocaleDateString()
                              : 'Sin fecha'}
                          </div>
                          {activeView === 'contracts' && <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">{item.template}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {totalItems === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                <Files size={64} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No hay {activeView === 'contracts' ? 'contratos' : 'cotizaciones'} registradas</p>
              </div>
            )}
          </div>

          {isGenerateModalOpen && createPortal(
            <GenerateContractModal
              isOpen={isGenerateModalOpen}
              onClose={() => setIsGenerateModalOpen(false)}
              inventory={inventory}
              templates={templates} // Pass dynamic templates
              onGenerate={onGenerateContract}
              initialVehicle={editingContract}
              userProfile={userProfile}
              showToast={showToast}
              resolvedDealerId={resolvedDealerId}
              ghlContacts={ghlContacts}
            />,
            document.body
          )}

          {isQuoteModalOpen && createPortal(
            <GenerateQuoteModal
              isOpen={isQuoteModalOpen}
              onClose={() => setIsQuoteModalOpen(false)}
              inventory={inventory}
              onSave={onGenerateQuote}
              templates={templates}
              showToast={showToast}
            />,
            document.body
          )}

          {selectedContractPreview && createPortal(
            <ContractPreviewModal
              isOpen={!!selectedContractPreview}
              onClose={() => setSelectedContractPreview(null)}
              contract={selectedContractPreview}
              userProfile={userProfile}
            />,
            document.body
          )}

          {selectedQuotePreview && createPortal(
            <QuotePreviewModal
              isOpen={!!selectedQuotePreview}
              onClose={() => setSelectedQuotePreview(null)}
              quote={selectedQuotePreview}
              userProfile={userProfile}
            />,
            document.body
          )}
        </>
      ) : null}
    </div >
  );
};

// --- LAYOUT ---
const AppLayout = ({ children, activeTab, setActiveTab, onLogout, userProfile, searchTerm, onSearchChange, isStoreRoute, isChatOpen = false }) => {
  const { t } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const menuItems = [
    { id: 'dashboard', label: t('nav_dashboard').toUpperCase(), icon: LayoutDashboard },
    { id: 'inventory', label: t('nav_inventory').toUpperCase(), icon: Box },
    { id: 'contacts', label: t('nav_contacts').toUpperCase(), icon: Users },
    { id: 'conversations', label: t('nav_messages').toUpperCase(), icon: MessageCircle },
    { id: 'settings', label: t('nav_settings').toUpperCase(), icon: Settings },
  ];

  return (
    <div className={`flex font-sans selection:bg-red-200 selection:text-red-900 h-screen overflow-hidden`} style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Ambient mesh background */}
      <div className="bg-mesh" />

      {/* ─── Desktop Sidebar (hidden on mobile) ─── */}
      {!isStoreRoute && (
        <aside
          className="hidden sm:flex flex-col w-[78px] h-screen sticky top-0 z-40 shrink-0 items-center py-6 gap-2"
          style={{
            background: 'var(--nav-bg)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            borderRight: '1px solid var(--nav-border)',
          }}
        >
          {/* Logo */}
          <div className="mb-4 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <AppLogo size={40} />
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {menuItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="relative flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 active:scale-90 group"
                  style={{
                    background: isActive ? 'var(--accent)' : 'transparent',
                    boxShadow: isActive ? 'var(--accent-glow)' : 'none',
                  }}
                  title={item.label}
                >
                  <item.icon
                    size={20}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: isActive ? '#ffffff' : 'var(--nav-inactive)' }}
                  />
                  <span
                    className="text-[8px] font-bold mt-0.5 uppercase tracking-wider"
                    style={{ color: isActive ? '#ffffff' : 'var(--nav-inactive)' }}
                  >
                    {item.label.slice(0, 5)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Bottom: Trash + Theme Toggle + User */}
          <div className="flex flex-col items-center gap-2 mt-auto">
            <button
              onClick={() => setActiveTab('trash')}
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-90"
              style={{
                background: activeTab === 'trash' ? 'var(--accent-soft)' : 'transparent',
                color: activeTab === 'trash' ? 'var(--accent)' : 'var(--nav-inactive)',
              }}
              title={t('nav_trash')}
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90 hover:scale-110"
              style={{ background: 'var(--input-bg)', color: isDark ? '#FBBF24' : 'var(--nav-inactive)' }}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black overflow-hidden cursor-pointer transition-all duration-300 hover:scale-110"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '2px solid var(--border-glass)' }}
              onClick={() => setActiveTab('settings')}
            >
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                (userProfile?.name || 'U').charAt(0)
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ─── Store Route Header (catalog) ─── */}
      {isStoreRoute && (
        <header className="sticky top-0 z-40 glass-nav px-4 sm:px-6 py-3 sm:py-4 transition-colors duration-500">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between">
            <div className="flex-1 hidden sm:flex"></div>
            <div className="flex-[2] flex flex-col items-center text-center">
              <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.3em] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('catalog_of')}</p>
              <h2 className="text-sm sm:text-xl font-black uppercase tracking-tight line-clamp-1" style={{ color: 'var(--text-primary)' }}>
                {(userProfile?.dealerName || new URLSearchParams(window.location.search).get('location_name') || 'Mi Dealer').trim().replace(/[*_~\`]/g, '')}
              </h2>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={() => setActiveTab('inventory')}
                className="flex items-center gap-2 text-white font-bold text-[10px] sm:text-[11px] uppercase tracking-wider py-2.5 px-4 sm:px-6 rounded-full transition-all active:scale-95"
                style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}
              >
                <LayoutGrid size={14} strokeWidth={2.5} />
                <span className="hidden xs:inline">{t('view_full_catalog')}</span>
                <span className="xs:hidden">{t('catalog')}</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <main className={`flex-1 w-full animate-in fade-in duration-500 flex flex-col min-h-0 ${activeTab === 'conversations' || activeTab === 'settings' || activeTab === 'contacts' ? 'overflow-hidden h-full' : 'p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto overflow-y-auto w-full'}`}>
          {children}
        </main>
      </div>

      {/* ─── Bottom Navigation (Mobile Only) — iOS glass pill ─── */}
      {!isStoreRoute && !isChatOpen && (
        <div
          className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))', paddingTop: '0.5rem' }}
        >
          <div className="glass-pill flex items-center px-2 py-1.5 rounded-full gap-1">
            {menuItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="relative flex items-center justify-center transition-all duration-300 active:scale-90"
                  style={{
                    borderRadius: '9999px',
                    padding: isActive ? '10px 20px' : '10px 18px',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    boxShadow: isActive ? 'var(--accent-glow)' : 'none',
                    transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  }}
                >
                  <item.icon
                    size={20}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: isActive ? '#ffffff' : 'var(--nav-inactive)' }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Reemplaza tu LoginScreen actual con este ---
const LoginScreen = ({ onLogin }) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    const email = e.target.elements.email.value;
    const password = e.target.elements.password.value;
    setTimeout(() => {
      const normalizedEmail = email.trim().toLowerCase();
      onLogin({ email: normalizedEmail, password });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans selection:bg-red-100" style={{ background: 'var(--bg-primary)' }}>
      <div className="bg-mesh" />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card w-full max-w-[420px] flex flex-col justify-center relative overflow-hidden p-8 sm:p-10"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >

        {/* Top accent border */}
        <div className="absolute top-0 left-0 w-full h-1.5" style={{ background: 'var(--accent)' }}></div>

        <div className="text-center mb-10 flex flex-col items-center mt-4">
          <div className="relative mb-6">
            <AppLogo size={72} className="relative z-10 drop-shadow-md" />
          </div>
          <div className="flex flex-col items-center leading-tight">
            <h1 className="text-4xl font-black tracking-tighter font-display" style={{ color: 'var(--text-primary)' }}>
              CarBot <span style={{ color: 'var(--accent)' }}>System</span>
            </h1>
            <p className="font-semibold text-sm mt-3 tracking-wide" style={{ color: 'var(--text-secondary)' }}>{t('loginSubtitle')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 text-sm rounded-xl flex items-center font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border-glass)' }}>
            <AlertTriangle size={18} className="mr-2 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-6">

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase tracking-[0.15em] ml-1 mb-2 block" style={{ color: 'var(--text-secondary)' }}>Correo Electrónico</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2" size={18} style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    name="email"
                    type="email"
                    placeholder="tu@correo.com"
                    required
                    className="glass-input w-full pl-12 pr-4 py-3.5 font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-[0.15em] ml-1 mb-2 block" style={{ color: 'var(--text-secondary)' }}>Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2" size={18} style={{ color: 'var(--text-tertiary)' }} />
                  <input
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className="glass-input w-full pl-12 pr-4 py-3.5 font-bold text-lg tracking-widest"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center pt-2">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <div className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors" style={rememberMe ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border-glass)', background: 'var(--input-bg)' }}>
                  {rememberMe && <Check size={14} className="text-white stroke-[4]" />}
                </div>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="hidden"
                />
                <span className="text-sm font-bold transition-colors" style={{ color: 'var(--text-secondary)' }}>Mantener sesión abierta</span>
              </label>
            </div>

            <button type="submit" disabled={loading} className="w-full py-3.5 text-white font-black text-base rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 group" style={{ background: 'var(--accent)', boxShadow: 'var(--accent-glow)' }}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <span>Entrar al Sistema</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-8 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Diseñado por <span className="text-red-500">CARBOT RD</span></p>
            <p className="text-[11px] font-black text-slate-500 font-mono">V3.0 • © 2026</p>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

// Función robusta para normalizar IDs (Sin acentos, sin fantasmas)
// Esta versión es agresiva: quita tildes, puntos, comas y deja solo letras/números/espacios
const normalizeStringForId = (str) => {
  if (!str) return '';

  // 1. Intento de reparar mojibake si detectamos errores comunes de GHL
  let clean = str;
  if (str.includes('Ã')) {
    try { clean = decodeURIComponent(escape(str)); } catch (e) { }
  }

  // NUEVO ESTÁNDAR: Eliminar puntos antes de normalizar para evitar S R L
  return clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};


const GHL_INSTALL_URL = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&redirect_uri=https%3A%2F%2Flpiwkennlavpzisdvnnh.supabase.co%2Ffunctions%2Fv1%2Foauth-callback&client_id=699b6f13fb99957c718a1e38-mma1agkx&scope=contacts.readonly+contacts.write+documents_contracts%2Flist.readonly+documents_contracts%2FsendLink.write+documents_contracts_template%2Flist.readonly+locations.readonly+users.readonly+documents_contracts_template%2FsendLink.write+locations%2FcustomFields.readonly+locations%2FcustomFields.write+custom-menu-link.readonly+custom-menu-link.write+conversations.readonly+conversations.write+conversations%2Fmessage.readonly+conversations%2Fmessage.write+conversations%2Freports.readonly+conversations%2Flivechat.write+conversation-ai.readonly+conversation-ai.write&version_id=69ab5865c2202af8a273fd40`;

const PANEL_MASTER_PERMISSIONS = [
  { key: 'install_dealer', label: 'Instalar dealers' },
  { key: 'delete_dealer', label: 'Eliminar dealers' },
  { key: 'edit_dealer', label: 'Editar dealers' },
  { key: 'enter_any_account', label: 'Entrar a cualquier cuenta' },
  { key: 'manage_admins', label: 'Gestionar administradores' },
  { key: 'view_all_dealers', label: 'Ver todos los dealers' },
];

const PanelMasterPermissionChecklist = ({ value, onChange, disabled }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
    {PANEL_MASTER_PERMISSIONS.map(p => (
      <label key={p.key} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)' }}>
        <div
          className="rounded-md flex items-center justify-center shrink-0 transition-all"
          style={{ width: 18, height: 18, background: value[p.key] ? 'var(--accent)' : 'var(--bg-elevated)', border: value[p.key] ? '1px solid var(--accent)' : '1px solid var(--border-glass)' }}
          onClick={() => !disabled && onChange({ ...value, [p.key]: !value[p.key] })}
        >
          {value[p.key] && <Check size={12} className="text-white stroke-[4]" />}
        </div>
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{p.label}</span>
      </label>
    ))}
  </div>
);

const PanelMasterTeamTab = ({ platformAdmins, ownUserId, canManageAdmins, onSearchUsers, onAddAdmin, onUpdateAdmin, onRemoveAdmin, showToast }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null); // existing admin being edited
  const [manualMode, setManualMode] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');

  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchError(''); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const r = await onSearchUsers(q);
        setResults(r);
      } catch (err) {
        setSearchError(err.message || 'Error al buscar usuarios.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, onSearchUsers]);

  const resetForm = () => {
    setSelectedCandidate(null);
    setEditingAdmin(null);
    setPermissions({});
    setPassword('');
    setQuery('');
    setResults([]);
    setManualMode(false);
    setManualEmail('');
    setManualName('');
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim());

  const handleContinueManual = () => {
    if (!emailValid) {
      showToast?.('Correo inválido.', 'error');
      return;
    }
    setSelectedCandidate({ id: null, correo: manualEmail.trim().toLowerCase(), nombre: manualName.trim(), isManual: true });
    setPermissions({});
    setPassword('');
  };

  const handleSubmit = async () => {
    if (password && password.length < 8) {
      showToast?.('La contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (editingAdmin) {
        await onUpdateAdmin({ user_id: editingAdmin.user_id, permissions, password: password || undefined });
      } else if (selectedCandidate?.isManual) {
        await onAddAdmin({ correo: selectedCandidate.correo, nombre: selectedCandidate.nombre, permissions, password: password || undefined });
      } else if (selectedCandidate) {
        await onAddAdmin({ usuario_id: selectedCandidate.id, permissions, password: password || undefined });
      }
      resetForm();
    } catch (err) {
      showToast?.(err.message || 'Error al guardar administrador.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManageAdmins) {
    return (
      <div className="px-6 py-10 text-center">
        <ShieldCheck size={28} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>No tienes permiso para gestionar administradores.</p>
      </div>
    );
  }

  const isFormOpen = !!selectedCandidate || !!editingAdmin;

  return (
    <div className="px-6 sm:px-10 pb-6 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
      {!isFormOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team roster */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Administradores</p>
            <div className="flex flex-col gap-1.5">
              {platformAdmins.map(admin => (
                <div key={admin.user_id} className="flex items-center gap-3 px-3 py-3 rounded-2xl" style={{ background: 'var(--input-bg)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {(admin.nombre || admin.correo || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>{admin.nombre || admin.correo}</div>
                    <div className="text-[10px] font-bold truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {admin.is_super_admin ? 'Super Admin' : Object.entries(admin.permissions || {}).filter(([, v]) => v).map(([k]) => PANEL_MASTER_PERMISSIONS.find(p => p.key === k)?.label).filter(Boolean).join(' · ') || 'Sin permisos'}
                    </div>
                  </div>
                  {!admin.is_super_admin && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => { setEditingAdmin(admin); setPermissions(admin.permissions || {}); setPassword(''); }}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: 'var(--text-tertiary)' }}
                        title="Editar permisos"
                      >
                        <Edit size={14} />
                      </button>
                      {admin.user_id !== ownUserId && (
                        <button
                          onClick={() => onRemoveAdmin(admin.user_id)}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: 'var(--text-tertiary)' }}
                          title="Quitar administrador"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {platformAdmins.length === 0 && (
                <p className="text-center text-xs font-bold py-4" style={{ color: 'var(--text-tertiary)' }}>Sin administradores todavía.</p>
              )}
            </div>
          </div>

          {/* Search GHL users to promote */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-tertiary)' }}>Usuario de GoHighLevel</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre o correo..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm font-bold outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
              />
            </div>
            {searching && <p className="text-[10px] font-bold mt-1.5" style={{ color: 'var(--text-tertiary)' }}>Buscando…</p>}
            {!searching && searchError && <p className="text-[10px] font-bold mt-1.5" style={{ color: 'var(--accent)' }}>{searchError}</p>}
            {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-[10px] font-bold mt-1.5" style={{ color: 'var(--text-tertiary)' }}>Sin resultados para "{query.trim()}".</p>
            )}
            {results.length > 0 && (
              <div className="mt-1.5 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-glass)' }}>
                {results.map(u => {
                  const alreadyAdmin = platformAdmins.some(a => a.user_id === u.id);
                  return (
                    <button
                      key={u.id}
                      disabled={alreadyAdmin}
                      onClick={() => { setSelectedCandidate(u); setPermissions({}); setPassword(''); }}
                      className="w-full flex flex-col items-start px-3 py-2 text-left disabled:opacity-40"
                      style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-glass)' }}
                    >
                      <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{u.nombre || u.correo}</span>
                      <span className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>{u.correo}{u.nombre_dealer ? ` · ${u.nombre_dealer}` : ''}{alreadyAdmin ? ' · Ya es admin' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!manualMode ? (
              <button
                onClick={() => { setManualMode(true); setManualEmail(query.trim().includes('@') ? query.trim() : ''); setManualName(''); }}
                className="text-[11px] font-bold mt-3 underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                ¿No aparece? Agregarlo manualmente
              </button>
            ) : (
              <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Agregar manualmente</p>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder="Correo electrónico"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                />
                <input
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-bold outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleContinueManual}
                    disabled={!emailValid}
                    className="flex-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Continuar
                  </button>
                  <button
                    onClick={() => { setManualMode(false); setManualEmail(''); setManualName(''); }}
                    className="px-3 py-2 rounded-xl text-xs font-black transition-all"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{editingAdmin ? (editingAdmin.nombre || editingAdmin.correo) : (selectedCandidate.nombre || selectedCandidate.correo)}</div>
              <div className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>{editingAdmin ? editingAdmin.correo : selectedCandidate.correo}</div>
            </div>
            <button onClick={resetForm} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
          </div>

          <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>Permisos</label>
          <PanelMasterPermissionChecklist value={permissions} onChange={setPermissions} />

          <label className="text-[10px] font-black uppercase tracking-wider mt-3 mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
            Contraseña {editingAdmin ? '(dejar vacío para no cambiar)' : ''}
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full px-3 py-2.5 rounded-xl text-sm font-bold outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
          />

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full mt-4 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }}
          >
            {submitting ? 'Guardando…' : (editingAdmin ? 'Actualizar Administrador' : 'Agregar Administrador')}
          </button>
        </div>
      )}
    </div>
  );
};

// logo_url a veces apunta a un archivo borrado/inaccesible (Storage limpiado,
// URL firmada expirada, CORS) — sin onError el <img> se queda en el ícono
// roto del navegador para siempre. Con hasError, cae a las iniciales igual
// que cuando no hay logo_url.
const DealerLogoBox = ({ logoUrl, initials, hue, grayscale = false, ghlConnected = false }) => {
  const [hasError, setHasError] = useState(false);
  const showImage = !!logoUrl && !hasError;

  return (
    <div
      className={`w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden relative ${grayscale ? 'grayscale' : ''}`}
      style={{
        background: showImage ? 'var(--input-bg)' : (grayscale ? 'var(--bg-elevated)' : `hsl(${hue}, 55%, 46%)`),
        border: '1px solid var(--border-glass)'
      }}
    >
      {showImage
        ? (
          <img
            src={logoUrl}
            alt=""
            className={`w-full h-full object-contain ${grayscale ? 'p-2' : 'p-2.5'}`}
            onError={() => setHasError(true)}
          />
        )
        : (
          <span className={grayscale ? 'text-lg font-black' : 'text-2xl font-black text-white'} style={grayscale ? { color: 'var(--text-tertiary)' } : undefined}>
            {initials}
          </span>
        )
      }
      {ghlConnected && (
        <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 rounded-full" style={{ background: '#22A745', border: '2px solid var(--bg-elevated)' }} title="Conectado a GHL" />
      )}
    </div>
  );
};

const DealerSwitcherModal = ({ isOpen, onClose, dealers, onSelect, isSuperAdmin, onSoftDelete, onRecover, onCreateDealer, canInstall, canDelete, canEnterAnyAccount, canManageAdmins, platformAdmins, ownUserId, onSearchUsers, onAddAdmin, onUpdateAdmin, onRemoveAdmin, showToast }) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [tab, setTab] = useState('dealers');

  if (!isOpen) return null;

  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;

  const getTimeLeft = (deletedAt) => {
    if (!deletedAt) return null;
    const remaining = MS_24H - (now - new Date(deletedAt).getTime());
    if (remaining <= 0) return null;
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const sortedDealers = [...dealers].sort((a, b) => {
    if (a.deleted_at && !b.deleted_at) return 1;
    if (!a.deleted_at && b.deleted_at) return -1;
    return a.nombre.localeCompare(b.nombre);
  });

  const handleInstallNew = () => {
    window.open(GHL_INSTALL_URL, '_blank');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 lg:p-10"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(var(--blur-glass)) saturate(180%)',
          WebkitBackdropFilter: 'blur(var(--blur-glass)) saturate(180%)',
          border: '1px solid var(--border-glass)',
          borderRadius: '1.75rem',
          boxShadow: 'var(--shadow-modal)',
        }}
        className="w-full max-w-6xl h-full max-h-[92vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="relative px-6 sm:px-10 pt-8 pb-5 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 0%, var(--accent-soft) 0%, transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-surface)' }}>
                <Building2 size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <span className="text-[10px] font-black tracking-[0.18em] uppercase" style={{ color: 'var(--text-tertiary)' }}>Panel Master</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{tab === 'team' ? 'Equipo' : 'Seleccionar Cuenta'}</h2>
            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {tab === 'team' ? `${platformAdmins?.length || 0} administradores` : `${sortedDealers.filter(d => !d.deleted_at).length} cuentas activas`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {canManageAdmins && (
          <div className="px-6 sm:px-10 pt-4 pb-1 flex items-center gap-2 shrink-0">
            {[{ id: 'dealers', label: 'Cuentas' }, { id: 'team', label: 'Equipo' }].map(tb => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-all"
                style={tab === tb.id
                  ? { background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }
                  : { background: 'var(--input-bg)', color: 'var(--text-secondary)' }}
              >
                {tb.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'team' ? (
          <PanelMasterTeamTab
            platformAdmins={platformAdmins || []}
            ownUserId={ownUserId}
            canManageAdmins={canManageAdmins}
            onSearchUsers={onSearchUsers}
            onAddAdmin={onAddAdmin}
            onUpdateAdmin={onUpdateAdmin}
            onRemoveAdmin={onRemoveAdmin}
            showToast={showToast}
          />
        ) : (
        <>
        {/* List */}
        <div className="px-6 sm:px-10 py-6 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedDealers.map((dealer) => {
              const isPendingDelete = !!dealer.deleted_at;
              const timeLeft = isPendingDelete ? getTimeLeft(dealer.deleted_at) : null;
              const isConfirming = confirmDeleteId === dealer.id;
              const initials = dealer.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              const hue = (dealer.nombre.charCodeAt(0) * 37) % 360;

              if (isPendingDelete) {
                return (
                  <div key={dealer.id} className="flex flex-col items-center text-center gap-3 p-5 rounded-3xl opacity-50" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-glass)' }}>
                    <DealerLogoBox logoUrl={dealer.logo_url} initials={initials} hue={hue} grayscale />
                    <div className="min-w-0 w-full">
                      <div className="text-sm font-black uppercase line-through truncate" style={{ color: 'var(--text-tertiary)' }}>{dealer.nombre}</div>
                      <div className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{timeLeft ? `Eliminando en ${timeLeft}` : 'Eliminando…'}</div>
                    </div>
                    {canDelete && (
                      <button onClick={() => onRecover(dealer.id)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all" style={{ background: 'rgba(52,199,89,0.12)', border: '1px solid rgba(52,199,89,0.25)', color: '#22A745' }}>
                        <Undo size={13} /> Recuperar
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div key={dealer.id} className="flex flex-col items-center text-center gap-3 p-5 rounded-3xl transition-all duration-200" style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(var(--blur-glass)) saturate(160%)', WebkitBackdropFilter: 'blur(var(--blur-glass)) saturate(160%)', border: '1px solid var(--border-glass)', boxShadow: 'var(--shadow-card)' }}>
                  {/* Big logo */}
                  <DealerLogoBox logoUrl={dealer.logo_url} initials={initials} hue={hue} ghlConnected={!!dealer.ghl_location_id} />

                  {/* Info */}
                  <div className="min-w-0 w-full">
                    <div className="text-sm font-black uppercase leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{dealer.nombre}</div>
                    <div className="text-[10px] font-bold mt-0.5 tracking-wider uppercase truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {dealer.ghl_location_id ? `GHL · ${dealer.id_busqueda || dealer.id.slice(0, 8)}` : dealer.id_busqueda || dealer.id.slice(0, 8)}
                    </div>
                  </div>

                  {/* Actions */}
                  {isConfirming ? (
                    <div className="w-full flex flex-col gap-1.5">
                      <p className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>¿Eliminar? 24h para recuperar.</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => { onSoftDelete(dealer.id); setConfirmDeleteId(null); }} className="flex-1 py-2 rounded-xl text-xs font-black transition-all" style={{ background: 'var(--accent)', color: '#fff' }}>Eliminar</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl text-xs font-black transition-all" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>No</button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full flex gap-1.5">
                      <button
                        onClick={() => canEnterAnyAccount && onSelect(dealer)}
                        disabled={!canEnterAnyAccount}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'var(--accent)', color: '#fff', boxShadow: 'var(--accent-glow)' }}
                      >
                        Entrar <ArrowRight size={13} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmDeleteId(dealer.id)}
                          className="w-9 flex items-center justify-center rounded-xl transition-all active:scale-95"
                          style={{ background: 'var(--input-bg)', color: 'var(--text-tertiary)' }}
                          title="Eliminar cuenta"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-10 pb-6 pt-3 space-y-2.5 shrink-0" style={{ borderTop: '1px solid var(--divider)' }}>
          {canInstall && (
            <button
              onClick={handleInstallNew}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl font-black text-sm transition-all duration-200 active:scale-[0.98] hover:opacity-90"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                boxShadow: 'var(--accent-glow)',
              }}
            >
              <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}>
                <Plus size={12} style={{ color: '#fff' }} />
              </div>
              Instalar en Nueva Subcuenta
              <ArrowRight size={14} />
            </button>
          )}
          <p className="text-center text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-tertiary)' }}>
            CarBot System · Panel Master
          </p>
        </div>
        </>
        )}
      </motion.div>
    </div>,
    document.body
  );
};


export default function CarbotApp() {
  // --- 0. DETECCIÓN SÍNCRONA DE PARÁMETROS GHL ---
  // --- 0. DETECCIÓN SÍNCRONA DE PARÁMETROS GHL & ROUTING ---
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pathname = window.location.pathname;

  // El catálogo público (/inventario/**, /catalogo/**) es 100% del Cloud Function.
  // La SPA solo entra en "modo tienda" para /tienda/ routes.
  const isStoreRoute = pathname.startsWith('/tienda/');
  const pathParts = decodeURIComponent(pathname).split('/').filter(Boolean); // [catalogo|tienda|inventario, slug, id?]
  const storeDealerSlug = pathParts[1] || null;
  const isCatalogMode = pathParts.includes('catalogo');
  const vehicleIdFromPath = isCatalogMode
    ? (pathParts[pathParts.indexOf('catalogo') + 2] || null)
    : (pathParts[0] === 'inventario' ? pathParts[2] : null);


  const urlVehicleId = params.get('vehicleID') || params.get('vehicleId') || null;
  const urlLocationId = params.get('location_id');
  const urlLocationName = params.get('location_name') || (isStoreRoute && storeDealerSlug ? storeDealerSlug.replace(/-/g, ' ').toUpperCase() : null);
  const urlUserName = params.get('user_name');
  const urlUserEmail = (params.get('user_email') || '').toLowerCase();
  const urlUserId = params.get('user_id'); // Nuevo: ID del usuario enviado por GHL

  const getStandardDealerId = (name, id) => {
    // CAMBIO SOLICITADO: ID del Documento = Nombre Normalizado (Sin tildes/Ñ)
    if (name) {
      return normalizeStringForId(name).toUpperCase();
    }
    // Fallback solo si no hay nombre
    if (id) return id;
    return null; // Cambiado de 'MI DEALER' para evitar falsos positivos en búsqueda
  };

  // Trigger login if location_id is present OR we have a previously saved session OR we are in Store Mode
  const isAutoLogin = !!(urlLocationId || isStoreRoute) && sessionStorage.getItem('manualLogout') !== 'true';
  const [isLoggedIn, setIsLoggedIn] = useState(isAutoLogin || !!localStorage.getItem('lastUserEmail'));
  const [ghlSSOLoading, setGhlSSOLoading] = useState(isAutoLogin && !!urlUserEmail);
  const [initializing, setInitializing] = useState(true);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  // Gate de arranque: no mostrar la app hasta tener perfil + primer inventario cargados.
  const [inventoryReady, setInventoryReady] = useState(false);
  const [forceReady, setForceReady] = useState(false); // bypass de seguridad (timeout)

  const [activeTab, setActiveTab] = useState(() => {
    if (isStoreRoute) return 'inventory';
    return localStorage.getItem('activeTab') || 'dashboard';
  });
  const [pendingContactId, setPendingContactId] = useState(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  // --- CONFIRMATION STATE ---
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDestructive: false,
    confirmText: 'Confirmar'
  });

  const requestConfirmation = ({ title, message, onConfirm, isDestructive = false, confirmText = 'Confirmar' }) => {
    setConfirmationModal({ isOpen: true, title, message, onConfirm, isDestructive, confirmText });
  };


  const [globalSearch, setGlobalSearch] = useState('');
  // Nuevo Estado: Filtro de Inventario (Levantamos el estado para controlarlo desde Dashboard)
  const [inventoryTab, setInventoryTab] = useState('available');

  // 1. ESTADO DE DATOS (Vacío al inicio, se llena desde Firebase)
  const [inventory, setInventory] = useState([]);
  const [legacyContracts, setLegacyContracts] = useState([]);
  const [legacyQuotes, setLegacyQuotes] = useState([]);
  const [legacyDocs, setLegacyDocs] = useState([]);
  const [newContracts, setNewContracts] = useState([]);
  const [newQuotes, setNewQuotes] = useState([]);
  const [templates, setTemplates] = useState([]);

  // GHL Contacts state
  const [ghlContacts, setGhlContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsLastFetched, setContactsLastFetched] = useState(null);
  const [contactsMeta, setContactsMeta] = useState({ total: 0, startAfterId: null });

  const [ghlConversations, setGhlConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false); // mobile: chat panel open
  const [conversationsLastFetched, setConversationsLastFetched] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [resolvedDealerId, setResolvedDealerId] = useState(params.get('dealer') || params.get('dealerID') || null);

  // --- SAFETY: Loading Timeout ---
  useEffect(() => {
    const timer = setTimeout(() => {
      console.warn("⚠️ App initialization timed out! Forcing loading screens off.");
      setInitializing(false);
      setGhlSSOLoading(false);
      setAuthChecked(true);
      setForceReady(true); // bypass del gate de datos para no quedar atascados
    }, 10000); // 10s safety margin
    return () => clearTimeout(timer);
  }, []);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDealerSwitcher, setShowDealerSwitcher] = useState(false);
  const [allDealers, setAllDealers] = useState([]);
  const [platformAdmin, setPlatformAdmin] = useState(null); // own platform_admins row, if any
  const [platformAdminsList, setPlatformAdminsList] = useState([]); // full team, for the Equipo tab
  const isPlatformAdminUser = !!platformAdmin;
  const hasPanelPermission = useCallback((perm) => {
    if (isSuperAdmin) return true;
    if (!platformAdmin) return false;
    if (platformAdmin.is_super_admin) return true;
    return platformAdmin.permissions?.[perm] === true;
  }, [isSuperAdmin, platformAdmin]);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [currentVehicleForModal, setCurrentVehicleForModal] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('contrato');

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);

  const { t } = useI18n();
  const { isDark } = useTheme();
  const showToast = (message, type = 'success') => {
    // Toast corto y legible: título de estado breve ("Listo" / "Error" / "Atención")
    // sobre fondo oscuro (el texto de sileo usa el color del estado — verde/rojo/ámbar —
    // que sobre blanco casi no se lee). El detalle completo queda en consola.
    const titles = {
      success: t('toast_title_success'),
      error: t('toast_title_error'),
      warning: t('toast_title_warning'),
    };
    if (type === 'error') {
      // Fondo rojo + texto blanco
      sileo.error({ title: titles.error, fill: '#dc2626', roundness: 16, styles: { title: 'toast-title-white', badge: 'toast-badge-white' } });
    } else if (type === 'warning') {
      sileo.warning({ title: titles.warning, fill: '#f59e0b', roundness: 16, styles: { title: 'toast-title-white', badge: 'toast-badge-white' } });
    } else {
      // Fondo blanco + "Listo" en verde agradable
      sileo.success({ title: titles.success, fill: '#ffffff', roundness: 16, styles: { title: 'toast-title-green', badge: 'toast-badge-green' } });
    }
  };


  const [currentUserEmail, setCurrentUserEmail] = useState(() => (urlUserEmail || localStorage.getItem('lastUserEmail') || '').toLowerCase());

  // --- SYNC USUARIOS ACTIVOS (GHL SPECIFIC) ---
  useEffect(() => {
    // Only sync if NOT in store route (Don't track public visitors as GHL users)
    if ((urlLocationName || urlLocationId) && !isStoreRoute) {
      const syncActiveUser = async () => {
        try {
          const cleanDisplayName = (urlLocationName || '').trim().replace(/[*_~\`]/g, '');
          const stableId = getStandardDealerId(urlLocationName, urlLocationId);

          // VERIFICACIÓN DE UNICIDAD: ghlLocationId solo para 1 dealer
          if (urlLocationId) {
            const dealerQuery = query(collection(db, "Dealers"), where("ghlLocationId", "==", urlLocationId));
            const dealerSnap = await getDocs(dealerQuery);
            if (!dealerSnap.empty && dealerSnap.docs[0].id !== stableId) {
              console.warn("ALERTA: ghlLocationId ya pertenece a otro dealer:", dealerSnap.docs[0].id);
              // Podríamos lanzar error o simplemente registrarlo. Por ahora advertimos.
            }
          }

          const activeUserRef = doc(db, "usuarios_activos", stableId);
          await setDoc(activeUserRef, {
            location_id: urlLocationId || '',
            location_name: cleanDisplayName,
            user_name: urlUserName || urlUserEmail?.split('@')[0] || 'Usuario GHL',
            user_email: (urlUserEmail || '').toLowerCase(),
            user_id: urlUserId || '', // Nuevo: ID del usuario desde GHL
            lastActive: new Date().toISOString(),
            source: 'GoHighLevel',
            stableId: stableId
          }, { merge: true });
        } catch (error) {
          console.error("Error sincronizando usuario activo:", error);
        }
      };
      syncActiveUser();
    }
  }, [urlLocationName, urlLocationId, urlUserName, urlUserEmail, isStoreRoute]);

  // ── GHL Auto-Login SSO ─────────────────────────────────────────
  useEffect(() => {
    if (!urlUserEmail || !urlLocationId || sessionStorage.getItem('manualLogout') === 'true') {
      return; // No params or manually logged out → normal login flow
    }

    const runGHLSSO = async () => {
      setGhlSSOLoading(true);
      try {
        // --- MULTI-TENANT CROSSOVER FIX ---
        // Varios iframes en el mismo navegador comparten el localStorage de Supabase.
        // Si el usuario A abrió la app, y luego el usuario B abre el iframe en otra cuenta,
        // la sesión vieja estará activa. DEBEMOS matarla si no coincide con urlUserEmail.
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user?.email && session.user.email.toLowerCase() !== urlUserEmail.toLowerCase()) {
          console.warn(`⚠️ Cross-Session Detectada! Sesión=${session.user.email} vs URL=${urlUserEmail}. Destruyendo sesión...`);
          await supabase.auth.signOut();
        } else if (session && session.user?.email && session.user.email.toLowerCase() === urlUserEmail.toLowerCase()) {
          console.log("✅ La sesión activa ya pertenece al usuario correcto. Skiping SSO auth.");
          setCurrentUserEmail(urlUserEmail);
          setIsLoggedIn(true);
          setGhlSSOLoading(false);
          return;
        }
        // ------------------------------------

        const res = await fetch(
          'https://lpiwkennlavpzisdvnnh.supabase.co/functions/v1/ghl-autologin',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: urlUserEmail,
              name: urlUserName || '',
              location_id: urlLocationId,
              location_name: urlLocationName || '',
            }),
          }
        );
        const result = await res.json();

        if (result.hashed_token) {
          // Verify OTP → creates real Supabase session
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: result.hashed_token,
            type: 'email',
          });
          if (!verifyErr) {
            // No limpiar URL params todavía, los necesitamos para inicializar
            // window.history.replaceState({}, '', window.location.pathname);
          }
        }
        // Whether SSO succeeded or had error, mark as logged in (GHL trust)
        setCurrentUserEmail(urlUserEmail);
        setIsLoggedIn(true);
      } catch (e) {
        console.error('GHL SSO error:', e);
        // Fallback: trust GHL params anyway
        setCurrentUserEmail(urlUserEmail);
        setIsLoggedIn(true);
      } finally {
        setGhlSSOLoading(false);
      }
    };

    runGHLSSO();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // ── Supabase Auth listener (reemplaza onAuthStateChanged de Firebase) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log(`🔐 Auth Event: ${_event}`, session?.user?.email);

      // MULTI-TENANT FIX: No obedecer la sesión si explícitamente estamos en GHL como ALGUIEN MÁS
      if (isAutoLogin && urlUserEmail && session?.user?.email && session.user.email.toLowerCase() !== urlUserEmail.toLowerCase()) {
        console.warn("🛡️ AuthListener bloqueó carga de estado incorrecto (El email en caché no es el del Iframe).");
        return;
      }

      if (session?.user) {
        setIsLoggedIn(true);
        setCurrentUserEmail(session.user.email);
        localStorage.setItem('lastUserEmail', session.user.email);
        if (session.user.email.toLowerCase() === 'jeancarlosgf13@gmail.com') setIsSuperAdmin(true);
      } else if (isAutoLogin) {
        const emailToUse = (urlUserEmail || localStorage.getItem('lastUserEmail') || (urlUserId ? `${urlUserId}@ghl.com` : (urlLocationId ? `admin@${urlLocationId}.com` : ''))).toLowerCase();
        if (emailToUse || isStoreRoute) {
          setCurrentUserEmail(emailToUse);
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
        }
      } else {
        // En login manual, si no hay sesión después de la verificación inicial, desloguear
        if (authChecked) {
          setIsLoggedIn(false);
        }
      }

      setAuthChecked(true);
      setInitializing(false);
    });

    // Verificación inicial forzada para evitar parpadeo
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
        setCurrentUserEmail(session.user.email);
        if (session.user.email.toLowerCase() === 'jeancarlosgf13@gmail.com') setIsSuperAdmin(true);
      }
      setAuthChecked(true);
      setInitializing(false);
    };
    checkSession();

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // --- 1.c FETCH ALL DEALERS FOR SUPERADMIN ---
  const refreshAllDealers = useCallback(async () => {
    if (!isSuperAdmin && !hasPanelPermission('view_all_dealers')) return;
    // Purge dealers whose 24h window has expired before fetching
    if (isSuperAdmin || hasPanelPermission('delete_dealer')) {
      await supabase
        .from('dealers')
        .delete()
        .not('deleted_at', 'is', null)
        .lt('deleted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    }
    const { data } = await supabase.from('dealers').select('*').order('nombre', { ascending: true });
    if (data) setAllDealers(data);
  }, [isSuperAdmin, hasPanelPermission]);

  useEffect(() => {
    refreshAllDealers();
  }, [refreshAllDealers]);

  // --- 1.d PANEL MASTER: own admin row + team roster ---
  const refreshPlatformAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setPlatformAdmin(null); return; }
    const { data } = await supabase
      .from('platform_admins')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setPlatformAdmin(data || null);
  }, []);

  useEffect(() => { refreshPlatformAdmin(); }, [refreshPlatformAdmin, isLoggedIn]);

  const refreshPlatformAdminsList = useCallback(async () => {
    if (!isSuperAdmin && !hasPanelPermission('manage_admins')) return;
    const { data } = await supabase.from('platform_admins').select('*').order('created_at', { ascending: true });
    if (data) setPlatformAdminsList(data);
  }, [isSuperAdmin, hasPanelPermission]);

  useEffect(() => { refreshPlatformAdminsList(); }, [refreshPlatformAdminsList]);

  // Calls the panel-master Edge Function (service-role only writes: add/update/remove admin).
  const callPanelMaster = useCallback(async (action, payload = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no válida.');
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/panel-master`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Error en el servidor.');
    return data;
  }, []);

  const handleSearchGhlUsers = useCallback(async (query) => {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    const data = await callPanelMaster('search_users', { query: q });
    return data?.users || [];
  }, [callPanelMaster]);

  const handleAddPlatformAdmin = useCallback(async ({ usuario_id, correo, nombre, permissions, password }) => {
    await callPanelMaster('add_admin', { usuario_id, correo, nombre, permissions, password });
    showToast('Administrador agregado.', 'success');
    await refreshPlatformAdminsList();
  }, [callPanelMaster, refreshPlatformAdminsList]);

  const handleUpdatePlatformAdmin = useCallback(async ({ user_id, permissions, password }) => {
    await callPanelMaster('update_admin', { user_id, permissions, password });
    showToast('Administrador actualizado.', 'success');
    await refreshPlatformAdminsList();
  }, [callPanelMaster, refreshPlatformAdminsList]);

  const handleRemovePlatformAdmin = useCallback(async (user_id) => {
    await callPanelMaster('remove_admin', { user_id });
    showToast('Administrador eliminado.', 'success');
    await refreshPlatformAdminsList();
  }, [callPanelMaster, refreshPlatformAdminsList]);

  const handleSoftDeleteDealer = useCallback(async (dealerId) => {
    const { error } = await supabase
      .from('dealers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', dealerId);
    if (error) {
      showToast(`Error al eliminar: ${error.message}`, 'error');
      return;
    }
    showToast('Cuenta marcada para eliminación. Tienes 24h para recuperarla.', 'success');
    await refreshAllDealers();
  }, [refreshAllDealers]);

  const handleRecoverDealer = useCallback(async (dealerId) => {
    const { error } = await supabase
      .from('dealers')
      .update({ deleted_at: null })
      .eq('id', dealerId);
    if (error) {
      showToast(`Error al recuperar: ${error.message}`, 'error');
      return;
    }
    showToast('Cuenta recuperada.', 'success');
    await refreshAllDealers();
  }, [refreshAllDealers]);

  const handleCreateDealer = useCallback(async ({ nombre, ghl_location_id }) => {
    const id_busqueda = normalizeStringForId(nombre).toUpperCase();
    const { data, error } = await supabase
      .from('dealers')
      .insert({ id: crypto.randomUUID(), nombre, id_busqueda, ghl_location_id: ghl_location_id || null, activo: true })
      .select('id, nombre')
      .single();
    if (error) {
      showToast(`Error al crear cuenta: ${error.message}`, 'error');
      return;
    }
    showToast(`Cuenta "${data.nombre}" creada.`, 'success');
    await refreshAllDealers();
  }, [refreshAllDealers, showToast]);

  // --- AUTO-SELECT VEHICLE FROM URL ---
  const autoSelectRan = useRef(false);
  useEffect(() => {
    // vehicleIdFromPath puede ser 'catalogo' (literal) cuando la URL es /inventario/slug/catalogo?vehicleID=...
    // En ese caso, usamos el query param urlVehicleId como fuente del ID real
    const targetId = (vehicleIdFromPath && vehicleIdFromPath !== 'catalogo')
      ? vehicleIdFromPath
      : urlVehicleId;
    if (targetId && inventory.length > 0 && !selectedVehicle && !autoSelectRan.current) {
      const vehicle = inventory.find(v => v.id === targetId);
      if (vehicle) {
        console.log("🎯 Auto-seleccionando vehículo desde URL:", targetId);
        setSelectedVehicle(vehicle);
        autoSelectRan.current = true;
      }
    }
  }, [vehicleIdFromPath, urlVehicleId, inventory, selectedVehicle]);

  // --- RESOLUCIÓN DE DEALER POR SLUG (PUBLIC MODE) ---
  useEffect(() => {
    if (isStoreRoute && storeDealerSlug && !resolvedDealerId) {
      const resolveDealer = async () => {
        try {
          // 1. Intentar ID directo (Normalizado)
          const potentialId = getStandardDealerId(storeDealerSlug);
          if (potentialId) {
            const dRef = doc(db, "Dealers", potentialId);
            const dSnap = await getDoc(dRef);
            if (dSnap.exists()) {
              setResolvedDealerId(potentialId);
              return;
            }
          }

          // 2. Buscar por campo 'slug' (Normalizado con guiones)
          const normalizedSlug = storeDealerSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const q = query(collection(db, "Dealers"), where("slug", "==", normalizedSlug));
          const s = await getDocs(q);
          if (!s.empty) {
            setResolvedDealerId(s.docs[0].id);
            return;
          }

          // 3. Last Resort: usaremos el normalizado
          setResolvedDealerId(potentialId);
        } catch (err) {
          console.error("Error resolviendo dealer:", err);
        }
      };
      resolveDealer();
    }
  }, [isStoreRoute, storeDealerSlug]);

  // --- 1.c RESOLUCIÓN DE CONTEXTO (IFRAME SAFE) ---
  const effectiveDealerId = useMemo(() => {
    return userProfile?.dealerId || resolvedDealerId || getStandardDealerId(urlLocationName, urlLocationId);
  }, [userProfile?.dealerId, resolvedDealerId, urlLocationName, urlLocationId]);

  // Perfil "Sombra" para cuando fall Auth en IFRAME o para Catálogo Público
  const shadowProfile = useMemo(() => {
    // Si estamos en el catálogo público, PRIORIZAMOS los datos del dealer dueño del catálogo
    if (isStoreRoute) {
      return {
        dealerId: resolvedDealerId || effectiveDealerId,
        dealerName: storeDealerSlug ? storeDealerSlug.replace(/-/g, ' ').toUpperCase() : (urlLocationName || 'Mi Dealer'),
        role: 'Viewer',
        ghlLocationId: '',
        dealer_logo: ''
      };
    }

    if (userProfile) return userProfile;
    if (!effectiveDealerId) return null;
    return {
      dealerId: effectiveDealerId,
      dealerName: urlLocationName || 'Mi Dealer',
      name: urlUserName || urlUserEmail?.split('@')[0] || 'Usuario GHL',
      email: urlUserEmail || '',
      role: 'Admin', // Default for GHL context
      ghlLocationId: urlLocationId || '',
      dealer_logo: userProfile?.dealer_logo || '',
      avatar_url: userProfile?.avatar_url || userProfile?.foto_url || ''
    };
  }, [userProfile, effectiveDealerId, urlLocationName, urlUserName, urlUserEmail, urlLocationId, isStoreRoute, resolvedDealerId, storeDealerSlug]);

  // --- LIMPIEZA DE ESTADO AL CAMBIAR DE CONTEXTO ---
  useEffect(() => {
    if (urlLocationId || urlLocationName || urlUserEmail) {
      console.log("🧹 Contexto cambiado (Loc/User), limpiando inventario y documentos...");
      setInventory([]);
      setNewContracts([]);
      setNewQuotes([]);
      setLegacyContracts([]);
      setLegacyQuotes([]);
      setLegacyDocs([]);
      setUserProfile(null);
    }
  }, [urlLocationId, urlLocationName, urlUserEmail, urlUserId]);

  // --- FILTROS GLOBALES ---
  const activeInventory = useMemo(() => (inventory || []).filter(i => i && i.status !== 'trash'), [inventory]);
  const trashInventory = useMemo(() => (inventory || []).filter(i => i && i.status === 'trash'), [inventory]);

  // Fetch user profile when logged in
  useEffect(() => {
    if (isLoggedIn && currentUserEmail) {
      const fetchUserProfile = async () => {
        try {
          const emailLower = currentUserEmail.toLowerCase();
          const userId = emailLower.replace(/\./g, '_');
          let manualSelectedDealerId = localStorage.getItem(`selected_dealer_${userId}`);

          // GUARDA MULTI-TENANT: el dealer seleccionado manualmente (SuperAdmin) puede haber
          // sido eliminado. Si su UUID ya no existe en Supabase, limpiamos la selección obsoleta
          // para no arrastrar un perfil/nombre fantasma (ej. un dealer borrado que sigue saliendo).
          if (emailLower === 'jeancarlosgf13@gmail.com' && manualSelectedDealerId) {
            try {
              const { data: liveDealer } = await supabase
                .from('dealers')
                .select('id')
                .eq('id', manualSelectedDealerId)
                .maybeSingle();
              if (!liveDealer) {
                console.warn('🧹 Dealer seleccionado ya no existe — limpiando selección obsoleta:', manualSelectedDealerId);
                localStorage.removeItem(`selected_dealer_${userId}`);
                manualSelectedDealerId = null;
              }
            } catch (e) {
              // Si la verificación falla (red/RLS), no bloqueamos el login: mantenemos la selección.
              console.warn('⚠️ No se pudo verificar el dealer seleccionado:', e?.message);
            }
          }

          let profileData = null;
          let dealerIdToUse = (emailLower === 'jeancarlosgf13@gmail.com' && manualSelectedDealerId)
            ? manualSelectedDealerId
            : getStandardDealerId(urlLocationName, urlLocationId);

          // ESTRATEGIA DE BÚSQUEDA ROBUSTA (MIGRACIÓN):
          console.log("🔍 Iniciando búsqueda de perfil para:", emailLower);

          // ═══ STEP 0: AUTOLOGIN URL CONTEXT (MÁXIMA PRIORIDAD) ═══
          // Cuando GHL pasa location_id via URL, ESA es la fuente de verdad.
          // NO buscamos en Firebase para evitar cargar datos de otro dealer.
          if (urlLocationId && isAutoLogin) {
            console.log('🎯 AutoLogin activo — perfil construido desde URL params, location_id:', urlLocationId);
            const urlName = params.get('user_name');
            const cleanDealerName = (urlLocationName || 'Mi Dealer').trim().replace(/[*_~`]/g, '');

            // Intentar enriquecer con datos de Supabase (logo, etc.) — no bloqueante
            let supaLogo = '';
            let supaUuid = dealerIdToUse;
            let supaDealer = null;
            try {
              const { data } = await supabase
                .from('dealers')
                .select('id, nombre, logo_url, has_bot, bot_name, catalogo_url')
                .eq('ghl_location_id', urlLocationId)
                .maybeSingle();
              if (data) {
                supaDealer = data;
                supaLogo = data.logo_url || '';
                supaUuid = data.id;
                console.log('✅ Supabase enriqueció con logo y UUID:', data.nombre);
              }
            } catch (e) {
              console.warn('⚠️ Supabase lookup failed (RLS?) — continuando sin logo:', e.message);
            }

            profileData = {
              name: urlName || emailLower.split('@')[0] || 'Usuario GHL',
              email: emailLower,
              dealerId: supaUuid,
              dealerName: cleanDealerName,
              jobTitle: 'Admin',
              role: 'Admin',
              uid: auth.currentUser?.uid || null,
              createdAt: new Date().toISOString(),
              ghlLocationId: urlLocationId,
              supabaseDealerId: supaUuid,
              dealer_logo: supaLogo,
              ghlUserId: urlUserId || '',
              has_bot: supaDealer?.has_bot || false,
              bot_name: supaDealer?.bot_name || null,
              catalogo_url: supaDealer?.catalogo_url || ''
            };
            dealerIdToUse = supaUuid;
            // ⚡ SKIP steps 1-3 — la URL es la fuente de verdad en AutoLogin
          }

          // 1. Scoped: Dealers/[ID]/usuarios/[USER_ID] — Solo para LOGIN MANUAL
          if (!profileData && dealerIdToUse) {
            const diRef = doc(db, "Dealers", dealerIdToUse, "usuarios", userId);
            const diSnap = await getDoc(diRef);
            if (diSnap.exists()) {
              console.log("✅ Perfil encontrado en Scoped Collection (New ID):", dealerIdToUse);
              profileData = diSnap.data();
              profileData.dealerId = dealerIdToUse;
            } else {
              // FALLBACK A ID LEGADO (Con espacios)
              const legacyId = dealerIdToUse.split('').join(' ').replace(/\s+/g, ' ');
              const legacyScopedRef = doc(db, "Dealers", legacyId, "usuarios", userId);
              const legacyScopedSnap = await getDoc(legacyScopedRef);
              if (legacyScopedSnap.exists()) {
                console.log("✅ Perfil encontrado en Scoped Collection (Legacy ID):", legacyId);
                profileData = legacyScopedSnap.data();
                profileData.dealerId = legacyId;
              }
            }
          }

          // 2. BUSQUEDA GLOBAL: collectionGroup (Solo para Manual Login o si no hay dealerIdToUse específico)
          // SuperAdmin sin selección válida NO usa heurísticas: debe ir al selector de dealer.
          if (!profileData && !dealerIdToUse && emailLower !== 'jeancarlosgf13@gmail.com') {
            try {
              console.log("🔍 Buscando usuario vía Global Search...");
              const ugq = query(collectionGroup(db, "usuarios"), where("email", "==", emailLower));
              const ugs = await getDocs(ugq);
              if (!ugs.empty) {
                const ud = ugs.docs[0];
                const realDealerId = ud.ref.parent.parent.id;
                console.log("✅ Usuario encontrado bajo el dealer (Global):", realDealerId);
                profileData = ud.data();
                profileData.dealerId = realDealerId;
              }
            } catch (err) {
              console.warn("⚠️ Global lookup fail (Probablemente falta índice):", err);
            }
          }

          // 3. RECUPERACIÓN (Escaneo Manual Seguro): Solo para Manual Login
          // SuperAdmin sin selección válida NO usa heurísticas: debe ir al selector de dealer.
          if (!profileData && !dealerIdToUse && emailLower !== 'jeancarlosgf13@gmail.com') {
            try {
              console.log("⚡ Iniciando escaneo manual de seguridad...");
              const dealersSnap = await getDocs(collection(db, "Dealers"));
              for (const dealerDoc of dealersSnap.docs) {
                const userInDealerRef = doc(db, "Dealers", dealerDoc.id, "usuarios", userId);
                const userInDealerSnap = await getDoc(userInDealerRef);
                if (userInDealerSnap.exists()) {
                  console.log("🎯 Usuario encontrado en Dealer:", dealerDoc.id);
                  profileData = userInDealerSnap.data();
                  profileData.dealerId = dealerDoc.id;
                  break;
                }
              }
            } catch (err) { console.error("❌ Falló escaneo manual:", err); }
          }

          // 4. Fallback AutoLogin (Creates or links profile if in GHL/Store context)
          if (!profileData && isAutoLogin) {
            console.log("✨ Perfil nuevo detectado vía AutoLogin");
            const urlName = params.get('user_name');
            const urlDealerName = params.get('location_name');
            const cleanDisplayDealerName = urlDealerName ? urlDealerName.trim().replace(/[*_~\`]/g, '') : (urlLocationName || 'Mi Dealer');
            const stableDealerId = getStandardDealerId(urlLocationName || 'Mi Dealer', urlLocationId);

            profileData = {
              name: urlName || emailLower.split('@')[0] || 'Usuario GHL',
              email: emailLower,
              dealerId: stableDealerId,
              dealerName: cleanDisplayDealerName,
              jobTitle: emailLower === 'jeancarlosgf13@gmail.com' ? 'SuperAdmin' : 'Asesor',
              role: emailLower === 'jeancarlosgf13@gmail.com' ? 'SuperAdmin' : 'Asesor',
              uid: auth.currentUser?.uid || null,
              createdAt: new Date().toISOString(),
              ghlLocationId: urlLocationId || '',
              ghlUserId: urlUserId || ''
            };
          }

          // 5. Fallback Supabase (Para usuarios sincronizados que aún no existen en Firebase local)
          // SuperAdmin con dealer manual seleccionado: NO buscar en usuarios (se resuelve en el bloque SuperAdmin)
          const isSuperAdminWithManualDealer = emailLower === 'jeancarlosgf13@gmail.com' && manualSelectedDealerId;
          if (!profileData && !isAutoLogin && !isSuperAdminWithManualDealer) {
            try {
              console.log("⚡ Buscando usuario en Supabase (migración transparente)...");
              const { data: supaUser, error: supaErr } = await supabase
                .from('usuarios')
                .select('nombre, correo, rol, dealer_id, avatar_url, foto_url, nombre_dealer, dealers(nombre, ghl_location_id, logo_url, has_bot, bot_name)')
                .eq('correo', emailLower)
                .maybeSingle();

              if (supaUser && supaUser.dealers && supaUser.dealer_id) {
                console.log("🎯 Usuario recuperado desde Supabase:", supaUser.dealer_id);
                profileData = {
                  name: supaUser.nombre || emailLower.split('@')[0],
                  email: supaUser.correo,
                  dealerId: supaUser.dealer_id,
                  dealerName: supaUser.dealers.nombre || 'Mi Dealer',
                  jobTitle: supaUser.rol || 'Asesor',
                  role: supaUser.rol || 'Asesor',
                  uid: auth.currentUser?.uid || null,
                  createdAt: new Date().toISOString(),
                  ghlLocationId: supaUser.dealers.ghl_location_id || '',
                  ghlUserId: '',
                  avatar_url: supaUser.avatar_url || supaUser.foto_url || '',
                  dealer_logo: supaUser.dealers.logo_url || '',
                  has_bot: supaUser.dealers.has_bot || false,
                  bot_name: supaUser.dealers.bot_name || null
                };
              }
            } catch (err) {
              console.error("❌ Falló búsqueda en Supabase:", err);
            }
          }

          // SUPERADMIN DETECT
          if (emailLower === 'jeancarlosgf13@gmail.com') {
            setIsSuperAdmin(true);

            // SuperAdmin con dealer seleccionado manualmente: construir perfil desde datos del dealer
            if (!profileData && manualSelectedDealerId && !isAutoLogin) {
              try {
                const { data: selectedDealer } = await supabase
                  .from('dealers')
                  .select('id, nombre, logo_url, address, website, ghl_location_id, id_busqueda, has_bot, bot_name, catalogo_url')
                  .eq('id', manualSelectedDealerId)
                  .maybeSingle();

                if (selectedDealer) {
                  console.log('🎯 SuperAdmin: perfil construido desde dealer seleccionado:', selectedDealer.nombre);
                  profileData = {
                    name: 'Jean Gomez',
                    email: emailLower,
                    dealerId: selectedDealer.id,
                    dealerName: selectedDealer.nombre || 'Mi Dealer',
                    jobTitle: 'SuperAdmin',
                    role: 'SuperAdmin',
                    uid: auth.currentUser?.uid || null,
                    createdAt: new Date().toISOString(),
                    ghlLocationId: selectedDealer.ghl_location_id || '',
                    ghlUserId: '',
                    supabaseDealerId: selectedDealer.id,
                    dealer_logo: selectedDealer.logo_url || '',
                    dealer_address: selectedDealer.address || '',
                    dealer_website: selectedDealer.website || '',
                    id_busqueda: selectedDealer.id_busqueda || '',
                    has_bot: selectedDealer.has_bot || false,
                    bot_name: selectedDealer.bot_name || null,
                    catalogo_url: selectedDealer.catalogo_url || ''
                  };
                  dealerIdToUse = selectedDealer.id;
                }
              } catch (err) {
                console.error('❌ Error cargando dealer para SuperAdmin:', err);
              }
            }

            // If superadmin has NO profile yet (not even in local storage selection), show dealer picker
            if (!profileData && !isAutoLogin) {
              const { data: dealers } = await supabase.from('dealers').select('*').order('nombre', { ascending: true });
              setAllDealers(dealers || []);
              setShowDealerSwitcher(true);
              setInitializing(false);
              return; // Stop and wait for selection
            }
          }

          if (profileData && profileData.dealerId) {
            const userId = emailLower.replace(/\./g, '_');

            // Garantizar que exista un ID válido para Storage Uploads y referencias
            profileData.id = profileData.id || auth.currentUser?.uid || userId;

            const dealerUserRef = doc(db, "Dealers", profileData.dealerId, "usuarios", userId);

            // Verificación estricta de contraseña si no es AutoLogin
            if (!isAutoLogin && auth.currentUser) {
              // Aquí delegamos la seguridad a Firebase Auth. Si llegó aquí está authenticado.
            }

            // SINCRO DEFINITIVA DE DEALER Y BOT
            try {
              const dealerRef = doc(db, "Dealers", profileData.dealerId);
              const dealerName = profileData.dealerName || 'Mi Dealer';
              const idBusqueda = dealerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");

              await setDoc(dealerRef, {
                name: dealerName,
                id_busqueda: idBusqueda,
                nombre: dealerName,
                lastActive: new Date().toISOString(),
                ghlLocationId: profileData.ghlLocationId || '',
                ...(profileData.supabaseDealerId ? { supabaseDealerId: profileData.supabaseDealerId } : {}),
                ...(profileData.dealer_logo ? { logo_url: profileData.dealer_logo } : {})
              }, { merge: true });

              // Read back the dealer doc to get the stored slug (may differ from generated one)
              const dealerSnap = await getDoc(dealerRef);
              const storedSlug = dealerSnap.exists() ? dealerSnap.data()?.slug : null;

              // Solo guardamos el perfil SI el dealerId coincide (o si no teníamos uno)
              await setDoc(dealerUserRef, profileData, { merge: true });

              // Inicializar configuración de Bot
              const botConfigRef = doc(db, "Dealers", profileData.dealerId, ":DATA BOT RN", "CONFIG");
              const cleanLinkName = dealerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
              const generatedCatalogoUrl = `https://carbotsystem.com/inventario/${cleanLinkName}/catalogo`;
              // Use stored catalogo_url from Supabase if available, otherwise use generated
              if (!profileData.catalogo_url) {
                profileData.catalogo_url = generatedCatalogoUrl;
                // Save to Supabase so it persists for this dealer
                if (profileData.supabaseDealerId) {
                  supabase.from('dealers').update({ catalogo_url: generatedCatalogoUrl }).eq('id', profileData.supabaseDealerId).then(() => {
                    console.log('✅ catalogo_url guardado en Supabase:', generatedCatalogoUrl);
                  }).catch(() => {});
                }
              }
              profileData.dealerSlug = cleanLinkName;
              const linkTienda = `https://carbotsystem.web.app/tienda/${cleanLinkName}`;

              const configDealerId = profileData.supabaseDealerId || profileData.dealerId;
              await setDoc(botConfigRef, {
                LINK_INVENTARIO_GHL: `https://inventarioia-gzhz2ynksa-uc.a.run.app/?dealer=${encodeURIComponent(configDealerId)}`,
                LINK_TIENDA: linkTienda,
                bot_active: true,
                lastSyncFromApp: new Date().toISOString(),
                dealerName: dealerName
              }, { merge: true });
            } catch (syncErr) {
              console.warn("⚠️ No se pudo sincronizar data de Dealer/Bot (Permisos):", syncErr);
            }

            // --- FETCH SUPABASE GHL ONBOARDING DATA ---
            // IMPORTANT: Use ghlLocationId from Firebase profile to identify the correct dealer
            // Do NOT rely on supaUser.dealer_id which may be stale/cross-dealer in multi-tenant spaces
            try {
              const { data: supaUser, error: supaErr } = await supabase
                .from('usuarios')
                .select('dealer_id, avatar_url, role_en_ghl, phone, nombre_dealer, nombre')
                .eq('correo', emailLower)
                .maybeSingle();

              // Fetch GHL permission fields separately (columns may not exist yet on all envs)
              let supaUserPerms = null;
              try {
                const { data: permsData } = await supabase
                  .from('usuarios')
                  .select('ghl_user_id, only_assigned_data')
                  .eq('correo', emailLower)
                  .maybeSingle();
                supaUserPerms = permsData;
              } catch (_) {}

              if (supaUser) {
                profileData.avatar_url = supaUser.avatar_url || profileData.avatar_url || '';
                profileData.ghl_role = supaUser.role_en_ghl || profileData.role || 'Admin';
                profileData.phone = supaUser.phone || '';
                profileData.ghlUserId = supaUserPerms?.ghl_user_id || profileData.ghlUserId || '';
                profileData.onlyAssignedData = supaUserPerms?.only_assigned_data === true;

                // Load real name if currently using email prefix fallback
                const emailPrefix = emailLower.split('@')[0];
                if (supaUser.nombre && (!profileData.name || profileData.name === emailPrefix || profileData.name === 'Usuario GHL')) {
                  profileData.name = supaUser.nombre;
                }

                // MULTI-TENANT FIX:
                // Only trust supaUser.dealer_id if we are NOT in an iframe with a forced urlLocationId
                // SuperAdmin con dealer manual: no sobreescribir supabaseDealerId
                const isSuperAdminManualSwitch = emailLower === 'jeancarlosgf13@gmail.com' && manualSelectedDealerId;
                if (isSuperAdminManualSwitch) {
                  console.log("🛡️ SuperAdmin: manteniendo dealer seleccionado manualmente, ignorando dealer_id de usuarios");
                } else if (supaUser.dealer_id && !urlLocationId) {
                  if (!profileData.dealerId) {
                    profileData.supabaseDealerId = supaUser.dealer_id;
                  } else {
                    profileData.supabaseDealerId = supaUser.dealer_id;
                  }
                } else if (urlLocationId) {
                  console.log("🛡️ Ignorando dealer_id de usuario en Supabase dado que GHL forzó un location_id específico:", urlLocationId);
                  profileData.supabaseDealerId = null;
                }
              }

              // --- LOAD DEALER LOGO/DATA/NAME BY GHL LOCATION ID, SUPABASE ID, OR LEGACY DEALER ID ---
              const locationIdToSearch = profileData.ghlLocationId || urlLocationId;
              let queryCol = null;
              let queryVal = null;

              if (locationIdToSearch) {
                queryCol = 'ghl_location_id';
                queryVal = locationIdToSearch;
              } else if (profileData.supabaseDealerId) {
                queryCol = 'id';
                queryVal = profileData.supabaseDealerId;
              } else if (profileData.dealerId) {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileData.dealerId);
                if (isUuid) {
                  queryCol = 'id';
                  queryVal = profileData.dealerId;
                } else {
                  queryCol = 'id_busqueda';
                  // Mantener los espacios pero forzar mayúsculas como en el guardado
                  queryVal = profileData.dealerId.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
                }
              }

              if (queryCol && queryVal) {
                const { data: dealerData } = await supabase
                  .from('dealers')
                  .select('id, nombre, logo_url, address, website, ghl_location_id, id_busqueda, has_bot, bot_name, catalogo_url')
                  .eq(queryCol, queryVal)
                  .maybeSingle();

                if (dealerData) {
                  console.log(`✅ Dealer data cargado por ${queryCol}:`, queryVal);
                  profileData.dealer_logo = dealerData.logo_url || '';
                  profileData.dealer_address = dealerData.address || '';
                  profileData.dealer_website = dealerData.website || '';
                  profileData.supabaseDealerId = dealerData.id;
                  profileData.id_busqueda = dealerData.id_busqueda || '';
                  profileData.catalogo_url = dealerData.catalogo_url || '';
                  profileData.has_bot = dealerData.has_bot || false;
                  profileData.bot_name = dealerData.bot_name || null;

                  if (dealerData.ghl_location_id && !profileData.ghlLocationId) {
                    profileData.ghlLocationId = dealerData.ghl_location_id;
                  }

                  if (dealerData.nombre) {
                    profileData.dealerName = dealerData.nombre;
                    // TRUNCA EL PROBLEMA MULTI-TENANT: Nunca sobreescribir profileData.dealerId si ya existe
                    // Porque dividiría a los usuarios en carpetas distintas de Firebase.
                    // En su lugar, usamos profileData.supabaseDealerId para URLs externas.
                    if (!profileData.dealerId) {
                      profileData.dealerId = dealerData.id || getStandardDealerId(dealerData.nombre, null);
                    }
                  }
                } else {
                  console.log(`⚠️ No se encontró dealer en Supabase mediante ${queryCol} = ${queryVal}`);
                }
              }
            } catch (err) {
              console.error("No se pudo obtener data de Supabase:", err);
            }

            if (emailLower === 'jeancarlosgf13@gmail.com') {
              profileData.name = "Jean Gomez";
            }

            setUserProfile(profileData);
            // Enrich saved user with latest avatar so LoginView can show the real photo
            try {
              const raw = localStorage.getItem('carbot-last-user');
              if (raw) {
                const saved = JSON.parse(raw);
                saved.avatar = profileData.avatar_url || profileData.photoURL || profileData.foto_url || '';
                saved.name = profileData.name || profileData.nombre || saved.name;
                localStorage.setItem('carbot-last-user', JSON.stringify(saved));
              }
            } catch { /* ignore */ }
            setInitializing(false);
          } else {
            // No se pudo determinar el dealer
            if (!isAutoLogin) {
              showToast("No se encontró cuenta asociada. Contacta soporte.", "error");
              await supabase.auth.signOut();
              setIsLoggedIn(false);
            } else {
              // Si es auto-login pero falló todo, evitamos el hang poniendo isLoggedIn en false
              setIsLoggedIn(false);
            }
            setInitializing(false);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          showToast("Error de conexión", "error");
          setInitializing(false);
        }
      };
      fetchUserProfile();
    } else {
      setUserProfile(null);
    }
  }, [isLoggedIn, currentUserEmail, isAutoLogin, isStoreRoute, urlLocationId, urlLocationName, profileRefreshKey]);

  const handleUpdateProfile = async (updatedData) => {
    if (!currentUserEmail || !userProfile?.dealerId) return;
    try {
      const emailLower = currentUserEmail.toLowerCase();
      const userId = currentUserEmail.replace(/\./g, '_');

      const allowedUpdates = {
        name: emailLower === 'jeancarlosgf13@gmail.com' ? 'Jean Gomez' : updatedData.name,
        jobTitle: updatedData.jobTitle,
        updatedAt: new Date().toISOString()
      };

      if (updatedData.photoURL) {
        allowedUpdates.photoURL = updatedData.photoURL;
        allowedUpdates.foto_url = updatedData.photoURL;
        allowedUpdates.avatar_url = updatedData.photoURL;
      }

      if (updatedData.dealer_logo) {
        allowedUpdates.dealer_logo = updatedData.dealer_logo;
      }

      // Update Firebase (Legacy/Main sync)
      const userRef = doc(db, "users", userId);
      const dealerUserRef = doc(db, "Dealers", effectiveDealerId, "usuarios", userId);
      await setDoc(dealerUserRef, allowedUpdates, { merge: true });
      try { await setDoc(userRef, allowedUpdates, { merge: true }); } catch (e) { }

      // Update Supabase (New Identity Provider) - Sync across all dealer accounts for this email
      const supaUpdates = {
        nombre: updatedData.name,
        rol: updatedData.jobTitle,
        nombre_dealer: userProfile?.dealerName || effectiveDealerId
      };
      if (updatedData.photoURL) {
        supaUpdates.avatar_url = updatedData.photoURL;
      }

      // We update by email without dealer constraint to ensure "todas las cuentas" are updated as requested
      const { error: supaUpdateErr } = await supabase
        .from('usuarios')
        .update({
          nombre: updatedData.name,
          ...(updatedData.photoURL ? { avatar_url: updatedData.photoURL } : {})
        })
        .eq('correo', emailLower);

      if (supaUpdateErr) {
        console.warn("Supabase multi-account sync error:", supaUpdateErr);
      }

      setUserProfile(prev => ({ ...prev, ...allowedUpdates }));
      showToast("Perfil actualizado");
    } catch (error) {
      console.error("Error updating profile:", error);
      showToast("Error al actualizar perfil", "error");
    }
  };

  // ... (keep existing firebase connection useEffect)

  // ... (rest of functions)

  // handleLogin is now handled inside LoginView (Supabase auth)
  // onLoginSuccess is called by LoginView after successful auth
  const handleLoginSuccess = (supUser) => {
    setIsLoggedIn(true);
    setCurrentUserEmail(supUser.email);
    localStorage.setItem('lastUserEmail', supUser.email);
    setInitializing(false);
  };

  // Modal de bienvenida a notificaciones — aparece una sola vez por dispositivo

  const handleDisconnectGhl = () => {
    requestConfirmation({
      title: 'Desconectar Plataforma',
      message: '¿Estás seguro de que deseas desconectar GoHighLevel? Perderás acceso a la generación de contratos y sincronización de inventario.',
      confirmText: 'Desconectar',
      isDestructive: true,
      onConfirm: async () => {
        try {
          let hasSupaError = false;
          let supaErrorMsg = "";

          if (userProfile?.supabaseDealerId) {
            const { error: supaErr } = await supabase
              .from('dealers')
              .update({
                ghl_access_token: null,
                ghl_refresh_token: null,
                ghl_token_expires_at: null,
                location_id: null,
                ghl_location_id: null
              })
              .eq('id', userProfile.supabaseDealerId);

            if (supaErr) {
              console.warn("Supabase auth cleanup failed (Check RLS or Null constraints):", supaErr);
              hasSupaError = true;
              supaErrorMsg = supaErr.message || supaErr.code || "Error en Supabase";
            }
          }

          if (userProfile?.dealerId) {
            // 1. Borrar el doc llave_ghl/config — aquí viven los tokens reales
            const llavePath = doc(db, "Dealers", userProfile.dealerId, "llave_ghl", "config");
            await deleteDoc(llavePath).catch(e => console.warn("⚠️ No se pudo borrar llave_ghl/config:", e.message));

            // 2. Limpiar ghlLocationId del dealer padre
            const dealerRef = doc(db, "Dealers", userProfile.dealerId);
            await setDoc(dealerRef, { ghlLocationId: '' }, { merge: true });

            // 3. Limpiar perfil del usuario
            if (currentUserEmail) {
              const emailLower = currentUserEmail.toLowerCase();
              const userId = emailLower.replace(/\./g, '_');
              const dealerUserRef = doc(db, "Dealers", userProfile.dealerId, "usuarios", userId);
              await setDoc(dealerUserRef, { ghlLocationId: '', location_id: '', ghl_access_token: '' }, { merge: true });
            }
          }

          setUserProfile(prev => ({ ...prev, ghlLocationId: '', location_id: '', ghl_access_token: '' }));

          if (hasSupaError) {
            showToast(`Desconectado localmente (Advertencia: ${supaErrorMsg})`, "warning");
          } else {
            showToast("Plataforma desconectada correctamente");
          }

        } catch (error) {
          console.error("Error crítico al desconectar GHL:", error);
          showToast(`Error al desconectar: ${error.message || 'Desconocido'}`, "error");
        }
      }
    });
  };

  const handleLogout = () => {
    requestConfirmation({
      message: '¿Estás seguro de que deseas salir del sistema?',
      confirmText: 'Salir',
      isDestructive: true,
      onConfirm: async () => {
        try {
          // Guardar refresh token con ventana de 1 hora antes de cerrar sesión localmente
          const { data: { session: currentSession } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          if (currentSession?.refresh_token) {
            try {
              const saved = JSON.parse(localStorage.getItem('carbot-last-user') || '{}');
              localStorage.setItem('carbot-last-user', JSON.stringify({
                ...saved,
                rt: currentSession.refresh_token,
                quickAccessUntil: Date.now() + 60 * 60 * 1000, // 1 hora
              }));
            } catch { /* ignore */ }
          }
          // scope: 'local' — borra la sesión local pero NO revoca el token en el servidor
          await supabase.auth.signOut({ scope: 'local' });
        } catch (error) {
          console.error("Error signing out", error);
        }
        localStorage.removeItem('lastUserEmail');
        sessionStorage.setItem('manualLogout', 'true');
        setIsLoggedIn(false);
        setUserProfile(null);
        setCurrentUserEmail('');
        // Force redirect to clean URL without GHL parameters to prevent auto-login
        window.location.href = window.location.origin + window.location.pathname;
      }
    });
  };

  const fetchVehiclesFromSupabase = useCallback(async () => {
    try {
      let query = supabase.from('vehiculos').select('*').order('created_at', { ascending: false });

      // ESTRICTO CONTROL MULTI-TENANT:
      // userProfile.supabaseDealerId ya fue curado para ignorar la caché de sesión
      // si estamos en un Iframe de GHL (usando el dealer real de la BD).
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const dealerUuid = userProfile?.supabaseDealerId || (uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null);

      if (dealerUuid) {
        query = query.eq('dealer_id', dealerUuid);
      } else {
        // Sin dealerUuid no podemos cargar inventario de forma segura.
        setInventory([]);
        setIsInventoryLoading(false);
        setInventoryReady(true);
        return;
      }

      setIsInventoryLoading(true);
      const { data, error } = await query;
      setIsInventoryLoading(false);
      if (error) throw error;

      let vehiclesData = (data || []).map(v => {
        // PRIORITIZAR: Columnas nativas nuevas -> campo JSON 'detalles' -> parseo básico del título
        const yearVal = v.anio || v.detalles?.year || v.detalles?.anio || v.titulo_vehiculo?.split(' ')[0] || '';
        const makeVal = v.marca || v.detalles?.make || v.detalles?.marca || v.titulo_vehiculo?.split(' ')[1] || 'N/A';
        const modelVal = v.modelo || v.detalles?.model || v.detalles?.modelo || v.titulo_vehiculo?.split(' ').slice(2).join(' ') || 'N/A';
        const editionVal = v.edicion || v.detalles?.edition || v.detalles?.edicion || '';
        const typeVal = v.tipo_vehiculo || v.detalles?.type || v.detalles?.tipo_vehiculo || '';

        return {
          ...v,
          ...(v.detalles || {}),
          year: yearVal,
          anio: yearVal,
          make: makeVal,
          marca: makeVal,
          model: modelVal,
          modelo: modelVal,
          edition: editionVal,
          edicion: editionVal,
          type: typeVal,
          tipo_vehiculo: typeVal,

          status: v.detalles?._deleted ? 'trash' :
            (v.estado === 'Vendido' || v.sold) ? 'sold' :
              (v.estado === 'Cotizado' || v.quoted) ? 'quoted' :
                (v.estado === 'Próximamente') ? 'upcoming' : 'available',
          images: v.fotos || [],
          fotos: v.fotos || [],
          image: (v.fotos && v.fotos.length > 0 ? v.fotos[0] : null),
          documents: v.documentos || [],

          exteriorColor: v.color || v.detalles?.color || v.detalles?.exteriorColor,
          condicion: v.condicion || v.detalles?.condition || v.detalles?.condicion,
          condition: v.condicion || v.detalles?.condition || v.detalles?.condicion,
          carfaxCondition: v.condicion_carfax || v.detalles?.condicion_carfax || v.detalles?.carfaxCondition,
          vin: v.chasis_vin || v.detalles?.vin || v.detalles?.chassis,
          drivetrain: v.traccion || v.detalles?.traccion || v.detalles?.drivetrain || v.detalles?.traction,
          transmission: v.transmision || v.detalles?.transmision || v.detalles?.transmission,
          engine: v.motor || v.detalles?.motor || v.detalles?.engine,
          roof: v.techo || v.detalles?.techo || v.detalles?.roof,
          fuelType: v.combustible || v.detalles?.combustible || v.detalles?.fuelType,
          keyType: v.llave || v.detalles?.llave || v.detalles?.keyType,
          camera: v.camara || v.detalles?.camara || v.detalles?.camera,
          interiorMaterial: v.material_asientos || v.detalles?.material_asientos || v.detalles?.interiorMaterial,

          // Logic to preserve backwards compatibility for prices & currencies
          currency: v.moneda_precio || v.detalles?.currency || 'USD',
          moneda_precio: v.moneda_precio || v.detalles?.currency || 'USD',
          downPaymentCurrency: v.moneda_inicial || v.detalles?.downPaymentCurrency || 'USD',
          moneda_inicial: v.moneda_inicial || v.detalles?.downPaymentCurrency || 'USD',
          
          price: parseFloat(v.precio || (v.detalles?.currency === 'DOP' && !v.detalles?.price ? v.detalles?.price_dop : v.detalles?.price) || 0),
          price_dop: parseFloat(v.precio || (v.detalles?.currency === 'DOP' ? (v.detalles?.price_dop || v.detalles?.price) : 0) || 0),
          precio: parseFloat(v.precio || (v.detalles?.currency === 'DOP' && !v.detalles?.price ? v.detalles?.price_dop : v.detalles?.price) || 0),
          
          initial_payment: parseFloat(v.inicial || (v.detalles?.downPaymentCurrency === 'DOP' && !v.detalles?.initial_payment ? v.detalles?.initial_payment_dop : v.detalles?.initial_payment) || 0),
          initial_payment_dop: parseFloat(v.inicial || (v.detalles?.downPaymentCurrency === 'DOP' ? (v.detalles?.initial_payment_dop || v.detalles?.initial_payment) : 0) || 0),
          inicial: parseFloat(v.inicial || (v.detalles?.downPaymentCurrency === 'DOP' && !v.detalles?.initial_payment ? v.detalles?.initial_payment_dop : v.detalles?.initial_payment) || 0),

          mileage: parseFloat(v.millas || v.detalles?.mileage || 0),
          seats: parseInt(v.cantidad_asientos || v.detalles?.seats || 0),

          powerTrunk: v.baul_electrico ?? v.detalles?.powerTrunk,
          sensors: v.sensores ?? v.detalles?.sensors,
          appleCarplay: v.carplay ?? v.detalles?.appleCarplay,
          powerWindows: v.vidrios_electricos ?? v.detalles?.powerWindows,

          ghlLocationId: v.ghl_location_id,
          createdAt: v.created_at,
          updatedAt: v.updated_at || v.created_at,
          lastChange: v.last_change || null
        };
      });

      if (dealerUuid) {
        vehiclesData = vehiclesData.filter(v => v.dealer_id === dealerUuid);
      }

      setInventory(vehiclesData);

    } catch (err) {
      console.error("❌ Error fetch Supabase Vehiculos:", err);
    } finally {
      setIsInventoryLoading(false);
      setInventoryReady(true);
    }
  }, [effectiveDealerId, userProfile, urlLocationId]);

  // GHL Contacts fetch (lazy — called when user opens Contactos tab)
  const fetchGHLConversations = useCallback(async (force = false) => {
    const dealerUuid = userProfile?.supabaseDealerId;
    if (!dealerUuid) return;
    if (!force && conversationsLastFetched && Date.now() - conversationsLastFetched < 30000) return;
    setConversationsLoading(true);
    try {
      const params = new URLSearchParams({ dealerId: dealerUuid, limit: '100' });
      if (userProfile?.onlyAssignedData && userProfile?.ghlUserId) params.set('assignedUserId', userProfile.ghlUserId);
      const r = await fetch(`/api/ghl-conversations?${params}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setGhlConversations(data.conversations || []);
      setConversationsLastFetched(Date.now());
    } catch (err) {
      console.error('❌ fetchGHLConversations error:', err);
    } finally {
      setConversationsLoading(false);
    }
  }, [userProfile, conversationsLastFetched]);

  const fetchGHLContacts = useCallback(async (force = false) => {
    const dealerUuid = userProfile?.supabaseDealerId || (() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null;
    })();
    if (!dealerUuid) return;

    // TTL: skip if fetched within 60s (unless forced)
    if (!force && contactsLastFetched && Date.now() - contactsLastFetched < 60000) return;

    setContactsLoading(true);
    try {
      const contactParams = new URLSearchParams({ dealerId: dealerUuid, limit: '100' });
      if (userProfile?.onlyAssignedData && userProfile?.ghlUserId) {
        contactParams.set('assignedTo', userProfile.ghlUserId);
      }
      const r = await fetch(`/api/ghlContacts?${contactParams}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const contacts = data.contacts || [];
      const meta = data.meta || {};
      setGhlContacts(contacts);
      setContactsMeta({ total: meta.total || contacts.length, startAfterId: contacts[contacts.length - 1]?.id || null });
      setContactsLastFetched(Date.now());
    } catch (err) {
      console.error('❌ fetchGHLContacts error:', err);
      showToast(t('toast_error_load_contacts'), 'error');
    } finally {
      setContactsLoading(false);
    }
  }, [effectiveDealerId, userProfile, contactsLastFetched]);

  // Load next page of contacts (appends to existing list)
  const fetchMoreGHLContacts = useCallback(async () => {
    const dealerUuid = userProfile?.supabaseDealerId || (() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null;
    })();
    if (!dealerUuid || !contactsMeta.startAfterId) return;

    setContactsLoading(true);
    try {
      const r = await fetch(`/api/ghlContacts?dealerId=${dealerUuid}&limit=100&startAfterId=${contactsMeta.startAfterId}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const newContacts = data.contacts || [];
      const meta = data.meta || {};
      setGhlContacts(prev => [...prev, ...newContacts]);
      setContactsMeta(prev => ({
        total: meta.total || prev.total,
        startAfterId: newContacts.length === 100 ? (newContacts[newContacts.length - 1]?.id || null) : null,
      }));
    } catch (err) {
      console.error('❌ fetchMoreGHLContacts error:', err);
      showToast('Error cargando más contactos', 'error');
    } finally {
      setContactsLoading(false);
    }
  }, [effectiveDealerId, userProfile, contactsMeta.startAfterId]);

  // Server-side search across ALL contacts (not just the loaded page)
  const searchGHLContacts = useCallback(async (query) => {
    const dealerUuid = userProfile?.supabaseDealerId || (() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null;
    })();
    if (!dealerUuid || !query) return null;
    try {
      const r = await fetch(`/api/ghlContacts?dealerId=${dealerUuid}&limit=100&query=${encodeURIComponent(query)}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      return data.contacts || [];
    } catch (err) {
      console.error('❌ searchGHLContacts error:', err);
      return null;
    }
  }, [effectiveDealerId, userProfile]);

  // Auto-fetch GHL contacts when navigating to Contactos tab
  useEffect(() => {
    if (activeTab === 'contacts' && effectiveDealerId) {
      fetchGHLContacts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, effectiveDealerId]);

  // Auto-fetch GHL conversations when navigating to Mensajes tab (with TTL cache)
  useEffect(() => {
    if (activeTab === 'conversations' && userProfile?.supabaseDealerId) {
      fetchGHLConversations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userProfile?.supabaseDealerId]);

  // 2. DATA LISTENERS (REACTIVE TO CONTEXT)
  useEffect(() => {
    if (!effectiveDealerId) {
      console.log("⏳ Esperando context/dealerId para iniciar listeners...");
      return;
    }

    console.log("📡 [LISTENERS] Iniciando para Dealer:", effectiveDealerId, "(GHL Mode:", !!urlLocationId, ")");

    // 1. Listen to Vehicles (Migrado a Supabase ✅)
    fetchVehiclesFromSupabase();


    // Supabase Realtime Subscription para vehiculos
    const vehicleSubscription = supabase
      .channel(`vehiculos_dealer_${effectiveDealerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vehiculos',
        filter: `dealer_id=eq.${effectiveDealerId}`
      }, (payload) => {
        fetchVehiclesFromSupabase();
      })
      .subscribe();

    // 2. Listen to Documents
    const newConRef = collection(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items");
    const unsubscribeNewContracts = onSnapshot(newConRef, (snapshot) => {
      setNewContracts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const newQuoRef = collection(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items");
    const unsubscribeNewQuotes = onSnapshot(newQuoRef, (snapshot) => {
      setNewQuotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Legacy: Listen to top-level collections
    const legacyConRef = collection(db, "Dealers", effectiveDealerId, "contracts");
    const unsubscribeLegacyContracts = onSnapshot(legacyConRef, (snapshot) => {
      setLegacyContracts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const legacyQuoRef = collection(db, "Dealers", effectiveDealerId, "quotes");
    const unsubscribeLegacyQuotes = onSnapshot(legacyQuoRef, (snapshot) => {
      setLegacyQuotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 4. Backward Compatibility for 'documentos' root
    const docRef = collection(db, "Dealers", effectiveDealerId, "documentos");
    const unsubscribeLegacyDocs = onSnapshot(docRef, (snapshot) => {
      setLegacyDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 5. Listen to Templates
    const tempRef = collection(db, "Dealers", effectiveDealerId, "documentos", "plantillas", "items");
    const unsubscribeTemplates = onSnapshot(tempRef, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      console.log("🛑 Limpiando listeners de Dealer:", effectiveDealerId);
      supabase.removeChannel(vehicleSubscription);
      unsubscribeNewContracts();
      unsubscribeNewQuotes();
      unsubscribeLegacyContracts();
      unsubscribeLegacyQuotes();
      unsubscribeLegacyDocs();
      unsubscribeTemplates();
    };
  }, [effectiveDealerId, urlLocationId, !!urlLocationId]); // Re-activar si cambia el contexto o el modo (GHL vs Regular)

  // --- SCRIPT DE REPARACIÓN ---
  useEffect(() => {
    if (!effectiveDealerId || !urlLocationId) return;

    const repairUntaggedVehicles = async () => {
      try {
        const vehRef = collection(db, "Dealers", effectiveDealerId, "vehiculos");
        const snapshot = await getDocs(vehRef);

        const batchUpdates = [];
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (!data.ghlLocationId) {
            console.log(`🔧 Reparando vehículo ${docSnap.id} con ghlLocationId: ${urlLocationId}`);
            batchUpdates.push(updateDoc(docSnap.ref, { ghlLocationId: urlLocationId }));
          }
        });

        if (batchUpdates.length > 0) {
          await Promise.all(batchUpdates);
          console.log(`✅ Reparados ${batchUpdates.length} vehículos.`);
        }
      } catch (err) {
        console.warn("⚠️ Falló script de reparación (Permisos?):", err);
      }
    };

    repairUntaggedVehicles();
  }, [effectiveDealerId, urlLocationId]);

  // Derived merged data
  const contracts = useMemo(() => {
    const all = [
      ...legacyContracts,
      ...legacyDocs.filter(d => d && (d.type === 'contract' || (d.id && d.id.startsWith('Contrato')))),
      ...newContracts
    ].filter(Boolean)
      .map(c => ({
        ...c,
        vehicle: c.vehicle || `${c.make || ''} ${c.model || ''} ${c.year || ''}`.trim() || 'Vehículo'
      }));
    return all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [legacyContracts, legacyDocs, newContracts]);

  const quotes = useMemo(() => {
    const all = [
      ...legacyQuotes,
      ...legacyDocs.filter(d => d && (d.type === 'quote' || (d.id && d.id.startsWith('Cotizacion')))),
      ...newQuotes,
      // Cotizaciones generadas via contract modal también viven en contratos/items con documentType='cotizacion'
      ...newContracts.filter(c => c && (c.documentType === 'cotizacion' || c.category === 'cotizacion' || c.type === 'quote')),
    ].filter(Boolean);
    return all.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [legacyQuotes, legacyDocs, newQuotes, newContracts]);


  // 3. GUARDAR (Crear o Editar en Supabase)
  const handleSaveVehicle = async (vehicleData) => {
    if (!effectiveDealerId) {
      console.error("No effectiveDealerId available");
      showToast("Error: No se encontró el ID del Dealer. Reintenta loguear.", "error");
      return;
    }
    const existingId = vehicleData.id;
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const dealerUuid = userProfile?.supabaseDealerId || (uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null);

      if (!dealerUuid) {
        throw new Error("UUID de Dealer inválido. No se puede guardar en Supabase.");
      }

      // --- ROW MERGE STRATEGY (ELITE ENGINEERING) ---
      let existingRecord = null;
      if (existingId) {
        const { data: supaRow } = await supabase.from('vehiculos').select('*').eq('id', existingId).maybeSingle();
        existingRecord = supaRow;
      }

      // --- HELPER: Pick first non-empty string value (ignores '', null, undefined) ---
      const pick = (...vals) => {
        for (const v of vals) {
          if (v !== undefined && v !== null && v !== '' && v !== 0) return v;
        }
        return null;
      };
      // For numeric fields: returns first defined numeric > 0, or fallback
      const pickNum = (...vals) => {
        for (const v of vals) {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) return n;
        }
        return 0;
      };

      // 1. Construir Título preservando lo existente si el nuevo es parcial
      const newYear = pick(vehicleData.year, vehicleData.detalles?.year, existingRecord?.detalles?.year) || '';
      const newMake = pick(vehicleData.make, vehicleData.marca, vehicleData.detalles?.make, existingRecord?.detalles?.make) || '';
      const newModel = pick(vehicleData.model, vehicleData.modelo, vehicleData.detalles?.model, existingRecord?.detalles?.model) || '';
      const defaultTitle = `${newYear} ${newMake} ${newModel}`.trim() || 'Vehículo Sin Título';
      const finalTitle = (vehicleData.titulo_vehiculo || defaultTitle).toUpperCase();

      // 2. Extraer detalles (excluyendo lo que va en columnas top-level)
      const {
        fotos, images, documentos, documents, image, // Multimedia (arrays/blobs)
        id, created_at, updated_at, dealer_id, // Columnas persistentes
        link_externo, // Columna dedicada (no va en detalles)
        ...restDetails
      } = vehicleData;

      // 3. Merge de Detalles — CRITICAL: strip empty/falsy VALUES before merging
      //    so that existing non-empty detalles values are NOT overwritten with ''
      const cleanedDetails = {};
      for (const [key, val] of Object.entries(restDetails)) {
        // Keep booleans (including false), non-empty strings, non-zero numbers, objects, arrays
        if (val === undefined || val === null) continue;
        if (typeof val === 'string' && val === '') continue;
        if (typeof val === 'number' && val === 0 && !['year', 'precio', 'price', 'millas', 'mileage', 'seats', 'inicial'].includes(key)) continue;
        cleanedDetails[key] = val;
      }
      const mergedDetails = {
        ...(existingRecord?.detalles || {}),
        ...cleanedDetails,
        // Always persist make/model/year/color in detalles for title reconstruction
        make: newMake || existingRecord?.detalles?.make || '',
        model: newModel || existingRecord?.detalles?.model || '',
        year: newYear || existingRecord?.detalles?.year || '',
        color: pick(vehicleData.exteriorColor, vehicleData.color, existingRecord?.color, existingRecord?.detalles?.color) || '',
        _updated_at: new Date().toISOString()
      };

      // 4. Construir objeto final de guardado — preservando lo existente si el nuevo no está.
      const dataToSave = {
        dealer_id: dealerUuid,
        titulo_vehiculo: finalTitle,
        anio: parseInt(newYear) || null,
        marca: newMake || null,
        modelo: newModel || null,
        edicion: pick(vehicleData.edition, vehicleData.edicion, existingRecord?.edicion, existingRecord?.detalles?.edition),
        tipo_vehiculo: pick(vehicleData.type, vehicleData.bodyType, vehicleData.tipo_vehiculo, existingRecord?.tipo_vehiculo, existingRecord?.detalles?.type),
        estado: (vehicleData.status === 'sold' || vehicleData.estado === 'Vendido') ? 'Vendido' :
          (vehicleData.status === 'quoted' || vehicleData.estado === 'Cotizado') ? 'Cotizado' :
            (vehicleData.status === 'upcoming' || vehicleData.estado === 'Próximamente') ? 'Próximamente' :
              (vehicleData.status === 'available' || vehicleData.estado === 'Disponible') ? 'Disponible' :
                (existingRecord?.estado || 'Disponible'),

        color: pick(vehicleData.exteriorColor, vehicleData.color, existingRecord?.color),
        condicion_carfax: pick(vehicleData.carfaxCondition, vehicleData.condicion_carfax, existingRecord?.condicion_carfax),
        chasis_vin: pick(vehicleData.vin, vehicleData.chasis_vin, existingRecord?.chasis_vin),
        traccion: pick(vehicleData.drivetrain, vehicleData.traccion, existingRecord?.traccion),
        transmision: pick(vehicleData.transmission, vehicleData.transmision, existingRecord?.transmision),
        motor: pick(vehicleData.engine, vehicleData.motor, existingRecord?.motor),
        techo: pick(vehicleData.roof, vehicleData.techo, existingRecord?.techo),
        combustible: pick(vehicleData.fuelType, vehicleData.combustible, existingRecord?.combustible),
        llave: pick(vehicleData.keyType, vehicleData.llave, existingRecord?.llave),
        camara: pick(vehicleData.camera, vehicleData.camara, existingRecord?.camara),
        material_asientos: pick(vehicleData.interiorMaterial, vehicleData.material_asientos, existingRecord?.material_asientos),

        precio: pickNum(vehicleData.price, vehicleData.price_dop, vehicleData.precio, existingRecord?.precio),
        moneda_precio: pick(vehicleData.currency, existingRecord?.moneda_precio, 'USD'),
        // pickNum descarta 0 y sigue buscando — correcto para "no tocó este campo",
        // incorrecto para "el dealer marcó dejar el inicial vacío a propósito" (0 es
        // el valor querido, no "faltante"). Si el formulario mandó explícitamente
        // alguna de estas 3 llaves, se respeta tal cual (incluyendo 0); solo se cae a
        // existingRecord cuando NINGUNA vino en el payload (ej. duplicar vehículo).
        inicial: (
          Object.prototype.hasOwnProperty.call(vehicleData, 'initial_payment') ||
          Object.prototype.hasOwnProperty.call(vehicleData, 'initial_payment_dop') ||
          Object.prototype.hasOwnProperty.call(vehicleData, 'inicial')
        )
          ? (Number(vehicleData.initial_payment ?? vehicleData.initial_payment_dop ?? vehicleData.inicial) || 0)
          : (Number(existingRecord?.inicial) || 0),
        moneda_inicial: pick(vehicleData.downPaymentCurrency, existingRecord?.moneda_inicial, 'USD'),
        // Marca si el inicial vino del % automático (no escrito a mano) — permite
        // recalcular en bloque desde Ajustes cuando el dealer cambia el % o la
        // tasa, sin arriesgar pisar un inicial real que el dealer tecleó.
        inicial_automatico: typeof vehicleData.inicial_automatico === 'boolean' ? vehicleData.inicial_automatico : (existingRecord?.inicial_automatico ?? null),
        millas: pickNum(vehicleData.millas, vehicleData.mileage, existingRecord?.millas),
        cantidad_asientos: parseInt(pick(vehicleData.cantidad_asientos, vehicleData.seats, existingRecord?.cantidad_asientos) || 0),

        baul_electrico: (vehicleData.trunk === 'Sí' || vehicleData.baul === 'Sí' || vehicleData.baul_electrico === true) ? true :
          (vehicleData.trunk === 'No' || vehicleData.baul === 'No' || vehicleData.baul_electrico === false) ? false : (existingRecord?.baul_electrico ?? false),
        sensores: (vehicleData.sensors === 'Sí' || vehicleData.sensores === 'Sí' || vehicleData.sensores === true) ? true :
          (vehicleData.sensors === 'No' || vehicleData.sensores === 'No' || vehicleData.sensores === false) ? false : (existingRecord?.sensores ?? false),
        carplay: (vehicleData.carplay === 'Sí' || vehicleData.carplay === true || vehicleData.appleCarplay === true) ? true :
          (vehicleData.carplay === 'No' || vehicleData.carplay === false || vehicleData.appleCarplay === false) ? false : (existingRecord?.carplay ?? false),
        vidrios_electricos: (vehicleData.electric_windows === 'Sí' || vehicleData.vidrios_electricos === 'Sí' || vehicleData.vidrios_electricos === true) ? true :
          (vehicleData.electric_windows === 'No' || vehicleData.vidrios_electricos === 'No' || vehicleData.vidrios_electricos === false) ? false : (existingRecord?.vidrios_electricos ?? false),

        fotos: vehicleData.images || vehicleData.fotos || (vehicleData.image ? [vehicleData.image] : (existingRecord?.fotos || [])),
        documentos: vehicleData.documents || vehicleData.documentos || (existingRecord?.documentos || []),

        // Link externo (Instagram/Drive/etc): null explícito limpia el valor previo
        link_externo: (link_externo && link_externo.trim()) ? link_externo.trim() : null,

        detalles: mergedDetails
      };

      // --- CHANGE LOG: comparar contra el registro previo para mostrar "qué cambió" en el UI ---
      if (existingId && existingRecord) {
        const CHANGE_FIELD_LABELS = {
          anio: 'Año', marca: 'Marca', modelo: 'Modelo', edicion: 'Edición', tipo_vehiculo: 'Tipo',
          estado: 'Estado', color: 'Color', condicion_carfax: 'Carfax', chasis_vin: 'VIN',
          traccion: 'Tracción', transmision: 'Transmisión', motor: 'Motor', techo: 'Techo',
          combustible: 'Combustible', llave: 'Llave', camara: 'Cámara', material_asientos: 'Asientos Material',
          precio: 'Precio', moneda_precio: 'Moneda Precio', inicial: 'Inicial', moneda_inicial: 'Moneda Inicial',
          millas: 'Millaje', cantidad_asientos: 'Cant. Asientos',
          baul_electrico: 'Baúl Eléctrico', sensores: 'Sensores', carplay: 'CarPlay', vidrios_electricos: 'Vidrios Eléctricos',
          link_externo: 'Link Externo'
        };
        const formatChangeValue = (key, val) => {
          if (val === null || val === undefined || val === '') return '—';
          if (typeof val === 'boolean') return val ? 'Sí' : 'No';
          if (key === 'precio' || key === 'inicial' || key === 'millas') return Number(val).toLocaleString('en-US');
          return String(val);
        };
        const cambios = [];
        for (const [key, label] of Object.entries(CHANGE_FIELD_LABELS)) {
          const before = existingRecord[key];
          const after = dataToSave[key];
          const beforeNorm = (before === null || before === undefined) ? '' : String(before).trim();
          const afterNorm = (after === null || after === undefined) ? '' : String(after).trim();
          if (beforeNorm !== afterNorm) {
            cambios.push({ campo: label, antes: formatChangeValue(key, before), despues: formatChangeValue(key, after) });
          }
        }
        if (cambios.length > 0) {
          dataToSave.last_change = { fecha: new Date().toISOString(), cambios };
        }
      }

      if (existingId) {
        const { error } = await supabase.from('vehiculos').update(dataToSave).eq('id', existingId);
        if (error) throw error;
        showToast(t('toast_vehicle_updated'));
      } else {
        dataToSave.created_at = new Date().toISOString();
        const { error } = await supabase.from('vehiculos').insert([dataToSave]);
        if (error) throw error;
        showToast(t('toast_vehicle_saved'));
        // Notificar al equipo del dealer sobre el nuevo vehículo
        sendDealerNotification({
          type: 'vehicle',
          actorName: userProfile?.name || 'Alguien',
          vehicleData: {
            año: String(newYear),
            marca: newMake,
            modelo: newModel,
            color: String(pick(vehicleData.color, vehicleData.detalles?.color) || ''),
          },
          dealerId: userProfile?.supabaseDealerId || dealerUuid,
        }).catch(() => {});
      }

      // Esperar el refetch: sin esto, la vista vuelve a la lista antes de que
      // `inventory` refleje los cambios, mostrando datos viejos al reentrar.
      await fetchVehiclesFromSupabase();
    } catch (error) {
      console.error("Error al guardar en Supabase:", error);
      const detailedError = error?.details || error?.hint || error?.message || 'Error desconocido';
      alert(`Error al guardar en Supabase: ${detailedError}\n\nRevisa la consola para más detalles.`);
      showToast(`Error: ${detailedError}`, "error");
    }
  };


  const handleDeleteVehicle = async (id) => {
    if (!userProfile?.dealerId) return;
    try {
      // Read current detalles, merge _deleted flag
      const { data: current } = await supabase.from('vehiculos').select('detalles').eq('id', id).single();
      const deletedAt = new Date().toISOString();
      const updatedDetalles = { ...(current?.detalles || {}), _deleted: true, _deleted_at: deletedAt };
      const { error } = await supabase.from('vehiculos').update({
        detalles: updatedDetalles,
        deleted_at: deletedAt
      }).eq('id', id);
      if (error) throw error;
      setInventory(prev => prev.map(v => v.id === id ? { ...v, status: 'trash', detalles: updatedDetalles, deleted_at: deletedAt } : v));
      showToast(t('toast_vehicle_moved_trash'));
      fetchVehiclesFromSupabase();
    } catch (error) {
      console.error(error);
      showToast(t('toast_error_move_trash'), 'error');
    }
  };

  const handleRestoreVehicle = async (id) => {
    if (!userProfile?.dealerId) return;
    try {
      const { data: current } = await supabase.from('vehiculos').select('detalles').eq('id', id).single();
      const updatedDetalles = { ...(current?.detalles || {}) };
      delete updatedDetalles._deleted;
      delete updatedDetalles._deleted_at;

      const { error } = await supabase.from('vehiculos').update({
        detalles: updatedDetalles,
        deleted_at: null
      }).eq('id', id);
      if (error) throw error;
      setInventory(prev => prev.map(v => v.id === id ? { ...v, status: 'available', detalles: updatedDetalles, deleted_at: null } : v));
      showToast(t('toast_vehicle_restored'));
      fetchVehiclesFromSupabase();
    } catch (e) {
      console.error(e);
      showToast(t('toast_error_restore'), 'error');
    }
  };

  const handlePermanentDelete = (id, force = false) => {
    if (!userProfile?.dealerId) return;

    const doDelete = async () => {
      try {
        const { error } = await supabase.from('vehiculos').delete().eq('id', id);
        if (error) throw error;
        setInventory(prev => prev.filter(v => v.id !== id));
        if (!force) showToast(t('toast_deleted_permanent'));
      } catch (error) {
        showToast(t('toast_error_delete'), 'error');
      }
    };

    if (force) return doDelete();

    requestConfirmation({
      title: 'Eliminar Permanentemente',
      message: '¿ESTÁS SEGURO? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar para Siempre',
      isDestructive: true,
      onConfirm: doDelete
    });
  };

  const handleRestoreDocument = async (item) => {
    if (!effectiveDealerId) return;
    try {
      let ref;
      // Determinar la referencia correcta basada en el ID y la lógica de colecciones
      if (item.id.startsWith('Contrato')) {
        ref = doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", item.id);
      } else if (item.id.startsWith('Cotizacion')) {
        ref = doc(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items", item.id);
      } else {
        // Legacy fallback
        const isContract = item.type === 'contract' || (item.client && !item.name);
        ref = doc(db, "Dealers", effectiveDealerId, isContract ? "contracts" : "quotes", item.id);
      }

      await updateDoc(ref, { status: 'active' });
      showToast(t('toast_document_restored'));
    } catch (e) {
      console.error(e);
      showToast(t('toast_error_restore'), 'error');
    }
  };

  const handlePermanentDeleteDocument = (item, force = false) => {
    if (!effectiveDealerId) return;

    const doDelete = async () => {
      try {
        let ref;
        if (item.id.startsWith('Contrato')) {
          ref = doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", item.id);
        } else if (item.id.startsWith('Cotizacion')) {
          ref = doc(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items", item.id);
        } else {
          const isContract = item.type === 'contract' || (item.client && !item.name);
          ref = doc(db, "Dealers", effectiveDealerId, isContract ? "contracts" : "quotes", item.id);
        }

        await deleteDoc(ref);
        // También intentar borrar de la colección raíz 'documentos' por si acaso es legacy
        try { await deleteDoc(doc(db, "Dealers", effectiveDealerId, "documentos", item.id)); } catch (e) { }

        if (!force) showToast(t('toast_deleted_permanent'));
      } catch (e) {
        console.error(e);
        showToast(t('toast_error_delete'), 'error');
      }
    };

    if (force) return doDelete();

    requestConfirmation({
      title: '¿Eliminar Documento?',
      message: 'Esta acción es irreversible.',
      confirmText: 'Eliminar Definitivamente',
      isDestructive: true,
      onConfirm: doDelete
    });
  };

  const handleEmptyTrash = () => {
    if (!userProfile?.dealerId) return;
    requestConfirmation({
      title: 'Vaciar Papelera',
      message: '¿Seguro que deseas eliminar todos los vehículos de la papelera? Esta acción es permanente.',
      confirmText: 'Vaciar Todo',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const trashItems = inventory.filter(i => i.status === 'trash');
          if (trashItems.length > 0) {
            const idsToDelete = trashItems.map(i => i.id);
            const { error } = await supabase.from('vehiculos').delete().in('id', idsToDelete);
            if (error) throw error;
            setInventory(prev => prev.filter(v => v.status !== 'trash'));
          }
          showToast(t('toast_trash_emptied'));
        } catch (e) {
          showToast(t('toast_error_empty_trash'), 'error');
        }
      }
    });
  };

  // Funciones locales (Contratos, etc.)
  const handleQuoteSent = async (quoteData) => {
    if (!userProfile?.dealerId) return;
    try {
      // Limpiar undefined antes de enviar a Firestore
      const cleanQuoteData = Object.fromEntries(
        Object.entries(quoteData).filter(([_, v]) => v !== undefined)
      );

      const vId = cleanQuoteData.vehicleId || selectedVehicle?.id;
      const vName = cleanQuoteData.vehicle || (selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : 'Vehículo Desconocido');

      // GENERAR ID DINÁMICO: Cotizacion_Cliente_Marca_Modelo_Ultimos4Chasis
      // 1. Limpieza de datos
      const clientName = `${quoteData.name || ''} ${quoteData.lastname || ''}`.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');

      // Intentar obtener datos del vehículo del inventario si es posible para tener Marca/Modelo limpios
      let make = 'MARCA';
      let model = 'MODELO';
      let last4Vin = '0000';

      if (vId) {
        // Si tenemos ID, intentamos buscarlo en el inventario activo (si está cargado)
        // O inferirlo del nombre string si no hay otra opción
        const vehicleObj = activeInventory.find(v => v.id === vId);
        if (vehicleObj) {
          make = (vehicleObj.make || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          model = (vehicleObj.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          last4Vin = (vehicleObj.vin || '0000').slice(-4);
        } else {
          // Fallback parsing from "make model year" string if object not found
          const parts = vName.split(' ');
          if (parts.length >= 2) {
            make = parts[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
            model = parts[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
          }
        }
      }

      const customId = `Cotizacion_${clientName}_${make}_${model}_${last4Vin}`;

      const newQuote = {
        ...cleanQuoteData,
        id: customId, // Guardar el ID también dentro del documento
        vehicleId: vId,
        vehicle: vName,
        type: 'quote', // Identificador de tipo para nueva colección unificada
        createdAt: new Date().toISOString()
      };

      // GUARDAR EN SUBCOLECCIÓN 'documentos/cotizaciones'
      await setDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items", customId), newQuote);

      // Notificar al equipo sobre la nueva cotización
      {
        const vehicleObj = activeInventory.find(v => v.id === vId);
        sendDealerNotification({
          type: 'quote',
          actorName: userProfile?.name || 'Alguien',
          vehicleData: {
            año: String(vehicleObj?.year || vehicleObj?.detalles?.year || ''),
            marca: vehicleObj?.make || vehicleObj?.detalles?.make || make,
            modelo: vehicleObj?.model || vehicleObj?.detalles?.model || model,
            color: vehicleObj?.color || vehicleObj?.detalles?.color || '',
          },
          clientName: `${quoteData.name || ''} ${quoteData.lastname || ''}`.trim(),
          dealerId: userProfile?.supabaseDealerId,
        }).catch(() => {});
      }

      await supabase.from('vehiculos')
        .update({
          estado: 'Cotizado',
          status: 'quoted'
        })
        .eq('id', vId);

      // Actualizar estado local inmediatamente para reflejar el cambio en la UI
      setInventory(prev => prev.map(v =>
        String(v.id) === String(vId) ? { ...v, estado: 'Cotizado', status: 'quoted' } : v
      ));
      requestConfirmation({
        title: 'Cotización Enviada',
        message: '¡Cotización enviada a GHL y guardada!',
        onConfirm: () => { },
        confirmText: 'Cerrar',
        cancelText: null
      });
    } catch (error) {
      console.error("Error al guardar cotización:", error);
      showToast("Error al procesar la cotización", "error");
    }
  };

  const handleGenerateMultiContract = async (contractsArray) => {
    console.log("handleGenerateMultiContract called with:", contractsArray);
    if (!userProfile?.dealerId) {
      console.error("MultiGen: Missing dealerId", userProfile);
      showToast("Error critico: No hay perfil de usuario cargado", "error");
      return;
    }
    if (!Array.isArray(contractsArray)) {
      console.error("MultiGen: Input is not an array", contractsArray);
      return;
    }

    try {
      let generatedCount = 0;
      let firstVehicleId = null;

      for (const contractData of contractsArray) {
        // Reuse the single contract logic structure
        // Clean data
        const cleanData = Object.fromEntries(
          Object.entries(contractData).filter(([_, v]) => v !== undefined)
        );
        const { id, category, ...data } = cleanData;

        // GENERAR ID DINÁMICO
        const clientName = (data.client || 'Cliente').toUpperCase().replace(/[^A-Z0-9]/g, '_');
        let make = 'MARCA';
        let model = 'MODELO';
        let last4Vin = '0000';

        if (contractData.vehicleId) {
          firstVehicleId = contractData.vehicleId;
          const vehicleObj = activeInventory.find(v => String(v.id) === String(contractData.vehicleId));
          if (vehicleObj) {
            make = (vehicleObj.make || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            model = (vehicleObj.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            last4Vin = (vehicleObj.vin || '0000').slice(-4);
          } else if (data.vehicle) {
            const parts = data.vehicle.split(' ');
            if (parts.length >= 2) {
              make = parts[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
              model = parts[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
            }
          }
        }

        const docType = category === 'quote' ? 'Cotizacion' : 'Contrato';
        const docCollection = category === 'quote' ? 'cotizaciones' : 'contratos';

        // Unique ID including Template Name to avoid collision if multiple docs for same car/client
        const templateTag = (data.template || 'Doc').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);
        const customId = `${docType}_${clientName}_${make}_${model}_${last4Vin}_${templateTag}_${Date.now().toString().slice(-4)}`;

        const newDoc = {
          ...data,
          id: customId,
          type: category || 'contract',
          category: category || 'contract',
          createdAt: new Date().toISOString()
        };

        // Guardar
        await setDoc(doc(db, "Dealers", effectiveDealerId, "documentos", docCollection, "items", customId), newDoc);

        // [LOCAL STATE SYNC] Add to local state immediately
        if (category === 'quote') {
          setNewQuotes(prev => [newDoc, ...prev]);
        } else {
          setNewContracts(prev => [newDoc, ...prev]);
        }

        generatedCount++;
      }

      // Update vehicle status ONLY if at least one contract was generated (not just quotes)
      const hasContract = contractsArray.some(c => c.category === 'contract' || !c.category);
      if (firstVehicleId) {
        const newEstado = hasContract ? 'Vendido' : 'Cotizado';
        const newStatus = hasContract ? 'sold' : 'quoted';

        await supabase.from('vehiculos')
          .update({ estado: newEstado })
          .eq('id', firstVehicleId);

        // [LOCAL STATE SYNC] Update inventory immediately
        setInventory(prev => prev.map(v =>
          String(v.id) === String(firstVehicleId) ? { ...v, estado: newEstado, status: newStatus } : v
        ));

        // Registrar comprador real (integración Cloy postventa) cuando es venta firme, no cotización.
        if (hasContract) {
          const saleDoc = contractsArray.find(c => String(c.vehicleId) === String(firstVehicleId) && (c.category === 'contract' || !c.category));
          const buyerName = saleDoc?.client;
          if (buyerName) {
            const dealerUuidForBuyer = userProfile?.supabaseDealerId || userProfile?.dealerId;
            await supabase.from('compradores').insert([{
              vehiculo_id: firstVehicleId,
              dealer_id: dealerUuidForBuyer,
              nombre: buyerName,
              telefono: toE164(saleDoc.phone) || null,
              cedula: saleDoc.cedula || null,
              correo: saleDoc.email || null,
            }]);
          }
        }
      }

      showToast(`${generatedCount} documentos generados con éxito`);

    } catch (error) {
      console.error("Error multi-gen:", error);
      showToast("Error generando documentos: " + error.message, "error");
    }
  };

  const handleGenerateContract = async (contractDataInput) => {
    if (!userProfile?.dealerId) return;

    // Support Input Array for multi-gen
    if (Array.isArray(contractDataInput)) {
      return handleGenerateMultiContract(contractDataInput);
    }

    const contractData = contractDataInput; // Single object case

    try {
      const cleanData = Object.fromEntries(
        Object.entries(contractData).filter(([_, v]) => v !== undefined)
      );

      const { id, clientData, ...restData } = cleanData;

      const combinedClientName = clientData
        ? `${clientData.name || ''} ${clientData.lastName || ''}`.trim()
        : (restData.client || 'Cliente');

      const data = {
        ...restData,
        client: combinedClientName,
        email: clientData?.email || restData.email || '',
        phone: clientData?.phone || restData.phone || '',
        cedula: clientData?.cedula || restData.cedula || ''
      };

      // GENERAR ID DINÁMICO: Contrato_Cliente_Marca_Modelo_Ultimos4Chasis
      const clientName = combinedClientName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      // Parsear vehículo string "Marca Modelo Año" o similar
      let make = 'MARCA';
      let model = 'MODELO';
      let last4Vin = '0000'; // Contrato data doesn't explicitly have VIN often, might need lookup or defaults

      // Si tenemos vehicleId, buscamos en inventario para más precisión
      if (contractData.vehicleId) {
        const vehicleObj = activeInventory.find(v => String(v.id) === String(contractData.vehicleId));
        if (vehicleObj) {
          make = (vehicleObj.make || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          model = (vehicleObj.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          last4Vin = (vehicleObj.vin || '0000').slice(-4);
        } else if (data.vehicle) {
          const parts = data.vehicle.split(' ');
          if (parts.length >= 2) {
            make = parts[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
            model = parts[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
          }
        }
      }

      const customId = `Contrato_${clientName}_${make}_${model}_${last4Vin}`;

      if (id) {
        // En caso de edición, mantenemos el ID original (o decidimos migrarlo, pero mejor mantener por simplicidad si ya existe)
        // Pero si es nuevo sistema, asumimos que 'id' vendría de una edición anterior.
        // Si queremos forzar el nuevo formato habría que borrar y crear, pero updateDoc es más seguro para ediciones.
        const contractRef = doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", id);
        await setDoc(contractRef, {
          ...data,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        showToast("Contrato actualizado");
      } else {
        const newContract = {
          ...data,
          id: customId,
          type: 'contract', // Identificador de tipo
          createdAt: new Date().toISOString()
        };

        // GUARDAR EN SUBCOLECCIÓN 'documentos/contratos'
        await setDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", customId), newContract);

        // [LOCAL STATE SYNC] Update contracts state immediately
        setNewContracts(prev => [newContract, ...prev]);

        // Notificar al equipo sobre el nuevo contrato
        {
          const vehicleObj = contractData.vehicleId
            ? activeInventory.find(v => String(v.id) === String(contractData.vehicleId))
            : null;
          sendDealerNotification({
            type: 'contract',
            actorName: userProfile?.name || 'Alguien',
            vehicleData: {
              año: String(vehicleObj?.year || vehicleObj?.detalles?.year || ''),
              marca: vehicleObj?.make || vehicleObj?.detalles?.make || make,
              modelo: vehicleObj?.model || vehicleObj?.detalles?.model || model,
              color: vehicleObj?.color || vehicleObj?.detalles?.color || '',
            },
            clientName: combinedClientName,
            dealerId: userProfile?.supabaseDealerId,
          }).catch(() => {});
        }

        if (contractData.vehicleId) {
          // Determinar estado basado en tipo de documento
          // El documentType puede ser 'contrato' o 'cotizacion'
          const isQuote = String(contractData.documentType).toLowerCase().includes('cotiz');
          const newEstado = isQuote ? 'Cotizado' : 'Vendido';
          const newStatus = isQuote ? 'quoted' : 'sold';

          try {
            await supabase.from('vehiculos')
              .update({ estado: newEstado })
              .eq('id', contractData.vehicleId);

            // Actualizar estado local para que el cambio sea reflejado en la UI inmediatamente
            setInventory(prev => prev.map(v =>
              String(v.id) === String(contractData.vehicleId) ? { ...v, estado: newEstado, status: newStatus } : v
            ));

            // Registrar comprador real (integración Cloy postventa) cuando es venta firme, no cotización.
            if (!isQuote && combinedClientName) {
              const dealerUuidForBuyer = userProfile?.supabaseDealerId || userProfile?.dealerId;
              await supabase.from('compradores').insert([{
                vehiculo_id: contractData.vehicleId,
                dealer_id: dealerUuidForBuyer,
                nombre: combinedClientName,
                telefono: toE164(data.phone) || null,
                cedula: data.cedula || null,
                correo: data.email || null,
              }]);
            }
          } catch (updateErr) {
            console.error("Error updating vehicle status:", updateErr);
          }
        }
        const docLabel = contractData.documentType === 'cotizacion' ? 'Cotización generada y vehículo marcado como Cotizado' : 'Contrato generado y vehículo marcado como Vendido';
        showToast(docLabel, "success");
      }
      showToast("Contrato generado");
    } catch (error) {
      console.error(error);
      showToast("Error: " + error.message, "error");
    }
  };


  const handleDeleteContract = async (id) => {
    if (!effectiveDealerId) return; // Usar effectiveDealerId
    try {
      if (id.startsWith('Contrato')) {
        await updateDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", id), { status: 'deleted' });
      } else {
        await updateDoc(doc(db, "Dealers", effectiveDealerId, "contracts", id), { status: 'deleted' });
      }
      showToast("Contrato movido a papelera");
    } catch (error) {
      console.error(error);
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const handleDeleteQuote = async (id) => {
    if (!effectiveDealerId) return;
    try {
      if (id.startsWith('Cotizacion')) {
        await updateDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items", id), { status: 'deleted' });
      } else {
        await updateDoc(doc(db, "Dealers", effectiveDealerId, "quotes", id), { status: 'deleted' });
      }
      showToast("Cotización movida a papelera");
    } catch (error) {
      console.error(error);
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const handleRedoSale = useCallback(async (vehicleId) => {
    if (!effectiveDealerId) return;
    try {
      // 1. Find associated contracts (not deleted)
      const associatedContracts = (contracts || []).filter(c => String(c.vehicleId) === String(vehicleId) && c.status !== 'deleted');

      // 2. Mark them as deleted in Firebase
      for (const contract of associatedContracts) {
        if (contract.id.startsWith('Contrato')) {
          await updateDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "contratos", "items", contract.id), { status: 'deleted' });
        } else if (contract.id.startsWith('Cotizacion')) {
          await updateDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "cotizaciones", "items", contract.id), { status: 'deleted' });
        } else {
          // Legacy check
          const coll = contract.category === 'quote' ? 'quotes' : 'contracts';
          await updateDoc(doc(db, "Dealers", effectiveDealerId, coll, contract.id), { status: 'deleted' });
        }
      }

      // 3. Update vehicle back to available in Supabase
      const { error } = await supabase.from('vehiculos')
        .update({ estado: 'Disponible' })
        .eq('id', vehicleId);

      if (error) throw error;

      // 3b. Venta deshecha: el comprador registrado ya no aplica.
      await supabase.from('compradores').delete().eq('vehiculo_id', vehicleId);

      // 4. Update local state
      setInventory(prev => prev.map(v =>
        String(v.id) === String(vehicleId) ? { ...v, estado: 'Disponible', status: 'available' } : v
      ));

      showToast("Venta deshecha: El vehículo vuelve a estar disponible", "success");
      fetchVehiclesFromSupabase();
    } catch (error) {
      console.error(error);
      showToast("Error al deshacer venta: " + error.message, "error");
    }
  }, [effectiveDealerId, contracts, setInventory, showToast, fetchVehiclesFromSupabase]);

  const handleSaveTemplate = async (templateData) => {
    if (!effectiveDealerId) return;
    try {
      const { id, ...data } = templateData;
      // Normalizar nombre para el ID o usar timestamp
      const nameSlug = (data.name || 'Plantilla').toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const templateId = id || `Plantilla_${nameSlug}_${Date.now()}`;

      const tempRef = doc(db, "Dealers", effectiveDealerId, "documentos", "plantillas", "items", templateId);

      await setDoc(tempRef, {
        ...data,
        id: templateId,
        updatedAt: new Date().toISOString(),
        createdAt: data.createdAt || new Date().toISOString()
      }, { merge: true });

      showToast(id ? t('toast_template_updated') : t('toast_template_created'));
    } catch (error) {
      console.error("Error saving template:", error);
      showToast(t('toast_error_save_template'), 'error');
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!effectiveDealerId) return;
    try {
      await deleteDoc(doc(db, "Dealers", effectiveDealerId, "documentos", "plantillas", "items", id));
      showToast("Plantilla eliminada");
    } catch (error) {
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  // ── GHL Contact Handlers ────────────────────────────────────────────────────

  const handleUpdateGHLContact = async (contactId, updateData) => {
    const dealerUuid = userProfile?.supabaseDealerId || (() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null;
    })();
    if (!dealerUuid) return;
    try {
      const r = await fetch(`/api/ghlContacts?dealerId=${dealerUuid}&contactId=${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!r.ok) throw new Error(await r.text());
      // Optimistic update
      setGhlContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...updateData } : c));
      showToast(t('toast_contact_updated'));
    } catch (err) {
      console.error('handleUpdateGHLContact error:', err);
      showToast(t('toast_contact_updated') + ': ' + err.message, 'error');
    }
  };

  const handleDeleteGHLContact = async (contactId) => {
    const dealerUuid = userProfile?.supabaseDealerId || (() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(effectiveDealerId) ? effectiveDealerId : null;
    })();
    if (!dealerUuid) return;
    try {
      const r = await fetch(`/api/ghlContacts?dealerId=${dealerUuid}&contactId=${contactId}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(await r.text());
      setGhlContacts(prev => prev.filter(c => c.id !== contactId));
      showToast(t('toast_contact_deleted'));
    } catch (err) {
      console.error('handleDeleteGHLContact error:', err);
      showToast('Error eliminando contacto: ' + err.message, 'error');
    }
  };

  // ────────────────────────────────────────────────────────────────────────────

  const handleSellQuoted = (quoteOrVehicle, docType = 'contrato') => {
    // If already a quote/doc object (has client data + vehicleId), use it directly
    const isQuoteObj = !!(quoteOrVehicle?.name || quoteOrVehicle?.lastname || quoteOrVehicle?.client) && !!quoteOrVehicle?.vehicleId;
    if (isQuoteObj) {
      setCurrentVehicleForModal(quoteOrVehicle);
    } else {
      // It's a vehicle — find its latest active quote
      const activeQuotes = (quotes || [])
        .filter(q => String(q.vehicleId) === String(quoteOrVehicle?.id) && q.status !== 'deleted')
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setCurrentVehicleForModal(activeQuotes.length > 0 ? activeQuotes[0] : quoteOrVehicle);
    }
    setSelectedDocType(docType);
    setIsContractModalOpen(true);
  };

  const handleVehicleSelect = (vehicle) => {
    console.log("App: handleVehicleSelect triggered", { vehicleId: vehicle?.id });
    setSelectedVehicle(vehicle);
  };

  const handleNavigate = (tab, filter = 'available') => {
    setSelectedVehicle(null);
    setActiveTab(tab);
    if (tab !== 'conversations') setIsChatOpen(false);
    if (tab === 'inventory' && filter) setInventoryTab(filter);
  };

  const handleDealerSelect = async (dealer) => {
    const userId = currentUserEmail.toLowerCase().replace(/\./g, '_');
    localStorage.setItem(`selected_dealer_${userId}`, dealer.id);
    setShowDealerSwitcher(false);
    setInitializing(true);
    setUserProfile(null);
    setResolvedDealerId(null);
    // Incrementar profileRefreshKey fuerza el useEffect de fetchUserProfile a re-ejecutarse
    setProfileRefreshKey(k => k + 1);
  };

  const renderContent = () => {
    return (
      <motion.div
        key={activeTab + (selectedVehicle ? '-edit' : '')}
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.02, y: -8 }}
        transition={{
          duration: 0.5,
          ease: [0.23, 1, 0.32, 1]
        }}
        className="w-full h-full origin-top flex flex-col"
      >
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent, #ef4444)' }} />
          </div>
        }>
        {(() => {
          console.log("App: renderContent inner execution", { hasSelectedVehicle: !!selectedVehicle, activeTab });
          if (selectedVehicle) {
            console.log("App: rendering VehicleEditView for", selectedVehicle.id);
            const associatedContract = contracts.find(c => String(c.vehicleId) === String(selectedVehicle.id));
            const associatedQuote = quotes.find(q => String(q.vehicleId) === String(selectedVehicle.id) && q.status !== 'deleted');

            return (
              <VehicleEditView
                vehicle={selectedVehicle}
                contract={associatedContract}
                quote={associatedQuote}
                readOnly={isStoreRoute}
                onBack={() => {
                  if (isStoreRoute) {
                    const url = new URL(window.location);
                    url.searchParams.delete('vehicleID');
                    url.searchParams.delete('vehicleId');
                    const pathParts = url.pathname.split('/').filter(Boolean);
                    if (pathParts.includes('catalogo')) {
                      const catIndex = pathParts.indexOf('catalogo');
                      if (pathParts.length > catIndex + 1) {
                        url.pathname = '/' + pathParts.slice(0, catIndex + 1).join('/');
                      }
                    }
                    if (url.pathname.includes('/inventario/')) {
                      window.location.href = url.toString(); // Forzar recarga para que Cloud Function retome el HTML del catálogo principal
                      return;
                    } else {
                      window.history.replaceState({}, '', url);
                    }
                  }
                  setSelectedVehicle(null);
                }}
                onSave={async (data) => {
                  await handleSaveVehicle(data);
                  setSelectedVehicle(null);
                }}
                onSellQuoted={handleSellQuoted}
                onSolicitInfo={(v) => {
                  if (typeof window !== 'undefined' && window.showToast) {
                    window.showToast(`Interés registrado para ${v.make} ${v.model}`, "success");
                  }
                }}
                userProfile={shadowProfile}
                allVehicles={isStoreRoute ? inventory : []}
                onSelectVehicle={(v) => setSelectedVehicle(v)}
              />
            );
          }
          switch (activeTab) {
            case 'settings': return <SettingsView userProfile={shadowProfile} onLogout={handleLogout} onUpdateProfile={handleUpdateProfile} showToast={showToast} onDisconnectGhl={handleDisconnectGhl} onShowDealerSwitcher={() => setShowDealerSwitcher(true)} isSuperAdmin={isSuperAdmin} isPlatformAdminUser={isPlatformAdminUser} requestConfirmation={requestConfirmation} onInventoryRecalculated={fetchVehiclesFromSupabase} />;
            case 'dashboard': return <DashboardView inventory={activeInventory} contracts={contracts || []} onNavigate={handleNavigate} userProfile={shadowProfile} />;
            case 'inventory': return <InventoryView inventory={activeInventory} setInventory={setInventory} quotes={quotes || []} contracts={contracts || []} templates={templates} activeTab={inventoryTab} setActiveTab={setInventoryTab} showToast={showToast} onGenerateContract={handleGenerateContract} onGenerateQuote={handleQuoteSent} onVehicleSelect={handleVehicleSelect} onSellQuoted={handleSellQuoted} onSave={handleSaveVehicle}
              onDelete={handleDeleteVehicle}
              onDeleteQuote={handleDeleteQuote}
              onRedoSale={handleRedoSale}
              userProfile={shadowProfile} searchTerm={globalSearch} requestConfirmation={requestConfirmation} resolvedDealerId={resolvedDealerId}
              isLoading={isInventoryLoading}
              readOnly={isStoreRoute}
              ghlContacts={ghlContacts}
            />;
            case 'contacts': return (
              <ContactsView
                contacts={ghlContacts}
                inventory={activeInventory}
                contracts={contracts || []}
                isLoading={contactsLoading}
                onRefresh={() => fetchGHLContacts(true)}
                onLoadMore={fetchMoreGHLContacts}
                onSearch={searchGHLContacts}
                hasMore={!!contactsMeta.startAfterId}
                totalContacts={contactsMeta.total}
                onUpdateContact={handleUpdateGHLContact}
                onDeleteContact={handleDeleteGHLContact}
                onSellNewCar={(contactData, docType = 'contrato') => {
                  // isContactData flag prevents modal from treating this as a vehicle pre-selection
                  setCurrentVehicleForModal({ ...contactData, isContactData: true });
                  setSelectedDocType(docType);
                  setIsContractModalOpen(true);
                }}
                quotes={quotes || []}
                onSellQuoted={handleSellQuoted}
                showToast={showToast}
                requestConfirmation={requestConfirmation}
                userProfile={shadowProfile}
                searchTerm={globalSearch}
                initialContactId={pendingContactId}
                onInitialContactOpened={() => setPendingContactId(null)}
                onlyAssignedData={userProfile?.onlyAssignedData === true}
                ghlUserId={userProfile?.ghlUserId || ''}
              />
            );
            case 'conversations': return (
              <ConversationsView
                dealerId={userProfile?.supabaseDealerId}
                initialConversations={ghlConversations}
                isLoadingConversations={conversationsLoading}
                onRefreshConversations={() => fetchGHLConversations(true)}
                showToast={showToast}
                userProfile={shadowProfile}
                onlyAssignedData={userProfile?.onlyAssignedData === true}
                ghlUserId={userProfile?.ghlUserId || ''}
                contracts={contracts}
                onNavigateToContact={(contactId) => {
                  if (contactId) setPendingContactId(contactId);
                  handleNavigate('contacts');
                }}
                onChatOpen={() => setIsChatOpen(true)}
                onChatClose={() => setIsChatOpen(false)}
              />
            );
            case 'trash': return <TrashView trash={trashInventory} contracts={contracts} quotes={quotes} onRestore={handleRestoreVehicle} onPermanentDelete={handlePermanentDelete} onRestoreDocument={handleRestoreDocument} onPermanentDeleteDocument={handlePermanentDeleteDocument} onEmptyTrash={handleEmptyTrash} showToast={showToast} userProfile={shadowProfile} />;
            default: return <DashboardView inventory={activeInventory} contracts={contracts} onNavigate={handleNavigate} userProfile={shadowProfile} />;
          }
        })()}
        </Suspense>
      </motion.div>
    );
  };

  // --- RENDER CONDICIONAL DE PANTALLA COMPLETA ---
  // Unificamos pantallas de carga para una experiencia fluida
  // Si estamos loggeados pero no hay profile después de 3s, permitimos que se vea la AppLayout con loaders internos
  // Para usuarios logueados (no rutas públicas de tienda) esperamos a tener
  // el perfil del dealer Y el primer inventario antes de entrar a la app,
  // evitando el flash de "TU DEALER / Usuario / 0". forceReady es el escape de seguridad.
  const needsAppData = isLoggedIn && !isStoreRoute;
  const appDataReady = forceReady || !needsAppData || (!!userProfile && inventoryReady);
  // No mostrar el loader si el SuperAdmin debe elegir dealer (perfil null a propósito).
  const isActuallyLoading = (initializing || ghlSSOLoading || (!authChecked) || !appDataReady) && !showDealerSwitcher;

  if (isActuallyLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit', system-ui, sans-serif",
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
      }}>
        <style>{`
          @keyframes logoBounce {
            0%, 100% { transform: translateY(0); }
            30% { transform: translateY(-30px); }
            50% { transform: translateY(-5px); }
            70% { transform: translateY(-15px); }
          }
          @keyframes progressBar {
            0% { width: 0%; }
            100% { width: 100%; }
          }
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
           @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.2); }
            50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.4); }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes spin-fast { 
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .animate-spin-fast {
            animation: spin-fast 0.4s linear infinite;
          }
        `}</style>

        <div style={{
          animation: 'logoBounce 2s ease-in-out infinite',
          marginBottom: '32px',
        }}>
          <AppLogo className="drop-shadow-2xl" size={120} style={{ filter: 'drop-shadow(0 10px 30px rgba(239, 68, 68, 0.3))' }} />
        </div>

        <h1 style={{
          color: '#1e293b',
          fontSize: '1.5rem',
          fontWeight: 800,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: '8px',
          animation: 'fadeInUp 0.8s ease-out 0.3s both',
        }}>
          CarBot <span style={{ color: '#ef4444' }}>System</span>
        </h1>

        <p style={{
          color: '#64748b',
          fontSize: '0.85rem',
          fontWeight: 500,
          marginBottom: '40px',
          animation: 'fadeInUp 0.8s ease-out 0.5s both',
        }}>
          {ghlSSOLoading ? 'Autenticando sesión segura...' : 'Sincronizando sistema...'}
        </p>

        <div style={{
          width: '220px',
          height: '4px',
          background: '#e2e8f0',
          borderRadius: '10px',
          overflow: 'hidden',
          animation: 'fadeInUp 0.8s ease-out 0.7s both, pulse-glow 2s ease-in-out infinite',
        }}>
          <div style={{
            height: '100%',
            borderRadius: '10px',
            background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)',
            backgroundSize: '200% 100%',
            animation: 'progressBar 2s cubic-bezier(0.65, 0, 0.35, 1) infinite, shimmer 1.5s linear infinite',
          }} />
        </div>
      </div>
    );
  }

  // Sin sesión → mostrar Login manual
  if (!isLoggedIn && !shadowProfile) {

    return (
      <>
        <LoginView onLoginSuccess={handleLoginSuccess} />
        <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} offset={{ top: 20, right: 20 }} options={{ roundness: 16, duration: 3500 }} />
      </>
    );
  }

  return (
    <>
      <AppLayout
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        onLogout={handleLogout}
        userProfile={shadowProfile}
        searchTerm={globalSearch}
        onSearchChange={setGlobalSearch}
        isStoreRoute={isStoreRoute}
        isChatOpen={isChatOpen}
      >
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </AppLayout>
      <Toaster position="top-right" theme={isDark ? 'dark' : 'light'} offset={{ top: 20, right: 20 }} options={{ roundness: 16, duration: 3500 }} />

      {isContractModalOpen && createPortal(
        <GenerateContractModal
          isOpen={isContractModalOpen}
          onClose={() => { setIsContractModalOpen(false); setCurrentVehicleForModal(null); }}
          inventory={inventory}
          onGenerate={handleGenerateContract}
          initialVehicle={currentVehicleForModal}
          templates={templates}
          userProfile={shadowProfile}
          showToast={showToast}
          initialDocumentType={selectedDocType}
          resolvedDealerId={resolvedDealerId}
          ghlContacts={ghlContacts}
        />,
        document.body
      )}

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        isDestructive={confirmationModal.isDestructive}
      />

      <DealerSwitcherModal
        isOpen={showDealerSwitcher}
        onClose={() => setShowDealerSwitcher(false)}
        dealers={allDealers}
        onSelect={handleDealerSelect}
        isSuperAdmin={isSuperAdmin}
        onSoftDelete={handleSoftDeleteDealer}
        onRecover={handleRecoverDealer}
        onCreateDealer={handleCreateDealer}
        canInstall={isSuperAdmin || hasPanelPermission('install_dealer')}
        canDelete={isSuperAdmin || hasPanelPermission('delete_dealer')}
        canEnterAnyAccount={isSuperAdmin || hasPanelPermission('enter_any_account')}
        canManageAdmins={isSuperAdmin || hasPanelPermission('manage_admins')}
        platformAdmins={platformAdminsList}
        ownUserId={platformAdmin?.user_id}
        onSearchUsers={handleSearchGhlUsers}
        onAddAdmin={handleAddPlatformAdmin}
        onUpdateAdmin={handleUpdatePlatformAdmin}
        onRemoveAdmin={handleRemovePlatformAdmin}
        showToast={showToast}
      />
    </>
  );
}


