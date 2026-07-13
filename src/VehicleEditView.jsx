import React, { useState, useEffect, useRef } from 'react';
import VinDecoderSection from './components/VinDecoderSection.jsx';
import {
  ArrowLeft, Calendar, Fuel, Settings, Save, DollarSign,
  IdCard, Maximize2, ChevronLeft, ChevronRight, ChevronDown,
  X, Info, Share2, Heart, Files, CheckCircle, CheckCircle2, Lock, Trash2, Camera, Phone, Mail,
  Shield, User, Users, Activity, Zap, FileText, Quote, Tag, AlertTriangle,
  FileSignature, MoreVertical, Copy, RefreshCw, Edit, Plus, CloudUpload, Check,
  Briefcase, MapPin, Gauge, LifeBuoy, Key, Palette, Hash, Building2, Car, Link
} from 'lucide-react';
import { useI18n } from './i18n/I18nContext.jsx';
import { useCurrency } from './CurrencyContext.jsx';

const formatWithCommas = (value) => {
  if (!value && value !== 0) return '';
  const str = value.toString().replace(/\D/g, '');
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const parseCommaNumber = (str) => {
  return str.toString().replace(/,/g, '');
};

const Input = ({ label, type = "text", className = "", ...props }) => (
  <div className="group">
    <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-600" style={{ color: 'var(--text-secondary)' }}>{label}</label>
    <div className="relative">
      <input
        type={type}
        className={`w-full px-4 py-3 rounded-2xl font-bold text-sm focus:outline-none focus:border-red-500/20 focus:ring-4 focus:ring-red-500/5 transition-all outline-none ${className}`}
        style={{ backgroundColor: 'var(--input-bg)', borderWidth: '2px', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
        {...props}
      />
    </div>
  </div>
);

const Select = ({ label, options = [], name, value, onChange, disabled, className = "", ...props }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { name, value: val } });
    }
  };

  const currentValue = value ?? (typeof options[0] === 'object' ? options[0].value : options[0]);
  const currentOption = options.find(opt => (typeof opt === 'object' ? opt.value : opt) === currentValue);
  const displayLabel = typeof currentOption === 'object' ? currentOption.label : currentOption || currentValue;

  return (
    <div className={`group relative ${className}`} ref={dropdownRef}>
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-600" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all outline-none ${isOpen ? 'border-red-500/20 ring-4 ring-red-500/5' : 'hover:opacity-90'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ backgroundColor: 'var(--input-bg)', borderWidth: '2px', borderColor: isOpen ? undefined : 'var(--input-border)', color: 'var(--text-primary)' }}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={16} className={`transition-transform duration-300 ${isOpen ? 'rotate-180 text-red-500' : ''}`} style={!isOpen ? { color: 'var(--text-tertiary)' } : {}} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-2 p-2 rounded-2xl shadow-2xl z-[110] animate-in fade-in zoom-in-95 duration-200" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
          <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-1">
            {options.map((opt, i) => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const labelText = typeof opt === 'object' ? opt.label : opt;
              const isActive = currentValue === val;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(val)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isActive
                    ? 'text-red-600'
                    : 'hover:text-red-500'
                    }`}
                  style={isActive ? { backgroundColor: 'rgba(227, 28, 37, 0.12)' } : { color: 'var(--text-secondary)' }}
                >
                  {labelText}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const Badge = ({ status }) => {
  const styles = {
    available: "bg-emerald-500 text-white border-emerald-400",
    quoted: "bg-amber-500 text-white border-amber-400",
    sold: "bg-red-600 text-white border-red-500",
    upcoming: "bg-indigo-600 text-white border-indigo-500",
    trash: "bg-slate-500 text-white border-slate-400"
  };
  const labels = {
    available: "Disponible",
    quoted: "Cotizado",
    sold: "Vendido",
    upcoming: "En Camino",
    trash: "Papelera"
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-lg ${styles[status] || styles.available}`}>
      {labels[status] || status}
    </span>
  );
};

const FormInput = ({ label, icon: Icon, name, value, onChange, type = "text", disabled, isSold, className = "", readOnly }) => (
  <div className="flex flex-col gap-2 group">
    {label && (
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-600" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
    )}
    <div className={`relative flex items-center rounded-2xl overflow-hidden focus-within:border-red-500/20 focus-within:ring-4 focus-within:ring-red-500/5 transition-all outline-none ${isSold ? 'opacity-60 grayscale-[0.5]' : ''} ${className}`} style={{ backgroundColor: 'var(--input-bg)', borderWidth: '2px', borderColor: 'var(--input-border)' }}>
      {Icon && <div className="pl-4 flex items-center shrink-0 group-focus-within:text-red-500 transition-colors" style={{ color: 'var(--text-tertiary)' }}><Icon size={18} /></div>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled || isSold}
        className={`w-full py-3 bg-transparent font-bold text-sm outline-none ${Icon ? 'pl-3 pr-4' : 'px-4'}`}
        style={{ color: 'var(--text-primary)' }}
      />
    </div>
  </div>
);

