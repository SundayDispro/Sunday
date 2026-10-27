// ============================================================================
// Sunday 3D Workshop — Domain Logic Unit Tests
// Tests units, transforms, costing, electrical sizing, parametric & manufacturing
// ============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  convertLength,
  toMM,
  fromMM,
  snapToGrid,
} from '../src/workshop/engine/Units.ts';

import {
  calculateCostBreakdown,
  applyMarkupToCost,
  calculateMarginFromPrice,
} from '../src/workshop/manufacturing/CostingEngine.ts';

import {
  calculateTotalLoad,
  applyEngineeringMargin,
  recommendPowerSupply,
} from '../src/workshop/manufacturing/PowerSupplyCalc.ts';

import {
  calculateBoxVolume,
  calculateCylinderVolume,
  calculateSphereVolume,
  calculateMass,
  estimate3DPrintFilamentGrams,
} from '../src/workshop/manufacturing/ManufacturingCalc.ts';

import { generateSign } from '../src/workshop/parametric/SignGenerator.ts';
import { calculateEnclosure } from '../src/workshop/parametric/EnclosureGenerator.ts';
import { calculateLEDLayout } from '../src/workshop/parametric/LEDLayout.ts';
import { MaterialsCatalog, DEFAULT_MATERIALS } from '../src/workshop/manufacturing/MaterialsCatalog.ts';
import { DEFAULT_LED_MODULES, DEFAULT_POWER_SUPPLIES } from '../src/workshop/manufacturing/ComponentCatalog.ts';

