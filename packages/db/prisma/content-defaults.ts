/**
 * The public site's copy as it stood when the CMS arrived — the first state of
 * each ContentPage row. Keys match CONTENT_PAGES in @avida/types. Written only
 * where a key is missing; the admin owns every value afterwards (D-33).
 *
 * Roadmap item 26: this is now the ONLY place these words exist. The site's
 * components render nothing for an empty key, so a sentence that used to be a
 * code fallback lives here, once, as the first value the admin can change.
 *
 * Nothing here repeats business data: counts, areas and the handover date are
 * written as {tokens} (fillCopyTokens) and filled from live inventory.
 */
export const contentDefaults: Record<string, { title: string; content: Record<string, unknown> }> = {
  home: {
    title: 'Homepage',
    content: {
      heroKicker: 'Kimihurura · Kigali',
      heroTitle: 'Almasi Residences',
      heroSubtitle: 'Contemporary residences in the heart of Kimihurura.',
      ctaPrimaryLabel: 'Explore residences',
      ctaPrimaryHref: '/residences',
      ctaSecondaryLabel: 'Take the 3D tour',
      ctaSecondaryHref: '/tour',
      introTitle: 'One distinct address.',
      introBody:
        'Almasi is Swahili for diamond — stone, walnut and glass on a quiet rise in Kimihurura, with deep balconies and a whole floor of amenities.',
      residencesKicker: 'Residences',
      residencesTitle: '{types} ways|to live here.',
      storyTitle: 'The experience',
      amenitiesKicker: 'Amenities',
      amenitiesTitle: 'The art|of living',
      amenitiesLede:
        'Everything a resident uses every day is inside the gate, from the pool deck on level one to the parking bay below.',
      penthouseKicker: 'The penthouses',
      penthouseTitle: 'The top floor,|in {penthouse.countWords} residences.',
      penthouseLede: 'From {penthouse.areaMin} to {penthouse.areaMax} m², glazed on three sides above the treetops.',
      filmKicker: 'The film',
      filmTitle: 'Almasi, an architectural film',
      filmCta: 'Play the film',
      progressKicker: 'Construction',
      progressTitle: 'Rising in|Kimihurura.',
    },
  },
  about: {
    title: 'About the project',
    content: {
      developerTitle: 'The developer',
      developerBody: '',
      architectureTitle: 'The architecture',
      architectureBody:
        'Stone, walnut and glass, with deep balconies and wide corridors. Every residence is a corner or an end, so every home has light from more than one side.',
    },
  },
  residences: {
    title: 'Residences page',
    content: {
      heroKicker: 'Residences',
      heroTitle: 'Every residence',
      heroLede: '{available} of {total} residences are available today. Filter by type, floor, size, price and status.',
    },
  },
  amenities: {
    title: 'Amenities page',
    content: {
      heroKicker: 'Amenities',
      heroTitle: 'The art|of living',
      heroLede:
        'A pool, a gym, a sauna and a restaurant inside the gate — so the best part of the day never needs the car.',
    },
  },
  location: {
    title: 'Location page',
    content: {
      heroKicker: 'Location',
      heroTitle: 'Kimihurura,|Kigali',
      heroLede:
        'A green ridge east of the city centre: embassies and restaurants on one side, the golf course and the airport road on the other.',
    },
  },
  buying: {
    title: 'Buying guide',
    content: {
      heroKicker: 'Buying',
      heroTitle: 'Buying at|Almasi',
      heroLede:
        'Open to buyers in Rwanda and abroad, and paid in stages that follow the building as it rises.',
      processSteps: [
        { title: 'Choose', body: 'Find a residence in the explorer or with the sales team, who confirm that it is available.' },
        { title: 'Reserve', body: 'The sales team holds the residence for you while the agreement is prepared.' },
        { title: 'Sign', body: 'Sign the agreement and pay the first stage of the payment plan.' },
        { title: 'Build', body: 'The balance falls due as construction reaches each stage, not on fixed dates.' },
        { title: 'Move in', body: 'The final payment falls due on handover.' },
      ],
      reservationBody:
        'Choose your residence, confirm with the sales team that it is available, and sign the reservation agreement. The residence is held for you while the sale agreement is prepared.',
      foreignBuyersBody:
        'Foreign buyers may purchase property in Rwanda. The developer assists with the documentation.',
    },
  },
  gallery: {
    title: 'Gallery page',
    content: {
      heroKicker: 'Gallery',
      heroTitle: 'Stone, walnut,|evening light.',
      heroLede: 'The building, its residences and the spaces around them. Prefer it moving? The film runs under a minute.',
    },
  },
  progress: {
    title: 'Construction progress page',
    content: {
      heroKicker: 'Construction',
      heroTitle: 'Progress,|dated.',
      heroLede: 'Updates from the site as the building goes up, each one dated and recorded as it happened.',
      emptyText: 'Updates appear here from the start of construction, dated and photographed.',
    },
  },
  film: {
    title: 'Film page',
    content: {
      caption: 'A silent film of artist’s impressions and concept visuals.',
      downloadLabel: 'Download the film (MP4)',
    },
  },
  contact: {
    title: 'Contact and enquiry',
    content: {
      heroKicker: 'Contact',
      heroTitle: 'Enquire about|Almasi',
      heroLede: 'Ask about a residence, arrange a viewing or discuss a reservation. The sales team replies within one working day.',
      enquireTitle: 'Arrange a private viewing.',
      enquireBody:
        'Viewings are by appointment with the sales team. Tell us which residences interest you and when suits you, and we will reply within one working day.',
      responseTime: 'We reply within one working day.',
    },
  },
};
