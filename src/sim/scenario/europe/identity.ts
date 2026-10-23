// National identity, laid over each nation's bloc (see src/sim/blocs.ts). The
// original six field their own named equipment and number their formations in
// their own language, so they override nearly everything; a newer nation
// overrides only a few signature designs, or nothing at all. Designs follow
// each nation's real 1914–1942 equipment where it existed; a few later or
// unbuilt projects fill gaps in this alternate history (marked "project").
import type { NationIdentityOverrides, NationSpeciality, UnitGen, UnitType } from '../../types';

type Names = Partial<Record<UnitType, Partial<Record<UnitGen, { name: string; detail: string }>>>>;
const n = (name: string, detail: string) => ({ name, detail });

const UK: Names = {
  infantry: {
    ww1: n('Tommies', 'Lee-Enfield SMLE rifles, Vickers machine guns'),
    interwar: n('Regular Infantry', 'SMLE Mk III rifles, Lewis guns'),
    ww2: n('Infantry Division', 'No. 4 rifles, Bren guns, 2-inch mortars'),
  },
  stormtroopers: {
    ww1: n('Trench Raiders', 'Mills bombs, Lewis guns, trench clubs'),
    interwar: n('Pioneer Assault Battalion', 'Bangalore torpedoes, Lewis guns'),
    ww2: n('Commandos', 'Thompson SMGs, Fairbairn–Sykes knives'),
  },
  mountain: {
    ww1: n('Highlanders', 'Kilted infantry from the hills'),
    interwar: n('Lovat Scouts', 'Highland stalkers and ghillies'),
    ww2: n('Mountain Division', 'Mules, ice axes and Bren guns'),
  },
  motorised: {
    interwar: n('Motor Battalion', 'Morris CDSW lorries'),
    ww2: n('Motor Brigade', 'Universal Carriers'),
  },
  cavalry: {
    ww1: n('Lancers', 'Lances, sabres and SMLE carbines'),
    interwar: n('Yeomanry', 'Mounted rifles'),
    ww2: n('Cavalry Brigade', 'Horsed regiments with Bren guns'),
  },
  armouredCar: {
    interwar: n('Rolls-Royce Armoured Car', '1920 pattern, Vickers MG turret'),
    ww2: n('Humber Armoured Car', '15 mm Besa, four-wheel drive'),
  },
  artillery: {
    ww1: n('QF 18-pounder', '84 mm field gun'),
    interwar: n('QF 18-pounder Mk IV', 'Split trail, longer range'),
    ww2: n('QF 25-pounder', '87.6 mm gun-howitzer'),
  },
  heavyArtillery: {
    ww1: n('BL 9.2-inch Howitzer', 'Siege howitzer, 13 t'),
    interwar: n('BL 6-inch 26 cwt', 'Heavy howitzer'),
    ww2: n('BL 5.5-inch Gun', 'Medium gun, 16 km range'),
  },
  antiTank: {
    interwar: n('Boys Anti-Tank Rifle', '.55-inch rifle teams'),
    ww2: n('QF 2-pounder', '40 mm anti-tank gun'),
  },
  lightTank: {
    ww1: n('Medium Mark A Whippet', 'Fast tank, four Hotchkiss MGs'),
    interwar: n('Vickers Light Tank Mk II', 'Two-man turret'),
    ww2: n('Light Tank Mk VI', '15 mm Besa, 56 km/h'),
  },
  tank: {
    ww1: n('Mark IV', 'Rhomboid landship, 6-pounder sponsons'),
    interwar: n('Vickers Medium Mk II', '3-pounder, sprung bogies'),
    ww2: n('Matilda II', '2-pounder, 78 mm armour'),
  },
  heavyTank: {
    interwar: n('A1E1 Independent', 'Five turrets, 3-pounder'),
    ww2: n('Churchill', '6-pounder, 102 mm armour'),
  },
  tankDestroyer: { ww2: n('Archer', '17-pounder on a Valentine chassis') },
};