describe('Sunday 3D Workshop — Domain Logic Tests', () => {
  // 1. Units & Snapping
  describe('Units & Grid Snapping', () => {
    it('converts correctly between mm, cm, m, inches, and feet', () => {
      assert.strictEqual(toMM(10, 'cm'), 100);
      assert.strictEqual(toMM(1, 'm'), 1000);
      assert.strictEqual(toMM(1, 'in'), 25.4);
      assert.strictEqual(fromMM(25.4, 'in'), 1);
      assert.strictEqual(convertLength(50, 'mm', 'cm'), 5);
    });

    it('snaps numbers to grid increments accurately', () => {
      assert.strictEqual(snapToGrid(13.4, 10), 10);
      assert.strictEqual(snapToGrid(16.8, 10), 20);
      assert.strictEqual(snapToGrid(23, 25), 25);
      assert.strictEqual(snapToGrid(12, 25), 0);
      assert.strictEqual(snapToGrid(7, 5), 5);
      assert.strictEqual(snapToGrid(8, 5), 10);
    });
  });

  // 2. Costing Engine (Markup vs Margin)
  describe('Costing Engine (Markup vs Margin formulas)', () => {
    it('calculates selling price and distinguishing markup from margin', () => {
      const cost = 1000;
      // 50% markup -> selling price 1500
      const priceWithMarkup = applyMarkupToCost(cost, 50);
      assert.strictEqual(priceWithMarkup, 1500);

      // Margin on 1500 with cost 1000: profit = 500, margin = 500/1500 = 33.33%
      const margin = calculateMarginFromPrice(cost, priceWithMarkup);
      assert.strictEqual(Math.round(margin * 100) / 100, 33.33);
    });

    it('generates a full transparent cost breakdown with labor and overhead', () => {
      const breakdown = calculateCostBreakdown({
        materials: [
          { description: 'Acrílico 3mm', quantity: 2, unit: 'm²', unitCost: 350, category: 'materiales' },
        ],
        components: [
          { description: 'Fuente 12V 100W', quantity: 1, unit: 'pza', unitCost: 450, category: 'electronica' },
        ],
        laborHours: 3,
        laborRatePerHour: 100,
        machineHours: 2,
        machineRatePerHour: 50,
        overheadPercent: 10,
        markupPercent: 30,
        currency: 'MXN',
      });

      // Direct costs: Materials (700) + Components (450) + Labor (300) + Machine (100) = 1550
      assert.strictEqual(breakdown.totalDirectCost, 1550);
      // Overhead (10% of 1550) = 155
      assert.strictEqual(breakdown.overheadCost, 155);
      // Total cost = 1705
      assert.strictEqual(breakdown.totalCost, 1705);
      // Selling price (1705 + 30% markup) = 2216.5
      assert.strictEqual(breakdown.sellingPrice, 2216.5);
      // Gross profit = 2216.5 - 1705 = 511.5
      assert.strictEqual(breakdown.grossProfit, 511.5);
    });
  });

  // 3. Electrical Load & PSU Sizing
  describe('Electrical Load & Power Supply Sizing', () => {
    it('calculates total wattage and current for 12V modules', () => {
      const module = DEFAULT_LED_MODULES.find((m) => m.power === 1.2 && m.voltage === 12)!; // 1.2W, 12V
      const load = calculateTotalLoad([module], [50]); // 50 modules

      assert.strictEqual(load.totalWatts, 60); // 50 * 1.2W
      assert.strictEqual(load.totalAmps, 5.0); // 60W / 12V = 5.0A
      assert.strictEqual(load.voltage, 12);
    });

    it('applies engineering margin (20%)', () => {
      const load = { totalWatts: 100, totalAmps: 8.33, voltage: 12 };
      const adjusted = applyEngineeringMargin(load, 20);

      assert.strictEqual(adjusted.adjustedWatts, 120);
      assert.strictEqual(Math.round(adjusted.adjustedAmps * 100) / 100, 10);
    });

    it('recommends an adequate power supply from catalog with sufficient headroom', () => {
      const load = { totalWatts: 60, totalAmps: 5.0, voltage: 12 };
      const rec = recommendPowerSupply(load, DEFAULT_POWER_SUPPLIES, 20);

      // 60W + 20% = 72W required -> should pick 100W PSU (since 60W is under 72W)
      assert.ok(rec.recommended !== null);
      assert.strictEqual(rec.recommended.wattage, 100);
      assert.strictEqual(rec.recommended.outputVoltage, 12);
    });
  });

  // 4. Manufacturing Calculations
  describe('Manufacturing Volume & Mass Calculations', () => {
    it('calculates volume of standard geometries correctly', () => {
      // 100mm x 50mm x 20mm box = 100,000 mm³ = 100 cm³
      const boxVolCm3 = calculateBoxVolume(100, 50, 20);
      assert.strictEqual(boxVolCm3, 100);

      // Cylinder radius 10mm (1cm), height 100mm (10cm): pi * 1² * 10 = ~31.416 cm³
      const cylVolCm3 = calculateCylinderVolume(10, 100);
      assert.strictEqual(Math.round(cylVolCm3 * 100) / 100, 31.42);

      // Sphere radius 20mm (2cm): (4/3) * pi * 2³ = ~33.51 cm³
      const sphereVolCm3 = calculateSphereVolume(20);
      assert.strictEqual(Math.round(sphereVolCm3 * 100) / 100, 33.51);
    });

    it('calculates mass from volume and density', () => {
      // PLA density = 1.25 g/cm³. 100 cm³ solid = 125 grams
      const massGrams = calculateMass(100, 1.25);
      assert.strictEqual(massGrams, 125);
    });

    it('estimates 3D print filament usage accounting for infill and walls', () => {
      // 100 cm³ box with 20% infill should be significantly lighter than solid 125g
      const estimatedGrams = estimate3DPrintFilamentGrams(100, 20, 1.25);
      assert.ok(estimatedGrams > 20 && estimatedGrams < 60);
    });
  });

  // 5. Parametric Generators
  describe('Parametric Generators (Sign, Enclosure, LED Layout)', () => {
    it('generates sign letter bodies and dimensions accurately', () => {
      const sign = generateSign({
        text: 'SUNDAY',
        fontUrl: '',
        letterHeight: 100,
        letterDepth: 40,
        letterSpacing: 10,
        layout: 'horizontal',
        bevelEnabled: false,
        bevelThickness: 0,
        bevelSize: 0,
        enclosureEnabled: true,
        wallThickness: 3,
        rearPanel: true,
        frontPanel: true,
        illuminated: true,
      });

      assert.strictEqual(sign.letterBodies.length, 6);
      assert.strictEqual(sign.dimensions.totalHeight, 100);
      assert.ok(sign.dimensions.totalWidth > 400);
      assert.ok(sign.letterBodies[0].interiorArea > 0);
    });

    it('calculates parametric enclosure clearances and cavity volume', () => {
      const enclosure = calculateEnclosure({
        length: 100,
        width: 60,
        height: 30,
        wallThickness: 2,
        floorThickness: 2,
        openFaces: ['top'],
        lidEnabled: true,
        lidThickness: 2,
        holes: [],
        cableOpenings: [],
      });

      assert.strictEqual(enclosure.body.width, 100);
      assert.strictEqual(enclosure.body.height, 60);
      // Interior dimensions: (100 - 4) x (60 - 4) x (30 - 2) = 96 x 56 x 28 = 150,528 mm³
      assert.strictEqual(enclosure.interiorVolume, 96 * 56 * 28);
      assert.ok(enclosure.lid !== null);
      assert.strictEqual(enclosure.lid.width, 100);
    });

    it('calculates LED layout adhering to edge margins and spacing', () => {
      const module = DEFAULT_LED_MODULES[0]; // 65x15mm
      const layout = calculateLEDLayout({
        areaWidth: 300,
        areaHeight: 100,
        moduleType: module,
        spacingX: 80,
        spacingY: 50,
        voltage: 12,
        minEdgeDistance: 15,
        mountingClearance: 2,
      });

      assert.ok(layout.totalCount > 0);
      assert.strictEqual(layout.modules.length, layout.totalCount);
      assert.ok(layout.totalPower > 0);
      assert.ok(layout.totalCurrent > 0);
      assert.ok(layout.circuits.length >= 1);
    });
  });

  // 6. Materials Catalog
  describe('Materials Catalog Management', () => {
    it('manages catalog items, category filtering and price updates', () => {
      const catalog = new MaterialsCatalog(DEFAULT_MATERIALS);
      const filamentos = catalog.getByCategory('filamento');
      assert.ok(filamentos.length >= 3);

      const firstItem = filamentos[0];
      const oldPrice = firstItem.pricePerUnit;
      catalog.updatePrice(firstItem.id, oldPrice + 50);

      const updated = catalog.getById(firstItem.id);
      assert.strictEqual(updated?.pricePerUnit, oldPrice + 50);
    });
  });
});
