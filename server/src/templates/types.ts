// Business types for the email templates. Each type has its own words, photos and ten accent colors;
// the ten layouts in layouts.ts turn each type into ten different designs.

export type BusinessType = {
  key: string;
  label: string;
  plural: string;
  keywords: string[]; // matched against a lead's category to pick the type
  photos: string[]; // files in server/assets/photos/<key>/
  accents: string[]; // ten accent colors, one per design
  tagline: string; // default hero line on the mock website
  services: string[]; // shown on the mock website
  feature: string; // what the website lets customers do
  appName: string; // the extra system sold at $500
  appLine: string; // what the management app shows the owner
  cta: string; // main button on the mock website
  headlines: string[]; // email headline variants; {name} is the business name
  subjects: string[]; // subject line variants
};

const T = (t: BusinessType) => t;

export const TYPES: BusinessType[] = [
  T({
    key: 'barbershop', label: 'Barbershop', plural: 'barbershops',
    keywords: ['barber', 'barbershop', 'fade', 'mens grooming', "men's grooming", 'shave'],
    photos: ['b-classic', 'b-interior', 'b-cutting', 'b-shears', 'b-trim', 'b-client'],
    accents: ['#b45309', '#7f1d1d', '#0f766e', '#1e3a8a', '#a16207', '#be123c', '#334155', '#4d7c0f', '#9333ea', '#c2410c'],
    tagline: 'Sharp fades, clean lines, no waiting around.',
    services: ['Fade', 'Haircut & beard', 'Line up', 'Hot towel shave', 'Kids cut'],
    feature: 'book a chair in a few taps, day or night', appName: 'booking system', appLine: "today's chairs, deposits and open slots",
    cta: 'Book a chair',
    headlines: ['A website and booking app for {name}', 'Your chairs, booked online', '{name}, online and bookable', 'Book-a-chair, built for {name}'],
    subjects: ['{name}: we designed you a website and booking app', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a booking page'],
  }),
  T({
    key: 'hair-salon', label: 'Hair salon', plural: 'hair salons',
    keywords: ['hair salon', 'salon', 'stylist', 'hair studio', 'braids', 'locs', 'blowout', 'hair'],
    photos: ['s-blowout', 's-interior', 's-mirrors', 's-cut', 's-updo', 's-tools'],
    accents: ['#be185d', '#7c3aed', '#b45309', '#0f766e', '#9f1239', '#6d28d9', '#a16207', '#0e7490', '#c2410c', '#4c1d95'],
    tagline: 'Color, cuts and styling, booked in seconds.',
    services: ['Cut & style', 'Color', 'Silk press', 'Braids', 'Treatments'],
    feature: 'book an appointment with their favorite stylist, day or night', appName: 'booking system', appLine: "today's appointments, deposits and open times",
    cta: 'Book now',
    headlines: ['A website and booking app for {name}', 'Your salon, bookable online', '{name}, online and ready to book', 'Bookings for {name}, made easy'],
    subjects: ['{name}: we designed you a website and booking app', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a booking page'],
  }),
  T({
    key: 'nail-salon', label: 'Nail salon', plural: 'nail salons',
    keywords: ['nail salon', 'nail bar', 'nail spa', 'nail', 'nails', 'manicure', 'pedicure', 'acrylic', 'gel'],
    photos: ['n-french', 'n-glitter', 'n-pink', 'n-salon', 'n-ornate', 'n-tortoise'],
    accents: ['#db2777', '#9333ea', '#e11d48', '#0d9488', '#c026d3', '#be123c', '#7c3aed', '#ea580c', '#0891b2', '#a21caf'],
    tagline: 'Gel, acrylics and nail art, booked online.',
    services: ['Gel manicure', 'Acrylic full set', 'Pedicure', 'Nail art', 'Fill-in'],
    feature: 'book their set and see your nail art', appName: 'booking system', appLine: "today's appointments, deposits and open times",
    cta: 'Book your set',
    headlines: ['A website and booking app for {name}', 'Your nail art, online', '{name}, ready to book online', 'Sets booked online for {name}'],
    subjects: ['{name}: we designed you a website and booking app', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a booking page'],
  }),
  T({
    key: 'beauty-spa', label: 'Beauty & spa', plural: 'beauty studios',
    keywords: ['lash', 'lashes', 'brow', 'brows', 'esthetic', 'esthetician', 'spa', 'facial', 'wax', 'makeup', 'beauty', 'massage', 'med spa'],
    photos: ['spa-lash', 'spa-brow', 's-tools', 's-maroon'],
    accents: ['#be185d', '#a16207', '#7c3aed', '#0f766e', '#9f1239', '#b45309', '#6d28d9', '#0e7490', '#c026d3', '#4d7c0f'],
    tagline: 'Lashes, brows and skin care, booked online.',
    services: ['Lash extensions', 'Brow lamination', 'Facials', 'Waxing', 'Makeup'],
    feature: 'book a treatment and pay a deposit online', appName: 'booking system', appLine: "today's clients, deposits and open times",
    cta: 'Book a treatment',
    headlines: ['A website and booking app for {name}', 'Your studio, bookable online', '{name}, online and ready to book', 'Treatments booked online for {name}'],
    subjects: ['{name}: we designed you a website and booking app', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a booking page'],
  }),
  T({
    key: 'tattoo', label: 'Tattoo studio', plural: 'tattoo studios',
    keywords: ['tattoo', 'tattoos', 'ink', 'piercing'],
    photos: ['tat-work', 'tat-focus', 'tat-flash'],
    accents: ['#dc2626', '#a16207', '#0f766e', '#7c3aed', '#be123c', '#ca8a04', '#334155', '#0891b2', '#c2410c', '#65a30d'],
    tagline: 'Custom work and flash. Book a consult online.',
    services: ['Custom pieces', 'Flash', 'Cover-ups', 'Touch-ups', 'Consultations'],
    feature: 'see your portfolio and request a consult with a deposit', appName: 'booking system', appLine: "upcoming sessions, deposits and consult requests",
    cta: 'Request a consult',
    headlines: ['A website and booking page for {name}', 'Your portfolio, online', '{name}, online with consult booking', 'Consults booked online for {name}'],
    subjects: ['{name}: we designed you a website and booking page', 'A website idea for {name}', 'Online consult booking for {name}?', 'Quick website concept for {name}', '{name} + a portfolio site'],
  }),
  T({
    key: 'restaurant', label: 'Restaurant', plural: 'restaurants',
    keywords: ['restaurant', 'grill', 'kitchen', 'taqueria', 'tacos', 'bbq', 'barbecue', 'soul food', 'diner', 'cafe food', 'pizza', 'burger', 'wings', 'thai', 'mexican', 'food', 'eatery', 'cuisine'],
    photos: ['t-birria', 'q-brisket', 'sf-plate', 'r-bowl', 'th-curry', 'p-poke'],
    accents: ['#c2410c', '#b91c1c', '#15803d', '#a16207', '#0f766e', '#9a3412', '#7c2d12', '#be123c', '#4d7c0f', '#1e40af'],
    tagline: 'Fresh food, made right. Order ahead online.',
    services: ['Menu', 'Order online', 'Catering', 'Specials', 'Hours & location'],
    feature: 'see your menu and order ahead for pickup', appName: 'online ordering system', appLine: "today's orders, pickups and sales",
    cta: 'Order online',
    headlines: ['A website and online ordering for {name}', 'Your menu, online', '{name}, online with ordering', 'Order-ahead, built for {name}'],
    subjects: ['{name}: we designed you a website and online ordering', 'A website idea for {name}', 'Online ordering for {name}?', 'Quick website concept for {name}', '{name} + an online menu'],
  }),
  T({
    key: 'food-truck', label: 'Food truck', plural: 'food trucks',
    keywords: ['food truck', 'truck', 'trailer', 'pop-up', 'popup', 'street food'],
    photos: ['sh-truck', 't-box', 't-neon', 't-spread', 'sh-straw', 'cu-press'],
    accents: ['#ea580c', '#dc2626', '#16a34a', '#ca8a04', '#0d9488', '#9333ea', '#be123c', '#2563eb', '#65a30d', '#c2410c'],
    tagline: "Find the truck, see the menu, order ahead.",
    services: ["Today's location", 'Menu', 'Order ahead', 'Catering & events', 'Schedule'],
    feature: "see where you're parked today and order ahead", appName: 'online ordering system', appLine: "today's orders, location and sales",
    cta: 'Find the truck',
    headlines: ['A website and online ordering for {name}', 'Your truck, easy to find', '{name}, online with ordering', "Today's spot and menu for {name}"],
    subjects: ['{name}: we designed you a website and online ordering', 'A website idea for {name}', 'Online ordering for {name}?', 'Quick website concept for {name}', '{name} + a location page'],
  }),
  T({
    key: 'bakery-cafe', label: 'Bakery & café', plural: 'bakeries and cafés',
    keywords: ['bakery', 'bakes', 'cake', 'cakes', 'cupcake', 'pastry', 'donut', 'cookies', 'cafe', 'café', 'coffee', 'dessert', 'sweets'],
    photos: ['k-case', 'k-donuts', 'k-bread', 'c-floral', 'c-tier', 'ft-syrup'],
    accents: ['#be185d', '#a16207', '#c2410c', '#0f766e', '#9f1239', '#7c3aed', '#b45309', '#15803d', '#0e7490', '#db2777'],
    tagline: 'Baked fresh. Pre-order cakes and treats online.',
    services: ['Custom cakes', 'Cupcakes', 'Pastries', 'Pre-orders', 'Events'],
    feature: 'browse your cakes and pre-order for pickup', appName: 'pre-order system', appLine: "upcoming orders, pickups and deposits",
    cta: 'Pre-order',
    headlines: ['A website and pre-orders for {name}', 'Your cakes, online', '{name}, online with pre-orders', 'Custom cake orders for {name}'],
    subjects: ['{name}: we designed you a website and pre-order page', 'A website idea for {name}', 'Online pre-orders for {name}?', 'Quick website concept for {name}', '{name} + a cake order page'],
  }),
  T({
    key: 'cleaning', label: 'Cleaning service', plural: 'cleaning services',
    keywords: ['cleaning', 'cleaners', 'maid', 'janitorial', 'housekeeping', 'carpet', 'move-out'],
    photos: ['h-kitchen', 'h-mop', 'h-spray', 'h-vacuum'],
    accents: ['#0284c7', '#0f766e', '#2563eb', '#16a34a', '#0891b2', '#7c3aed', '#0369a1', '#059669', '#4f46e5', '#0e7490'],
    tagline: 'Spotless homes and offices. Get a quote in a minute.',
    services: ['Home cleaning', 'Deep clean', 'Move-out', 'Office cleaning', 'Recurring plans'],
    feature: 'get an instant quote and book a cleaning', appName: 'quote and booking system', appLine: "today's jobs, crews and quote requests",
    cta: 'Get a quote',
    headlines: ['A website and online quotes for {name}', 'Your cleaning service, online', '{name}, booked online', 'Instant quotes for {name}'],
    subjects: ['{name}: we designed you a website and quote form', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + an instant quote page'],
  }),
  T({
    key: 'landscaping', label: 'Lawn & landscaping', plural: 'lawn care companies',
    keywords: ['lawn', 'landscaping', 'landscape', 'yard', 'mowing', 'tree', 'pressure washing', 'power washing', 'gardening'],
    photos: ['l-crew', 'l-fresh', 'l-trim', 'l-yard', 'pw-washer'],
    accents: ['#15803d', '#4d7c0f', '#0f766e', '#a16207', '#166534', '#65a30d', '#0d9488', '#b45309', '#047857', '#3f6212'],
    tagline: 'Clean lawns and sharp yards. Free quotes online.',
    services: ['Lawn mowing', 'Landscaping', 'Hedge trimming', 'Cleanups', 'Pressure washing'],
    feature: 'request a free quote with photos of their yard', appName: 'quote and scheduling system', appLine: "this week's jobs, routes and quote requests",
    cta: 'Free quote',
    headlines: ['A website and online quotes for {name}', 'Your yard work, online', '{name}, booked online', 'Free quotes for {name}, online'],
    subjects: ['{name}: we designed you a website and quote form', 'A website idea for {name}', 'Online quotes for {name}?', 'Quick website concept for {name}', '{name} + a free quote page'],
  }),
  T({
    key: 'home-trades', label: 'Home trades', plural: 'trades businesses',
    keywords: ['plumb', 'plumber', 'plumbing', 'electric', 'electrician', 'hvac', 'air conditioning', 'heating', 'handyman', 'roof', 'roofing', 'contractor', 'remodel', 'painting', 'painter', 'flooring'],
    photos: ['trd-bath', 'trd-sink', 'trd-heater', 'a-house'],
    accents: ['#1d4ed8', '#c2410c', '#0f766e', '#b91c1c', '#0369a1', '#a16207', '#334155', '#15803d', '#7c3aed', '#ea580c'],
    tagline: 'Fast, honest service. Request a visit online.',
    services: ['Repairs', 'Installations', 'Emergency calls', 'Estimates', 'Maintenance'],
    feature: 'request a visit or an estimate in a minute', appName: 'job request system', appLine: "today's jobs, requests and estimates",
    cta: 'Request service',
    headlines: ['A website and online job requests for {name}', 'Your service calls, online', '{name}, booked online', 'Service requests for {name}'],
    subjects: ['{name}: we designed you a website and request form', 'A website idea for {name}', 'Online job requests for {name}?', 'Quick website concept for {name}', '{name} + a service request page'],
  }),
  T({
    key: 'auto-repair', label: 'Auto repair', plural: 'auto shops',
    keywords: ['auto', 'mechanic', 'car repair', 'auto repair', 'tire', 'tires', 'brake', 'oil change', 'detailing', 'body shop', 'transmission', 'garage'],
    photos: ['auto-engine', 'auto-hands', 'auto-inspect', 'auto-tools'],
    accents: ['#dc2626', '#1d4ed8', '#ca8a04', '#0f766e', '#ea580c', '#334155', '#16a34a', '#7c3aed', '#b91c1c', '#0369a1'],
    tagline: 'Honest repairs, fair prices. Book online.',
    services: ['Oil change', 'Brakes', 'Diagnostics', 'Tires', 'Engine repair'],
    feature: 'book a service slot and get updates by text', appName: 'booking system', appLine: "today's cars, bays and booked services",
    cta: 'Book service',
    headlines: ['A website and online booking for {name}', 'Your shop, bookable online', '{name}, online and bookable', 'Service bookings for {name}'],
    subjects: ['{name}: we designed you a website and booking page', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a service booking page'],
  }),
  T({
    key: 'fitness', label: 'Fitness & training', plural: 'gyms and trainers',
    keywords: ['gym', 'fitness', 'trainer', 'training', 'boxing', 'crossfit', 'yoga', 'pilates', 'martial arts', 'bootcamp', 'jiu jitsu', 'mma'],
    photos: ['fit-trainer', 'fit-barbell', 'fit-plan'],
    accents: ['#dc2626', '#ea580c', '#16a34a', '#2563eb', '#ca8a04', '#7c3aed', '#0f766e', '#be123c', '#0891b2', '#65a30d'],
    tagline: 'Train with us. Book a session or class online.',
    services: ['Personal training', 'Group classes', 'Memberships', 'Free trial', 'Nutrition'],
    feature: 'book a session or class and sign up for a membership', appName: 'booking and membership system', appLine: "today's sessions, members and payments",
    cta: 'Book a session',
    headlines: ['A website and class booking for {name}', 'Your sessions, booked online', '{name}, online and bookable', 'Class and session booking for {name}'],
    subjects: ['{name}: we designed you a website and booking page', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a class booking page'],
  }),
  T({
    key: 'pet-grooming', label: 'Pet grooming', plural: 'pet groomers',
    keywords: ['pet salon', 'pet spa', 'dog salon', 'dog spa', 'salon dog', 'pet grooming', 'dog grooming', 'pet', 'dog', 'grooming', 'groomer', 'grooming salon', 'cat', 'boarding', 'daycare'],
    photos: ['pet-cut', 'pet-towel', 'pet-bandana'],
    accents: ['#0d9488', '#db2777', '#2563eb', '#ca8a04', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#be185d', '#4d7c0f'],
    tagline: 'Happy, fresh pups. Book a grooming online.',
    services: ['Full groom', 'Bath & brush', 'Nail trim', 'Puppy groom', 'De-shedding'],
    feature: 'book a grooming slot for their dog', appName: 'booking system', appLine: "today's pets, appointments and deposits",
    cta: 'Book a groom',
    headlines: ['A website and booking app for {name}', 'Grooming, booked online', '{name}, online and bookable', 'Pet bookings for {name}'],
    subjects: ['{name}: we designed you a website and booking app', 'A website idea for {name}', 'Online booking for {name}?', 'Quick website concept for {name}', '{name} + a booking page'],
  }),
];

export const TYPE_BY_KEY = new Map(TYPES.map((t) => [t.key, t]));

// Picks a business type from free text (category, name). Longer keyword matches win ("food truck" beats "food").
export const detectType = (...texts: (string | null | undefined)[]): BusinessType | null => {
  const hay = ` ${texts.filter(Boolean).join(' ').toLowerCase()} `;
  const direct = TYPES.find((t) => hay.includes(` ${t.key} `) || hay.trim() === t.key);
  if (direct) return direct;
  let best: { t: BusinessType; len: number } | null = null;
  for (const t of TYPES)
    for (const k of t.keywords)
      // Whole words only (an optional plural s/es), so "shave" doesn't match "Shaved Ice" and "ink" doesn't match "pink".
      if (new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?([^a-z]|$)`, 'i').test(hay) && (!best || k.length > best.len)) best = { t, len: k.length };
  return best?.t ?? null;
};
