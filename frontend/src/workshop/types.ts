// ============================================================================
// Sunday 3D Workshop — Core Type Definitions
// All geometric values in millimeters. All money in MXN (configurable).
// ============================================================================

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** 3D vector (x, y, z) — all values in millimeters unless noted otherwise. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Euler angles in radians (XYZ order). */
export interface EulerAngles {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounding box. */
export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

// ---------------------------------------------------------------------------
// Materials & appearance
// ---------------------------------------------------------------------------

export interface MaterialData {
  color: string;      // hex, e.g. "#ff9900"
  opacity: number;    // 0–1
  wireframe: boolean;
}

// ---------------------------------------------------------------------------
// Scene objects
// ---------------------------------------------------------------------------

export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'wedge'
  | 'torus'
  | 'text'
  | 'svgExtrusion'
  | 'boolean'
  | 'group'
  | 'imported';

export interface SceneObjectData {
  id: string;
  name: string;
  type: PrimitiveType;
  position: Vec3;
  rotation: EulerAngles;
  scale: Vec3;
  material: MaterialData;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  parentId: string | null;
  childrenIds: string[];
  /** Primitive-specific parameters used for regeneration. */
  parameters: Record<string, number | string | boolean>;
  /** User-defined metadata / tags. */
  metadata: Record<string, unknown>;
}

export interface SceneData {
  objects: SceneObjectData[];
  /** ID of objects currently selected. */
  selectedIds: string[];
  /** Ambient settings (background, grid visibility, etc.). */
  settings: SceneSettings;
}

export interface SceneSettings {
  backgroundColor: string;
  gridVisible: boolean;
  gridSize: number; // mm
  snapEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Project persistence
// ---------------------------------------------------------------------------

export interface ProjectData {
  version: string;
  name: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;
  scene: SceneData;
  parameters: ParametricConfig[];
  catalog: ProjectCatalog;
  quotations: QuotationData[];
}

export interface ProjectCatalog {
  materials: MaterialEntry[];
  components: ComponentEntry[];
}

// ---------------------------------------------------------------------------
// Parametric engine
// ---------------------------------------------------------------------------

export interface ParameterDef {
  name: string;
  label: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  /** Names of other parameters this one depends on. */
  dependsOn: string[];
}

export interface ParametricConfig {
  id: string;
  objectId: string;
  parameters: ParameterDef[];
}

// ---------------------------------------------------------------------------
// Sign generator
// ---------------------------------------------------------------------------

export interface SignConfig {
  text: string;
  fontUrl: string;            // URL / path to Three.js JSON font
  letterHeight: number;       // mm
  letterDepth: number;        // mm
  letterSpacing: number;      // mm between letters
  layout: 'horizontal' | 'vertical' | 'arc';
  bevelEnabled: boolean;
  bevelThickness: number;     // mm
  bevelSize: number;          // mm
  enclosureEnabled: boolean;
  wallThickness: number;      // mm
  rearPanel: boolean;
  frontPanel: boolean;
  illuminated: boolean;
  ledConfig?: LEDLayoutConfig;
}

export interface SignLetterBody {
  letter: string;
  /** Index in the original text. */
  index: number;
  width: number;   // mm
  height: number;  // mm
  depth: number;   // mm
  position: Vec3;
  /** Interior usable area in mm² for LED placement. */
  interiorArea: number;
}

export interface SignResult {
  letterBodies: SignLetterBody[];
  enclosure: EnclosureParts | null;
  panels: { name: string; width: number; height: number; thickness: number }[];
  dimensions: { totalWidth: number; totalHeight: number; totalDepth: number };
  componentList: { description: string; quantity: number; unit: string }[];
}

// ---------------------------------------------------------------------------
// Enclosure generator
// ---------------------------------------------------------------------------

export interface HoleSpec {
  position: Vec3;   // center, relative to enclosure origin
  diameter: number;  // mm
}

export interface CableOpeningSpec {
  face: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
  position: { x: number; y: number }; // relative to face
  width: number;
  height: number;
}

export interface EnclosureConfig {
  length: number;      // mm (X)
  width: number;       // mm (Y / depth)
  height: number;      // mm (Z)
  wallThickness: number;
  floorThickness: number;
  openFaces: ('top' | 'bottom' | 'left' | 'right' | 'front' | 'back')[];
  lidEnabled: boolean;
  lidThickness: number;
  holes: HoleSpec[];
  cableOpenings: CableOpeningSpec[];
}

export interface EnclosureParts {
  body: { width: number; height: number; depth: number; wallThickness: number };
  lid: { width: number; depth: number; thickness: number } | null;
  panels: { name: string; width: number; height: number; thickness: number }[];
  totalDimensions: { width: number; height: number; depth: number };
  /** Total interior volume in mm³. */
  interiorVolume: number;
}

// ---------------------------------------------------------------------------
// LED layout
// ---------------------------------------------------------------------------

export interface LEDModuleData {
  id: string;
  name: string;
  power: number;         // Watts
  voltage: number;       // Volts
  current: number;       // Amps
  width: number;         // mm
  height: number;        // mm
  depth: number;         // mm (thickness)
  lumens: number;
  price: number;         // MXN
}

export interface LEDLayoutConfig {
  areaWidth: number;       // mm
  areaHeight: number;      // mm
  moduleType: LEDModuleData;
  spacingX: number;        // mm between modules horizontally
  spacingY: number;        // mm between modules vertically
  voltage: number;         // system voltage (12 / 24)
  minEdgeDistance: number;  // mm from edge
  mountingClearance: number; // mm behind module
}

export interface LEDPlacement {
  moduleId: string;
  position: Vec3;
  orientation: 'horizontal' | 'vertical';
}

export interface LEDCircuit {
  id: string;
  modules: LEDPlacement[];
  totalPower: number;   // W
  totalCurrent: number; // A
  connection: 'series' | 'parallel';
}

export interface LEDLayoutResult {
  modules: LEDPlacement[];
  totalCount: number;
  totalPower: number;    // W
  totalCurrent: number;  // A
  circuits: LEDCircuit[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Power supply
// ---------------------------------------------------------------------------

export interface PowerSupplyData {
  id: string;
  name: string;
  inputVoltage: string;      // e.g. "100-240V AC"
  outputVoltage: number;     // V DC
  outputCurrent: number;     // A
  wattage: number;           // W
  price: number;             // MXN
}

export interface PowerLoadSummary {
  totalWatts: number;
  totalAmps: number;
  voltage: number;
}

export interface PSURecommendation {
  recommended: PowerSupplyData | null;
  alternatives: PowerSupplyData[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Materials catalog
// ---------------------------------------------------------------------------

export type MaterialCategory =
  | 'filamento'
  | 'acrilico'
  | 'pvc'
  | 'adhesivo'
  | 'hardware'
  | 'otro';

export interface MaterialEntry {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: string;            // e.g. "kg", "m²", "m"
  pricePerUnit: number;    // MXN
  density?: number;        // g/cm³
  thickness?: number;      // mm (for sheets)
  color?: string;
}

// ---------------------------------------------------------------------------
// Components catalog
// ---------------------------------------------------------------------------

export type ComponentCategory = 'led' | 'power_supply' | 'hardware';

export interface ComponentEntry {
  id: string;
  name: string;
  category: ComponentCategory;
  unit: string;
  pricePerUnit: number;    // MXN
  specs: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Costing engine
// ---------------------------------------------------------------------------

export type CostCategory =
  | 'materials'
  | 'electronics'
  | 'hardware'
  | 'labor'
  | 'machineTime'
  | 'electricity'
  | 'waste'
  | 'packaging'
  | 'other';

export interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;   // MXN
  total: number;       // MXN
  category: CostCategory;
}

export interface CostBreakdown {
  lineItems: LineItem[];
  subtotals: Record<CostCategory, number>;
  totalDirectCost: number;
  overheadPercent: number;
  overheadAmount: number;
  totalCost: number;
  markupPercent: number;
  sellingPrice: number;
  grossProfit: number;
  marginPercent: number;
  currency: string;
}

export interface QuotationData {
  id: string;
  projectName: string;
  date: string;       // ISO 8601
  lineItems: LineItem[];
  subtotals: Record<CostCategory, number>;
  totalCost: number;
  sellingPrice: number;
  currency: string;
  notes: string;
  validUntil: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// Costing input
// ---------------------------------------------------------------------------

export interface CostingConfig {
  laborRatePerHour: number;    // MXN
  machineRatePerHour: number;  // MXN
  overheadPercent: number;     // e.g. 15 for 15 %
  markupPercent: number;       // e.g. 40 for 40 %
  wastePercent: number;        // material waste factor
  currency: string;            // default "MXN"
}

export interface ProjectManufacturing {
  /** Material line items (description, quantity, unit, unitCost). */
  materialItems: Omit<LineItem, 'total' | 'category'>[];
  electronicsItems: Omit<LineItem, 'total' | 'category'>[];
  hardwareItems: Omit<LineItem, 'total' | 'category'>[];
  laborHours: number;
  machineHours: number;
  electricityKwh: number;
  electricityRate: number;     // MXN / kWh
  packagingCost: number;       // flat MXN
}

// ---------------------------------------------------------------------------
// Export / validation
// ---------------------------------------------------------------------------

export interface ExportOptions {
  format: 'stl_binary' | 'stl_ascii' | 'obj';
  /** Scale factor applied on export (1 = mm). */
  scaleFactor: number;
  includeNormals: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Text geometry
// ---------------------------------------------------------------------------

export interface TextGeometryOptions {
  fontUrl: string;
  size: number;           // mm
  depth: number;          // mm
  letterSpacing: number;  // mm
  bevelEnabled: boolean;
  bevelThickness: number; // mm
  bevelSize: number;      // mm
  bevelSegments: number;
}

// ---------------------------------------------------------------------------
// SVG parsing
// ---------------------------------------------------------------------------

export interface SVGShape {
  type: 'path' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'polyline';
  /** Raw SVG 'd' attribute or equivalent. */
  data: string;
  /** Parsed numeric parameters. */
  params: Record<string, number>;
}

export interface SVGParseResult {
  shapes: SVGShape[];
  viewBox: { x: number; y: number; width: number; height: number } | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Undo system
// ---------------------------------------------------------------------------

export type CommandType =
  | 'AddObject'
  | 'RemoveObject'
  | 'TransformObject'
  | 'BooleanOp'
  | 'RenameObject'
  | 'GroupObjects'
  | 'UngroupObjects'
  | 'ChangeVisibility'
  | 'ChangeMaterial'
  | 'Composite';

export interface UndoableCommand {
  type: CommandType;
  description: string;
  execute: () => void;
  undo: () => void;
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

export type SceneEventType =
  | 'objectAdded'
  | 'objectRemoved'
  | 'objectUpdated'
  | 'selectionChanged'
  | 'sceneCleared'
  | 'projectLoaded'
  | 'projectSaved';

export interface SceneEvent {
  type: SceneEventType;
  objectIds?: string[];
  data?: unknown;
}

export type SceneEventListener = (event: SceneEvent) => void;