export default function VehicleEditView({
  vehicle,
  contract,
  quote,
  onBack,
  onSave,
  onSellQuoted,
  onSolicitInfo,
  readOnly = false,
  userProfile,
  allVehicles = [],
  onSelectVehicle
}) {
  console.log("VehicleEditView render start", { vehicleId: vehicle?.id, readOnly });
  const { t } = useI18n();
  const { selected: selectedCurrencies, getSymbol, CURRENCIES: CURR_MAP } = useCurrency();
  const [loading, setLoading] = useState(false);
  const mileageRef = useRef(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [currency, setCurrency] = useState(vehicle?.currency || (vehicle?.price_dop > 0 ? 'DOP' : 'USD'));
  const [downPaymentCurrency, setDownPaymentCurrency] = useState(vehicle?.downPaymentCurrency || (vehicle?.initial_payment_dop > 0 ? 'DOP' : 'USD'));
  const [mileageUnit, setMileageUnit] = useState(vehicle?.mileage_unit || 'KM');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    const link = (formData.link_externo || '').trim();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      // Fallback para navegadores sin clipboard API
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onSwipeEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) nextPhoto();
    if (isRightSwipe) prevPhoto();
  };

  const isSold = vehicle?.status === 'sold';
  const isQuoted = vehicle?.status === 'quoted' || vehicle?.estado === 'Cotizado';

  const mapVehicleFields = (v) => ({
    ...v,
    year: v?.anio || v?.year || v?.detalles?.year || '',
    make: v?.marca || v?.make || v?.detalles?.make || '',
    model: v?.modelo || v?.model || v?.detalles?.model || '',
    edition: v?.edicion || v?.edition || v?.detalles?.edition || '',
    type: v?.tipo_vehiculo || v?.type || v?.detalles?.type || '',
    color: v?.color || v?.exteriorColor || v?.detalles?.color || '',
    mileage: v?.millas || v?.mileage || v?.detalles?.mileage || 0,
    plate: v?.placa || v?.plate || v?.detalles?.plate || '',
    vin: v?.chasis_vin || v?.vin || v?.detalles?.vin || '',
    chassis: v?.chasis_vin || v?.chassis || v?.detalles?.chassis || '',

    images: v?.images || (v?.image ? [v.image] : []),
    photos: v?.photos || [],
    documents: v?.documents || [],
    price_unified: (v?.precio > 0 ? v?.precio : (v?.price_dop > 0 ? v.price_dop : (v?.price || 0))).toString(),
    initial_unified: (v?.inicial > 0 ? v?.inicial : (v?.initial_payment_dop > 0 ? v.initial_payment_dop : (v?.initial_payment || 0))).toString(),
  });

  const [formData, setFormData] = useState({
    ...mapVehicleFields(vehicle),

    // Defaults for selects
    transmission: vehicle?.transmission || vehicle?.transmision || '-',
    transmision: vehicle?.transmision || vehicle?.transmission || '-',
    fuel: vehicle?.fuel || vehicle?.combustible || '-',
    combustible: vehicle?.combustible || vehicle?.fuel || '-',
    traction: vehicle?.traction || vehicle?.traccion || '-',
    traccion: vehicle?.traccion || vehicle?.traction || '-',
    engine_type: vehicle?.engine_type || vehicle?.motor || '-',
    motor: vehicle?.motor || vehicle?.engine_type || '-',
    seat_material: vehicle?.seat_material || '-',
    roof_type: vehicle?.roof_type || '-',
    key_type: vehicle?.key_type || '-',
    seats: vehicle?.seats || vehicle?.cantidad_asientos || '-',
    asientos: vehicle?.asientos || vehicle?.cantidad_asientos || vehicle?.seats || '-',
    condition: vehicle?.condicion || vehicle?.condition || '-',
    condicion: vehicle?.condicion || vehicle?.condition || '-',
    clean_carfax: vehicle?.clean_carfax || vehicle?.condicion_carfax || vehicle?.carfaxCondition || vehicle?.detalles?.clean_carfax || '-',
    link_externo: vehicle?.link_externo || vehicle?.detalles?.link_externo || '',

    // Convert boolean flags to "Sí" / "No" / "-" for the dropdowns
    // ONLY map to "No" if it is explicitly the string 'No' in detalles or at the top level
    carplay: (vehicle?.appleCarplay === true || vehicle?.carplay === true || vehicle?.carplay === 'Sí' || vehicle?.apple_android === 'Sí') ? 'Sí' :
      (vehicle?.carplay === 'No' || vehicle?.apple_android === 'No' || vehicle?.detalles?.carplay === 'No' || vehicle?.detalles?.appleCarplay === 'No') ? 'No' : '-',
    sensors: (vehicle?.sensores === true || vehicle?.sensores === 'Sí' || vehicle?.sensors === true || vehicle?.sensors === 'Sí') ? 'Sí' :
      (vehicle?.sensores === 'No' || vehicle?.sensors === 'No' || vehicle?.detalles?.sensors === 'No' || vehicle?.detalles?.sensores === 'No') ? 'No' : '-',
    trunk: (vehicle?.powerTrunk === true || vehicle?.baul_electrico === true || vehicle?.baul_electrico === 'Sí' || vehicle?.trunk === 'Sí' || vehicle?.baul === 'Sí') ? 'Sí' :
      (vehicle?.baul_electrico === 'No' || vehicle?.trunk === 'No' || vehicle?.baul === 'No' || vehicle?.detalles?.powerTrunk === 'No' || vehicle?.detalles?.trunk === 'No' || vehicle?.detalles?.baul_electrico === 'No') ? 'No' : '-',
    camera: (vehicle?.camera === true || vehicle?.camera === 'Sí' || vehicle?.camara === true || vehicle?.camara === 'Sí') ? 'Reversa' :
      (vehicle?.camera === 'No' || vehicle?.camara === 'No' || vehicle?.detalles?.camera === 'No' || vehicle?.detalles?.camara === 'No') ? 'No' :
        (vehicle?.camera || vehicle?.camara || '-'),
    electric_windows: (vehicle?.powerWindows === true || vehicle?.vidrios_electricos === true || vehicle?.vidrios_electricos === 'Sí' || vehicle?.electric_windows === 'Sí' || vehicle?.vidrios === 'Sí') ? 'Sí' :
      (vehicle?.vidrios_electricos === 'No' || vehicle?.electric_windows === 'No' || vehicle?.vidrios === 'No' || vehicle?.detalles?.powerWindows === 'No' || vehicle?.detalles?.electric_windows === 'No' || vehicle?.detalles?.vidrios_electricos === 'No') ? 'No' : '-'
  });

  useEffect(() => {
    if (vehicle) {
      setFormData(prev => ({
        ...prev,
        ...mapVehicleFields(vehicle),

        // Defaults for selects
        transmission: vehicle?.transmission || vehicle?.transmision || '-',
        transmision: vehicle?.transmision || vehicle?.transmission || '-',
        fuel: vehicle?.fuel || vehicle?.combustible || '-',
        combustible: vehicle?.combustible || vehicle?.fuel || '-',
        traction: vehicle?.traction || vehicle?.traccion || '-',
        traccion: vehicle?.traccion || vehicle?.traction || '-',
        engine_type: vehicle?.engine_type || vehicle?.motor || '-',
        motor: vehicle?.motor || vehicle?.engine_type || '-',
        seat_material: vehicle?.seat_material || '-',
        roof_type: vehicle?.roof_type || '-',
        key_type: vehicle?.key_type || '-',
        seats: vehicle?.seats || vehicle?.cantidad_asientos || '-',
        asientos: vehicle?.asientos || vehicle?.cantidad_asientos || vehicle?.seats || '-',
        condition: vehicle?.condicion || vehicle?.condition || '-',
        condicion: vehicle?.condicion || vehicle?.condition || '-',
        clean_carfax: vehicle?.clean_carfax || vehicle?.condicion_carfax || vehicle?.carfaxCondition || vehicle?.detalles?.clean_carfax || '-',
        link_externo: vehicle?.link_externo || vehicle?.detalles?.link_externo || '',

        // Convert boolean flags to "Sí" / "No" / "-" for the dropdowns
        // ONLY map to "No" if it is explicitly the string 'No' in detalles or at the top level
        carplay: (vehicle?.appleCarplay === true || vehicle?.carplay === true || vehicle?.carplay === 'Sí' || vehicle?.apple_android === 'Sí') ? 'Sí' :
          (vehicle?.carplay === 'No' || vehicle?.apple_android === 'No' || vehicle?.detalles?.carplay === 'No' || vehicle?.detalles?.appleCarplay === 'No') ? 'No' : '-',
        sensors: (vehicle?.sensores === true || vehicle?.sensores === 'Sí' || vehicle?.sensors === true || vehicle?.sensors === 'Sí') ? 'Sí' :
          (vehicle?.sensores === 'No' || vehicle?.sensors === 'No' || vehicle?.detalles?.sensors === 'No' || vehicle?.detalles?.sensores === 'No') ? 'No' : '-',
        trunk: (vehicle?.powerTrunk === true || vehicle?.baul_electrico === true || vehicle?.baul_electrico === 'Sí' || vehicle?.trunk === 'Sí' || vehicle?.baul === 'Sí') ? 'Sí' :
          (vehicle?.baul_electrico === 'No' || vehicle?.trunk === 'No' || vehicle?.baul === 'No' || vehicle?.detalles?.powerTrunk === 'No' || vehicle?.detalles?.trunk === 'No' || vehicle?.detalles?.baul_electrico === 'No') ? 'No' : '-',
        camera: (vehicle?.camera === true || vehicle?.camera === 'Sí' || vehicle?.camara === true || vehicle?.camara === 'Sí') ? 'Reversa' :
          (vehicle?.camera === 'No' || vehicle?.camara === 'No' || vehicle?.detalles?.camera === 'No' || vehicle?.detalles?.camara === 'No') ? 'No' :
            (vehicle?.camera || vehicle?.camara || '-'),
        electric_windows: (vehicle?.powerWindows === true || vehicle?.vidrios_electricos === true || vehicle?.vidrios_electricos === 'Sí' || vehicle?.electric_windows === 'Sí' || vehicle?.vidrios === 'Sí') ? 'Sí' :
          (vehicle?.vidrios_electricos === 'No' || vehicle?.electric_windows === 'No' || vehicle?.vidrios === 'No' || vehicle?.detalles?.powerWindows === 'No' || vehicle?.detalles?.electric_windows === 'No' || vehicle?.detalles?.vidrios_electricos === 'No') ? 'No' : '-'
      }));
      setCurrency(vehicle.moneda_precio || vehicle.currency || vehicle.detalles?.currency || (vehicle.precio > 0 ? 'USD' : (vehicle.price_dop > 0 ? 'DOP' : 'USD')));
      setDownPaymentCurrency(vehicle.moneda_inicial || vehicle.downPaymentCurrency || vehicle.detalles?.downPaymentCurrency || (vehicle.initial_payment_dop > 0 ? 'DOP' : 'USD'));
      setMileageUnit(vehicle.unit || vehicle.mileage_unit || 'MI');
    }
    if (mileageRef.current) mileageRef.current.value = vehicle.millas || vehicle.mileage || 0;
  }, [vehicle?.id]);

  if (!vehicle) return null;

  const handlePriceChange = (e) => {
    if (isSold || readOnly) return;
    const { value } = e.target;
    const cleanValue = parseCommaNumber(value);
    setFormData(prev => ({ ...prev, price_unified: cleanValue }));
  };

  const handleInitialChange = (e) => {
    if (isSold || readOnly) return;
    const { value } = e.target;
    const cleanValue = parseCommaNumber(value);
    setFormData(prev => ({ ...prev, initial_unified: cleanValue }));
  };

  const handleChange = (e) => {
    if (isSold || readOnly) return;
    const { name, value } = e.target;

    let finalValue = value;

    // Special handling for VIN/Chassis: No 'O' allowed (both cases)
    if (['vin', 'chassis'].includes(name)) {
      finalValue = finalValue.replace(/o/gi, '');
    }

    // Enforce uppercase for specific fields
    const upperFields = ['make', 'model', 'edition', 'vin', 'chassis', 'color', 'plate'];
    if (upperFields.includes(name)) {
      finalValue = finalValue.toUpperCase();
    }

    // Special handling for Plate: Alphanumeric only
    if (name === 'plate') {
      finalValue = finalValue.replace(/[^A-Z0-9]/g, '');
    }

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || isSold) return;
    setLoading(true);
    try {
      const finalData = { ...formData };
      // Sync mileage from uncontrolled input ref in case onBlur wasn't fired
      if (mileageRef.current) finalData.mileage = mileageRef.current.value || 0;

      // --- CLEANUP "-" VALUES ---
      Object.keys(finalData).forEach(key => {
        if (finalData[key] === '-') finalData[key] = '';
      });

      const priceVal = Number(finalData.price_unified);
      const initialVal = Number(finalData.initial_unified);

      const dataToSave = {
        ...finalData,
        image: finalData.images?.[0] || finalData.image,

        // Guardar precio en el campo principal + campo legacy si aplica
        price: priceVal,
        price_dop: currency === 'DOP' ? priceVal : 0,
        currency: currency,

        initial_payment: initialVal,
        initial_payment_dop: downPaymentCurrency === 'DOP' ? initialVal : 0,
        downPaymentCurrency: downPaymentCurrency,

        mileage_unit: mileageUnit,

        // Mapeo detallado de campos técnicos para Backend/Catalog
        drivetrain: finalData.traction || finalData.traccion,
        fuelType: finalData.fuel || finalData.combustible,
        engine: finalData.engine_type || finalData.motor,
        interiorMaterial: finalData.seat_material || finalData.material_asientos,
        roof: finalData.roof_type || finalData.techo,

        // Mapeo de booleanos (UI -> DB)
        sensores: finalData.sensors,
        carplay: finalData.carplay,
        camara: finalData.camera,
        baul_electrico: finalData.trunk,
        vidrios_electricos: finalData.electric_windows,
        material_asientos: finalData.seat_material,
        traccion: finalData.traction,
        transmision: finalData.transmission,
        combustible: finalData.fuel,
        motor: finalData.engine_type,
        techo: finalData.roof_type,
        llave: finalData.key_type,
        millas: Number(finalData.mileage),
        unit: mileageUnit,
        cantidad_asientos: finalData.seats,
        placa: finalData.plate,
        tipo_vehiculo: finalData.type,
        tipo_de_vehculo: finalData.type, // Alias for GHL compatibility

        // Compatibilidad legacy
        precio: priceVal,
        inicial: initialVal
      };

      if (!readOnly) await onSave(dataToSave);
    } catch (error) {
      console.error("Error saving vehicle:", error);
      alert("Error al guardar los cambios.");
    } finally {
      setLoading(false);
    }
  };

  const handleSellQuotedAction = (e) => {
    console.log("VehicleEditView: handleSellQuotedAction clicked");
    if (e && e.stopPropagation) e.stopPropagation();
    if (onSellQuoted) {
      console.log("VehicleEditView: Calling onSellQuoted with vehicle", vehicle?.id);
      onSellQuoted(vehicle);
    } else {
      console.warn("onSellQuoted not provided to VehicleEditView");
    }
  };

  const handleSolicitInfoAction = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (onSolicitInfo) onSolicitInfo(vehicle);
    else if (typeof window !== 'undefined' && window.showToast) {
      window.showToast("Solicitud enviada al vendedor", "success");
    }
  };

  const nextPhoto = () => setActivePhotoIndex(prev => (prev + 1) % formData.images.length);
  const prevPhoto = () => setActivePhotoIndex(prev => (prev - 1 + formData.images.length) % formData.images.length);

  const movePhotoLeft = (e, index) => {
    e.stopPropagation();
    if (index === 0 || readOnly) return;
    const newImages = [...formData.images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    setFormData(prev => ({ ...prev, images: newImages }));
    if (activePhotoIndex === index) setActivePhotoIndex(index - 1);
    else if (activePhotoIndex === index - 1) setActivePhotoIndex(index);
  };

  const movePhotoRight = (e, index) => {
    e.stopPropagation();
    if (index === formData.images.length - 1 || readOnly) return;
    const newImages = [...formData.images];
    [newImages[index + 1], newImages[index]] = [newImages[index], newImages[index + 1]];
    setFormData(prev => ({ ...prev, images: newImages }));
    if (activePhotoIndex === index) setActivePhotoIndex(index + 1);
    else if (activePhotoIndex === index + 1) setActivePhotoIndex(index);
  };

  const setAsCover = (e, index) => {
    e.stopPropagation();
    if (index === 0) return;
    const newImages = [...formData.images];
    const target = newImages.splice(index, 1)[0];
    newImages.unshift(target);
    setFormData(prev => ({ ...prev, images: newImages }));
    setActivePhotoIndex(0);
  };

  const removePhoto = (e, index) => {
    e.stopPropagation();
    if (readOnly) return;
    if (confirm(t('field_delete_photo'))) {
      const newImages = formData.images.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, images: newImages }));
      if (activePhotoIndex >= newImages.length) {
        setActivePhotoIndex(Math.max(0, newImages.length - 1));
      }
    }
  };


  if (readOnly) {
    // ── Helpers de precio — show as-is with original currency ──────────────────
    const displayPrice = Number(formData.price_unified || 0);
    const displayInitial = Number(formData.initial_unified || 0);
    const priceLabel = getSymbol(currency);
    const initialLabel = getSymbol(downPaymentCurrency);

    // ─── Sección de ficha técnica ───────────────────────────────────────────────
    // Estilo igual a carbotsystem.com: 3 columnas, cada campo es label pequeño + valor en caja gris
    const FichaCelda = ({ label, value }) => (
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.18em]">{label}</span>
        <div className="bg-[#f4f6f8] dark:bg-white/5 border border-slate-100 rounded-xl px-4 py-3">
          <span className="text-[13px] font-semibold text-slate-700 uppercase">{value || '—'}</span>
        </div>
      </div>
    );

    const CurrencyToggle = ({ activeCurrency }) => (
      <div className="flex p-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 border" style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)' }}>
        {selectedCurrencies.map(c => (
          <div key={c} className={`px-3 py-1 rounded-full transition-all ${activeCurrency === c ? 'bg-red-600 text-white shadow-sm' : ''}`} style={activeCurrency !== c ? { color: 'var(--text-tertiary)' } : {}}>{getSymbol(c)}</div>
        ))}
      </div>
    );

    return (
      <div
        className="min-h-screen font-sans"
        style={{ background: '#f4f6f8', fontFamily: "'Inter', 'Outfit', system-ui, sans-serif" }}
      >
        {/* DEALER HEADER (FIXED) - OCULTO PORQUE SE USA EL GLOBAL DE APPLAYOUT */}
        {/*
        <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-3 pb-2">
          ...
        </div>
        */}

        <div className="h-4 sm:h-6"></div> {/* Spacer minimal para el nuevo header global */}


        {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
        <div className="max-w-[1600px] mx-auto px-4 pb-16">

          {/* ENCABEZADO MÓVIL (sólo visible en < xl) */}
          <div className="xl:hidden mb-6 px-2">
            {/* AÑO • COLOR • VERSIÓN */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-red-600 font-black text-sm tracking-tight">{formData.year}</span>
              <span className="text-slate-300 font-bold">•</span>
              <span className="text-slate-400 font-bold text-xs uppercase">{formData.color}</span>
              {formData.edition && formData.edition.toUpperCase() !== 'VALUE' && (
                <>
                  <span className="text-slate-300 font-bold">•</span>
                  <span className="text-slate-400 font-bold text-xs uppercase">{formData.edition}</span>
                </>
              )}
            </div>

            {/* MARCA + MODELO */}
            <div className="leading-none">
              <h1 className="text-4xl sm:text-[2.2rem] font-black text-slate-900 uppercase tracking-tighter mb-1">
                {formData.make}
              </h1>
              <h1 className="text-4xl sm:text-[2.2rem] font-black text-red-600 uppercase tracking-tighter">
                {formData.model}
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-10">

            {/* ── LEFT: FOTO PRINCIPAL ───────────────────────────────────────── */}
            <div className="xl:col-span-8 space-y-4">
              {/* Imagen principal — mismo estilo que la vista interna */}
              <div className="relative bg-white dark:bg-[#1A1D24] rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl transition-all duration-700 border-4 md:border-8 border-white dark:border-[#1A1D24] h-[400px] md:h-[650px]">
                <div
                  className="w-full h-full relative group cursor-zoom-in flex items-center justify-center"
                  onClick={() => formData.images.length > 0 && setIsLightboxOpen(true)}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onSwipeEnd}
                >
                  {formData.images[activePhotoIndex] && !formData.images[activePhotoIndex].includes('unsplash') ? (
                    <img
                      src={formData.images[activePhotoIndex]}
                      alt={`${formData.make} ${formData.model}`}
                      className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-50">
                      {userProfile?.dealer_logo ? (
                        <img src={userProfile.dealer_logo} alt="Dealer Logo" className="w-full h-full object-contain opacity-60 drop-shadow-sm" />
                      ) : (
                        <div className="flex flex-col items-center text-slate-300">
                          <Camera size={64} className="mb-4 opacity-50" />
                          <p className="font-bold text-lg opacity-50">Sin Imágenes</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Flechas de navegación */}
                  {formData.images.length > 1 && (
                    <div className="absolute inset-x-2 sm:inset-x-8 top-[65%] sm:top-[75%] -translate-y-1/2 flex justify-between pointer-events-none">
                      <button type="button" onClick={(e) => { e.stopPropagation(); prevPhoto(); }} className="p-2 sm:p-3 rounded-full bg-white dark:bg-white/10 hover:bg-red-600 text-red-600 hover:text-white backdrop-blur-sm transition-all pointer-events-auto shadow-xl border border-red-500/10">
                        <ChevronLeft size={16} className="sm:w-6 sm:h-6" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); nextPhoto(); }} className="p-2 sm:p-3 rounded-full bg-white dark:bg-white/10 hover:bg-red-600 text-red-600 hover:text-white backdrop-blur-sm transition-all pointer-events-auto shadow-xl border border-red-500/10">
                        <ChevronRight size={16} className="sm:w-6 sm:h-6" />
                      </button>
                    </div>
                  )}

                </div>
              </div>

              {/* ── THUMBNAILS / CARRETE (debajo de la foto) ────────────────── */}
              {formData.images.length > 1 && (
                <div className="pt-3">
                  <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
                    {formData.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`relative w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === activePhotoIndex
                          ? 'border-red-500 shadow-md'
                          : 'border-transparent opacity-75 hover:opacity-100 hover:border-slate-200'
                          }`}
                      >
                        <img src={img} className="w-full h-full object-cover" alt={`Foto ${idx + 1}`} />
                        {idx === 0 && (
                          <div className="absolute top-1 left-1 bg-emerald-500 text-white text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-wider shadow-sm">
                            {t('field_cover_label')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* ── RIGHT: INFO + PRECIO + CARRETE ─────────────────────────────── */}
            <div className="xl:col-span-4 space-y-4 md:space-y-8">
              <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl shadow-slate-200/60 border border-slate-100 flex flex-col gap-6 md:gap-8">

                {/* ENCABEZADO DESKTOP (sólo visible en >= xl) */}
                <div className="hidden xl:block">
                  {/* AÑO • COLOR • VERSIÓN */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span className="text-red-600 font-black text-sm tracking-tight">{formData.year}</span>
                    <span className="text-slate-300 font-bold">•</span>
                    <span className="text-slate-400 font-bold text-xs uppercase">{formData.color}</span>
                    {formData.edition && formData.edition.toUpperCase() !== 'VALUE' && (
                      <>
                        <span className="text-slate-300 font-bold">•</span>
                        <span className="text-slate-400 font-bold text-xs uppercase">{formData.edition}</span>
                      </>
                    )}
                  </div>

                  {/* MARCA + MODELO */}
                  <div className="leading-none mb-10">
                    <h1 className="text-4xl sm:text-[2.2rem] font-black text-slate-900 uppercase tracking-tighter mb-1">
                      {formData.make}
                    </h1>
                    <h1 className="text-4xl sm:text-[2.2rem] font-black text-red-600 uppercase tracking-tighter">
                      {formData.model}
                    </h1>
                  </div>
                </div>

                {/* PRECIOS */}
                <div className="space-y-6 mb-10">
                  {/* PRECIO DE VENTA */}
                  {displayPrice > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                          <DollarSign size={10} className="text-slate-400" />
                          {t('sale_price').toUpperCase()}
                        </p>
                        <CurrencyToggle activeCurrency={currency} />
                      </div>
                      <p className="text-[2.6rem] font-black tracking-tighter flex items-center gap-2">
                        <span className="text-red-600">{priceLabel}</span>
                        <span className="text-slate-900">{displayPrice.toLocaleString('en-US')}</span>
                      </p>
                    </div>
                  )}

                  {(displayPrice > 0 && displayInitial > 0) && (
                    <div className="h-px bg-slate-100 w-full my-6"></div>
                  )}

                  {/* PAGO INICIAL */}
                  {displayInitial > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                          PAGO INICIAL SUGERIDO
                        </p>
                        <CurrencyToggle activeCurrency={downPaymentCurrency} />
                      </div>
                      <p className="text-2xl pt-1 font-black tracking-tight flex items-center gap-2">
                        <span className="text-slate-400">{initialLabel}</span>
                        <span className="text-slate-700">{displayInitial.toLocaleString('en-US')}</span>
                      </p>
                    </div>
                  )}
                </div>



                {/* (Botón removido y movido al header superior) */}

              </div> {/* END inner white card */}
            </div> {/* END right column */}
          </div> {/* END grid */}

          {/* ── FICHA TÉCNICA COMPLETA ─────────────────────────────────────────── */}
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl shadow-slate-200/60 border border-slate-100 mt-8 p-6 lg:p-8">
            {/* Header ficha */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                <Info size={14} className="text-red-600" />
              </div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">FICHA TÉCNICA COMPLETA</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">

              {/* ── COLUMNA 1: INFORMACIÓN BÁSICA ───────────────────────────── */}
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <span className="w-3.5 h-3.5 rounded flex items-center justify-center text-slate-400">
                    <Info size={11} />
                  </span>
                  INFORMACIÓN BÁSICA
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('year').toUpperCase()} value={formData.year} />
                  <FichaCelda label={t('color').toUpperCase()} value={formData.color} />
                </div>
                <FichaCelda label={t('field_edition').toUpperCase()} value={formData.edition} />
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_mileage')} value={formData.mileage ? `${Number(formData.mileage).toLocaleString('en-US')} ${mileageUnit}` : null} />
                  <FichaCelda label={t('field_plate')} value={formData.plate} />
                </div>
                <FichaCelda label={t('field_vin_chassis')} value={formData.vin || formData.chassis} />
              </div>

              {/* ── COLUMNA 2: MECÁNICA ──────────────────────────────────────── */}
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <span className="w-3.5 h-3.5 rounded flex items-center justify-center text-slate-400">
                    <Settings size={11} />
                  </span>
                  MECÁNICA
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_clean_carfax')} value={formData.carfax || formData.condition} />
                  <FichaCelda label={t('field_vehicle_type')} value={formData.type || formData.tipo_vehiculo} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('transmission').toUpperCase()} value={formData.transmision || formData.transmission} />
                  <FichaCelda label={t('field_traction')} value={formData.traccion || formData.traction} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('fuel').toUpperCase()} value={formData.combustible || formData.fuel} />
                  <FichaCelda label="MOTOR" value={formData.motor || formData.engine_type} />
                </div>
              </div>

              {/* ── COLUMNA 3: CONFORT Y EXTRAS ─────────────────────────────── */}
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <span className="w-3.5 h-3.5 rounded flex items-center justify-center text-slate-400">
                    <Shield size={11} />
                  </span>
                  CONFORT Y EXTRAS
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_interior')} value={formData.seat_material} />
                  <FichaCelda label={t('field_roof')} value={formData.roof_type} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_carplay')} value={formData.carplay} />
                  <FichaCelda label={t('field_camera')} value={formData.camera || formData.camara} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_sensors')} value={formData.sensors || formData.sensores} />
                  <FichaCelda label={t('field_electric_trunk')} value={formData.trunk || formData.baul_electrico} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FichaCelda label={t('field_electric_windows')} value={formData.electric_windows || formData.vidrios_electricos} />
                  <FichaCelda label="LLAVE" value={formData.key_type} />
                </div>
                <FichaCelda label={t('field_seat_rows')} value={formData.asientos || formData.seats} />
              </div>
            </div>
          </div>

          {/* ── VEHÍCULOS RELACIONADOS ──────────────────────────────────────── */}
          {readOnly && allVehicles.length > 1 && (() => {
            const related = allVehicles
              .filter(v => v.id !== vehicle?.id && v.status !== 'trash' && v.status !== 'sold')
              .slice(0, 4);
            if (related.length === 0) return null;
            return (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                    <Car size={14} className="text-red-600" />
                  </div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">VEHÍCULOS RELACIONADOS</h2>
                </div>
                <div className="w-12 h-1 bg-red-500 rounded-full mb-6"></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {related.map(r => {
                    const img = r.images?.[0] || r.imagen || '';
                    const name = r.nombre || `${r.year || ''} ${r.make || ''} ${r.model || ''} ${r.trim || ''}`.trim();

                    const hasUsd = r.price_usd > 0 || (r.price > 0 && r.currency === 'USD');
                    const hasDop = r.price_dop > 0 || (r.price > 0 && (!r.currency || r.currency === 'DOP'));

                    let priceText = '';
                    if (hasUsd) {
                      const val = r.price_usd > 0 ? r.price_usd : r.price;
                      priceText = `US$ ${Number(val).toLocaleString('en-US')}`;
                    } else if (hasDop) {
                      const val = r.price_dop > 0 ? r.price_dop : r.price;
                      priceText = `RD$ ${Number(val).toLocaleString('en-US')}`;
                    }

                    return (
                      <button
                        key={r.id}
                        onClick={() => onSelectVehicle?.(r)}
                        className="bg-white rounded-2xl shadow-lg overflow-hidden text-left hover:shadow-xl hover:-translate-y-1 transition-all group"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                          {img ? (
                            <img src={img} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={name} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Car size={40} />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h4 className="text-xs font-black text-slate-800 uppercase line-clamp-1 tracking-tight">{name}</h4>
                          {priceText && <p className="text-xs font-bold text-red-600 mt-1">{priceText}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── BOTÓN REGRESAR AL INVENTARIO (BOTTOM) ───────────────────────── */}
          {readOnly && (
            <div className="flex justify-center mt-12 mb-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] uppercase tracking-wider py-3 px-8 rounded-full transition-all active:scale-95 shadow-lg hover:shadow-xl"
              >
                <ArrowLeft size={16} strokeWidth={2.5} />
                Regresar al Inventario
              </button>
            </div>
          )}

        </div>

        {/* ── LIGHTBOX MODAL ─────────────────────────────────────────────────── */}
        {isLightboxOpen && (
          <div
            className="fixed inset-0 z-[100] bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300 overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onSwipeEnd}
          >
            {/* HEADER - ABSOLUTE TO NOT PUSH CONTENT DOWN INCORRECTLY */}
            <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-4 sm:p-8 z-50 pointer-events-none">
              <div className="text-slate-900 dark:text-white pointers-events-auto">
                <h4 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-red-600 line-clamp-1 drop-shadow-sm">{formData.make} {formData.model}</h4>
                <p className="text-slate-500 dark:text-white/50 text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-0.5 sm:mt-1">Foto {activePhotoIndex + 1} de {formData.images.length}</p>
              </div>
              <button
                onClick={() => setIsLightboxOpen(false)}
                className="p-3 sm:p-4 rounded-full bg-slate-100/80 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/20 hover:text-red-600 transition-all shadow-sm pointer-events-auto"
              >
                <X size={24} className="sm:w-[32px] sm:h-[32px]" />
              </button>
            </div>

            <div className="flex-1 w-full h-full flex items-center justify-center p-4 relative">
              <img
                src={formData.images[activePhotoIndex]}
                className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
                alt="Lightbox View"
              />

              {/* NAV CONTROLS FLOATING */}
              <div className="hidden sm:flex absolute inset-x-4 sm:inset-x-10 top-1/2 -translate-y-1/2 justify-between pointer-events-none">
                <button onClick={(e) => { e.stopPropagation(); prevPhoto(); }} className="p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 text-red-600 hover:scale-110 transition-all shadow-2xl border border-red-100 dark:border-white/10 flex items-center justify-center pointer-events-auto">
                  <ChevronLeft size={24} className="sm:w-8 sm:h-8" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); nextPhoto(); }} className="p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 text-red-600 hover:scale-110 transition-all shadow-2xl border border-red-100 dark:border-white/10 flex items-center justify-center pointer-events-auto">
                  <ChevronRight size={24} className="sm:w-8 sm:h-8" />
                </button>
              </div>
            </div>

            {/* THUMBNAILS CAROUSEL IN LIGHTBOX - MOBILE OPTIMIZED */}
            <div className="absolute bottom-4 sm:bottom-8 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
              <div className="flex gap-2 sm:gap-3 overflow-x-auto max-w-full pointer-events-auto no-scrollbar py-2 px-2">
                {formData.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setActivePhotoIndex(idx); }}
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden transition-all duration-300 shadow-sm ${activePhotoIndex === idx ? 'ring-2 ring-red-600 scale-100 opacity-100' : 'opacity-40 hover:opacity-100 scale-95 grayscale'}`}
                  >
                    <img src={img} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='animate-in fade-in duration-700 p-4 pb-40 md:p-8 max-w-[1600px] mx-auto'>
      {/* HEADER ACTIONS */}
      <div className="flex justify-between items-center mb-6 sm:mb-10">
        <button onClick={onBack} className='flex items-center text-slate-400 hover:text-red-600 font-bold transition-all group px-2 sm:px-4 py-2 hover:bg-red-50 rounded-xl' disabled={loading}>
          <ArrowLeft size={16} className='mr-1 sm:mr-2 group-hover:-translate-x-1 transition-transform' />
          <span className="text-[10px] sm:text-sm uppercase tracking-wider">Volver</span>
        </button>

        <button
          onClick={onBack}
          disabled={loading}
          className="p-2 sm:p-3 bg-white border border-slate-200 rounded-xl sm:rounded-2xl text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shadow-lg"
          title="Cerrar"
        >
          <X size={20} className="sm:w-6 sm:h-6" />
        </button>
      </div>

      {/* MOBILE TITLE (Visible only on mobile) */}
      <div className="block xl:hidden mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-600 font-extrabold text-lg tracking-tighter">{formData.year}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <span className="text-slate-400 font-bold text-xs uppercase">{formData.color}</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none">
          {formData.make} <span className="text-red-600">{formData.model}</span>
        </h2>
        {(formData.createdAt || formData.updatedAt) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            {formData.createdAt && !isNaN(new Date(formData.createdAt).getTime()) && (
              <span>Agregado: {new Date(formData.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            )}
            {formData.updatedAt && !isNaN(new Date(formData.updatedAt).getTime()) && (
              <span>Actualizado: {new Date(formData.updatedAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-10">

        {/* LEFT PANEL: GALLERY & VISUALS */}
        <div className="xl:col-span-8 space-y-4 md:space-y-8">
          <div className="relative bg-white dark:bg-[#1A1D24] rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl transition-all duration-700 border-4 md:border-8 border-white dark:border-[#1A1D24] h-[400px] md:h-[650px]">
            <div className="w-full h-full relative group cursor-zoom-in flex items-center justify-center" onClick={() => formData.images.length > 0 && setIsLightboxOpen(true)}>
              {formData.images.length > 0 && !formData.images[0]?.includes('unsplash') ? (
                <img
                  src={formData.images[activePhotoIndex]}
                  className='max-w-full max-h-full object-contain'
                  alt="Vista principal"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-50">
                  {userProfile?.dealer_logo ? (
                    <img src={userProfile.dealer_logo} alt="Dealer Logo" className="w-full h-full object-contain opacity-60 drop-shadow-sm" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-300">
                      <Camera size={64} className="mb-4 opacity-50" />
                      <p className="font-bold text-lg opacity-50">Sin Imágenes</p>
                    </div>
                  )}
                </div>
              )}
              {formData.images.length > 0 && (
                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white">
                    <Maximize2 size={32} />
                  </div>
                </div>
              )}

              {/* NAV CONTROLS */}
              {formData.images.length > 1 && (
                <div className="absolute inset-x-2 sm:inset-x-8 top-[65%] sm:top-[75%] -translate-y-1/2 flex justify-between pointer-events-none">
                  <button type="button" onClick={(e) => { e.stopPropagation(); prevPhoto(); }} className="p-2 sm:p-3 rounded-full bg-white hover:bg-red-600 text-red-600 hover:text-white backdrop-blur-sm transition-all pointer-events-auto shadow-xl border border-red-500/10"><ChevronLeft size={16} className="sm:w-6 sm:h-6" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); nextPhoto(); }} className="p-2 sm:p-3 rounded-full bg-white hover:bg-red-600 text-red-600 hover:text-white backdrop-blur-sm transition-all pointer-events-auto shadow-xl border border-red-500/10"><ChevronRight size={16} className="sm:w-6 sm:h-6" /></button>
                </div>
              )}


            </div>
          </div>

          {/* THUMBNAILS GRID - Below main photo on all screens */}
          <div className="pt-3 border-t border-slate-100 dark:border-white/6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Files size={14} className="text-red-500" />
                Carrete ({formData.images.length})
              </h3>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
              {formData.images.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setActivePhotoIndex(idx)}
                  className={`aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border-2 relative group ${activePhotoIndex === idx ? 'border-red-600 scale-95 shadow-md' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`}
                >
                  <img src={img} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />

                  {/* COMPACT OVERLAY CONTROLS */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-0.5">
                    <div className="flex justify-between">
                      <button type="button" onClick={(e) => movePhotoLeft(e, idx)} className="p-0.5 bg-white/20 hover:bg-white text-white hover:text-red-600 rounded backdrop-blur-sm"><ChevronLeft size={10} /></button>
                      <button type="button" onClick={(e) => movePhotoRight(e, idx)} className="p-0.5 bg-white/20 hover:bg-white text-white hover:text-red-600 rounded backdrop-blur-sm"><ChevronRight size={10} /></button>
                    </div>
                    <button type="button" onClick={(e) => removePhoto(e, idx)} className="absolute top-0.5 right-0.5 p-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full backdrop-blur-sm"><Trash2 size={10} /></button>

                    {idx !== 0 && (
                      <button type="button" onClick={(e) => setAsCover(e, idx)} className="w-full py-0.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[6px] font-black uppercase rounded shadow-sm">{t('field_cover')}</button>
                    )}
                  </div>
                  {idx === 0 && <div className="absolute top-0.5 left-0.5 px-1 py-0.5 bg-emerald-500 text-white text-[6px] font-black rounded shadow-sm leading-none">{t('field_cover_label')}</div>}
                </div>
              ))}
            </div>
          </div>


        </div>

        {/* RIGHT PANEL: INFO & CONTROLS */}
        <div className="xl:col-span-4 space-y-4 md:space-y-8">
          <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-2xl flex flex-col gap-6 md:gap-8" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>

            {/* 1. TITLE / HEADER SECTION (Desktop Only) */}
            <div className="hidden xl:block space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-extrabold text-xl tracking-tighter">{formData.year}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                <span className="text-slate-400 font-bold text-sm uppercase">{formData.color}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight leading-none">
                {formData.make} <br />
                <span className="text-red-700">{formData.model}</span>
              </h2>
              {(formData.createdAt || formData.updatedAt) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                  {formData.createdAt && !isNaN(new Date(formData.createdAt).getTime()) && (
                    <span>Agregado: {new Date(formData.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  )}
                  {formData.updatedAt && !isNaN(new Date(formData.updatedAt).getTime()) && (
                    <span>Actualizado: {new Date(formData.updatedAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  )}
                </div>
              )}
            </div>


            {/* 2. PRICING SECTION */}
            {!isSold && (
              <div className="space-y-6">
                {/* MAIN PRICE DISPLAY / EDIT */}
                <div className="relative group">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 group-focus-within:text-red-600 transition-colors">
                      <DollarSign size={14} className="text-red-500" /> {t('sale_price')}
                    </label>
                    <div className="flex p-1 rounded-xl shadow-inner scale-90 origin-right" style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                      {selectedCurrencies.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${currency === c ? 'bg-red-600 text-white shadow-md transform scale-105' : 'hover:opacity-80'}`}
                          style={currency !== c ? { color: 'var(--text-tertiary)' } : {}}
                        >{getSymbol(c)}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-3 group-focus-within:translate-x-1 transition-transform">
                    <span className="text-4xl md:text-5xl font-black text-red-600 tracking-tighter shrink-0">{getSymbol(currency)}</span>
                    <input
                      type="text"
                      value={formatWithCommas(formData.price_unified)}
                      onChange={handlePriceChange}
                      className="w-full bg-transparent text-4xl md:text-5xl font-black outline-none border-b-4 border-transparent focus:border-red-600/20 pb-1 transition-all"
                      style={{ color: 'var(--text-primary)' }}
                      placeholder="0"
                    />
                  </div>

                  {/* INITIAL PAYMENT - WITH ITS OWN CURRENCY TOGGLE */}
                  <div className="mt-8 pt-6 border-t border-slate-100/80">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-red-600 transition-colors">Pago Inicial Sugerido</label>
                      <div className="flex p-1 rounded-xl shadow-inner scale-90 origin-right" style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>
                        {selectedCurrencies.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setDownPaymentCurrency(c)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${downPaymentCurrency === c ? 'bg-red-600 text-white shadow-md transform scale-105' : 'hover:opacity-80'}`}
                            style={downPaymentCurrency !== c ? { color: 'var(--text-tertiary)' } : {}}
                          >{getSymbol(c)}</button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 transition-all">
                      <span className="text-xl font-bold" style={{ color: 'var(--text-tertiary)' }}>{getSymbol(downPaymentCurrency)}</span>
                      <input
                        type="text"
                        value={formatWithCommas(formData.initial_unified) || ''}
                        onChange={handleInitialChange}
                        className="bg-transparent text-2xl font-black outline-none w-full border-b-2 border-transparent transition-all"
                        style={{ color: 'var(--text-secondary)', borderColor: 'transparent' }}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QUOTED CONTEXT SECTION - Finalize Sale */}
            {isQuoted && !isSold && !readOnly && (
              <div className="relative overflow-hidden p-6 sm:p-8 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl sm:rounded-[2rem] text-white shadow-xl shadow-emerald-200 transition-all border border-emerald-400/20 group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                  <DollarSign size={80} />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle size={18} className="sm:w-5 sm:h-5 text-emerald-200" /> Vehículo en Cotización
                    </h3>
                    <div className="px-3 py-1 bg-white/20 rounded-full backdrop-blur-sm text-[10px] font-black uppercase tracking-widest line-clamp-1">
                      Paso Final: Generar Contrato
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-4 bg-emerald-900/30 rounded-2xl backdrop-blur-md border border-white/10 ring-1 ring-white/5">
                      <p className="text-[10px] font-black text-emerald-200 uppercase mb-3 tracking-widest flex items-center gap-2">
                        <Info size={12} /> Cliente Interesado
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] font-bold text-emerald-300 uppercase">Nombre</p>
                          <p className="text-sm font-black truncate">
                            {quote?.client || (quote?.name ? `${quote.name} ${quote.lastname || ''}` : 'Cliente en Proceso')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-emerald-300 uppercase">Monto Cotizado</p>
                          <p className="text-sm font-black">
                            {quote?.price || quote?.finalPrice ? `${quote.priceCurrency || 'RD$'} ${Number(quote.price || quote.finalPrice).toLocaleString()}` : 'Ver detalles'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100/50">
                      <button
                        onClick={handleSellQuotedAction}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
                      >
                        <DollarSign size={16} />
                        Vender Ahora
                      </button>
                    </div>
                    <p className="text-[10px] font-bold text-emerald-100/70 text-center tracking-wide italic">
                      Al hacer clic, se abrirá el generador de contratos con los datos del cliente precargados.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SOLD CONTEXT SECTION - Showing if applicable */}
            {isSold && (
              <div className="relative overflow-hidden p-6 sm:p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl sm:rounded-[2rem] text-white shadow-xl transition-all border border-slate-700">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle size={18} className="sm:w-5 sm:h-5 text-emerald-400" /> VENTA Completada
                    </h3>
                    <div className="p-1.5 sm:p-2 bg-white/10 rounded-lg sm:rounded-xl backdrop-blur-sm border border-white/5">
                      <Lock size={14} className="sm:w-4 sm:h-4 text-slate-400" />
                    </div>
                  </div>

                  <div className="space-y-4 sm:y-6">
                    <div className="p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/5">
                      <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">PROPIETARIO ACTUAL</p>
                      <p className="text-lg sm:text-xl font-black mb-2">{contract?.client || 'N/A'}</p>
                      <div className="space-y-1.5 opacity-90 border-t border-white/5 pt-2">
                        {contract?.cedula && (
                          <div className="flex items-center gap-2 text-[10px] font-bold">
                            <IdCard size={12} className="text-slate-500" /> {contract.cedula}
                          </div>
                        )}
                        {contract?.phone && (
                          <div className="flex items-center gap-2 text-[10px] font-bold">
                            <Phone size={12} className="text-slate-500" /> {contract.phone}
                          </div>
                        )}
                        {contract?.email && (
                          <div className="flex items-center gap-2 text-[10px] font-bold truncate">
                            <Mail size={12} className="text-slate-500" /> {contract.email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/5 text-center">
                        <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">{t('field_list_price')}</p>
                        <p className="text-xs sm:text-sm font-black whitespace-nowrap">
                          {formData.price_dop > 0 ? `RD$ ${Number(formData.price_dop).toLocaleString()}` : `US$ ${Number(formData.price).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/5 text-center">
                        <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase mb-1 tracking-widest">{t('field_sale_price')}</p>
                        <p className="text-xs sm:text-sm font-black text-emerald-400 whitespace-nowrap">
                          {contract?.price ? (formData.price_dop > 0 ? `RD$ ${Number(contract.price).toLocaleString()}` : `US$ ${Number(contract.price).toLocaleString()}`) : (formData.price_dop > 0 ? `RD$ ${Number(formData.price_dop).toLocaleString()}` : `US$ ${Number(formData.price).toLocaleString()}`)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SAVE BUTTON AT BOTTOM */}
          </div>
        </div>

        {/* VIN DECODER */}
        <div className="xl:col-span-12 -mt-2">
          <VinDecoderSection
            existingData={formData}
            onApply={(fields) => {
              setFormData(prev => ({ ...prev, ...fields }));
            }}
          />
        </div>

        {/* FULL WIDTH BOTTOM: FICHA TÉCNICA */}
        <div className="xl:col-span-12 -mt-2">
          <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-glass)' }}>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-8" style={{ color: 'var(--text-primary)' }}>
              <Info size={18} className="text-red-600" /> Ficha Técnica Completa
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-12 gap-y-8">

              {/* COL 1: INFO BÁSICA */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-glass)' }}>
                  <IdCard size={14} /> Información Básica
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label={t('year')} name="year" type="number" onWheel={(e) => e.target.blur()} value={formData.year} onChange={handleChange} />
                  <FormInput label={t('color')} name="color" value={formData.color} onChange={handleChange} />
                </div>
                <FormInput label={t('field_edition')} name="edition" value={formData.edition} onChange={handleChange} />

                {/* MILAJE MOVED HERE */}
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-600" style={{ color: 'var(--text-secondary)' }}>{t('field_mileage')}</label>
                  <div className="flex rounded-2xl overflow-hidden focus-within:border-red-500/20 focus-within:ring-4 focus-within:ring-red-500/5 transition-all outline-none" style={{ backgroundColor: 'var(--input-bg)', borderWidth: '2px', borderColor: 'var(--input-border)' }}>
                    <input
                      name="mileage"
                      type="text"
                      autoComplete="off"
                      value={String(formData.mileage ?? '')}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        setFormData(prev => ({ ...prev, mileage: v }));
                      }}
                      className="w-full min-w-0 px-4 py-3 bg-transparent font-bold text-sm outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <div className="flex items-center shrink-0" style={{ borderLeft: '1px solid var(--border-glass)' }}>
                      {['KM', 'MI'].map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setMileageUnit(u)}
                          className={`px-3 py-3 text-[10px] font-black transition-all ${mileageUnit === u ? 'text-red-600' : ''}`}
                          style={mileageUnit !== u ? { color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-tertiary)' } : { backgroundColor: 'var(--bg-tertiary)' }}
                        >{u}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FormInput label={t('field_vin_chassis')} name="vin" value={formData.vin || formData.chassis} onChange={handleChange} className="font-mono text-xs tracking-wider" />
                  </div>
                  <div className="col-span-1 text-[10px]">
                    <FormInput label={t('field_plate')} name="plate" value={formData.plate || formData.placa} onChange={handleChange} className="font-mono text-xs tracking-wider" />
                  </div>
                </div>

                {/* LINK DE FOTOS (Instagram, Drive, etc.) */}
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ml-1 transition-colors group-focus-within:text-red-600" style={{ color: 'var(--text-secondary)' }}>
                    {t('field_photo_link')}
                  </label>
                  <div className="flex items-center rounded-2xl overflow-hidden focus-within:border-red-500/20 focus-within:ring-4 focus-within:ring-red-500/5 transition-all" style={{ backgroundColor: 'var(--input-bg)', borderWidth: '2px', borderColor: 'var(--input-border)' }}>
                    <div className="flex items-center justify-center w-11 self-stretch shrink-0 group-focus-within:text-red-500 transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                      <Link size={18} />
                    </div>
                    <input
                      type="url"
                      name="link_externo"
                      value={formData.link_externo || ''}
                      onChange={handleChange}
                      placeholder="https://instagram.com/p/…"
                      className="flex-1 min-w-0 py-3 pr-2 bg-transparent font-bold text-sm outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      disabled={!formData.link_externo}
                      title={t('copy_link')}
                      className={`flex items-center gap-1.5 m-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${linkCopied ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      {linkCopied ? <><Check size={13} /> {t('copied')}</> : <><Copy size={13} /> {t('copy_link')}</>}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] -mt-2 ml-1" style={{ color: 'var(--text-tertiary)' }}>
                  {t('photo_link_hint')}
                </p>
              </div>

              {/* COL 2: MECÁNICA GENERAL */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-glass)' }}>
                  <Settings size={14} /> Mecánica
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label={t('field_clean_carfax')}
                    name="clean_carfax"
                    value={formData.clean_carfax}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Sí', label: t('yes') },
                      { value: 'No', label: t('no') }
                    ]}
                  />
                  <Select
                    label={t('field_vehicle_type')}
                    name="type"
                    value={formData.type || formData.tipo_vehiculo}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Automóvil', label: t('option_sedan') },
                      { value: 'Jeepeta', label: t('option_jeepeta') },
                      { value: 'Camioneta', label: t('option_truck') },
                      { value: 'Moto', label: t('option_motorcycle') },
                      { value: 'Camión', label: t('option_cargo') },
                      { value: 'Bus', label: t('option_bus') },
                      { value: 'Vehículos Pesados', label: t('option_heavy') }
                    ]}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label={t('transmission').toUpperCase()}
                    name="transmission"
                    value={formData.transmission}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Automática', label: t('option_automatic') },
                      { value: 'Manual', label: t('option_manual') },
                      { value: 'CVT', label: t('option_cvt') },
                      { value: 'Tiptronic', label: t('option_tiptronic') },
                      { value: 'DSG', label: t('option_dsg') }
                    ]}
                  />
                  <Select label={t('field_traction')} name="traction" value={formData.traction} onChange={handleChange} options={['-', 'FWD', 'RWD', 'AWD', '4x4']} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label={t('fuel').toUpperCase()}
                    name="fuel"
                    value={formData.fuel}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Gasolina', label: t('option_gasoline') },
                      { value: 'Diesel', label: t('option_diesel') },
                      { value: 'Híbrido', label: t('option_hybrid') },
                      { value: 'Eléctrico', label: t('option_electric') },
                      { value: 'GLP', label: t('option_lpg') }
                    ]}
                  />
                  <Select label="Motor" name="engine_type" value={formData.engine_type} onChange={handleChange} options={['-', 'Normal', 'Turbo', 'Supercharged', 'Híbrido', 'Eléctrico']} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormInput label="Cilindros" name="engine_cyl" value={formData.engine_cyl || ''} onChange={handleChange} placeholder="4 Cil" />
                  <FormInput label="CC" name="engine_cc" value={formData.engine_cc || ''} onChange={handleChange} placeholder="2.0L" />
                </div>
              </div>


              {/* COL 4: CONFORT & EXTRAS */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest border-b pb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-glass)' }}>
                  <CheckCircle size={14} /> Confort y Extras
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t('field_interior')}
                    name="seat_material"
                    value={formData.seat_material}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Piel', label: t('option_leather') },
                      { value: 'Tela', label: t('option_fabric') },
                      { value: 'Alcántara', label: t('option_suede') }
                    ]}
                  />
                  <Select
                    label={t('field_roof')}
                    name="roof_type"
                    value={formData.roof_type}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Normal', label: t('option_normal') },
                      { value: 'Sunroof', label: t('option_sunroof') },
                      { value: 'Panorámico', label: t('option_panoramic') }
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t('field_carplay')}
                    name="carplay"
                    value={formData.carplay}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Sí', label: t('yes') },
                      { value: 'No', label: t('no') }
                    ]}
                  />
                  <Select
                    label={t('field_camera')}
                    name="camera"
                    value={formData.camera}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'No', label: t('no') },
                      { value: 'Reversa', label: t('option_reverse') },
                      { value: '360°', label: t('option_360') }
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t('field_sensors')}
                    name="sensors"
                    value={formData.sensors}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Sí', label: t('yes') },
                      { value: 'No', label: t('no') }
                    ]}
                  />
                  <Select
                    label={t('field_electric_trunk')}
                    name="trunk"
                    value={formData.trunk}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'No', label: t('no') },
                      { value: 'Sí', label: t('yes') }
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t('field_electric_windows')}
                    name="electric_windows"
                    value={formData.electric_windows}
                    onChange={handleChange}
                    options={[
                      '-',
                      { value: 'Sí', label: t('yes') },
                      { value: 'No', label: t('no') }
                    ]}
                  />
                  <Select label="Llave" name="key_type" value={formData.key_type} onChange={handleChange} options={['-', 'Llave Normal', 'Push Button']} />
                </div>
                <Select label={t('field_seat_rows')} name="seats" value={formData.seats} onChange={handleChange} options={['-', '2', '3', '4', '5']} />
              </div>

            </div>
          </div>
        </div>

        {/* FULL WIDTH BOTTOM: SAVE BUTTON */}
        <div className="xl:col-span-12">
          {!isSold && !readOnly && (
            <button
              type="submit"
              disabled={loading}
              className="w-full py-6 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-600 transition-all shadow-xl shadow-slate-900/20 hover:shadow-red-600/20 active:scale-95 disabled:opacity-50"
            >
              {loading ? <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : <><Save size={24} /> Guardar Cambios</>}
            </button>
          )}
        </div>

      </form>

      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-white/95 dark:bg-[#0D0F14]/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onSwipeEnd}
        >
          {/* HEADER - ABSOLUTE TO NOT PUSH CONTENT DOWN INCORRECTLY */}
          <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-4 sm:p-8 z-50 pointer-events-none">
            <div className="text-slate-900 dark:text-white pointers-events-auto">
              <h4 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-red-600 line-clamp-1 drop-shadow-sm">{formData.make} {formData.model}</h4>
              <p className="text-slate-500 dark:text-white/50 text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-0.5 sm:mt-1">Foto {activePhotoIndex + 1} de {formData.images.length}</p>
            </div>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="p-3 sm:p-4 rounded-full bg-slate-100/80 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/20 hover:text-red-600 transition-all shadow-sm pointer-events-auto"
            >
              <X size={24} className="sm:w-[32px] sm:h-[32px]" />
            </button>
          </div>

          <div className="flex-1 w-full h-full flex items-center justify-center p-4 relative">
            <img
              src={formData.images[activePhotoIndex]}
              className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
              alt="Lightbox View"
            />

            {/* NAV CONTROLS FLOATING */}
            <div className="hidden sm:flex absolute inset-x-4 sm:inset-x-10 top-1/2 -translate-y-1/2 justify-between pointer-events-none">
              <button onClick={(e) => { e.stopPropagation(); prevPhoto(); }} className="p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 text-red-600 hover:scale-110 transition-all shadow-2xl border border-red-100 dark:border-white/10 flex items-center justify-center pointer-events-auto">
                <ChevronLeft size={24} className="sm:w-8 sm:h-8" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); nextPhoto(); }} className="p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 text-red-600 hover:scale-110 transition-all shadow-2xl border border-red-100 dark:border-white/10 flex items-center justify-center pointer-events-auto">
                <ChevronRight size={24} className="sm:w-8 sm:h-8" />
              </button>
            </div>
          </div>

          {/* THUMBNAILS CAROUSEL IN LIGHTBOX - MOBILE OPTIMIZED */}
          <div className="absolute bottom-4 sm:bottom-8 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
            <div className="flex gap-2 sm:gap-3 overflow-x-auto max-w-full pointer-events-auto no-scrollbar py-2 px-2">
              {formData.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.stopPropagation(); setActivePhotoIndex(idx); }}
                  className={`relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden transition-all duration-300 shadow-sm ${activePhotoIndex === idx ? 'ring-2 ring-red-600 scale-100 opacity-100' : 'opacity-40 hover:opacity-100 scale-95 grayscale'}`}
                >
                  <img src={img} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
