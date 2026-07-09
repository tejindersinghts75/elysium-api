import Script from "next/script";
import pageContent from "./page-markup.json";
import "./jr-suite.css";

const waitlistUrl = "https://www.elysiumcommunities.com/?openFormModal=true";

const pageMarkup = pageContent.markup
  .replace(
    '<a href="https://www.elysiumcommunities.com/living-spaces-v2" class="nav-cta">Enter to Win</a>',
    `<a href="${waitlistUrl}" class="nav-cta js-join-waitlist">Join Waitlist</a>`,
  )
  .replace(
    '<a href="https://www.elysiumcommunities.com/pricing" class="nav-link">Pricing</a>',
    '',
  )
  .replace(
    '<a href="https://www.elysiumcommunities.com/pricing">Price</a>',
    '',
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
    '$499 replaces<br />restaurants, car<br />payments, and<br />entertainment.',
    '$499/mo membership<br />replaces restaurant,<br />car, and entertainment<br />costs.',
  )
  .replace(
    'Hit Reserve and your spot is secured. Our team follows up within 48 hours with next steps.',
    "Hit Reserve and your spot is saved. Our team follows up when it's your turn to secure a deposit.",
  )
  .replace(
    /<img\s+src="[^"]+"\s+alt="Elysium Junior Suite floor plan"\s+class="how-floorplan-img"/,
    '<img src="/free-year1-hero.webp" alt="Elysium waterfront community viewed from a private balcony" class="how-floorplan-img"',
  )
  .replace(
    'Elysium is a next-generation residential community — what we call an "experiential microcity." It combines luxury residential living with on-site agriculture, wellness infrastructure, entertainment venues, co-working spaces, and a community-driven economy. Think of it as a small city designed entirely around human well-being, where everything you need is within walking distance and your monthly living costs are dramatically lower than traditional city living.',
    "The Elysium Junior Suite is our flagship entry-level residential unit. Starting at $130,000, it offers 400 square feet of Mediterranean-inspired design — thoughtfully laid out for beauty, flow, and intentional living. Suites are privately owned and come with full access to all Elysium community amenities including agriculture, wellness facilities, eateries, and entertainment. It's the most efficient and affordable way to own an incredible property inside an Elysium community.",
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
    '<div class="trust-row"><span class="trust-check">✓</span> Our team follows up within 48 hours</div>',
    '',
  )
  .replace(
    'href="https://www.elysiumcommunities.com/locations" class="faq-link"',
    'href="https://www.elysiumcommunities.com/location" class="faq-link"',
  )
  .replace(
    'src="https://www.youtube.com/embed/VMTye70QrFU?si=-sMzo-t2xUH5Enc5"',
    'src="https://www.youtube.com/embed/39clY-dYvcA"',
  );

export const metadata = {
  title: "The Elysium Junior Suite - Reserve Yours",
  description:
    "Starting at $130,000. 400 sqft of Mediterranean-inspired design inside a community built for human connection.",
};

export default function JuniorSuitePage() {
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
      <Script
        id="contentsquare-uxa"
        src="https://t.contentsquare.net/uxa/af824c2635d00.js"
        strategy="afterInteractive"
      />
      <Script src="/jr-suite.js" strategy="afterInteractive" />
    </>
  );
}
