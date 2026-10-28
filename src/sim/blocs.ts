// Blocs: equipment families shared by many nations. A nation names its bloc
// and inherits everything its armies need from it (named designs, formation
// and army names, and in the UI the look of its units); it overrides only
// what it wants to make its own. The original six override almost
// everything; a new country can override nothing.
//
// Blocs follow who armed whom between 1914 and 1942, so their designs are
// the ones a member state would plausibly field: Renault tanks and the
// French 75 in the west, Škoda guns and German armour in the centre, Russian
// and Soviet designs in the east.
import type { BlocDef, BlocId, NationIdentity, NationIdentityOverrides } from './types';

const n = (name: string, detail: string) => ({ name, detail });

const WESTERN: BlocDef = {
  id: 'western',
  name: 'Western pattern',
  description: 'Entente equipment as exported across Europe: Lebel and Berthier rifles, Hotchkiss guns, Renault tanks and the French 75.',
  identity: {
    units: {
      infantry: {
        ww1: n('Line Infantry', 'Lebel rifles, Hotchkiss machine guns'),
        interwar: n('Infantry Regiment', 'Berthier rifles, Chauchat light MGs'),
        ww2: n('Infantry Division', 'FM 24/29 light MGs, Brandt mortars'),
      },
      stormtroopers: {
        ww1: n('Grenadier Companies', 'Grenades, trench knives and Chauchats'),
        interwar: n('Shock Battalion', 'Raiding companies with light MGs'),
        ww2: n('Assault Pioneers', 'Submachine guns, charges and flamethrowers'),
      },
      mountain: {
        ww1: n('Mountain Chasseurs', 'Berets, alpenstocks and mules'),
        interwar: n('Mountain Battalion', 'Skis, mules and 65 mm pack guns'),
        ww2: n('Mountain Division', 'Ski scouts and pack howitzers'),
      },
      motorised: {
        interwar: n('Lorried Infantry', 'Laffly and Renault lorries'),
        ww2: n('Motorised Division', 'Lorraine carriers and lorries'),
      },
      cavalry: {
        ww1: n('Dragoons', 'Sabres, lances and carbines'),
        interwar: n('Cavalry Regiment', 'Mounted rifles'),
        ww2: n('Cavalry Brigade', 'Horsed dragoons with Hotchkiss MGs'),
      },
      armouredCar: {
        interwar: n('White Armoured Car', '37 mm gun and Hotchkiss MG'),
        ww2: n('Panhard AMD', '25 mm gun, four-wheel drive'),
      },
      artillery: {
        ww1: n('Canon de 75', 'The French 75, sold the world over'),
        interwar: n('75 mm Field Gun', 'The 75 on a modernised trail'),
        ww2: n('105 mm Schneider Howitzer', 'Field howitzer'),
      },
      heavyArtillery: {
        ww1: n('155 mm Rimailho', 'Schneider heavy howitzer'),
        interwar: n('155 mm GPF', 'Filloux long gun'),
        ww2: n('220 mm Schneider Mortar', 'Heavy siege mortar'),
      },
      antiTank: {
        interwar: n('25 mm Hotchkiss AT Gun', 'Light anti-tank gun'),
        ww2: n('47 mm APX AT Gun', 'High-velocity anti-tank gun'),
      },
      lightTank: {
        ww1: n('Renault FT', 'The first rotating turret'),
        interwar: n('Renault NC', 'The FT’s export successor'),
        ww2: n('Renault R35', '37 mm, cast hull'),
      },
      tank: {
        ww1: n('Schneider CA1', 'Short 75 mm in the hull'),
        interwar: n('Vickers 6-ton', 'The great export tank'),
        ww2: n('SOMUA S35', '47 mm, cast hull'),
      },
      heavyTank: {
        interwar: n('Char B1', '75 mm hull gun and 47 mm turret'),
        ww2: n('Matilda II', '2-pounder, 78 mm armour'),
      },
      tankDestroyer: { ww2: n('Laffly W15 TCC', '47 mm gun on a lorry chassis') },
    },
    army: '{ord} Army',
    formations: {
      infantry: '{ord} Infantry Division',
      stormtroopers: '{ord} Shock Battalion',
      mountain: '{ord} Mountain Battalion',
      motorised: '{ord} Motorised Division',
      cavalry: '{ord} Cavalry Regiment',
      armouredCar: '{ord} Reconnaissance Group',
      artillery: '{ord} Field Artillery Regiment',
      heavyArtillery: '{ord} Heavy Artillery Regiment',
      antiTank: '{ord} Anti-Tank Battery',
      lightTank: '{ord} Light Tank Battalion',
      tank: '{ord} Tank Battalion',
      heavyTank: '{ord} Heavy Tank Battalion',
      tankDestroyer: '{ord} Tank Destroyer Group',
    },
  },
};

