// Geometry source rules: which Natural Earth admin-1 units are merged into each
// game province shape. This file only controls *shapes*. Gameplay data
// (owner, terrain, cities, production) lives in src/sim/scenario/ and movement
// connections live in src/sim/scenario/europe/connections.ts.
//
// Matching: `country` is the Natural Earth `adm0_a3` code. A unit matches when
// its `region` is listed in `regions`, or its `name` is listed in `names`, or
// `whole: true` (every unit of that country, minus `exclude` names/regions).

export const PROVINCE_SOURCES = [
  // United Kingdom
  { id: 'uk-scotland', country: 'GBR', regions: ['Highlands and Islands', 'North Eastern', 'Eastern', 'South Western'] },
  { id: 'uk-north', country: 'GBR', regions: ['North East', 'North West', 'Yorkshire and the Humber'] },
  { id: 'uk-midlands', country: 'GBR', regions: ['West Midlands', 'East Midlands'] },
  { id: 'uk-west', country: 'GBR', regions: ['West Wales and the Valleys', 'East Wales', 'South West'] },
  { id: 'uk-london', country: 'GBR', regions: ['Greater London', 'South East', 'East'] },
  { id: 'uk-ulster', country: 'GBR', regions: ['Northern Ireland'] },

  // France (metropolitan only; overseas departments are outside the prototype)
  { id: 'fr-paris', country: 'FRA', regions: ['Île-de-France'] },
  { id: 'fr-nord', country: 'FRA', regions: ['Hauts-de-France'] },
  { id: 'fr-normandy', country: 'FRA', regions: ['Normandie'] },
  { id: 'fr-west', country: 'FRA', regions: ['Bretagne', 'Pays de la Loire'] },
  { id: 'fr-east', country: 'FRA', regions: ['Grand Est'] },
  { id: 'fr-centre', country: 'FRA', regions: ['Centre-Val de Loire', 'Bourgogne-Franche-Comté'] },
  { id: 'fr-rhone', country: 'FRA', regions: ['Auvergne-Rhône-Alpes'] },
  { id: 'fr-aquitaine', country: 'FRA', regions: ['Nouvelle-Aquitaine'] },
  { id: 'fr-midi', country: 'FRA', regions: ['Occitanie', "Provence-Alpes-Côte-d'Azur", 'Corse'] },

  // Germany (admin-1 units are the 16 Länder; matched by name)
  { id: 'de-berlin', country: 'DEU', names: ['Berlin', 'Brandenburg'] },
  { id: 'de-north', country: 'DEU', names: ['Schleswig-Holstein', 'Hamburg', 'Mecklenburg-Vorpommern'] },
  { id: 'de-lowersaxony', country: 'DEU', names: ['Niedersachsen', 'Bremen'] },
  { id: 'de-ruhr', country: 'DEU', names: ['Nordrhein-Westfalen'] },
  { id: 'de-saxony', country: 'DEU', names: ['Sachsen', 'Sachsen-Anhalt', 'Thüringen'] },
  { id: 'de-hesse', country: 'DEU', names: ['Hessen', 'Rheinland-Pfalz', 'Saarland'] },
  { id: 'de-baden', country: 'DEU', names: ['Baden-Württemberg'] },
  { id: 'de-bavaria', country: 'DEU', names: ['Bayern'] },

  // Italy
  { id: 'it-piedmont', country: 'ITA', regions: ['Piemonte', "Valle d'Aosta", 'Liguria'] },
  { id: 'it-lombardy', country: 'ITA', regions: ['Lombardia'] },
  { id: 'it-venetia', country: 'ITA', regions: ['Veneto', 'Friuli-Venezia Giulia', 'Trentino-Alto Adige'] },
  { id: 'it-tuscany', country: 'ITA', regions: ['Emilia-Romagna', 'Toscana'] },
  { id: 'it-rome', country: 'ITA', regions: ['Lazio', 'Umbria', 'Marche', 'Abruzzo', 'Molise'] },
  { id: 'it-naples', country: 'ITA', regions: ['Campania', 'Apulia', 'Basilicata', 'Calabria'] },
  { id: 'it-islands', country: 'ITA', regions: ['Sicily', 'Sardegna'] },

  // Spain (Canary Islands, Ceuta and Melilla are outside the prototype)
  { id: 'es-madrid', country: 'ESP', regions: ['Madrid', 'Castilla-La Mancha'] },
  { id: 'es-castile', country: 'ESP', regions: ['Castilla y León'] },
  { id: 'es-north', country: 'ESP', regions: ['País Vasco', 'Foral de Navarra', 'Cantabria', 'La Rioja'] },
  { id: 'es-galicia', country: 'ESP', regions: ['Galicia', 'Asturias'] },
  { id: 'es-catalonia', country: 'ESP', regions: ['Cataluña', 'Aragón', 'Islas Baleares'] },
  { id: 'es-valencia', country: 'ESP', regions: ['Valenciana', 'Murcia'] },
  { id: 'es-andalusia', country: 'ESP', regions: ['Andalucía', 'Extremadura'] },

  // Poland (admin-1 units are voivodeships; matched by name)
  { id: 'pl-warsaw', country: 'POL', names: ['Masovian', 'Łódź'] },
  { id: 'pl-pomerania', country: 'POL', names: ['Pomeranian', 'West Pomeranian', 'Kuyavian-Pomeranian'] },
  { id: 'pl-greater', country: 'POL', names: ['Greater Poland', 'Lubusz'] },
  { id: 'pl-silesia', country: 'POL', names: ['Silesian', 'Lower Silesian', 'Opole'] },
  { id: 'pl-lesser', country: 'POL', names: ['Lesser Poland', 'Subcarpathian', 'Świętokrzyskie'] },
  { id: 'pl-east', country: 'POL', names: ['Lublin', 'Podlachian', 'Warmian-Masurian'] },

  // Neutral minor states (one province each)
  { id: 'nt-benelux', country: 'BEL', whole: true },
  { id: 'nt-benelux', country: 'LUX', whole: true },
  { id: 'nt-netherlands', country: 'NLD', whole: true, exclude: ['Bonaire', 'Saba', 'St. Eustatius'] },
  { id: 'nt-switzerland', country: 'CHE', whole: true },
  { id: 'nt-austria', country: 'AUT', whole: true },
  { id: 'nt-czechia', country: 'CZE', whole: true },
  { id: 'nt-denmark', country: 'DNK', whole: true },
  { id: 'nt-portugal', country: 'PRT', whole: true, exclude: ['Madeira', 'Azores'] },
];