const FR: Names = {
  infantry: {
    ww1: n('Poilus', 'Lebel rifles, Hotchkiss machine guns'),
    interwar: n("Régiment d'Infanterie", 'Berthier rifles, Chauchat light MGs'),
    ww2: n("Division d'Infanterie", 'MAS-36 rifles, FM 24/29'),
  },
  stormtroopers: {
    ww1: n('Nettoyeurs de tranchées', 'Grenades, knives, Chauchats'),
    interwar: n('Corps Francs', 'Raiding companies'),
    ww2: n('Groupes Francs', 'MAS-38 submachine guns'),
  },
  mountain: {
    ww1: n('Chasseurs Alpins', '"Les Diables Bleus" — berets and alpenstocks'),
    interwar: n('Chasseurs Alpins', 'Skis, mules and mountain guns'),
    ww2: n('Division Alpine', 'Ski scouts and 65 mm mountain guns'),
  },
  motorised: {
    interwar: n('Dragons Portés', 'Laffly lorries'),
    ww2: n('Division Légère Mécanique', 'Lorraine 37L carriers'),
  },
  cavalry: {
    ww1: n('Cuirassiers', 'Breastplates, plumed helmets, sabres'),
    interwar: n('Spahis', 'North African horsemen'),
    ww2: n('Division de Cavalerie', 'Mounted dragoons'),
  },
  armouredCar: {
    interwar: n('White-Laffly AMD', '37 mm gun and MG'),
    ww2: n('Panhard 178', '25 mm gun, four-wheel drive'),
  },
  artillery: {
    ww1: n('Canon de 75 mle 1897', 'The famous "soixante-quinze"'),
    interwar: n('75 mle 1897/33', 'Modernised on pneumatic tyres'),
    ww2: n('105 mm mle 1935 B', 'Bourges arsenal howitzer'),
  },
  heavyArtillery: {
    ww1: n('Mortier de 220 mm', 'Schneider siege mortar'),
    interwar: n('155 mm GPF', 'Filloux long gun'),
    ww2: n('280 mm Schneider', 'Super-heavy mortar'),
  },
  antiTank: {
    interwar: n('Canon de 25 mm SA 34', 'Hotchkiss light AT gun'),
    ww2: n('Canon de 47 mm SA 37', 'Puteaux AT gun'),
  },
  lightTank: {
    ww1: n('Renault FT', 'The first rotating turret'),
    interwar: n('Renault D1', '47 mm gun, cast turret'),
    ww2: n('Hotchkiss H39', '37 mm SA38'),
  },
  tank: {
    ww1: n('Schneider CA1', 'Short 75 mm in the hull'),
    interwar: n('Char D2', '47 mm, radio-equipped'),
    ww2: n('SOMUA S35', '47 mm, cast hull'),
  },
  heavyTank: {
    interwar: n('Char 2C', '69 t breakthrough giant'),
    ww2: n('Char B1 bis', '75 mm hull gun and 47 mm turret'),
  },
  tankDestroyer: { ww2: n('SAu 40', '75 mm on a SOMUA chassis') },
};