const CENTRAL: BlocDef = {
  id: 'central',
  name: 'Central pattern',
  description: 'The Central Powers’ equipment and its heirs: Mannlicher and Mauser rifles, Schwarzlose guns, Škoda artillery and German armour.',
  identity: {
    units: {
      infantry: {
        ww1: n('Line Infantry', 'Mannlicher rifles, Schwarzlose machine guns'),
        interwar: n('Infantry Regiment', 'Mannlicher carbines, Schwarzlose MGs'),
        ww2: n('Infantry Division', 'Mauser carbines, MG 34s'),
      },
      stormtroopers: {
        ww1: n('Storm Battalion', 'Stick grenades, trench clubs and flamethrowers'),
        interwar: n('Assault Pioneers', 'Demolition charges and MP 28s'),
        ww2: n('Assault Engineers', 'Submachine guns and flamethrowers'),
      },
      mountain: {
        ww1: n('Mountain Rifles', 'Edelweiss badges and alpenstocks'),
        interwar: n('Mountain Brigade', 'Skis, mules and Škoda pack guns'),
        ww2: n('Mountain Division', 'Pack howitzers and ski battalions'),
      },
      motorised: {
        interwar: n('Lorried Rifles', 'Steyr and Büssing lorries'),
        ww2: n('Motorised Rifles', 'Half-tracks and lorries'),
      },
      cavalry: {
        ww1: n('Uhlans', 'Lances and czapka helmets'),
        interwar: n('Hussars', 'Light horse with sabres'),
        ww2: n('Cavalry Brigade', 'Horsed reconnaissance with MGs'),
      },
      armouredCar: {
        interwar: n('Steyr ADGZ', 'Eight wheels, 20 mm gun'),
        ww2: n('Sd.Kfz. 222', '20 mm gun, four-wheel drive'),
      },
      artillery: {
        ww1: n('8 cm Feldkanone M.5', 'Austro-Hungarian field gun'),
        interwar: n('10 cm Škoda Howitzer', 'Light field howitzer'),
        ww2: n('10.5 cm leFH 18', 'Light field howitzer'),
      },
      heavyArtillery: {
        ww1: n('30.5 cm Škoda Mortar', 'The siege mortar that broke the Belgian forts'),
        interwar: n('15 cm Škoda Howitzer', 'Heavy field howitzer'),
        ww2: n('21 cm Mörser', 'Heavy mortar'),
      },
      antiTank: {
        interwar: n('3.7 cm PaK', 'Rheinmetall anti-tank gun'),
        ww2: n('4.7 cm Škoda AT Gun', 'High-velocity anti-tank gun'),
      },
      lightTank: {
        ww1: n('LK II', 'Leichter Kampfwagen'),
        interwar: n('Landsverk L-60', 'Torsion bars, 20 mm gun'),
        ww2: n('Panzer 38(t)', '37 mm Škoda, Czech-built'),
      },
      tank: {
        ww1: n('A7V', '57 mm, eighteen crew'),
        interwar: n('Panzer IV Ausf. A', 'Short 75 mm support gun'),
        ww2: n('Panzer IV', 'Long 75 mm gun'),
      },
      heavyTank: {
        interwar: n('K-Wagen', '120 t breakthrough tank (project)'),
        ww2: n('Tiger', '88 mm, 100 mm armour'),
      },
      tankDestroyer: { ww2: n('Marder', '75 mm PaK on a tank chassis') },
    },
    army: '{ord} Army',
    formations: {
      infantry: '{ord} Infantry Division',
      stormtroopers: '{ord} Storm Battalion',
      mountain: '{ord} Mountain Brigade',
      motorised: '{ord} Motorised Brigade',
      cavalry: '{ord} Cavalry Regiment',
      armouredCar: '{ord} Reconnaissance Battalion',
      artillery: '{ord} Field Artillery Regiment',
      heavyArtillery: '{ord} Heavy Artillery Battalion',
      antiTank: '{ord} Anti-Tank Battalion',
      lightTank: '{ord} Light Tank Battalion',
      tank: '{ord} Armoured Regiment',
      heavyTank: '{ord} Heavy Tank Battalion',
      tankDestroyer: '{ord} Assault Gun Battalion',
    },
  },
};

