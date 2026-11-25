import { EbookDocument } from '../types/ebook';

export const SAMPLE_EBOOKS: EbookDocument[] = [
  {
    id: 'sample-abstract-form-cosmos',
    title: 'Abstract Form & Cosmic Order',
    author: 'Dr. Elara Vance',
    coverDataUrl: '/src/assets/images/cover_sample_atlas_1795396763258.jpg',
    totalPages: 6,
    createdAt: 1795300000000,
    lastOpenedAt: 1795350000000,
    currentPage: 1,
    paletteId: 'prismatic',
    pageVisualStyle: 'cartoon',
    isSample: true,
    chapters: [
      { title: 'Chapter 1: Geometry in Living Leaves', pageNumber: 1 },
      { title: 'Chapter 2: Refraction & Natural Prisms', pageNumber: 3 },
      { title: 'Chapter 3: Celestial Rhythms & Orbits', pageNumber: 5 },
    ],
    highlights: [
      {
        id: 'hl-sample-1',
        pageNumber: 1,
        text: 'Nature rarely draws in straight lines; instead, it folds light, water, and carbon into logarithmic spirals that maximize resilience.',
        color: 'amber',
        note: 'Core thesis of Chapter 1 — compare with Fibonacci phyllotaxis.',
        createdAt: 1795340000000,
      },
    ],
    bookmarks: [{ pageNumber: 3, label: 'Refraction & Natural Prisms', createdAt: 1795345000000 }],
    flashcards: [
      {
        id: 'fc-sample-1',
        pageNumber: 1,
        front: 'Why do botanical leaves follow the Golden Angle (137.5°)?',
        back: 'It optimizes sunlight capture so upper leaves never directly shade lower buds.',
        mastered: false,
        createdAt: 1795346000000,
      },
      {
        id: 'fc-sample-2',
        pageNumber: 3,
        front: 'How does structural colour differ from chemical pigment?',
        back: 'Structural colour scatters light using microscopic photonic lattices that never fade, unlike pigments which chemically absorb wavelengths.',
        mastered: false,
        createdAt: 1795347000000,
      },
    ],
    pages: [
      {
        pageNumber: 1,
        chapterTitle: 'Chapter 1: Geometry in Living Leaves',
        wordCount: 164,
        hasRichVisuals: false,
        rawText:
          'Chapter 1: Geometry in Living Leaves\n\nWalk through a botanical conservatory just after dawn and look closely at the unfurling fronds of a fern. Nature rarely draws in straight lines; instead, it folds light, water, and carbon into logarithmic spirals that maximize resilience.\n\nθ = 360° × (1 - 1 / φ) ≈ 137.5°\n\nEvery vein branching across a monstera leaf solves an engineering puzzle: how to transport nutrients from stem to tip with minimal energy loss while resisting wind shear.\n\n"Symmetry is not decoration in the living world—it is the visible signature of balanced forces."',
        blocks: [
          {
            id: 's1-p1-b0',
            type: 'heading',
            text: 'Chapter 1: Geometry in Living Leaves',
          },
          {
            id: 's1-p1-b1',
            type: 'paragraph',
            text: 'Walk through a botanical conservatory just after dawn and look closely at the unfurling fronds of a fern. Nature rarely draws in straight lines; instead, it folds light, water, and carbon into logarithmic spirals that maximize resilience.',
          },
          {
            id: 's1-p1-formula',
            type: 'formula',
            text: 'θ = 360° × (1 - 1 / φ) ≈ 137.5°  (Golden Angle Formula)',
          },
          {
            id: 's1-p1-b2',
            type: 'paragraph',
            text: 'Every vein branching across a monstera leaf solves an engineering puzzle: how to transport nutrients from stem to tip with minimal energy loss while resisting wind shear.',
          },
          {
            id: 's1-p1-b3',
            type: 'quote',
            text: 'Symmetry is not decoration in the living world—it is the visible signature of balanced forces.',
          },
          {
            id: 's1-p1-b4',
            type: 'subheading',
            text: 'Three Core Botanical Ratios',
          },
          {
            id: 's1-p1-b5',
            type: 'list-item',
            text: 'Golden Angle (137.5°): Optimizes sunlight capture so upper leaves never shade lower buds.',
          },
          {
            id: 's1-p1-b6',
            type: 'list-item',
            text: 'Murray’s Law Branching: Vessel radii cube-balance fluid pressure across microscopic capillaries (r₀³ = r₁³ + r₂³).',
          },
        ],
      },
      {
        pageNumber: 2,
        chapterTitle: 'Chapter 1: Geometry in Living Leaves',
        wordCount: 132,
        hasRichVisuals: false,
        rawText:
          'Cellular Tessellation\n\nBeneath a microscope, epidermal plant cells interlock like stained-glass mosaics. Hexagonal packing reduces total cell-wall material by nearly eighteen percent compared to square grids.\n\nWhen drought arrives, guard cells surrounding each stoma flex inward along curved cellulose microfibrils, sealing precious moisture inside the leaf within seconds.',
        blocks: [
          {
            id: 's1-p2-b0',
            type: 'subheading',
            text: 'Cellular Tessellation',
          },
          {
            id: 's1-p2-b1',
            type: 'paragraph',
            text: 'Beneath a microscope, epidermal plant cells interlock like stained-glass mosaics. Hexagonal packing reduces total cell-wall material by nearly eighteen percent compared to square grids.',
          },
          {
            id: 's1-p2-b2',
            type: 'paragraph',
            text: 'When drought arrives, guard cells surrounding each stoma flex inward along curved cellulose microfibrils, sealing precious moisture inside the leaf within seconds.',
          },
          {
            id: 's1-p2-b3',
            type: 'quote',
            text: 'Even a single drop of morning dew carries the geometry of surface tension—curving into a miniature lens that focuses sunlight onto chlorophyll.',
          },
        ],
      },
      {
        pageNumber: 3,
        chapterTitle: 'Chapter 2: Refraction & Natural Prisms',
        wordCount: 146,
        hasRichVisuals: false,
        rawText:
          'Chapter 2: Refraction & Natural Prisms\n\nColour is neither wholly inside an object nor solely inside the eye; it is a conversation conducted by wavelengths of electromagnetic energy.\n\nWhen white light crosses into glass or crystalline ice, shorter violet wavelengths slow down more sharply than longer crimson waves, fanning the beam into an unbroken spectrum.',
        blocks: [
          {
            id: 's1-p3-b0',
            type: 'heading',
            text: 'Chapter 2: Refraction & Natural Prisms',
          },
          {
            id: 's1-p3-b1',
            type: 'paragraph',
            text: 'Colour is neither wholly inside an object nor solely inside the eye; it is a conversation conducted by wavelengths of electromagnetic energy.',
          },
          {
            id: 's1-p3-b2',
            type: 'paragraph',
            text: 'When white light crosses into glass or crystalline ice, shorter violet wavelengths slow down more sharply than longer crimson waves, fanning the beam into an unbroken spectrum.',
          },
          {
            id: 's1-p3-b3',
            type: 'subheading',
            text: 'Structural Colour vs. Pigment',
          },
          {
            id: 's1-p3-b4',
            type: 'list-item',
            text: 'Pigments absorb select wavelengths chemically, fading over centuries of ultraviolet exposure.',
          },
          {
            id: 's1-p3-b5',
            type: 'list-item',
            text: 'Structural colours—such as Morpho butterfly wings and peacock feathers—scatter light using microscopic photonic lattices that never fade.',
          },
        ],
      },
      {
        pageNumber: 4,
        chapterTitle: 'Chapter 2: Refraction & Natural Prisms',
        wordCount: 118,
        hasRichVisuals: false,
        rawText:
          'Atmospheric Chromatics\n\nAt noon, nitrogen and oxygen molecules scatter short blue photons in every direction, painting the dome above us cobalt. At twilight, sunlight grazes a thicker slice of atmosphere, leaving amber, marigold, and deep coral tones to reach the horizon.',
        blocks: [
          {
            id: 's1-p4-b0',
            type: 'subheading',
            text: 'Atmospheric Chromatics',
          },
          {
            id: 's1-p4-b1',
            type: 'paragraph',
            text: 'At noon, nitrogen and oxygen molecules scatter short blue photons in every direction, painting the dome above us cobalt. At twilight, sunlight grazes a thicker slice of atmosphere, leaving amber, marigold, and deep coral tones to reach the horizon.',
          },
          {
            id: 's1-p4-b2',
            type: 'quote',
            text: 'Every sunset is a live demonstration of Rayleigh scattering written across two hundred miles of sky.',
          },
        ],
      },
      {
        pageNumber: 5,
        chapterTitle: 'Chapter 3: Celestial Rhythms & Orbits',
        wordCount: 140,
        hasRichVisuals: false,
        rawText:
          'Chapter 3: Celestial Rhythms & Orbits\n\nLong before telescopes, navigators traced elliptical arcs across desert skies and noticed that planets weave intricate geometric rosettes relative to Earth.\n\nKepler discovered that equal areas are swept in equal intervals—an invisible choreography linking orbital speed with solar distance.',
        blocks: [
          {
            id: 's1-p5-b0',
            type: 'heading',
            text: 'Chapter 3: Celestial Rhythms & Orbits',
          },
          {
            id: 's1-p5-b1',
            type: 'paragraph',
            text: 'Long before telescopes, navigators traced elliptical arcs across desert skies and noticed that planets weave intricate geometric rosettes relative to Earth.',
          },
          {
            id: 's1-p5-b2',
            type: 'paragraph',
            text: 'Kepler discovered that equal areas are swept in equal intervals—an invisible choreography linking orbital speed with solar distance.',
          },
        ],
      },
      {
        pageNumber: 6,
        chapterTitle: 'Chapter 3: Celestial Rhythms & Orbits',
        wordCount: 114,
        hasRichVisuals: false,
        rawText:
          'Resonance Across Scale\n\nFrom the five-fold symmetry of sea stars to the 3:2 orbital resonance of Neptune and Pluto, mathematics remains the quiet loom binding microscopic cells and spiral galaxies into one shared tapestry.',
        blocks: [
          {
            id: 's1-p6-b0',
            type: 'subheading',
            text: 'Resonance Across Scale',
          },
          {
            id: 's1-p6-b1',
            type: 'paragraph',
            text: 'From the five-fold symmetry of sea stars to the 3:2 orbital resonance of Neptune and Pluto, mathematics remains the quiet loom binding microscopic cells and spiral galaxies into one shared tapestry.',
          },
          {
            id: 's1-p6-b2',
            type: 'quote',
            text: 'To study form is to realize the universe prefers elegance over excess.',
          },
        ],
      },
    ],
  },
  {
    id: 'sample-horizons-chromatic-geometry',
    title: 'Horizons of Chromatic Design',
    author: 'Mateo Rivera',
    coverDataUrl: '/src/assets/images/cover_sample_cosmos_1795396763465.jpg',
    totalPages: 4,
    createdAt: 1795250000000,
    lastOpenedAt: 1795280000000,
    currentPage: 1,
    paletteId: 'marigold',
    isSample: true,
    chapters: [
      { title: 'Part I: Warmth, Contrast & Paper', pageNumber: 1 },
      { title: 'Part II: Rhythm in Editorial Grids', pageNumber: 3 },
    ],
    highlights: [],
    bookmarks: [],
    pages: [
      {
        pageNumber: 1,
        chapterTitle: 'Part I: Warmth, Contrast & Paper',
        wordCount: 130,
        hasRichVisuals: false,
        rawText:
          'Part I: Warmth, Contrast & Paper\n\nBlack ink on stark white paper was an industrial compromise, not an aesthetic ideal. Early illuminated manuscripts paired lapis lazuli, vermilion ochre, and burnished gold leaf to anchor human memory.\n\nWhen a reader encounters tinted parchment and deliberate typographic hierarchy, comprehension rises and visual fatigue recedes.',
        blocks: [
          {
            id: 's2-p1-b0',
            type: 'heading',
            text: 'Part I: Warmth, Contrast & Paper',
          },
          {
            id: 's2-p1-b1',
            type: 'paragraph',
            text: 'Black ink on stark white paper was an industrial compromise, not an aesthetic ideal. Early illuminated manuscripts paired lapis lazuli, vermilion ochre, and burnished gold leaf to anchor human memory.',
          },
          {
            id: 's2-p1-b2',
            type: 'paragraph',
            text: 'When a reader encounters tinted parchment and deliberate typographic hierarchy, comprehension rises and visual fatigue recedes.',
          },
        ],
      },
      {
        pageNumber: 2,
        chapterTitle: 'Part I: Warmth, Contrast & Paper',
        wordCount: 108,
        hasRichVisuals: false,
        rawText:
          'Chromatic Memory Anchors\n\nPsychologists have long observed that spatial and colour context improves recall. Assigning distinct chromatic moods to consecutive spreads helps readers mentally map where an argument appeared in a book.',
        blocks: [
          {
            id: 's2-p2-b0',
            type: 'subheading',
            text: 'Chromatic Memory Anchors',
          },
          {
            id: 's2-p2-b1',
            type: 'paragraph',
            text: 'Psychologists have long observed that spatial and colour context improves recall. Assigning distinct chromatic moods to consecutive spreads helps readers mentally map where an argument appeared in a book.',
          },
          {
            id: 's2-p2-b2',
            type: 'quote',
            text: 'Colour gives ideas a physical address inside memory.',
          },
        ],
      },
      {
        pageNumber: 3,
        chapterTitle: 'Part II: Rhythm in Editorial Grids',
        wordCount: 112,
        hasRichVisuals: false,
        rawText:
          'Part II: Rhythm in Editorial Grids\n\nA memorable book breathes through proportion. Generous outer margins frame the prose like a gallery mat, inviting annotations and quiet pauses between paragraphs.',
        blocks: [
          {
            id: 's2-p3-b0',
            type: 'heading',
            text: 'Part II: Rhythm in Editorial Grids',
          },
          {
            id: 's2-p3-b1',
            type: 'paragraph',
            text: 'A memorable book breathes through proportion. Generous outer margins frame the prose like a gallery mat, inviting annotations and quiet pauses between paragraphs.',
          },
        ],
      },
      {
        pageNumber: 4,
        chapterTitle: 'Part II: Rhythm in Editorial Grids',
        wordCount: 95,
        hasRichVisuals: false,
        rawText:
          'The Living Digital Page\n\nDigital books should not mimic sterile word processors. By uniting expressive serif typography, tactile paper hues, spoken narration, and interactive marginalia, every document becomes an edition worth revisiting.',
        blocks: [
          {
            id: 's2-p4-b0',
            type: 'subheading',
            text: 'The Living Digital Page',
          },
          {
            id: 's2-p4-b1',
            type: 'paragraph',
            text: 'Digital books should not mimic sterile word processors. By uniting expressive serif typography, tactile paper hues, spoken narration, and interactive marginalia, every document becomes an edition worth revisiting.',
          },
        ],
      },
    ],
  },
];
