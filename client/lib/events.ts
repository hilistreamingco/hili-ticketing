export interface EventTheme {
  mode: "light" | "dark";
  primary: string;
  background: string;
  foreground: string;
  card: string;
  radius: string;
}

export interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  quantityTotal: number;
  quantitySold: number;
  maxPerOrder: number;
}

export interface Organizer {
  name: string;
  avatar: string;
}

export interface HiliEvent {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  coverImage: string;
  logoText: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  city: string;
  address: string;
  mapUrl: string;
  organizer: Organizer;
  ageRestriction: string;
  policies: string[];
  theme: EventTheme;
  ticketTypes: TicketType[];
  featured?: boolean;
  popular?: boolean;
  attendeeCount: number;
}

export const categories = [
  "Nightlife",
  "Music",
  "Business",
  "Festival",
  "Comedy",
  "Food & Drink",
] as const;

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export const events: HiliEvent[] = [
  {
    id: "1",
    slug: "hili-summer-fest",
    title: "Hili Summer Fest",
    shortDescription: "Kenya's biggest open-air music & culture festival.",
    description:
      "Three stages, world-class DJs, local legends, food trucks, and art installations. Hili Summer Fest returns to Uhuru Gardens for a full day of music, colour, and community. Bring your dancing shoes and your best festival fit.",
    category: "Festival",
    coverImage: img("photo-1470225620780-dba8ba36b745"),
    logoText: "SUMMER FEST",
    date: "2025-12-20",
    startTime: "12:00",
    endTime: "23:00",
    venue: "Uhuru Gardens",
    city: "Nairobi",
    address: "Langata Rd, Nairobi",
    mapUrl: "https://maps.google.com/?q=Uhuru+Gardens+Nairobi",
    organizer: { name: "Hili Live", avatar: img("photo-1633332755192-727a05c4013d") },
    ageRestriction: "18+",
    policies: ["No re-entry", "No outside food or drinks", "ID required at gate"],
    theme: {
      mode: "light",
      primary: "24 95% 55%",
      background: "35 90% 97%",
      foreground: "20 40% 12%",
      card: "0 0% 100%",
      radius: "1.5rem",
    },
    ticketTypes: [
      { id: "t1", name: "Early Bird", description: "Limited early access tickets.", price: 1500, quantityTotal: 100, quantitySold: 92, maxPerOrder: 4 },
      { id: "t2", name: "Regular", description: "General festival entry.", price: 2000, quantityTotal: 500, quantitySold: 210, maxPerOrder: 6 },
      { id: "t3", name: "VIP", description: "Fast lane entry + VIP lounge access.", price: 5000, quantityTotal: 100, quantitySold: 40, maxPerOrder: 4 },
    ],
    featured: true,
    popular: true,
    attendeeCount: 342,
  },
  {
    id: "2",
    slug: "midnight-noir",
    title: "Midnight Noir",
    shortDescription: "An exclusive black & red nightclub experience.",
    description:
      "Step into Midnight Noir — an immersive nightlife experience with resident DJs, moody visuals, and a strictly curated guest list. Tables are limited. Dress code: all black.",
    category: "Nightlife",
    coverImage: img("photo-1516450360452-9312f5e86fc7"),
    logoText: "MIDNIGHT NOIR",
    date: "2025-12-06",
    startTime: "21:00",
    endTime: "04:00",
    venue: "The Vault Club",
    city: "Nairobi",
    address: "Westlands, Nairobi",
    mapUrl: "https://maps.google.com/?q=Westlands+Nairobi",
    organizer: { name: "Noir Collective", avatar: img("photo-1541534741688-6078c6bfb5c5") },
    ageRestriction: "21+",
    policies: ["Strict dress code: all black", "No entry after 1am", "Valid ID required"],
    theme: {
      mode: "dark",
      primary: "0 84% 55%",
      background: "0 0% 6%",
      foreground: "0 0% 96%",
      card: "0 0% 10%",
      radius: "0.5rem",
    },
    ticketTypes: [
      { id: "t1", name: "General", description: "Standard club entry.", price: 1000, quantityTotal: 300, quantitySold: 288, maxPerOrder: 6 },
      { id: "t2", name: "Table (4 seats)", description: "Reserved table with bottle service.", price: 15000, quantityTotal: 20, quantitySold: 18, maxPerOrder: 2 },
    ],
    featured: true,
    popular: true,
    attendeeCount: 306,
  },
  {
    id: "3",
    slug: "future-of-work-summit",
    title: "Future of Work Summit",
    shortDescription: "Where East Africa's boldest founders and leaders meet.",
    description:
      "A full-day summit exploring the future of work, AI, and entrepreneurship in East Africa. Keynotes, panels, and structured networking with the region's top operators and investors.",
    category: "Business",
    coverImage: img("photo-1540039155733-5bb30b53aa14"),
    logoText: "FUTURE OF WORK",
    date: "2026-01-15",
    startTime: "09:00",
    endTime: "17:00",
    venue: "Radisson Blu",
    city: "Nairobi",
    address: "Upper Hill, Nairobi",
    mapUrl: "https://maps.google.com/?q=Radisson+Blu+Nairobi",
    organizer: { name: "Hili Business", avatar: img("photo-1560250097-0b93528c311a") },
    ageRestriction: "All ages",
    policies: ["Business casual attire", "Badge required for entry"],
    theme: {
      mode: "light",
      primary: "168 60% 24%",
      background: "0 0% 100%",
      foreground: "220 20% 10%",
      card: "0 0% 100%",
      radius: "0.375rem",
    },
    ticketTypes: [
      { id: "t1", name: "Student", description: "Valid student ID required.", price: 500, quantityTotal: 100, quantitySold: 34, maxPerOrder: 2 },
      { id: "t2", name: "Regular", description: "Full-day access + lunch.", price: 3500, quantityTotal: 300, quantitySold: 120, maxPerOrder: 5 },
      { id: "t3", name: "VVIP", description: "Front row + speaker dinner.", price: 12000, quantityTotal: 30, quantitySold: 9, maxPerOrder: 2 },
    ],
    featured: false,
    popular: false,
    attendeeCount: 163,
  },
  {
    id: "4",
    slug: "laugh-tank-live",
    title: "Laugh Tank Live",
    shortDescription: "Kenya's funniest comedians, one wild night.",
    description:
      "Laugh Tank Live brings together the country's sharpest stand-up comedians for a night of nonstop laughs. Come early — seats are first come, first served.",
    category: "Comedy",
    coverImage: img("photo-1585699324551-f6c309eedeca"),
    logoText: "LAUGH TANK",
    date: "2025-11-29",
    startTime: "19:30",
    endTime: "22:30",
    venue: "Kenya Cultural Centre",
    city: "Nairobi",
    address: "Harry Thuku Rd, Nairobi",
    mapUrl: "https://maps.google.com/?q=Kenya+Cultural+Centre",
    organizer: { name: "Laugh Tank Media", avatar: img("photo-1522075469751-3a6694fb2f61") },
    ageRestriction: "16+",
    policies: ["No recording during performances", "Latecomers seated at intervals"],
    theme: {
      mode: "light",
      primary: "43 96% 50%",
      background: "40 60% 97%",
      foreground: "30 30% 12%",
      card: "0 0% 100%",
      radius: "1.25rem",
    },
    ticketTypes: [
      { id: "t1", name: "Regular", description: "Standard seating.", price: 800, quantityTotal: 200, quantitySold: 173, maxPerOrder: 6 },
      { id: "t2", name: "Front Row", description: "Best seats in the house.", price: 2000, quantityTotal: 40, quantitySold: 35, maxPerOrder: 4 },
    ],
    featured: false,
    popular: true,
    attendeeCount: 208,
  },
  {
    id: "5",
    slug: "taste-of-nairobi",
    title: "Taste of Nairobi",
    shortDescription: "A weekend food & drink festival celebrating local flavour.",
    description:
      "Sample dishes from 40+ of Nairobi's best restaurants and food trucks, live cooking demos, craft drinks, and live acoustic sets all weekend long.",
    category: "Food & Drink",
    coverImage: img("photo-1414235077428-338989a2e8c0"),
    logoText: "TASTE OF NAIROBI",
    date: "2026-02-07",
    startTime: "11:00",
    endTime: "21:00",
    venue: "Ngong Racecourse",
    city: "Nairobi",
    address: "Ngong Rd, Nairobi",
    mapUrl: "https://maps.google.com/?q=Ngong+Racecourse",
    organizer: { name: "Hili Culinary", avatar: img("photo-1607746882042-944635dfe10e") },
    ageRestriction: "All ages",
    policies: ["Outside food not permitted", "Pets not allowed"],
    theme: {
      mode: "light",
      primary: "150 55% 32%",
      background: "60 40% 97%",
      foreground: "30 30% 12%",
      card: "0 0% 100%",
      radius: "1rem",
    },
    ticketTypes: [
      { id: "t1", name: "Free Entry", description: "Grounds access, pay per dish.", price: 0, quantityTotal: 1000, quantitySold: 410, maxPerOrder: 8 },
      { id: "t2", name: "Tasting Pass", description: "10 tasting tokens included.", price: 2500, quantityTotal: 300, quantitySold: 96, maxPerOrder: 6 },
    ],
    featured: true,
    popular: false,
    attendeeCount: 506,
  },
  {
    id: "6",
    slug: "coastal-beats-mombasa",
    title: "Coastal Beats Mombasa",
    shortDescription: "Sunset beach party with the region's top selectors.",
    description:
      "Coastal Beats returns to Nyali Beach for a sunset-to-sunrise celebration of Amapiano, Afrobeats, and coastal sounds right on the sand.",
    category: "Music",
    coverImage: img("photo-1533174072545-7a4b6ad7a6c3"),
    logoText: "COASTAL BEATS",
    date: "2025-12-13",
    startTime: "16:00",
    endTime: "02:00",
    venue: "Nyali Beach",
    city: "Mombasa",
    address: "Nyali, Mombasa",
    mapUrl: "https://maps.google.com/?q=Nyali+Beach+Mombasa",
    organizer: { name: "Coastal Sounds", avatar: img("photo-1500648767791-00dcc994a43e") },
    ageRestriction: "18+",
    policies: ["No glass bottles on the beach", "Security bag checks at entry"],
    theme: {
      mode: "dark",
      primary: "190 80% 45%",
      background: "210 45% 10%",
      foreground: "190 40% 96%",
      card: "210 40% 14%",
      radius: "1.5rem",
    },
    ticketTypes: [
      { id: "t1", name: "Regular", description: "General beach access.", price: 1200, quantityTotal: 400, quantitySold: 260, maxPerOrder: 6 },
      { id: "t2", name: "VIP Cabana", description: "Shaded cabana for up to 6 guests.", price: 18000, quantityTotal: 25, quantitySold: 21, maxPerOrder: 2 },
    ],
    featured: false,
    popular: true,
    attendeeCount: 281,
  },
];

export function getEventBySlug(slug: string) {
  return events.find((e) => e.slug === slug);
}

export function ticketsLeft(ticket: TicketType) {
  return ticket.quantityTotal - ticket.quantitySold;
}

export function formatPrice(amount: number) {
  if (amount === 0) return "Free";
  return `KSh ${amount.toLocaleString()}`;
}

export function startingPrice(event: HiliEvent) {
  const active = event.ticketTypes.filter((t) => ticketsLeft(t) > 0);
  const cheapest = Math.min(...(active.length ? active : event.ticketTypes).map((t) => t.price));
  return formatPrice(cheapest);
}

export function formatEventDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
}

export function formatEventTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}
