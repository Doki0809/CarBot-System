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

// Fecha de descarga: larga para mostrar, corta (YYYY-MM-DD) para el nombre del archivo.
const today = () => new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

const todayStamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── CSV ──────────────────────────────────────────────────────────────
export const exportInventoryCSV = (inventory, dealerName) => {
  const rows = getExportableVehicles(inventory);
  if (rows.length === 0) return 0;

  const escape = (val) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // Se agrega la fecha de descarga como última columna, repetida en cada fila,
  // para no romper el parseo de la cabecera en Excel/Sheets.
  const stamp = today();
  const csv = [
    [...EXPORT_COLUMNS.map(c => escape(c.label)), escape('Fecha de descarga')].join(','),
    ...rows.map(r => [...EXPORT_COLUMNS.map(c => escape(r[c.key])), escape(stamp)].join(',')),
  ].join('\n');

  // BOM para que Excel respete los acentos
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Inventario_${slug(dealerName)}_${todayStamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
};

// ── PDF ──────────────────────────────────────────────────────────────
// Se dibuja con jsPDF en texto vectorial, NO con html2canvas: ese
// rasterizaba la página a imagen, y por eso el PDF se veía como una foto
// (borroso al acercar, imposible de seleccionar/buscar) y cortaba el
// contenido a la mitad al paginar.

// Medidas en puntos (72 pt = 1 pulgada). Carta = 612 x 792.
const PAGE = { w: 612, h: 792, mL: 40, mR: 40, mT: 40, mB: 48 };
const CONTENT_W = PAGE.w - PAGE.mL - PAGE.mR;

const COLOR = {
  red:    [220, 38, 38],
  dark:   [15, 23, 42],
  value:  [30, 41, 59],
  label:  [148, 163, 184],
  border: [226, 232, 240],
  muted:  [100, 116, 139],
};

// Campos que se listan dentro de cada unidad.
const DETAIL_FIELDS = [
  ['anio', 'Año'], ['color', 'Color'], ['millaje', 'Millaje'], ['tipo', 'Tipo'],
  ['transmision', 'Transmisión'], ['combustible', 'Combustible'], ['motor', 'Motor'],
  ['traccion', 'Tracción'], ['techo', 'Techo'], ['asientos_material', 'Asientos'],
  ['asientos_cantidad', 'Cant. asientos'], ['chasis', 'Chasis'], ['placa', 'Placa'],
  ['condicion', 'Condición'], ['carfax', 'Carfax'], ['llave', 'Llave'],
  ['camara', 'Cámara'], ['carplay', 'CarPlay'], ['sensores', 'Sensores'],
  ['baul_electrico', 'Baúl eléct.'], ['vidrios_electricos', 'Vidrios eléct.'],
];

const CARD = { padX: 12, padY: 11, titleH: 20, colGap: 8, rowH: 23, cols: 4, gapBelow: 9 };
const BRAND = { headerH: 26, gapBelow: 10, gapAbove: 14 };

const cardChips = (u) => DETAIL_FIELDS.filter(([key]) => text(u[key]) !== '');

const cardHeight = (u) => {
  const rows = Math.ceil(cardChips(u).length / CARD.cols);
  return CARD.padY * 2 + CARD.titleH + rows * CARD.rowH;
};

const setColor = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);

// Recorta el texto para que nunca se salga de su columna.
const fit = (doc, str, maxW) => {
  let s = String(str ?? '');
  if (doc.getTextWidth(s) <= maxW) return s;
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
  return s + '…';
};

const drawCard = (doc, u, y) => {
  const h = cardHeight(u);
  const x = PAGE.mL;

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.7);
  doc.roundedRect(x, y, CONTENT_W, h, 7, 7, 'S');

  const innerX = x + CARD.padX;
  const innerW = CONTENT_W - CARD.padX * 2;

  // Precio a la derecha; se reserva su ancho para que el título no lo pise.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const priceStr = u.precio || '—';
  const priceW = doc.getTextWidth(priceStr);
  const initialStr = u.inicial ? `Inicial: ${u.inicial}` : '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const initialW = initialStr ? doc.getTextWidth(initialStr) : 0;
  const rightW = Math.max(priceW, initialW);

  const titleBaseline = y + CARD.padY + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setColor(doc, COLOR.red);
  doc.text(priceStr, x + CONTENT_W - CARD.padX, titleBaseline, { align: 'right' });
  if (initialStr) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, COLOR.muted);
    doc.text(initialStr, x + CONTENT_W - CARD.padX, titleBaseline + 9.5, { align: 'right' });
  }

  // Modelo + edición
  const titleMaxW = innerW - rightW - 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  setColor(doc, COLOR.dark);
  const model = fit(doc, u.modelo, titleMaxW);
  doc.text(model, innerX, titleBaseline);
  if (u.edicion) {
    const used = doc.getTextWidth(model);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(doc, COLOR.muted);
    doc.text(fit(doc, u.edicion, titleMaxW - used - 5), innerX + used + 5, titleBaseline);
  }

  // Detalles en 4 columnas
  const chips = cardChips(u);
  const colW = (innerW - CARD.colGap * (CARD.cols - 1)) / CARD.cols;
  chips.forEach((chip, i) => {
    const [key, label] = chip;
    const col = i % CARD.cols;
    const row = Math.floor(i / CARD.cols);
    const cx = innerX + col * (colW + CARD.colGap);
    const cy = y + CARD.padY + CARD.titleH + row * CARD.rowH;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    setColor(doc, COLOR.label);
    doc.text(fit(doc, label.toUpperCase(), colW), cx, cy + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    setColor(doc, COLOR.value);
    doc.text(fit(doc, u[key], colW), cx, cy + 16);
  });

  return h;
};