const DE: Names = {
  infantry: {
    ww1: n('Feldgrau Infantry', 'Gewehr 98 rifles, MG 08'),
    interwar: n('Reichsheer Infantry', 'Kar 98b carbines, MG 08/15'),
    ww2: n('Infanterie-Division', 'Kar 98k rifles, MG 34'),
  },
  stormtroopers: {
    ww1: n('Stoßtruppen', 'Stick grenades, MP 18, flamethrowers'),
    interwar: n('Sturmpioniere', 'Demolition charges and MP 28'),
    ww2: n('Sturmpioniere', 'MP 40, Flammenwerfer 35'),
  },
  mountain: {
    ww1: n('Alpenkorps', 'Bavarian mountain infantry'),
    interwar: n('Gebirgsjäger', 'Edelweiss on the cap'),
    ww2: n('Gebirgs-Division', 'Pack howitzers and skis'),
  },
  motorised: {
    interwar: n('Kraftfahr-Infanterie', 'Büssing-NAG lorries'),
    ww2: n('Panzergrenadiere', 'Sd.Kfz. 251 half-tracks'),
  },
  cavalry: {
    ww1: n('Ulanen', 'Lances and czapka helmets'),
    interwar: n('Reiter-Regiment', 'Mounted rifles'),
    ww2: n('Kavallerie-Division', 'Horsed reconnaissance'),
  },
  armouredCar: {
    interwar: n('Kfz. 13', 'Adler MG car'),
    ww2: n('Sd.Kfz. 231 (8-Rad)', '20 mm KwK, eight wheels'),
  },
  artillery: {
    ww1: n('7.7 cm FK 96 n.A.', 'Krupp field gun'),
    interwar: n('7.7 cm FK 16', 'Long-barrel field gun'),
    ww2: n('10.5 cm leFH 18', 'Light field howitzer'),
  },
  heavyArtillery: {
    ww1: n('Dicke Bertha', '42 cm Krupp siege howitzer'),
    interwar: n('15 cm sFH 18', 'Heavy field howitzer'),
    ww2: n('21 cm Mörser 18', 'Heavy mortar'),
  },
  antiTank: {
    interwar: n('3.7 cm PaK 36', 'Rheinmetall AT gun'),
    ww2: n('5 cm PaK 38', 'High-velocity AT gun'),
  },
  lightTank: {
    ww1: n('LK II', 'Leichter Kampfwagen'),
    interwar: n('Panzer I', 'Twin MG training tank'),
    ww2: n('Panzer II', '20 mm KwK 30'),
  },
  tank: {
    ww1: n('A7V Sturmpanzerwagen', '57 mm, eighteen crew'),
    interwar: n('Neubaufahrzeug', 'Multi-turret prototype'),
    ww2: n('Panzer III', '50 mm KwK, torsion bars'),
  },
  heavyTank: {
    interwar: n('Großtraktor', 'Secret Kama trials tank'),
    ww2: n('Tiger', '88 mm KwK 36 (project)'),
  },
  tankDestroyer: { ww2: n('StuG III', '75 mm StuK 37') },
};

const IT: Names = {
  infantry: {
    ww1: n('Fanti', 'Carcano M91 rifles, Fiat-Revelli MGs'),
    interwar: n('Fanteria', 'Carcano rifles, Breda 30 light MGs'),
    ww2: n('Divisione di Fanteria', 'Carcano M38, Breda M37'),
  },
  stormtroopers: {
    ww1: n('Arditi', 'Daggers, grenades and the Villar Perosa'),
    interwar: n('Arditi', 'Assault companies'),
    ww2: n('Guastatori', 'Beretta M38 SMGs, flamethrowers'),
  },
  mountain: {
    ww1: n('Alpini', 'The feathered hat of the Alps'),
    interwar: n('Alpini', 'Mule trains and mountain guns'),
    ww2: n('Divisione Alpina', 'Ski battalions, 75/13 pack guns'),
  },
  motorised: {
    interwar: n('Bersaglieri Motorizzati', 'Fiat lorries and motorcycles'),
    ww2: n('Bersaglieri Corazzati', 'SPA-Viberti carriers'),
  },
  cavalry: {
    ww1: n('Lancieri di Novara', 'Lance cavalry'),
    interwar: n('Cavalleggeri', 'Light horse'),
    ww2: n('Savoia Cavalleria', 'The last great charge'),
  },
  armouredCar: {
    interwar: n('Lancia 1ZM', 'Three MGs, tall turret'),
    ww2: n('Autoblinda AB 41', '20 mm Breda'),
  },
  artillery: {
    ww1: n('Cannone da 75/27', 'Deport field gun'),
    interwar: n('Obice da 75/18', 'Mountain-field howitzer'),
    ww2: n('Obice da 100/17', 'Skoda-pattern howitzer'),
  },
  heavyArtillery: {
    ww1: n('Obice da 305/17', 'Coastal siege howitzer'),
    interwar: n('Obice da 149/12', 'Heavy howitzer'),
    ww2: n('Obice da 210/22', 'Heavy howitzer'),
  },
  antiTank: {
    interwar: n('Cannone da 47/32', 'Böhler AT gun'),
    ww2: n('Cannone da 47/40', 'Improved 47 mm'),
  },
  lightTank: {
    ww1: n('Fiat 3000', 'Licensed Renault FT'),
    interwar: n('CV-33 Tankette', 'Two-man tankette'),
    ww2: n('L6/40', '20 mm Breda turret'),
  },
  tank: {
    ww1: n('Fiat 2000', '40 t, 65 mm turret'),
    interwar: n('Carro M11/39', '37 mm in the hull'),
    ww2: n('Carro M13/40', '47 mm, riveted hull'),
  },
  heavyTank: {
    interwar: n('Carro Pesante Fiat', 'Breakthrough tank (project)'),
    ww2: n('P26/40', '75 mm, 26 t'),
  },
  tankDestroyer: { ww2: n('Semovente 75/18', 'Assault howitzer') },
};

