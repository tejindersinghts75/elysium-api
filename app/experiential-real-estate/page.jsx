import Script from "next/script";
import pageContent from "./page-markup.json";
import "./experiential-real-estate.css";

const waitlistUrl = "https://join.elysiumcommunities.com/join-waitlist";

function removeFaq(markup, question) {
  const escapedQuestion = question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.replace(
    new RegExp(
      `\\n\\s*<div class="faq-item"[^>]*>\\s*<button class="faq-q"[^>]*>\\s*<span>${escapedQuestion}</span>[\\s\\S]*?<\\/div>\\s*<\\/div>`,
    ),
    "",
  );
}

const pageWithRemovedFaqs = [
  "What is a Junior Suite?",
  "Can I own my Junior Suite outright?",
  "How is this different from a regular apartment or condo?",
  "What does reserving mean — is there a deposit?",
].reduce((markup, question) => removeFaq(markup, question), pageContent.markup);

const pageMarkup = pageWithRemovedFaqs
  .replace(
    /[ \t]*<p class="hero-eyebrow"[^>]*>[\s\S]*?<\/p>\n/,
    "",
  )
  .replace(
    /[ \t]*<p class="intro-eyebrow"[^>]*>[\s\S]*?<\/p>\n/,
    "",
  )
  .replace(
    '<a href="https://www.elysiumcommunities.com/living-spaces-v2" class="nav-cta">Enter to Win</a>',
    `<a href="${waitlistUrl}" class="nav-cta js-join-waitlist">Join Waitlist</a>`,
  )
  .replace(
    '<a href="https://www.elysiumcommunities.com/pricing">Price</a>',
    '<a href="https://www.elysiumcommunities.com/pricing">Pricing</a>',
  )
  .replace(
    '<a href="#reserve" class="btn-black">Reserve a Junior Suite</a>',
    `<a href="${waitlistUrl}" class="btn-black js-join-waitlist">Join Waitlist</a>`,
  )
  .replace(
    '<a href="#reserve" class="btn-black">Reserve My Spot for a Junior Suite</a>',
    `<a href="${waitlistUrl}" class="btn-black js-join-waitlist">Join Waitlist</a>`,
  )
  .replace(
    '<span class="btn-txt">Reserve a Junior Suite</span>',
    '<span class="btn-txt">Join Waitlist</span>',
  )
  .replace(
    '<a href="#reserve" class="btn-white">Reserve a Junior Suite</a>',
    `<a href="${waitlistUrl}" class="btn-white js-join-waitlist">Join Waitlist</a>`,
  )
  .replace(
    "The Elysium Junior Suite · Starting at $130,000",
    "Elysium Communities",
  )
  .replace(
    "The Secret To<br />\n          Owning A<br />\n          <em>Beautiful Home</em><br />\n          For Less? Get In<br />\n          Before It's Built.",
    "Live In<br />\n          <em>Experiential</em><br />\n          Real Estate.<br />\n          Live Better,<br />\n          Together.",
  )
  .replace(
    "400 sqft of Mediterranean-inspired design inside a community built for human connection. Reserve your spot before they're gone.",
    "Community-focused lifestyle with dining, Teslas, wellness, and events all included.",
  )
  .replace("From $130,000", "$499/mo")
  .replace("400 sqft", "Dining Included")
  .replace("Mediterranean Design", "Wellness + Events")
  .replace("The Junior Suite", "The Membership")
  .replace(
    '$499 replaces<br />restaurants, car<br />payments, and<br />entertainment.',
    '$499 replaces<br />restaurants, car<br />payments, and<br />entertainment.',
  )
  .replace(
    "Starting at $130,000",
    "Award-Winning Mediterranean Design",
  )
  .replace(
    "Pre-construction pricing — the best time to buy is before it's built.",
    "Intentionally designed architecture for an experience that inspires.",
  )
  .replace(
    "400 sqft · Mediterranean Design",
    "2 Complimentary Meals Daily",
  )
  .replace(
    "Thoughtfully designed for beauty, flow, and intentional living.",
    "Restaurant-quality dining, on-site. Breakfast and dinner included in your monthly fee - every day.",
  )
  .replace(
    "2 Complimentary Meals Daily",
    "Shared Community Tesla",
  )
  .replace(
    "Restaurant-quality dining, on-site. Breakfast and dinner included in your monthly fee — every day.",
    "Daily access to the community fleet - 4 hours per person per day, with upgrade options available.",
  )
  .replace(
    "Shared Community Tesla · 4 hrs/day",
    "Shared Community Tesla",
  )
  .replace(
    /<img\s+src="[^"]+"\s+alt="Elysium Junior Suite floor plan"\s+class="how-floorplan-img"/,
    '<img src="/free-year1-hero.webp" alt="Elysium waterfront community viewed from a private balcony" class="how-floorplan-img"',
  )
  .replace(
    "Reserving through this form places you on the priority waitlist at the current published price. After submitting your reservation form, our team will contact you within 48 hours to walk you through the next steps, including any deposit requirements to fully secure your unit. There is no charge or commitment required to complete the reservation form itself — it simply holds your place in the queue at today's pricing.",
    "Reserving through this form places you on the priority waitlist at the current published price. After submitting your reservation form, our team will contact you when it's your time to secure a deposit and let you know about next steps. There is no charge or commitment required to complete the reservation form itself — it simply holds your place in the queue at today's pricing.",
  )
  .replace(
    "Traditional apartments give you four walls. Elysium gives you an entire ecosystem. The difference is in what surrounds you — an on-site farm, community restaurants, entertainment, wellness, nature, and a curated group of people who choose to live intentionally. The unit price ($130,000+) is significantly lower than comparable quality real estate in most markets, because Elysium's construction model, shared infrastructure, and community-driven economy allow us to pass those savings to owners. You're not just buying a home — you're buying into a way of life.",
    "Traditional apartments give you four walls. Elysium gives you an entire ecosystem. The difference is in what surrounds you — an on-site farm, community restaurants, entertainment, wellness, nature, and a curated group of people who choose to live intentionally. The unit price ($130,000+) is significantly lower than comparable quality real estate in most markets, because Elysium's construction model, shared infrastructure, and community-driven economy allow us to pass those savings to owners. You're not just buying a home. You're buying into the entire village.",
  )
  .replace(
    "<strong>Shared Community Tesla</strong>\n              <p>Restaurant-quality dining, on-site. Breakfast and dinner included in your monthly fee - every day.</p>",
    "<strong>2 Complimentary Meals Daily</strong>\n              <p>Restaurant-quality dining, on-site. Breakfast and dinner included in your monthly fee - every day.</p>",
  )
  .replace(
    "<strong>2 Complimentary Meals Daily</strong>\n              <p>Daily access to the community fleet - 4 hours per person per day, with upgrade options available.</p>",
    "<strong>Shared Community Tesla</strong>\n              <p>Daily access to the community fleet - 4 hours per person per day, with upgrade options available.</p>",
  )
  .replace(
    /[ \t]*<li>\n[ \t]*<span class="val-check">✓<\/span>\n[ \t]*<div>\n[ \t]*<strong>Shared Community Tesla<\/strong>\n[ \t]*<p>Daily access to the community fleet — 4 hours per person per day, with upgrade options available\.<\/p>\n[ \t]*<\/div>\n[ \t]*<\/li>\n/,
    "",
  )
  .replace(
    "How to reserve your spot<br class=\"br-d\" /> for an Elysium Junior Suite.",
    "How to reserve your spot in<br class=\"br-d\" /> Elysium.",
  )
  .replace(
    'Click any "Reserve a Junior Suite" button on this page to jump to the reservation form below.',
    'Click any "Join Waitlist" button on this page to jump to the reservation form below.',
  )
  .replace(
    "Hit Reserve and your spot is secured. Our team follows up within 48 hours with next steps.",
    "Hit Reserve and your spot is secured. Our team follows up within 48 hours with next steps.",
  )
  .replace("Junior Suite · 400 sqft", "Elysium Floor Plan")
  .replace(
    "Mediterranean Design · Pre-construction pricing from $130,000",
    "Award-Winning Mediterranean Design",
  )
  .replace(
    "Get on the<br />waitlist before<br />they're gone.",
    "Get on the waitlist<br />before they're gone.",
  )
  .replace(
    "Reserve your spot for an Elysium Junior Suite. Starting at $130,000, 400 sqft of Mediterranean-inspired design inside of a community built for human connection. Get on the waitlist before they're gone.",
    "Reserve your spot in Elysium - a community-focused lifestyle with dining, Teslas, wellness, and events all included. Get on the waitlist before they're gone.",
  )
  .replace(
    "The Elysium Junior Suite",
    "Elysium Communities",
  )
  .replace(
    "The Elysium Junior Suite",
    "Elysium Communities",
  )
  .replace(
    'From <strong>$130,000</strong> · 400 sqft',
    '<strong>$499/mo</strong> Community Membership',
  )
  .replace(
    "You're on the list.</h3>\n          <p>Your reservation request has been received. Our team will contact you within 48 hours to walk you through next steps.",
    "You're on the list.</h3>\n          <p>Your waitlist request has been received. Our team will contact you within 48 hours to walk you through next steps.",
  )
  .replace(
    "I just reserved my spot for an %40ElysiumOnX Junior Suite.+Starting+at+%24130%2C000+for+a+community+built+for+human+connection.",
    "I just joined the %40ElysiumOnX waitlist for experiential real estate with dining, wellness, Teslas, and events included.",
  )
  .replace(
    "I+just+reserved+my+spot+for+an+%40ElysiumOnX+Junior+Suite.+Starting+at+%24130%2C000+for+a+community+built+for+human+connection.",
    "I+just+joined+the+%40ElysiumOnX+waitlist+for+experiential+real+estate+with+dining%2C+wellness%2C+Teslas%2C+and+events+included.",
  )
  .replace(
    "All pricing, specifications, renderings, and timelines are subject to change without notice and do not constitute a binding offer or contract. The Elysium Junior Suite starting price of $130,000 reflects pre-construction pricing as of current publication and may increase as development milestones are achieved. Reservation of a unit through this form does not constitute a purchase agreement. Full purchase terms, financing options, and legal documentation will be provided upon qualification and execution of a formal purchase agreement.",
    "All pricing, specifications, renderings, and timelines are subject to change without notice and do not constitute a binding offer or contract. Reservation through this form does not constitute a purchase agreement or membership agreement. Full membership terms, pricing, and legal documentation will be provided upon qualification.",
  )
  .replace(
    "All pricing, specifications, renderings, and timelines are subject to change without notice and do not constitute a binding offer or contract. Elysium Communities starting price of $130,000 reflects pre-construction pricing as of current publication and may increase as development milestones are achieved. Reservation of a unit through this form does not constitute a purchase agreement. Full purchase terms, financing options, and legal documentation will be provided upon qualification and execution of a formal purchase agreement.",
    "All pricing, specifications, renderings, and timelines are subject to change without notice and do not constitute a binding offer or contract. Reservation through this form does not constitute a purchase agreement or membership agreement. Full membership terms, pricing, and legal documentation will be provided upon qualification.",
  )
  .replace(
    'href="https://www.elysiumcommunities.com/locations" class="faq-link"',
    'href="https://www.elysiumcommunities.com/location" class="faq-link"',
  )
  .replace(
    'src="https://www.youtube.com/embed/VMTye70QrFU?si=-sMzo-t2xUH5Enc5"',
    'src="https://www.youtube.com/embed/39clY-dYvcA"',
  )
  .replace(
    /<iframe width="560" height="315" src="https:\/\/www\.youtube\.com\/embed\/39clY-dYvcA" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen><\/iframe>/,
    `<button class="video-lite" type="button" data-youtube-src="https://www.youtube.com/embed/39clY-dYvcA?autoplay=1" aria-label="Play Elysium keynote video">
              <span class="video-lite-play">▶</span>
            </button>`,
  )
  .replace(/width=2560/g, "width=1200");

export const metadata = {
  title: "Elysium Communities - Live In Experiential Real Estate",
  description:
    "Community-focused lifestyle with dining, Teslas, wellness, and events all included. Join the Elysium waitlist.",
};

export default function ExperientialRealEstatePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: pageMarkup }} />
      <Script id="x-conversion-base" strategy="afterInteractive">
        {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','rcajc');`}
      </Script>
      <Script id="x-conversion-event" strategy="afterInteractive">
        {`twq('event', 'tw-rcajc-rcb3i', {});`}
      </Script>
      <Script id="contentsquare-uxa-loader" strategy="lazyOnload">
        {`window.requestIdleCallback ? requestIdleCallback(function(){var s=document.createElement('script');s.src='https://t.contentsquare.net/uxa/af824c2635d00.js';s.async=true;document.head.appendChild(s);},{timeout:4000}) : setTimeout(function(){var s=document.createElement('script');s.src='https://t.contentsquare.net/uxa/af824c2635d00.js';s.async=true;document.head.appendChild(s);},2500);`}
      </Script>
      <Script src="/experiential-real-estate.js" strategy="afterInteractive" />
    </>
  );
}
