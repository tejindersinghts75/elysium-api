import "../funnel-v3/page.css";

export const metadata = {
  title: "Elysium Options - Join Waitlist",
  description:
    "Join the Elysium waitlist and configure your living preferences.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function buildFunnelSrc(searchParams = {}) {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined) params.append(key, item);
      });
      return;
    }

    if (value !== undefined) params.set(key, value);
  });

  const query = params.toString();
  return `/funnel-v3-static/index.html${query ? `?${query}` : ""}`;
}

export default async function JoinWaitlistPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const funnelSrc = buildFunnelSrc(resolvedSearchParams);

  return (
    <main className="funnelV3Shell">
      <iframe
        className="funnelV3Frame"
        src={funnelSrc}
        title="Elysium reservation funnel"
      />
    </main>
  );
}
