import {
  getPageByLocaleAndKind,
  queries,
  resolveContactPageHeroImages,
} from 'gcss-sanity-queries';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const fallbackSrc = '/brand-assets/hero/contact/Hero-Contact-01.webp';
const sanityImageUrl = 'https://cdn.sanity.io/images/exampleproject/development/contact-hero.webp';

assert(
  queries.pageByLocaleAndKind.includes('"sanityImageUrl": image.asset->url'),
  'Sanity page query must project image.asset->url for the Contact Image CDN pilot.',
);

const contactPage = resolveContactPageHeroImages({
  kind: 'contact',
  pageHero: {
    slides: [
      {
        src: fallbackSrc,
        sanityImageUrl,
      },
    ],
  },
});

assert(
  contactPage.pageHero.slides[0].src === sanityImageUrl,
  'Contact page hero slides must prefer Sanity Image CDN URL when present.',
);

const aboutPage = resolveContactPageHeroImages({
  kind: 'about',
  pageHero: {
    slides: [
      {
        src: '/brand-assets/hero/about/Hero-About-01.webp',
        sanityImageUrl,
      },
    ],
  },
});

assert(
  aboutPage.pageHero.slides[0].src === sanityImageUrl,
  'All brand page hero slides must prefer Sanity Image CDN URL when present.',
);

const localSourcePage = resolveContactPageHeroImages({
  kind: 'about',
  pageHero: {
    slides: [
      {
        imageSource: 'local',
        src: '/brand-assets/hero/about/Hero-About-01.webp',
        sanityImageUrl,
      },
    ],
  },
});

assert(
  localSourcePage.pageHero.slides[0].src === '/brand-assets/hero/about/Hero-About-01.webp',
  'Content images must allow administrator fallback when imageSource is local.',
);

const fallbackContactPage = resolveContactPageHeroImages({
  kind: 'contact',
  pageHero: {
    slides: [
      {
        src: fallbackSrc,
      },
    ],
  },
});

assert(
  fallbackContactPage.pageHero.slides[0].src === fallbackSrc,
  'Contact page hero slides must keep local fallback src when Sanity image is not set.',
);

const fetchedPage = await getPageByLocaleAndKind({
  fetch: async () => ({
    locale: 'en',
    kind: 'contact',
    pageHero: {
      slides: [
        {
          src: fallbackSrc,
          sanityImageUrl,
        },
      ],
    },
  }),
}, 'en', 'contact');

assert(
  fetchedPage.pageHero.slides[0].src === sanityImageUrl,
  'getPageByLocaleAndKind must return Contact slides with resolved Sanity Image CDN src.',
);

console.log('Sanity Image CDN pilot OK: Contact hero uses Sanity image URL with local fallback.');