const EASTERN: BlocDef = {
  id: 'eastern',
  name: 'Eastern pattern',
  description: 'Russian and Soviet equipment: Mosin rifles, Maxim guns, the Putilov three-inch and the T-26, BT and KV tanks.',
  identity: {
    units: {
      infantry: {
        ww1: n('Line Infantry', 'Mosin rifles, Maxim machine guns'),
        interwar: n('Rifle Regiment', 'Mosin rifles, DP light MGs'),
        ww2: n('Rifle Division', 'SVT-40 rifles, DP light MGs'),
      },
      stormtroopers: {
        ww1: n('Grenadier Detachment', 'Grenades, entrenching tools and Madsen guns'),
        interwar: n('Assault Engineers', 'Charges and Degtyaryov MGs'),
        ww2: n('Assault Engineer Brigade', 'PPSh SMGs, flamethrowers and body armour'),
      },
      mountain: {
        ww1: n('Caucasian Rifles', 'Mountain infantry of the Caucasus'),
        interwar: n('Mountain Rifles', 'Mules and 76 mm mountain guns'),
        ww2: n('Mountain Rifle Division', 'Pack guns and ski troops'),
      },
      motorised: {
        interwar: n('Motor Rifles', 'GAZ-AA lorries'),
        ww2: n('Motor Rifle Division', 'ZiS-5 lorries'),
      },
      cavalry: {
        ww1: n('Cossacks', 'Shashka sabres and lances'),
        interwar: n('Red Cavalry', 'Sabres and machine-gun carts'),
        ww2: n('Cavalry Corps', 'Horsed divisions with 45 mm guns'),
      },
      armouredCar: {
        interwar: n('BA-27', '37 mm gun on an AMO lorry'),
        ww2: n('BA-10', '45 mm gun, six wheels'),
      },
      artillery: {
        ww1: n('76 mm M1902', 'The Putilov three-inch field gun'),
        interwar: n('76 mm M1902/30', 'Modernised, longer barrel'),
        ww2: n('76 mm ZiS-3', 'Divisional gun'),
      },
      heavyArtillery: {
        ww1: n('152 mm M1909', 'Schneider-pattern siege howitzer'),
        interwar: n('122 mm A-19', 'Corps gun'),
        ww2: n('152 mm ML-20', 'Gun-howitzer'),
      },
      antiTank: {
        interwar: n('45 mm M1932', 'Anti-tank gun'),
        ww2: n('57 mm ZiS-2', 'High-velocity anti-tank gun'),
      },
      lightTank: {
        ww1: n('Russky Reno', 'Sormovo’s copy of the Renault FT'),
        interwar: n('T-26', '45 mm, licence-built Vickers'),
        ww2: n('BT-7', 'Fast tank on Christie suspension'),
      },
      tank: {
        ww1: n('Mark V', 'Captured British landships'),
        interwar: n('T-28', 'Three turrets, 76 mm'),
        ww2: n('T-34', '76 mm, sloped armour'),
      },
      heavyTank: {
        interwar: n('T-35', 'Five turrets, 76 mm'),
        ww2: n('KV-1', '76 mm, 75 mm armour'),
      },
      tankDestroyer: { ww2: n('SU-85', '85 mm on a T-34 chassis') },
    },
    army: '{ord} Army',
    formations: {
      infantry: '{ord} Rifle Division',
      stormtroopers: '{ord} Assault Engineer Battalion',
      mountain: '{ord} Mountain Rifle Division',
      motorised: '{ord} Motor Rifle Division',
      cavalry: '{ord} Cavalry Division',
      armouredCar: '{ord} Armoured Car Battalion',
      artillery: '{ord} Artillery Regiment',
      heavyArtillery: '{ord} Heavy Artillery Regiment',
      antiTank: '{ord} Anti-Tank Regiment',
      lightTank: '{ord} Light Tank Brigade',
      tank: '{ord} Tank Brigade',
      heavyTank: '{ord} Heavy Tank Regiment',
      tankDestroyer: '{ord} Self-Propelled Gun Regiment',
    },
  },
};

export const BLOCS: Record<BlocId, BlocDef> = { western: WESTERN, central: CENTRAL, eastern: EASTERN };

/** A nation's full identity: its bloc's, with the nation's own designs and names laid over it. */
export function nationIdentity(bloc: BlocId, own: NationIdentityOverrides = {}): NationIdentity {
  const base = BLOCS[bloc].identity;
  const units: NationIdentity['units'] = {};
  for (const type of new Set([...Object.keys(base.units), ...Object.keys(own.units ?? {})]) as Set<keyof NationIdentity['units']>) {
    units[type] = { ...base.units[type], ...own.units?.[type] };
  }
  return {
    units,
    formations: { ...base.formations, ...own.formations },
    army: own.army ?? base.army,
  };
}