const ES: Names = {
  infantry: {
    ww1: n('Infantería de Línea', 'Spanish Mauser M1893, Hotchkiss MGs'),
    interwar: n('Regimiento de Infantería', 'Mauser rifles, Hotchkiss MGs'),
    ww2: n('División de Infantería', 'Mauser M43, FAO light MGs'),
  },
  stormtroopers: {
    ww1: n('Cazadores', 'Light assault battalions'),
    interwar: n('La Legión', 'Legionaries of the Tercio'),
    ww2: n('Banderas de la Legión', 'Star Z-45 SMGs'),
  },
  mountain: {
    ww1: n('Cazadores de Montaña', 'Pyrenean light infantry'),
    interwar: n('Tropas de Montaña', 'Skis and mules'),
    ww2: n('División de Montaña', 'Pyrenean guard'),
  },
  motorised: {
    interwar: n('Infantería Motorizada', 'Hispano-Suiza lorries'),
    ww2: n('Infantería Mecanizada', 'Half-track companies (project)'),
  },
  cavalry: {
    ww1: n('Húsares de Pavía', 'Hussars with sabres'),
    interwar: n('Cazadores de Caballería', 'Mounted rifles'),
    ww2: n('División de Caballería', 'Horsed dragoons'),
  },
  armouredCar: {
    interwar: n('Blindado Bilbao', '1932 Hotchkiss MG car'),
    ww2: n('Autoametralladora UNL-35', 'Twin MGs, Valencia-built'),
  },
  artillery: {
    ww1: n('Cañón Schneider 75 mm', 'Field gun'),
    interwar: n('Obús 105/11', 'Vickers-Placencia howitzer'),
    ww2: n('Obús 105/26', 'Field howitzer'),
  },
  heavyArtillery: {
    ww1: n('Obús de 305 mm', 'Trubia siege howitzer'),
    interwar: n('Obús Vickers 155/13', 'Heavy howitzer'),
    ww2: n('Obús 155/13', 'Modernised heavy howitzer'),
  },
  antiTank: {
    interwar: n('Cañón 37 mm', 'Rheinmetall AT gun'),
    ww2: n('Cañón 45 mm', 'High-velocity AT gun'),
  },
  lightTank: {
    ww1: n('Renault FT', 'Spanish Army FT-17'),
    interwar: n('Trubia A4', 'Spanish-built light tank'),
    ww2: n('Verdeja 1', '45 mm, Spanish design'),
  },
  tank: {
    ww1: n('Schneider CA1', 'Ex-French landship'),
    interwar: n('T-26B (licence)', '45 mm, licence-built'),
    ww2: n('Verdeja 2', '75 mm (project)'),
  },
  heavyTank: {
    interwar: n('Carro Pesado Trubia', 'Multi-turret giant (project)'),
    ww2: n('Carro Pesado Verdeja', '88 mm (project)'),
  },
  tankDestroyer: { ww2: n('Cazacarros Verdeja 75', 'Casemate gun (project)') },
};