// Encabezado grande, solo en la primera página. Sin logo: se pidió quitarlo.
const drawMainHeader = (doc, dealer, totalRows, totalBrands) => {
  let y = PAGE.mT;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  setColor(doc, COLOR.dark);
  doc.text(fit(doc, dealer.name || 'Inventario', CONTENT_W * 0.62), PAGE.mL, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setColor(doc, COLOR.red);
  doc.text('INVENTARIO DISPONIBLE', PAGE.mL, y + 26);

  // Datos del dealer, alineados a la derecha
  const lines = [dealer.address, dealer.phone, dealer.website].map(text).filter(Boolean);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setColor(doc, COLOR.muted);
  const rightX = PAGE.w - PAGE.mR;
  lines.forEach((l, i) => doc.text(fit(doc, l, CONTENT_W * 0.36), rightX, y + 6 + i * 10, { align: 'right' }));
  doc.setFont('helvetica', 'bold');
  setColor(doc, COLOR.label);
  const dateBaseline = y + 6 + lines.length * 10 + 2;
  doc.text(`Descargado: ${today()}`, rightX, dateBaseline, { align: 'right' });

  // La regla roja va debajo de TODO el encabezado: el bloque de contacto crece
  // con la cantidad de datos que tenga el dealer, y con un tope fijo la fecha
  // quedaba tachada por la línea.
  y = Math.max(y + 34, dateBaseline + 7);
  doc.setFillColor(...COLOR.red);
  doc.rect(PAGE.mL, y, CONTENT_W, 2.4, 'F');
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(doc, COLOR.muted);
  doc.text(
    `${totalRows} ${totalRows === 1 ? 'vehículo' : 'vehículos'}  ·  ${totalBrands} ${totalBrands === 1 ? 'marca' : 'marcas'}`,
    PAGE.mL, y
  );

  return y + 12;
};

// Encabezado delgado para las páginas siguientes.
const drawRunningHeader = (doc, dealer) => {
  const y = PAGE.mT;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setColor(doc, COLOR.dark);
  doc.text(fit(doc, dealer.name || 'Inventario', CONTENT_W * 0.7), PAGE.mL, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setColor(doc, COLOR.label);
  doc.text('INVENTARIO DISPONIBLE', PAGE.w - PAGE.mR, y, { align: 'right' });

  doc.setFillColor(...COLOR.red);
  doc.rect(PAGE.mL, y + 5, CONTENT_W, 1.6, 'F');
  return y + 20;
};

const drawBrandHeader = (doc, brand, count, y) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setColor(doc, COLOR.dark);
  doc.text(fit(doc, brand, CONTENT_W * 0.7), PAGE.mL, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setColor(doc, COLOR.label);
  doc.text(`${count} ${count === 1 ? 'unidad' : 'unidades'}`, PAGE.w - PAGE.mR, y + 11, { align: 'right' });

  doc.setFillColor(...COLOR.red);
  doc.rect(PAGE.mL, y + 16, CONTENT_W, 1.6, 'F');

  return y + BRAND.headerH;
};

const drawFooters = (doc) => {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, COLOR.label);
    doc.text(`Página ${p} de ${total}`, PAGE.w / 2, PAGE.h - 26, { align: 'center' });
  }
};

export const exportInventoryPDF = async (inventory, dealer = {}) => {
  const rows = getExportableVehicles(inventory);
  if (rows.length === 0) return 0;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });

  const byBrand = rows.reduce((acc, r) => { (acc[r.marca] ||= []).push(r); return acc; }, {});
  const brands = Object.keys(byBrand).sort((a, b) => a.localeCompare(b, 'es'));

  const limitY = PAGE.h - PAGE.mB;
  let y = drawMainHeader(doc, dealer, rows.length, brands.length);

  const newPage = () => {
    doc.addPage();
    return drawRunningHeader(doc, dealer);
  };

  brands.forEach((brand, brandIdx) => {
    const units = byBrand[brand];
    if (brandIdx > 0) y += BRAND.gapAbove;

    // El título de marca nunca se queda solo al final de una página: si no
    // cabe junto a su primera unidad, se pasa completo a la siguiente. Es
    // preferible dejar el espacio en blanco al final.
    const firstBlock = BRAND.headerH + BRAND.gapBelow + cardHeight(units[0]);
    if (y + firstBlock > limitY) y = newPage();

    y = drawBrandHeader(doc, brand, units.length, y) + BRAND.gapBelow;

    units.forEach((u) => {
      const h = cardHeight(u);
      // Una unidad nunca se parte entre dos páginas.
      if (y + h > limitY) y = newPage();
      drawCard(doc, u, y);
      y += h + CARD.gapBelow;
    });
  });

  drawFooters(doc);
  doc.save(`Inventario_${slug(dealer.name)}_${todayStamp()}.pdf`);
  return rows.length;
};
