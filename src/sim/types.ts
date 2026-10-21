// Core simulation types. Everything in src/sim is framework-free TypeScript so
// the same code can later run on an authoritative multiplayer server.

export type NationId = string;
/** Owner of neutral minor-state provinces and their garrisons. */
export const NEUTRAL = 'neutral' as const;
export type OwnerId = NationId | typeof NEUTRAL;
export type ProvinceId = string;
export type ArmyId = string;
export type UnitId = string;

export type ResourceKey = 'money' | 'materials' | 'fuel' | 'manpower';
export const RESOURCE_KEYS: readonly ResourceKey[] = ['money', 'materials', 'fuel', 'manpower'];
export type Resources = Record<ResourceKey, number>;
export type PartialResources = Partial<Resources>;

export type Terrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'urban' | 'marsh';
export type UnitType = 'infantry' | 'artillery' | 'tank';
export const UNIT_TYPES: readonly UnitType[] = ['infantry', 'artillery', 'tank'];
export type BuildingType =
  | 'industry'
  | 'barracks'
  | 'armsWorks'
  | 'tankWorks'
  | 'refinery'
  | 'fortifications'
  | 'supplyDepot';
export type TechId = string;
export type Relation = 'war' | 'peace';
export type ConnectionKind = 'land' | 'mountain' | 'strait';
export type Era = 'WWI' | 'Interwar' | 'WWII';

// ---------------------------------------------------------------------------
// Static scenario definition (never mutated during play)
// ---------------------------------------------------------------------------

export interface CityDef {
  name: string;
  /** [longitude, latitude] — also the province's movement anchor. */
  coord: [number, number];
  size: 'capital' | 'major' | 'town';
}

/** Names that read with "the" in running text ("the United Kingdom", "the Midlands"). */
export type Article = 'the';

export interface NeutralStateDef {
  name: string;
  /** Used for its forces: "Dutch garrison". */
  adjective: string;
  article?: Article;
}

export interface ProvinceDef {
  id: ProvinceId;
  name: string;
  article?: Article;
  /** Nation whose core territory this is; null for neutral minor states. */
  core: NationId | null;
  /** The neutral state this province belongs to (neutral provinces only). */
  neutral?: NeutralStateDef;
  terrain: Terrain;
  city: CityDef;
  /** Base output per minute (Standard speed) before buildings and research. */
  production: Resources;
  /** Oil deposits allow refineries without Synthetic Fuel research. */
  oil?: boolean;
  /** Strategic objective worth this many victory points. */
  objectiveVp?: number;
}

export interface ConnectionDef {
  a: ProvinceId;
  b: ProvinceId;
  kind: ConnectionKind;
  /** Optional label shown on the map (e.g. "Strait of Dover"). */
  label?: string;
}

export interface NationDef {
  id: NationId;
  name: string;
  article?: Article;
  adjective: string;
  color: string;
  capital: ProvinceId;
}

export interface StartingArmyDef {
  owner: OwnerId;
  province: ProvinceId;
  units: Partial<Record<UnitType, number>>;
}

export interface ScenarioDef {
  id: string;
  name: string;
  nations: NationDef[];
  provinces: ProvinceDef[];
  connections: ConnectionDef[];
  startingBuildings: { province: ProvinceId; buildings: Partial<Record<BuildingType, number>> }[];
  startingArmies: StartingArmyDef[];
  startingResources: Resources;
}

// ---------------------------------------------------------------------------
// Dynamic game state (serialised for save/load; must stay plain JSON)
// ---------------------------------------------------------------------------

export interface Unit {
  id: UnitId;
  type: UnitType;
  /** Fraction of full strength, 0..1. Max HP comes from config + research. */
  strength: number;
}

export interface MoveLeg {
  from: ProvinceId;
  to: ProvinceId;
  elapsed: number;
  duration: number;
}

export interface ArmyMove {
  /** Remaining destinations in order; path[0] is the current/next leg target. */
  path: ProvinceId[];
  /** Non-null while travelling between two provinces. */
  leg: MoveLeg | null;
}