const PL: Names = {
  infantry: {
    ww1: n('Legiony Polskie', 'Mannlicher M95 rifles, Schwarzlose MGs'),
    interwar: n('Piechota', 'Mauser wz. 98 rifles, Browning wz. 28'),
    ww2: n('Dywizja Piechoty', 'Kbk wz. 29 rifles, RKM wz. 28'),
  },
  stormtroopers: {
    ww1: n('Szturmowcy', 'Assault detachments of the Legions'),
    interwar: n('Saperzy Szturmowi', 'Assault engineers'),
    ww2: n('Saperzy Szturmowi', 'Mors SMGs and charges'),
  },
  mountain: {
    ww1: n('Strzelcy Podhalańscy', 'Highland rifles in feathered hats'),
    interwar: n('Strzelcy Podhalańscy', 'Carpathian riflemen'),
    ww2: n('Brygada Górska', 'Mountain brigade'),
  },
  motorised: {
    interwar: n('Strzelcy Zmotoryzowani', 'Ursus lorries'),
    ww2: n('Czarna Brygada', 'The "Black Brigade" — C7P tractors'),
  },
  cavalry: {
    ww1: n('Ułani', 'Lances with red-white pennants'),
    interwar: n('Ułani', 'Lancers of the Second Republic'),
    ww2: n('Brygada Kawalerii', 'Horsed brigade with Bofors AT guns'),
  },
  armouredCar: {
    interwar: n('Samochód pancerny wz. 29', 'Ursus armoured car'),
    ww2: n('Samochód pancerny wz. 34', 'Citroën-based car'),
  },
  artillery: {
    ww1: n('75 mm wz. 1897', 'French-pattern field gun'),
    interwar: n('75 mm wz. 02/26', 'Re-bored field gun'),
    ww2: n('100 mm wz. 14/19', 'Skoda howitzer'),
  },
  heavyArtillery: {
    ww1: n('220 mm Škoda', 'Siege mortar'),
    interwar: n('155 mm wz. 17', 'Schneider heavy howitzer'),
    ww2: n('220 mm Škoda wz. 32', 'Heavy mortar'),
  },
  antiTank: {
    interwar: n('Karabin ppanc wz. 35', 'The secret "Ur" anti-tank rifle'),
    ww2: n('Armata ppanc wz. 36', '37 mm Bofors'),
  },
  lightTank: {
    ww1: n('Renault FT', 'Polish 1st Tank Regiment'),
    interwar: n('TKS Tankette', '20 mm FK-A gun'),
    ww2: n('7TP', '37 mm Bofors, diesel engine'),
  },
  tank: {
    ww1: n('Saint-Chamond', 'Ex-French landship'),
    interwar: n('Vickers 6-ton', 'Twin-turret export tank'),
    ww2: n('10TP', 'Fast tank, 37 mm (project)'),
  },
  heavyTank: {
    interwar: n('20TP', '20-ton breakthrough tank (project)'),
    ww2: n('25TP', '75 mm breakthrough tank (project)'),
  },
  tankDestroyer: { ww2: n('TKD Niszczyciel', '47 mm self-propelled gun') },
};

// Hungary takes the Central bloc's equipment and names, apart from its hussars
// and the armour it built for itself.
const HU: Names = {
  cavalry: {
    ww1: n('Honvéd Hussars', 'Sabres, carbines and the frogged dolman'),
    interwar: n('Huszárok', 'Light horse of the Honvédség'),
    ww2: n('Hussar Division', 'Horsed brigades with Toldi tanks'),
  },
  armouredCar: { ww2: n('Csaba', '20 mm gun, four-wheel drive') },
  lightTank: { ww2: n('Toldi', 'Licence-built L-60, 20 mm gun') },
  tank: { ww2: n('Turán', '40 mm, on a Škoda design') },
  heavyTank: { ww2: n('Tas', '75 mm breakthrough tank (project)') },
  tankDestroyer: { ww2: n('Zrínyi', 'Assault gun on the Turán chassis') },
};

