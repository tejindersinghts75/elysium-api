import Script from "next/script";
import pageContent from "./page-markup.json";
import "./free-year1.css";

export const metadata = {
  title: "Win an Apartment - Elysium Communities",
  description:
    "Enter for a chance to live rent-free for one year in an Elysium microcity. Experiential real estate. Coming 2030.",
};

export default function FreeYearOnePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: pageContent.markup }} />
      <Script src="/free-year1.js" strategy="afterInteractive" />
    </>
  );
}
