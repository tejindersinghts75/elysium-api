export const metadata = {
  title: "You've been invited to Elysium",
  description:
    "Open your Elysium referral invitation and continue into the reservation funnel.",
};

function buildReferralPostSrc(searchParams = {}) {
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
  return `/referral/index.html${query ? `?${query}` : ""}`;
}

export default async function ReferralPostPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const referralSrc = buildReferralPostSrc(resolvedSearchParams);

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <iframe
        src={referralSrc}
        title="Elysium referral invitation"
        style={{
          display: "block",
          width: "100%",
          height: "100vh",
          border: 0,
        }}
      />
    </main>
  );
}
