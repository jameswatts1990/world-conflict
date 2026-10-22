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

export type UnitType =
  | 'infantry'
  | 'stormtroopers'
  | 'mountain'
  | 'motorised'
  | 'cavalry'
  | 'armouredCar'
  | 'artillery'
  | 'heavyArtillery'
  | 'antiTank'
  | 'lightTank'
  | 'tank'
  | 'heavyTank'
  | 'tankDestroyer';
export const UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'stormtroopers',
  'mountain',
  'motorised',
  'cavalry',
  'armouredCar',
  'artillery',
  'heavyArtillery',
  'antiTank',
  'lightTank',
  'tank',
  'heavyTank',
  'tankDestroyer',
];
export type UnitClass = 'infantry' | 'mobile' | 'support' | 'armour';
/** Equipment generation: Great War, interwar, 1940. */
export type UnitGen = 'ww1' | 'interwar' | 'ww2';
export const UNIT_GENS: readonly UnitGen[] = ['ww1', 'interwar', 'ww2'];

export type BuildingType =
  | 'industry'
  | 'market'
  | 'powerPlant'
  | 'refinery'
  | 'housing'
  | 'university'
  | 'barracks'
  | 'academy'
  | 'armsWorks'
  | 'motorPool'
  | 'tankWorks'
  | 'hospital'
  | 'propaganda'
  | 'garrisonHq'
  | 'fortifications'
  | 'supplyDepot'
  | 'railway'
  | 'coastalBattery';
export type BuildingCategory = 'economy' | 'military' | 'civic' | 'infrastructure';
/** 1 Town, 2 City, 3 Large City, 4 Metropolis, 5 World City. */
export type CityTier = 1 | 2 | 3 | 4 | 5;

export type TechId = string;
export type TechBranch = 'infantry' | 'artillery' | 'armour' | 'industry' | 'logistics' | 'society';
export type Relation = 'war' | 'peace';
export type ConnectionKind = 'land' | 'mountain' | 'strait';
export type Era = 'WWI' | 'Interwar' | 'WWII';

/** Which unit types an effect applies to. */
export type UnitSelector = readonly UnitType[] | 'all';

/**
 * Declarative modifiers granted by technologies and national specialities.
 * The UI describes them and the simulation applies them.
 */
export type Effect =
  | { kind: 'production'; resource: ResourceKey; mult: number }
  | { kind: 'unitStat'; units: UnitSelector; stat: 'attack' | 'defence' | 'speed' | 'resilience' | 'shock'; mult: number }
  | { kind: 'unitModel'; units: readonly UnitType[]; gen: UnitGen }
  | { kind: 'unlockUnit'; unit: UnitType }
  | { kind: 'unlockBuilding'; building: BuildingType }
  | { kind: 'recruitTime'; mult: number; units?: UnitSelector }
  | { kind: 'recruitCost'; resource: ResourceKey; mult: number; units?: UnitSelector }
  | { kind: 'startXp'; units: UnitSelector; xp: number }
  | { kind: 'xpGain'; mult: number }
  | { kind: 'constructionTime'; mult: number }
  | { kind: 'constructionCost'; mult: number; building?: BuildingType }
  | { kind: 'fortification'; mult: number }
  | { kind: 'syntheticFuel' }
  | { kind: 'refinery'; mult: number }
  | { kind: 'combinedArms'; mult: number }
  | { kind: 'researchSlot' }
  | { kind: 'researchSpeed'; mult: number }
  /** Province morale target in core provinces. */
  | { kind: 'morale'; amount: number }
  /** Province morale target in occupied provinces. */
  | { kind: 'occupationMorale'; amount: number }
  | { kind: 'propaganda'; mult: number }
  | { kind: 'cityGrowth'; mult: number }
  | { kind: 'buildingSlots'; amount: number }
  | { kind: 'supplyRange'; amount: number }
  | { kind: 'attritionGrace'; seconds: number }
  | { kind: 'healing'; mult: number }
  /** Scales the penalty for attacking straight off a sea crossing. */
  | { kind: 'amphibious'; mult: number }
  | { kind: 'movement'; mult: number };

// ---------------------------------------------------------------------------
// Static scenario definition (never mutated during play)
// ---------------------------------------------------------------------------

export interface CityDef {
  name: string;
  /** [longitude, latitude] — also the province's movement anchor. */
  coord: [number, number];
  size: 'capital' | 'major' | 'town';
}

