// Exportación del inventario (CSV y PDF).
//
// Se exportan únicamente las unidades que el dealer todavía puede ofrecer
// (disponibles + cotizadas) y NUNCA se incluye el estado en la salida: para
// quien recibe el listado todas son "en existencia".

const CURRENCY_SYMBOLS = { DOP: 'RD$', USD: 'US$', EUR: '€', COP: 'COP$' };

const EXPORTABLE_STATUSES = new Set(['available', 'quoted']);

// Columnas del export, en el mismo orden para CSV y PDF.
export const EXPORT_COLUMNS = [
  { key: 'marca',              label: 'Marca' },
  { key: 'modelo',             label: 'Modelo' },
  { key: 'anio',               label: 'Año' },
  { key: 'edicion',            label: 'Edición' },
  { key: 'tipo',               label: 'Tipo' },
  { key: 'color',              label: 'Color' },
  { key: 'precio',             label: 'Precio' },
  { key: 'inicial',            label: 'Inicial' },
  { key: 'millaje',            label: 'Millaje' },
  { key: 'transmision',        label: 'Transmisión' },
  { key: 'combustible',        label: 'Combustible' },
  { key: 'motor',              label: 'Motor' },
  { key: 'traccion',           label: 'Tracción' },
  { key: 'techo',              label: 'Techo' },
  { key: 'asientos_material',  label: 'Material asientos' },
  { key: 'asientos_cantidad',  label: 'Cant. asientos' },
  { key: 'chasis',             label: 'Chasis / VIN' },
  { key: 'placa',              label: 'Placa' },
  { key: 'condicion',          label: 'Condición' },
  { key: 'carfax',             label: 'Carfax' },
  { key: 'llave',              label: 'Llave' },
  { key: 'camara',             label: 'Cámara' },
  { key: 'carplay',            label: 'CarPlay' },
  { key: 'sensores',           label: 'Sensores' },
  { key: 'baul_electrico',     label: 'Baúl eléctrico' },
  { key: 'vidrios_electricos', label: 'Vidrios eléctricos' },
];

const money = (amount, currency) => {
  const val = Number(amount);
  if (!val || isNaN(val)) return '';
  return `${CURRENCY_SYMBOLS[currency] || CURRENCY_SYMBOLS.USD} ${Math.round(val).toLocaleString('en-US')}`;
};

const yesNo = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  const s = String(v).trim().toLowerCase();
  if (['true', 'si', 'sí', '1', 'yes'].includes(s)) return 'Sí';
  if (['false', 'no', '0'].includes(s)) return 'No';
  return String(v);
};

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Vehículo (ya normalizado por la app) -> fila plana lista para exportar.
const toRow = (v) => {
  const priceCurrency = v.moneda_precio || v.currency || 'USD';
  const initialCurrency = v.moneda_inicial || v.downPaymentCurrency || priceCurrency;
  const priceAmount = v.precio > 0 ? v.precio : (priceCurrency === 'DOP' ? (v.price_dop || v.price) : v.price);
  const initialAmount = v.inicial > 0 ? v.inicial : (initialCurrency === 'DOP' ? (v.initial_payment_dop || v.initial_payment) : v.initial_payment);
  const mileage = Number(v.mileage || v.millas || 0);

  return {
    marca: text(v.make || v.marca).toUpperCase(),
    modelo: text(v.model || v.modelo).toUpperCase(),
    anio: text(v.year || v.anio),
    edicion: text(v.edition || v.edicion),
    tipo: text(v.type || v.tipo_vehiculo),
    color: text(v.color || v.exteriorColor),
    precio: money(priceAmount, priceCurrency),
    inicial: money(initialAmount, initialCurrency),
    millaje: mileage ? `${Math.round(mileage).toLocaleString('en-US')} ${String(v.mileage_unit || '').toUpperCase() === 'KM' ? 'Km' : 'Millas'}` : '',
    transmision: text(v.transmission || v.transmision),
    combustible: text(v.fuelType || v.combustible),
    motor: text(v.engine || v.motor),
    traccion: text(v.drivetrain || v.traccion),
    techo: text(v.roof || v.techo),
    asientos_material: text(v.interiorMaterial || v.material_asientos),
    asientos_cantidad: v.seats ? String(v.seats) : '',
    chasis: text(v.vin || v.chasis_vin || v.chassis).toUpperCase(),
    placa: text(v.plate || v.placa).toUpperCase(),
    condicion: text(v.condition || v.condicion),
    carfax: text(v.carfaxCondition || v.condicion_carfax),
    llave: text(v.keyType || v.llave),
    camara: text(v.camera || v.camara),
    carplay: yesNo(v.appleCarplay ?? v.carplay),
    sensores: yesNo(v.sensors ?? v.sensores),
    baul_electrico: yesNo(v.powerTrunk ?? v.baul_electrico),
    vidrios_electricos: yesNo(v.powerWindows ?? v.vidrios_electricos),
  };
};

// Vehículos exportables, ordenados por marca y luego modelo/año.
export const getExportableVehicles = (inventory = []) =>
  inventory
    .filter(v => v && EXPORTABLE_STATUSES.has(v.status))
    .map(toRow)
    .sort((a, b) =>
      a.marca.localeCompare(b.marca, 'es') ||
      a.modelo.localeCompare(b.modelo, 'es') ||
      String(a.anio).localeCompare(String(b.anio))
    );

const slug = (s) => text(s).replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '_') || 'Dealer';

const today = () => new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