export const IDENTITIES: Record<string, NationIdentityOverrides> = {
  uk: {
    units: UK,
    army: '{ord} Army',
    formations: {
      infantry: '{ord} Infantry Division',
      stormtroopers: '{ord} Assault Brigade',
      mountain: '{ord} Mountain Brigade',
      motorised: '{ord} Motor Brigade',
      cavalry: '{ord} Cavalry Brigade',
      armouredCar: '{ord} Armoured Car Regiment',
      artillery: '{ord} Field Regiment, RA',
      heavyArtillery: '{ord} Heavy Regiment, RA',
      antiTank: '{ord} Anti-Tank Regiment, RA',
      lightTank: '{ord} Light Tank Battalion',
      tank: '{ord} Royal Tank Regiment',
      heavyTank: '{ord} Heavy Tank Battalion',
      tankDestroyer: '{ord} Tank Destroyer Regiment',
    },
  },
  fr: {
    units: FR,
    army: '{fr-f} Armée',
    formations: {
      infantry: "{fr-f} Division d'Infanterie",
      stormtroopers: '{fr-m} Corps Franc',
      mountain: '{fr-m} Bataillon de Chasseurs Alpins',
      motorised: "{fr-f} Division d'Infanterie Motorisée",
      cavalry: '{fr-f} Division de Cavalerie',
      armouredCar: '{fr-m} Groupe de Reconnaissance',
      artillery: "{fr-m} Régiment d'Artillerie",
      heavyArtillery: "{fr-m} Régiment d'Artillerie Lourde",
      antiTank: '{fr-f} Batterie Antichar',
      lightTank: '{fr-m} Bataillon de Chars Légers',
      tank: '{fr-m} Bataillon de Chars de Combat',
      heavyTank: '{fr-m} Bataillon de Chars Lourds',
      tankDestroyer: '{fr-m} Groupe Autonome Antichar',
    },
  },
  de: {
    units: DE,
    army: '{n}. Armee',
    formations: {
      infantry: '{n}. Infanterie-Division',
      stormtroopers: '{n}. Sturm-Bataillon',
      mountain: '{n}. Gebirgs-Division',
      motorised: '{n}. Infanterie-Division (mot.)',
      cavalry: '{n}. Kavallerie-Division',
      armouredCar: '{n}. Aufklärungs-Abteilung',
      artillery: '{n}. Artillerie-Regiment',
      heavyArtillery: '{n}. Schwere Artillerie-Abteilung',
      antiTank: '{n}. Panzerjäger-Abteilung',
      lightTank: '{n}. Leichte Panzer-Abteilung',
      tank: '{n}. Panzer-Regiment',
      heavyTank: '{n}. Schwere Panzer-Abteilung',
      tankDestroyer: '{n}. Sturmgeschütz-Abteilung',
    },
  },
  it: {
    units: IT,
    army: '{n}ª Armata',
    formations: {
      infantry: '{n}ª Divisione di Fanteria',
      stormtroopers: "{n}º Reparto d'Assalto",
      mountain: '{n}º Reggimento Alpini',
      motorised: '{n}ª Divisione Motorizzata',
      cavalry: '{n}º Reggimento di Cavalleria',
      armouredCar: '{n}º Gruppo Autoblindo',
      artillery: '{n}º Reggimento Artiglieria',
      heavyArtillery: '{n}º Raggruppamento Artiglieria Pesante',
      antiTank: '{n}º Battaglione Controcarro',
      lightTank: '{n}º Battaglione Carri Leggeri',
      tank: '{n}º Reggimento Carristi',
      heavyTank: '{n}º Battaglione Carri Pesanti',
      tankDestroyer: '{n}º Gruppo Semoventi',
    },
  },
  es: {
    units: ES,
    army: '{n}.º Ejército',
    formations: {
      infantry: '{n}.ª División de Infantería',
      stormtroopers: '{n}.ª Bandera de la Legión',
      mountain: '{n}.ª Brigada de Montaña',
      motorised: '{n}.ª División Motorizada',
      cavalry: '{n}.ª División de Caballería',
      armouredCar: '{n}.º Escuadrón de Autoametralladoras',
      artillery: '{n}.º Regimiento de Artillería',
      heavyArtillery: '{n}.º Regimiento de Artillería Pesada',
      antiTank: '{n}.º Grupo Antitanque',
      lightTank: '{n}.º Batallón de Carros Ligeros',
      tank: '{n}.º Regimiento de Carros de Combate',
      heavyTank: '{n}.º Batallón de Carros Pesados',
      tankDestroyer: '{n}.º Grupo de Cazacarros',
    },
  },
  pl: {
    units: PL,
    army: '{n}. Armia',
    formations: {
      infantry: '{n}. Dywizja Piechoty',
      stormtroopers: '{n}. Batalion Szturmowy',
      mountain: '{n}. Brygada Górska',
      motorised: '{n}. Brygada Zmotoryzowana',
      cavalry: '{n}. Brygada Kawalerii',
      armouredCar: '{n}. Dywizjon Samochodów Pancernych',
      artillery: '{n}. Pułk Artylerii Lekkiej',
      heavyArtillery: '{n}. Pułk Artylerii Ciężkiej',
      antiTank: '{n}. Dywizjon Przeciwpancerny',
      lightTank: '{n}. Batalion Czołgów Lekkich',
      tank: '{n}. Batalion Pancerny',
      heavyTank: '{n}. Batalion Czołgów Ciężkich',
      tankDestroyer: '{n}. Dywizjon Niszczycieli Czołgów',
    },
  },
  hu: { units: HU, formations: { cavalry: '{ord} Hussar Regiment' } },
};

