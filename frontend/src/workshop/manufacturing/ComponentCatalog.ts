// ============================================================================
// Sunday 3D Workshop — Component Catalog
// LED modules, power supplies, hardware — Mexican market MXN prices.
// ============================================================================

import type {
  LEDModuleData,
  PowerSupplyData,
  ComponentEntry,
  ComponentCategory,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Default LED modules
// ---------------------------------------------------------------------------

export const DEFAULT_LED_MODULES: LEDModuleData[] = [
  {
    id: 'led-smd5050-3led',
    name: 'Módulo LED SMD 5050 (3 LEDs)',
    power: 0.72,
    voltage: 12,
    current: 0.06,
    width: 36,
    height: 9,
    depth: 5,
    lumens: 45,
    price: 4.5,
  },
  {
    id: 'led-smd5050-4led',
    name: 'Módulo LED SMD 5050 (4 LEDs)',
    power: 0.96,
    voltage: 12,
    current: 0.08,
    width: 46,
    height: 15,
    depth: 5,
    lumens: 60,
    price: 6.0,
  },
  {
    id: 'led-smd2835-3led',
    name: 'Módulo LED SMD 2835 (3 LEDs)',
    power: 0.72,
    voltage: 12,
    current: 0.06,
    width: 36,
    height: 9,
    depth: 4,
    lumens: 55,
    price: 5.0,
  },
  {
    id: 'led-smd2835-bar',
    name: 'Barra LED SMD 2835 (6 LEDs)',
    power: 1.2,
    voltage: 12,
    current: 0.1,
    width: 72,
    height: 12,
    depth: 5,
    lumens: 100,
    price: 8.5,
  },
  {
    id: 'led-strip-5050-per-m',
    name: 'Tira LED SMD 5050 (por metro)',
    power: 14.4,
    voltage: 12,
    current: 1.2,
    width: 1000,
    height: 10,
    depth: 3,
    lumens: 900,
    price: 45,
  },
  {
    id: 'led-smd3030-1w',
    name: 'Módulo LED SMD 3030 de alta potencia (1 W)',
    power: 1.0,
    voltage: 12,
    current: 0.083,
    width: 20,
    height: 20,
    depth: 6,
    lumens: 90,
    price: 7.0,
  },
];

// ---------------------------------------------------------------------------
// Default power supplies
// ---------------------------------------------------------------------------

export const DEFAULT_POWER_SUPPLIES: PowerSupplyData[] = [
  {
    id: 'psu-12v-60w',
    name: 'Fuente switching 12 V / 5 A (60 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 12,
    outputCurrent: 5,
    wattage: 60,
    price: 120,
  },
  {
    id: 'psu-12v-100w',
    name: 'Fuente switching 12 V / 8.3 A (100 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 12,
    outputCurrent: 8.3,
    wattage: 100,
    price: 185,
  },
  {
    id: 'psu-12v-150w',
    name: 'Fuente switching 12 V / 12.5 A (150 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 12,
    outputCurrent: 12.5,
    wattage: 150,
    price: 250,
  },
  {
    id: 'psu-12v-200w',
    name: 'Fuente switching 12 V / 16.7 A (200 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 12,
    outputCurrent: 16.7,
    wattage: 200,
    price: 310,
  },
  {
    id: 'psu-12v-350w',
    name: 'Fuente switching 12 V / 29 A (350 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 12,
    outputCurrent: 29,
    wattage: 350,
    price: 450,
  },
  {
    id: 'psu-24v-150w',
    name: 'Fuente switching 24 V / 6.25 A (150 W)',
    inputVoltage: '100-240V AC',
    outputVoltage: 24,
    outputCurrent: 6.25,
    wattage: 150,
    price: 270,
  },
];

// ---------------------------------------------------------------------------
// Default hardware
// ---------------------------------------------------------------------------

export const DEFAULT_HARDWARE: ComponentEntry[] = [
  {
    id: 'hw-screw-m3x10',
    name: 'Tornillo M3×10 mm inox',
    category: 'hardware',
    unit: 'pz',
    pricePerUnit: 0.80,
    specs: { diameter: 3, length: 10, material: 'stainless_steel' },
  },
  {
    id: 'hw-screw-m4x16',
    name: 'Tornillo M4×16 mm inox',
    category: 'hardware',
    unit: 'pz',
    pricePerUnit: 1.20,
    specs: { diameter: 4, length: 16, material: 'stainless_steel' },
  },
  {
    id: 'hw-bracket-l-25',
    name: 'Escuadra L 25×25 mm',
    category: 'hardware',
    unit: 'pz',
    pricePerUnit: 5.00,
    specs: { size: 25 },
  },
  {
    id: 'hw-wire-awg22-per-m',
    name: 'Cable AWG 22 (por metro)',
    category: 'hardware',
    unit: 'm',
    pricePerUnit: 3.50,
    specs: { awg: 22 },
  },
  {
    id: 'hw-wire-awg18-per-m',
    name: 'Cable AWG 18 (por metro)',
    category: 'hardware',
    unit: 'm',
    pricePerUnit: 5.00,
    specs: { awg: 18 },
  },
  {
    id: 'hw-connector-2pin',
    name: 'Conector rápido 2 pines',
    category: 'hardware',
    unit: 'pz',
    pricePerUnit: 3.00,
    specs: { pins: 2 },
  },
];

// ---------------------------------------------------------------------------
// ComponentCatalog class
// ---------------------------------------------------------------------------

export class ComponentCatalog {
  private ledModules: LEDModuleData[];
  private powerSupplies: PowerSupplyData[];
  private hardware: ComponentEntry[];

  constructor(init?: {
    ledModules?: LEDModuleData[];
    powerSupplies?: PowerSupplyData[];
    hardware?: ComponentEntry[];
  }) {
    this.ledModules = (init?.ledModules ?? DEFAULT_LED_MODULES).map((m) => ({ ...m }));
    this.powerSupplies = (init?.powerSupplies ?? DEFAULT_POWER_SUPPLIES).map((p) => ({ ...p }));
    this.hardware = (init?.hardware ?? DEFAULT_HARDWARE).map((h) => ({ ...h }));
  }

  // ---- LED modules ----

  getAllLEDModules(): LEDModuleData[] {
    return this.ledModules.map((m) => ({ ...m }));
  }

  getLEDModuleById(id: string): LEDModuleData | undefined {
    const found = this.ledModules.find((m) => m.id === id);
    return found ? { ...found } : undefined;
  }

  addLEDModule(module: LEDModuleData): void {
    if (this.ledModules.some((m) => m.id === module.id)) {
      throw new Error(`LED module "${module.id}" already exists.`);
    }
    this.ledModules.push({ ...module });
  }

  removeLEDModule(id: string): boolean {
    const idx = this.ledModules.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.ledModules.splice(idx, 1);
    return true;
  }

  // ---- Power supplies ----

  getAllPowerSupplies(): PowerSupplyData[] {
    return this.powerSupplies.map((p) => ({ ...p }));
  }

  getPowerSupplyById(id: string): PowerSupplyData | undefined {
    const found = this.powerSupplies.find((p) => p.id === id);
    return found ? { ...found } : undefined;
  }

  /** Get power supplies matching the given output voltage. */
  getPowerSuppliesByVoltage(voltage: number): PowerSupplyData[] {
    return this.powerSupplies.filter((p) => p.outputVoltage === voltage).map((p) => ({ ...p }));
  }

  addPowerSupply(psu: PowerSupplyData): void {
    if (this.powerSupplies.some((p) => p.id === psu.id)) {
      throw new Error(`Power supply "${psu.id}" already exists.`);
    }
    this.powerSupplies.push({ ...psu });
  }

  removePowerSupply(id: string): boolean {
    const idx = this.powerSupplies.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.powerSupplies.splice(idx, 1);
    return true;
  }

  // ---- Hardware ----

  getAllHardware(): ComponentEntry[] {
    return this.hardware.map((h) => ({ ...h }));
  }

  getHardwareById(id: string): ComponentEntry | undefined {
    const found = this.hardware.find((h) => h.id === id);
    return found ? { ...found } : undefined;
  }

  getByCategory(category: ComponentCategory): ComponentEntry[] {
    if (category === 'led') {
      return this.ledModules.map((m) => ({
        id: m.id,
        name: m.name,
        category: 'led' as ComponentCategory,
        unit: 'pz',
        pricePerUnit: m.price,
        specs: {
          power: m.power,
          voltage: m.voltage,
          current: m.current,
          lumens: m.lumens,
        },
      }));
    }
    if (category === 'power_supply') {
      return this.powerSupplies.map((p) => ({
        id: p.id,
        name: p.name,
        category: 'power_supply' as ComponentCategory,
        unit: 'pz',
        pricePerUnit: p.price,
        specs: {
          outputVoltage: p.outputVoltage,
          outputCurrent: p.outputCurrent,
          wattage: p.wattage,
        },
      }));
    }
    return this.hardware.filter((h) => h.category === category).map((h) => ({ ...h }));
  }

  addHardware(entry: ComponentEntry): void {
    if (this.hardware.some((h) => h.id === entry.id)) {
      throw new Error(`Hardware "${entry.id}" already exists.`);
    }
    this.hardware.push({ ...entry });
  }

  removeHardware(id: string): boolean {
    const idx = this.hardware.findIndex((h) => h.id === id);
    if (idx === -1) return false;
    this.hardware.splice(idx, 1);
    return true;
  }

  // ---- Serialization ----

  serialize(): {
    ledModules: LEDModuleData[];
    powerSupplies: PowerSupplyData[];
    hardware: ComponentEntry[];
  } {
    return {
      ledModules: this.getAllLEDModules(),
      powerSupplies: this.getAllPowerSupplies(),
      hardware: this.getAllHardware(),
    };
  }

  static deserialize(data: {
    ledModules: LEDModuleData[];
    powerSupplies: PowerSupplyData[];
    hardware: ComponentEntry[];
  }): ComponentCatalog {
    return new ComponentCatalog(data);
  }

  resetDefaults(): void {
    this.ledModules = DEFAULT_LED_MODULES.map((m) => ({ ...m }));
    this.powerSupplies = DEFAULT_POWER_SUPPLIES.map((p) => ({ ...p }));
    this.hardware = DEFAULT_HARDWARE.map((h) => ({ ...h }));
  }
}