export interface TownDef {
  name: string;
  coord: [number, number];
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
  /** Starting city tier. */
  tier: CityTier;
  /** Urban population of the principal city in thousands (display and growth). */
  population: number;
  /** Smaller towns drawn on the map at close zoom (no gameplay effect). */
  towns: TownDef[];
  /** Has a sea coast (skyline art; coastal batteries also need a sea crossing). */
  coastal: boolean;
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

export interface NationSpeciality {
  name: string;
  description: string;
  effects: Effect[];
}

/** National flavour: equipment and formation names in the nation's own style. */
export interface NationIdentity {
  /** Named equipment per unit type and generation, e.g. tank/ww1 = Mark IV. */
  units: Partial<Record<UnitType, Partial<Record<UnitGen, { name: string; detail: string }>>>>;
  /**
   * Formation name templates per unit type. Tokens: {n} number, {ord} English
   * ordinal (1st), {fr-f}/{fr-m} French feminine/masculine ordinal (1re, 1er).
   */
  formations: Record<UnitType, string>;
  /** Army name template, same tokens. */
  army: string;
}

export interface NationDef {
  id: NationId;
  name: string;
  article?: Article;
  adjective: string;
  color: string;
  capital: ProvinceId;
  speciality: NationSpeciality;
  identity: NationIdentity;
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
  /** Technologies every nation knows at the start. */
  startingTechs: TechId[];
}

// ---------------------------------------------------------------------------
// Dynamic game state (serialised for save/load; must stay plain JSON)
// ---------------------------------------------------------------------------

export interface Unit {
  id: UnitId;
  type: UnitType;
  /** Fraction of full strength, 0..1. Max HP comes from config + research. */
  strength: number;
  /** Fighting spirit, 0..1. Broken armies rout. */
  morale: number;
  /** Combat experience; ranks Green, Regular, Veteran, Elite. */
  xp: number;
  /** Formation number within its owner and type, e.g. 12 for "12th Infantry Division". */
  serial: number;
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
  /** Army number within its owner, e.g. 3 for "3rd Army". */
  serial: number;
  /** Province the army is in, or departed from while a leg is in progress. */
  province: ProvinceId;
  units: Unit[];
  move: ArmyMove | null;
  supplied: boolean;
  /** Consecutive ticks spent out of supply. */
  unsuppliedTicks: number;
  /** How the army reached its current province (sea landings fight at a penalty). */
  arrivedVia: ConnectionKind | null;
  /** A routed army cannot take orders until this tick. */
  routedUntil: number;
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
  /** Civilian morale 0..100: drives output. */
  morale: number;
  tier: CityTier;
  /** Growth points towards the next city tier. */
  growth: number;
}

export interface RelationState {
  status: Relation;
  since: number;
  /** War cannot be declared again before this tick (set when peace is made). */
  truceUntil: number;
  /** No new peace offer to this nation before this tick (set when one is rejected or expires). */
  peaceOfferAfter?: number;
}

export interface ResearchJob {
  tech: TechId;
  /** Remaining work in ticks at research speed 1. */
  remaining: number;
  total: number;
}

export interface ResearchState {
  completed: TechId[];
  /** One job per research slot in use. */
  active: ResearchJob[];
  /** Starts automatically, in order, when a slot is free and the cost is affordable. */
  queue: TechId[];
}

export interface AiMemory {
  /** 0..1, how readily this AI starts wars and attacks. */
  aggression: number;
  /** 0..1, preference for economy over military spending. */
  economyBias: number;
  /** Research and recruitment emphasis. */
  doctrine: 'armour' | 'infantry' | 'artillery';
  nextThinkTick: number;
  /** Provinces currently being massed against (kept between thinks to avoid dithering). */
  campaigns: ProvinceId[];
  /** Neighbouring provinces this AI covets in this campaign, drawn from the seed (absent in older saves). */
  claims?: ProvinceId[];
  /** How it opens the campaign, drawn from the seed (absent in older saves, which open with 'strike'). */
  opening?: AiOpening;
}

/** strike: war as soon as it may; expand: neutral states first; build: a longer peace to build up. */
export type AiOpening = 'strike' | 'expand' | 'build';

export interface NationState {
  id: NationId;
  controller: 'human' | 'ai';
  resources: Resources;
  research: ResearchState;
  relations: Record<NationId, RelationState>;
  eliminated: boolean;
  /** True when an upkeep bill could not be paid in full this minute. */
  shortages: { money: boolean; fuel: boolean };
  /** Home-front morale 0..100 (population-weighted core province morale). */
  morale: number;
  ai: AiMemory | null;
  stats: { provincesCaptured: number; unitsLost: number; unitsDestroyed: number; armiesSurrendered: number };
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

export type AiDifficulty = 'easy' | 'normal';

export interface GameSettings {
  speed: 'standard' | 'slow';
  /** Multiplier applied to every duration (1 for Standard). */
  durationScale: number;
  timeLimitTicks: number;
  humanNation: NationId | null;
  /** How well the computer opponents play (absent in older saves, which play at normal). */
  difficulty?: AiDifficulty;
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
  /** Last formation number issued, keyed by `${owner}:${unitType}` or `${owner}:army`. */
  serials: Record<string, number>;
  peaceOffers: PeaceOffer[];
  battles: Record<ProvinceId, BattleState>;
  events: GameEvent[];
  nextEventId: number;
  victory: { leader: NationId | null; holdSince: number | null };
  outcome: GameOutcome | null;
}
