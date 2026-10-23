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

  // Hungary (admin-1 units are counties and cities with county rights, grouped
  // by statistical region; the two northern Transdanubian regions form one
  // province so Budapest's neighbours are not crowded onto it)
  { id: 'hu-budapest', country: 'HUN', regions: ['Central Hungary'] },
  { id: 'hu-north', country: 'HUN', regions: ['Northern Hungary'] },
  { id: 'hu-east', country: 'HUN', regions: ['Northern Great Plain'] },
  { id: 'hu-south', country: 'HUN', regions: ['Great Southern Plain'] },
  { id: 'hu-west', country: 'HUN', regions: ['Western Transdanubia', 'Central Transdanubia'] },
  { id: 'hu-southwest', country: 'HUN', regions: ['Southern Transdanubia'] },

  // Romania (admin-1 units are counties; matched by name, grouped by historical region)
  { id: 'ro-bucharest', country: 'ROU', names: ['Bucharest', 'Ilfov', 'Prahova', 'Dâmbovita', 'Arges', 'Giurgiu', 'Teleorman', 'Calarasi', 'Ialomita'] },
  { id: 'ro-banat', country: 'ROU', names: ['Timis', 'Arad', 'Caras-Severin', 'Hunedoara', 'Dolj', 'Gorj', 'Mehedinti', 'Olt', 'Vâlcea'] },
  { id: 'ro-transylvania', country: 'ROU', names: ['Alba', 'Brasov', 'Covasna', 'Harghita', 'Mures', 'Sibiu', 'Bihor', 'Bistrita-Nasaud', 'Cluj', 'Maramures', 'Satu Mare', 'Salaj'] },
  { id: 'ro-moldavia', country: 'ROU', names: ['Bacau', 'Botosani', 'Iasi', 'Neamt', 'Suceava', 'Vaslui'] },
  { id: 'ro-dobruja', country: 'ROU', names: ['Braila', 'Buzau', 'Constanta', 'Galati', 'Tulcea', 'Vrancea'] },

  // Serbia (admin-1 units are districts; Kosovo is a separate country in Natural Earth)
  { id: 'rs-belgrade', country: 'SRB', names: ['Grad Beograd', 'Severno-Backi', 'Zapadno-Backi', 'Južno-Backi', 'Severno-Banatski', 'Srednje-Banatski', 'Južno-Banatski', 'Sremski'] },
  { id: 'rs-sumadija', country: 'SRB', names: ['Šumadijski', 'Kolubarski', 'Macvanski', 'Zlatiborski', 'Moravicki', 'Raški', 'Pomoravski'] },
  { id: 'rs-south', country: 'SRB', names: ['Podunavski', 'Branicevski', 'Borski', 'Zajecarski', 'Nišavski', 'Pirotski', 'Toplicki', 'Jablanicki', 'Pcinjski'] },

  // Minor powers of the Danube and the Adriatic
  { id: 'sk-bratislava', country: 'SVK', names: ['Bratislavský', 'Trnavský', 'Trenciansky', 'Nitriansky'] },
  { id: 'sk-kosice', country: 'SVK', names: ['Žilinský', 'Banskobystrický', 'Prešov', 'Košický'] },
  { id: 'si-ljubljana', country: 'SVN', whole: true },
  { id: 'hr-zagreb', country: 'HRV', names: ['Grad Zagreb', 'Zagrebacka', 'Krapinsko-Zagorska', 'Varaždinska', 'Medimurska', 'Koprivničko-Križevačka', 'Bjelovarsko-bilogorska', 'Viroviticko-Podravska', 'Osjecko-Baranjska', 'Vukovarsko-Srijemska', 'Brodsko-Posavska', 'Sisacko-Moslavacka', 'Karlovacka'] },
  { id: 'hr-dalmatia', country: 'HRV', names: ['Istarska', 'Primorsko-Goranska', 'Licko-Senjska', 'Zadarska', 'Šibensko-Kninska', 'Splitsko-Dalmatinska', 'Dubrovacko-Neretvanska'] },

  // Minor powers (one province each; Belgium and Luxembourg share one)
  { id: 'be-brussels', country: 'BEL', whole: true },
  { id: 'be-brussels', country: 'LUX', whole: true },
  { id: 'nl-amsterdam', country: 'NLD', whole: true, exclude: ['Bonaire', 'Saba', 'St. Eustatius'] },
  { id: 'ch-bern', country: 'CHE', whole: true },
  { id: 'at-vienna', country: 'AUT', whole: true },
  { id: 'cz-prague', country: 'CZE', whole: true },
  { id: 'dk-copenhagen', country: 'DNK', whole: true },
  { id: 'pt-lisbon', country: 'PRT', whole: true, exclude: ['Madeira', 'Azores'] },
];