// Each nation has one small, flavourful edge. They are deliberately modest so
// the starting balance holds.
export const SPECIALITIES: Record<string, NationSpeciality | undefined> = {
  uk: {
    name: 'Combined Operations',
    description: 'An island nation that knows the sea: no penalty for attacking straight off a sea crossing.',
    effects: [{ kind: 'amphibious', mult: 0 }],
  },
  fr: {
    name: 'Ligne Maginot',
    description: 'Masters of the fortified frontier: fortifications are 30% more effective and 20% cheaper.',
    effects: [
      { kind: 'fortification', mult: 1.3 },
      { kind: 'constructionCost', mult: 0.8, building: 'fortifications' },
    ],
  },
  de: {
    name: 'Bewegungskrieg',
    description: 'War of movement: armour and motorised units are 10% faster and break morale 15% harder.',
    effects: [
      { kind: 'unitStat', units: ['lightTank', 'tank', 'heavyTank', 'tankDestroyer', 'motorised', 'armouredCar'], stat: 'speed', mult: 1.1 },
      { kind: 'unitStat', units: ['lightTank', 'tank', 'heavyTank', 'tankDestroyer', 'motorised', 'armouredCar'], stat: 'shock', mult: 1.15 },
    ],
  },
  it: {
    name: 'Alpini',
    description: 'The finest mountain soldiers in Europe: mountain troops +20% attack and defence, and cost 20% less money.',
    effects: [
      { kind: 'unitStat', units: ['mountain'], stat: 'attack', mult: 1.2 },
      { kind: 'unitStat', units: ['mountain'], stat: 'defence', mult: 1.2 },
      { kind: 'recruitCost', resource: 'money', mult: 0.8, units: ['mountain'] },
    ],
  },
  es: {
    name: 'La Legión',
    description: 'Novios de la muerte: assault infantry +20% morale resilience and +10% attack, and are always raised as Regulars.',
    effects: [
      { kind: 'unitStat', units: ['stormtroopers'], stat: 'resilience', mult: 1.2 },
      { kind: 'unitStat', units: ['stormtroopers'], stat: 'attack', mult: 1.1 },
      { kind: 'startXp', units: ['stormtroopers'], xp: 1 },
    ],
  },
  pl: {
    name: 'Ułani',
    description: 'The last great cavalry: cavalry +25% attack, +10% speed and +15% morale resilience.',
    effects: [
      { kind: 'unitStat', units: ['cavalry'], stat: 'attack', mult: 1.25 },
      { kind: 'unitStat', units: ['cavalry'], stat: 'speed', mult: 1.1 },
      { kind: 'unitStat', units: ['cavalry'], stat: 'resilience', mult: 1.15 },
    ],
  },
  ro: {
    name: 'Ploiești',
    description: "Europe's own oil field: refineries produce 25% more fuel and cost 20% less to build.",
    effects: [
      { kind: 'refinery', mult: 1.25 },
      { kind: 'constructionCost', mult: 0.8, building: 'refinery' },
    ],
  },
  rs: {
    name: 'Kolubara',
    description: 'The army that would not break: infantry +15% morale resilience and +10% defence.',
    effects: [
      { kind: 'unitStat', units: ['infantry'], stat: 'resilience', mult: 1.15 },
      { kind: 'unitStat', units: ['infantry'], stat: 'defence', mult: 1.1 },
    ],
  },
  hu: {
    name: 'Huszárok',
    description: 'The original hussars: cavalry and armoured cars +15% attack and 10% faster, and cavalry are always raised as Regulars.',
    effects: [
      { kind: 'unitStat', units: ['cavalry', 'armouredCar'], stat: 'attack', mult: 1.15 },
      { kind: 'unitStat', units: ['cavalry', 'armouredCar'], stat: 'speed', mult: 1.1 },
      { kind: 'startXp', units: ['cavalry'], xp: 1 },
    ],
  },
};