// ── CSV ──────────────────────────────────────────────────────────────
export const exportInventoryCSV = (inventory, dealerName) => {
  const rows = getExportableVehicles(inventory);
  if (rows.length === 0) return 0;

  const escape = (val) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [
    EXPORT_COLUMNS.map(c => escape(c.label)).join(','),
    ...rows.map(r => EXPORT_COLUMNS.map(c => escape(r[c.key])).join(',')),
  ].join('\n');

  // BOM para que Excel respete los acentos
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Inventario_${slug(dealerName)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
};

// ── PDF ──────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Campos que se muestran como "chips" de detalle debajo de cada unidad.
const DETAIL_CHIPS = [
  ['anio', 'Año'], ['color', 'Color'], ['millaje', 'Millaje'], ['tipo', 'Tipo'],
  ['transmision', 'Transmisión'], ['combustible', 'Combustible'], ['motor', 'Motor'],
  ['traccion', 'Tracción'], ['techo', 'Techo'], ['asientos_material', 'Asientos'],
  ['asientos_cantidad', 'Cant. asientos'], ['chasis', 'Chasis'], ['placa', 'Placa'],
  ['condicion', 'Condición'], ['carfax', 'Carfax'], ['llave', 'Llave'],
  ['camara', 'Cámara'], ['carplay', 'CarPlay'], ['sensores', 'Sensores'],
  ['baul_electrico', 'Baúl eléct.'], ['vidrios_electricos', 'Vidrios eléct.'],
];

export const buildInventoryPdfHtml = (rows, dealer = {}) => {
  const byBrand = rows.reduce((acc, r) => {
    (acc[r.marca] ||= []).push(r);
    return acc;
  }, {});

  const brands = Object.keys(byBrand).sort((a, b) => a.localeCompare(b, 'es'));

  const dealerLines = [dealer.address, dealer.phone, dealer.website]
    .map(text).filter(Boolean);

  const brandSections = brands.map(brand => {
    const units = byBrand[brand];
    const cards = units.map(u => {
      const chips = DETAIL_CHIPS
        .filter(([key]) => text(u[key]))
        .map(([key, label]) => `
          <td style="width:25%;padding:3px 10px 3px 0;vertical-align:top;">
            <div style="font-size:7px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;">${esc(label)}</div>
            <div style="font-size:9px;font-weight:600;color:#1e293b;word-break:break-word;">${esc(u[key])}</div>
          </td>`);

      // 4 chips por fila para que quepan en el ancho de la página; la última
      // fila se rellena con celdas vacías para no romper el layout fijo.
      const chipRows = [];
      for (let i = 0; i < chips.length; i += 4) {
        const slice = chips.slice(i, i + 4);
        const padding = '<td style="width:25%;"></td>'.repeat(4 - slice.length);
        chipRows.push(`<tr>${slice.join('')}${padding}</tr>`);
      }

      return `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
            <tr>
              <td style="font-size:13px;font-weight:800;color:#0f172a;">
                ${esc(u.modelo)}${u.edicion ? ` <span style="font-weight:600;color:#64748b;">${esc(u.edicion)}</span>` : ''}
              </td>
              <td style="text-align:right;white-space:nowrap;">
                <span style="font-size:13px;font-weight:800;color:#dc2626;">${esc(u.precio || '—')}</span>
                ${u.inicial ? `<div style="font-size:8px;font-weight:600;color:#64748b;">Inicial: ${esc(u.inicial)}</div>` : ''}
              </td>
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${chipRows.join('')}</table>
        </div>`;
    }).join('');

    return `
      <div style="page-break-inside:auto;margin-bottom:14px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;page-break-after:avoid;">
          <tr>
            <td style="font-size:15px;font-weight:800;color:#0f172a;letter-spacing:.04em;border-bottom:2px solid #dc2626;padding-bottom:4px;">
              ${esc(brand)}
            </td>
            <td style="text-align:right;font-size:9px;font-weight:700;color:#94a3b8;border-bottom:2px solid #dc2626;padding-bottom:4px;">
              ${units.length} ${units.length === 1 ? 'unidad' : 'unidades'}
            </td>
          </tr>
        </table>
        ${cards}
      </div>`;
  }).join('');

  return `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#0f172a;padding:4px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <tr>
          ${dealer.logo ? `<td style="width:70px;vertical-align:middle;"><img src="${esc(dealer.logo)}" style="width:60px;height:60px;object-fit:contain;" /></td>` : ''}
          <td style="vertical-align:middle;">
            <div style="font-size:26px;font-weight:900;letter-spacing:-.02em;line-height:1.1;">${esc(dealer.name || 'Inventario')}</div>
            <div style="font-size:10px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.18em;margin-top:2px;">Inventario disponible</div>
          </td>
          <td style="text-align:right;vertical-align:middle;font-size:8.5px;color:#64748b;line-height:1.6;">
            ${dealerLines.map(l => `<div>${esc(l)}</div>`).join('')}
            <div style="margin-top:3px;font-weight:700;color:#94a3b8;">${esc(today())}</div>
          </td>
        </tr>
      </table>
      <div style="height:3px;background:#dc2626;border-radius:2px;margin-bottom:14px;"></div>
      <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:12px;">
        ${rows.length} ${rows.length === 1 ? 'vehículo' : 'vehículos'} · ${brands.length} ${brands.length === 1 ? 'marca' : 'marcas'}
      </div>
      ${brandSections}
    </div>`;
};

export const exportInventoryPDF = async (inventory, dealer = {}) => {
  const rows = getExportableVehicles(inventory);
  if (rows.length === 0) return 0;

  const element = document.createElement('div');
  element.innerHTML = buildInventoryPdfHtml(rows, dealer);
  element.style.width = '7.5in';
  document.body.appendChild(element);

  try {
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf().set({
      margin: [0.4, 0.4, 0.5, 0.4],
      filename: `Inventario_${slug(dealer.name)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(element).save();
  } finally {
    document.body.removeChild(element);
  }
  return rows.length;
};
