/**
 * The one place that says who this site is for.
 * Change these values to re-badge the whole site for another client:
 * names, wording, contact details and the "built by" credit all come from here.
 * (Colours live in client/global.css. Event data lives in the database.)
 */
export const BRAND = {
  /** Shown in the header, footer, browser tab and emails' subject lines where used. */
  name: "Tiketi",
  /** One line under the name on the home page. */
  tagline: "Tickets for the nights, films and shows worth leaving the house for.",
  /** The cinema that screens the movies (used on movie pages). */
  cinemaName: "Prestige Cinemas",
  /** Public contact details. */
  contactEmail: "hilistreaming.co@gmail.com",
  whatsappNumber: "254796429978", // digits only, with country code
  whatsappDisplay: "0796 429 978",
  instagramUrl: "https://www.instagram.com/madebyhili/?hl=en",
  /** Small credit in the footer. Set to null to remove it. */
  builtBy: { name: "Hili", url: "https://www.instagram.com/madebyhili/?hl=en" } as { name: string; url: string } | null,
};