export interface Army {
  id: ArmyId;
  owner: OwnerId;
  /** Province the army is in, or departed from while a leg is in progress. */
  province: ProvinceId;
  units: Unit[];
  move: ArmyMove | null;
  supplied: boolean;
  /** Consecutive ticks spent out of supply. */
  unsuppliedTicks: number;
}

export interface ConstructionJob {
  building: BuildingType;
  targetLevel: number;
  remaining: number;
  total: number;
  /** Price paid, refunded on cancel (absent in saves made before it was recorded). */
  cost?: PartialResources;
}

export interface RecruitJob {
  unitType: UnitType;
  remaining: number;
  total: number;
  /** Price paid, refunded on cancel (absent in saves made before it was recorded). */
  cost?: PartialResources;
}

export interface CaptureProgress {
  by: NationId;
  progress: number;
  required: number;
}

export interface ProvinceState {
  id: ProvinceId;
  owner: OwnerId;
  buildings: Partial<Record<BuildingType, number>>;
  construction: ConstructionJob | null;
  recruitQueue: RecruitJob[];
  capture: CaptureProgress | null;
  /** Connected by owned territory to one of the owner's supply hubs. */
  supplied: boolean;
  /** Tick of the last ownership change (0 at start). */
  ownerSince: number;
}

export interface RelationState {
  status: Relation;
  since: number;
  /** War cannot be declared again before this tick (set when peace is made). */
  truceUntil: number;
  /** No new peace offer to this nation before this tick (set when one is rejected or expires). */
  peaceOfferAfter?: number;
}

export interface ResearchState {
  completed: TechId[];
  active: { tech: TechId; remaining: number; total: number } | null;
}

export interface AiMemory {
  /** 0..1, how readily this AI starts wars and attacks. */
  aggression: number;
  /** 0..1, preference for economy over military spending. */
  economyBias: number;
  nextThinkTick: number;
}

export interface NationState {
  id: NationId;
  controller: 'human' | 'ai';
  resources: Resources;
  research: ResearchState;
  relations: Record<NationId, RelationState>;
  eliminated: boolean;
  /** True when an upkeep bill could not be paid in full this minute. */
  shortages: { money: boolean; fuel: boolean };
  ai: AiMemory | null;
  stats: { provincesCaptured: number; unitsLost: number; unitsDestroyed: number };
}

export interface PeaceOffer {
  from: NationId;
  to: NationId;
  expiresAt: number;
}

export type EventSeverity = 'info' | 'good' | 'bad' | 'combat' | 'system';

export interface GameEvent {
  id: number;
  tick: number;
  kind: string;
  text: string;
  /** Nations the event concerns; empty means it is shown to everyone. */
  nations: NationId[];
  province?: ProvinceId;
  /** Who it happened to: the side that lost an army or a province, or whose peace offer was turned down. */
  subject?: OwnerId;
  severity: EventSeverity;
}

export interface BattleState {
  province: ProvinceId;
  startedAt: number;
  owners: OwnerId[];
}

export interface ScoreLine {
  nation: NationId;
  vp: number;
  provinces: number;
  techs: number;
  score: number;
}

export type OutcomeReason = 'objectives' | 'timeLimit' | 'lastStanding' | 'humanEliminated';

export interface GameOutcome {
  winner: NationId | null;
  reason: OutcomeReason;
  tick: number;
  scores: ScoreLine[];
}

export interface GameSettings {
  speed: 'standard' | 'slow';
  /** Multiplier applied to every duration (1 for Standard). */
  durationScale: number;
  timeLimitTicks: number;
  humanNation: NationId | null;
}

export interface GameState {
  schemaVersion: number;
  scenarioId: string;
  seed: number;
  /** Internal state of the seeded PRNG. */
  rng: number;
  tick: number;
  settings: GameSettings;
  nations: Record<NationId, NationState>;
  provinces: Record<ProvinceId, ProvinceState>;
  armies: Record<ArmyId, Army>;
  nextId: number;
  peaceOffers: PeaceOffer[];
  battles: Record<ProvinceId, BattleState>;
  events: GameEvent[];
  nextEventId: number;
  victory: { leader: NationId | null; holdSince: number | null };
  outcome: GameOutcome | null;
}
