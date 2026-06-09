const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

const EMPTY_VALUES = new Set(['', 'Not Applicable', 'N/A', '0', 'null', 'undefined', 'Not Available', 'Standard', 'Optional']);

function clean(val) {
  if (val == null) return '';
  const s = String(val).trim();
  return EMPTY_VALUES.has(s) ? '' : s;
}

// clean but keep "Standard"/"Optional" for safety/equipment fields
function cleanEquip(val) {
  if (val == null) return '';
  const s = String(val).trim();
  return ['', 'Not Applicable', 'N/A', 'null', 'undefined', 'Not Available'].includes(s) ? '' : s;
}

export function validateVin(vin) {
  const v = vin.replace(/\s/g, '').toUpperCase();
  const invalid = /[IOQ]/.test(v);
  const isStandard = v.length === 17 && !invalid;
  return { cleaned: v, isStandard, tooShort: v.length < 17, hasInvalidChars: invalid };
}

export async function decodeVIN(vin) {
  const { cleaned } = validateVin(vin);
  if (!cleaned) throw new Error('VIN vacío');

  const url = `${NHTSA_BASE}/${encodeURIComponent(cleaned)}?format=json`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('network');
  }
  if (!res.ok) throw new Error('api_error');

  const json = await res.json();
  const r = json?.Results?.[0];
  if (!r) throw new Error('no_results');

  if (!clean(r.Make)) throw new Error('no_data');

  return {
    vin: cleaned,
    make: clean(r.Make),
    model: clean(r.Model),
    year: clean(r.ModelYear),
    trim: clean(r.Trim),
    series: clean(r.Series),
    vehicleType: clean(r.VehicleType),
    bodyClass: clean(r.BodyClass),
    doors: clean(r.Doors),
    seats: clean(r.Seats),
    seatRows: clean(r.SeatRows),

    fuelType: clean(r.FuelTypePrimary),
    fuelTypeSecondary: clean(r.FuelTypeSecondary),
    electrificationLevel: clean(r.ElectrificationLevel),

    engineModel: clean(r.EngineModel),
    engineConfig: clean(r.EngineConfiguration),
    cylinders: clean(r.EngineCylinders),
    engineHP: clean(r.EngineHP),
    displacementL: clean(r.DisplacementL),
    displacementCC: clean(r.DisplacementCC),

    driveType: clean(r.DriveType),
    transmissionStyle: clean(r.TransmissionStyle),
    transmissionSpeeds: clean(r.TransmissionSpeeds),

    steeringLocation: clean(r.SteeringLocation),
    brakeSystem: clean(r.BrakeSystemType),
    gvwr: clean(r.GVWR),
    topSpeedMPH: clean(r.TopSpeedMPH),
    wheelbase: clean(r.WheelBaseShort),

    // Safety / equipment (keep Standard/Optional)
    abs: cleanEquip(r.ABS),
    esc: cleanEquip(r.ESC),
    tractionControl: cleanEquip(r.TractionControl),
    blindSpot: cleanEquip(r.BlindSpotMon),
    parkAssist: cleanEquip(r.ParkAssist),
    rearCamera: cleanEquip(r.RearVisibilitySystem),
    fcw: cleanEquip(r.ForwardCollisionWarning),
    laneWarning: cleanEquip(r.LaneDepartureWarning),
    laneKeep: cleanEquip(r.LaneKeepSystem),
    adaptiveCruise: cleanEquip(r.AdaptiveCruiseControl),
    keylessIgnition: cleanEquip(r.KeylessIgnition),
    adaptiveBeams: cleanEquip(r.AdaptiveDrivingBeam),
    drl: cleanEquip(r.DaytimeRunningLight),
    tpms: cleanEquip(r.TPMS),
    airbagFront: cleanEquip(r.AirBagLocFront),
    airbagCurtain: cleanEquip(r.AirBagLocCurtain),
    airbagSide: cleanEquip(r.AirBagLocSide),
    airbagKnee: cleanEquip(r.AirBagLocKnee),

    // Plant / origin
    manufacturer: clean(r.Manufacturer),
    plantCountry: clean(r.PlantCountry),
    plantCity: clean(r.PlantCity),
    plantState: clean(r.PlantState),

    basePrice: clean(r.BasePrice),
    raw: r,
  };
}

const DRIVE_MAP = {
  'FWD/Front-Wheel Drive': 'FWD',
  'RWD/Rear-Wheel Drive': 'RWD',
  'AWD/All-Wheel Drive': 'AWD',
  '4WD/4-Wheel Drive/4x4': '4WD',
  '4x2': 'FWD',
};

const TYPE_MAP = {
  'PASSENGER CAR': 'Automóvil',
  'MULTIPURPOSE PASSENGER VEHICLE (MPV)': 'Jeepeta',
  'TRUCK': 'Camioneta',
  'MOTORCYCLE': 'Moto',
  'BUS': 'Bus',
  'LOW SPEED VEHICLE (LSV)': 'Automóvil',
};

const TRANS_MAP = {
  'Manual': 'Manual',
  'Automatic': 'Automática',
  'CVT': 'CVT',
  'Automated Manual Transmission (AMT)': 'Automática',
  'Dual-Clutch Transmission (DCT)': 'Automática',
};

const FUEL_MAP = {
  'Gasoline': 'Gasolina',
  'Diesel': 'Diesel',
  'Electric': 'Eléctrico',
  'Hybrid (Hybrid Electric Vehicle)': 'Híbrido',
  'Plug-in Electric/Plug-in Hybrid Electric Vehicle': 'Híbrido',
  'Flex-Fuel Vehicle (FFV)': 'Gasolina',
  'Natural Gas': 'Gas Natural',
  'Hydrogen': 'Hidrógeno',
};

export function mapVinToFormFields(decoded) {
  const fields = {};

  if (decoded.make) fields.make = decoded.make;
  if (decoded.model) fields.model = decoded.model;
  if (decoded.year) fields.year = decoded.year;
  if (decoded.trim) fields.edition = decoded.trim;
  if (decoded.vehicleType) fields.type = TYPE_MAP[decoded.vehicleType] || decoded.vehicleType;

  // Fuel: prefer secondary if primary is Electric but secondary is Gasoline (PHEV case)
  const primaryFuel = decoded.fuelType;
  const secondaryFuel = decoded.fuelTypeSecondary;
  const isPhev = decoded.electrificationLevel?.includes('PHEV') || decoded.electrificationLevel?.includes('Plug-in');
  if (isPhev) {
    fields.fuel = 'Híbrido';
  } else if (primaryFuel) {
    fields.fuel = FUEL_MAP[primaryFuel] || primaryFuel;
  }

  if (decoded.transmissionStyle) {
    fields.transmission = TRANS_MAP[decoded.transmissionStyle] || decoded.transmissionStyle;
  }

  if (decoded.driveType) {
    fields.traction = DRIVE_MAP[decoded.driveType] || decoded.driveType;
  }

  // Engine aspiration type
  const elec = decoded.electrificationLevel || '';
  if (elec.includes('PHEV') || elec.includes('HEV') || elec.includes('Hybrid')) {
    fields.engine_type = 'Híbrido';
  } else if (elec.includes('BEV') || elec.includes('Pure Electric') || decoded.fuelType === 'Electric') {
    fields.engine_type = 'Eléctrico';
  }

  // Engine cylinders & displacement
  if (decoded.cylinders) fields.engine_cyl = `${decoded.cylinders} Cil`;
  if (decoded.displacementL) fields.engine_cc = `${parseFloat(decoded.displacementL).toFixed(1)}L`;

  // Camera — if rear visibility system is present
  if (decoded.rearCamera === 'Standard') fields.camera = 'Reversa';

  // Key type — keyless ignition → Push Button
  if (decoded.keylessIgnition === 'Standard') fields.key_type = 'Push Button';

  // Seat rows
  if (decoded.seatRows) fields.seats = decoded.seatRows;

  // VIN
  if (decoded.vin) fields.vin = decoded.vin;

  return fields;
}
