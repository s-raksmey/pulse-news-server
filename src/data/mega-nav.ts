export type MegaNavSection = {
  title: string;
  items: { label: string; href: string }[];
};

export type MegaNavConfig = {
  root: { label: string; href: string };
  explore: MegaNavSection;
  shop: MegaNavSection;
  more: MegaNavSection;
};

export const MEGA_NAV: Record<string, MegaNavConfig> = {
  world: {
    root: { label: "World", href: "/world" },
    explore: {
      title: "Explore World",
      items: [
        { label: "Top Stories", href: "/world/latest" },
        { label: "Asia", href: "/world/asia" },
        { label: "Europe", href: "/world/europe" },
        { label: "Middle East", href: "/world/middle-east" },
        { label: "Africa", href: "/world/africa" },
      ],
    },
    shop: {
      title: "World Highlights",
      items: [
        { label: "Latest", href: "/world/latest" },
        { label: "Editors' Picks", href: "/world/editors-picks" },
        { label: "Most Read", href: "/world/most-read" },
      ],
    },
    more: {
      title: "More from World",
      items: [
        { label: "Newsletter", href: "/world/newsletter" },
        { label: "RSS", href: "/world/rss" },
        { label: "About", href: "/world/about" },
      ],
    },
  },

  tech: {
    root: { label: "Tech", href: "/tech" },
    explore: {
      title: "Explore Tech",
      items: [
        { label: "AI", href: "/tech/ai" },
        { label: "Startups", href: "/tech/startups" },
        { label: "Gadgets", href: "/tech/gadgets" },
        { label: "Cybersecurity", href: "/tech/security" },
      ],
    },
    shop: {
      title: "Tech Coverage",
      items: [
        { label: "Latest", href: "/tech/latest" },
        { label: "Reviews", href: "/tech/reviews" },
        { label: "Explainers", href: "/tech/explainers" },
      ],
    },
    more: {
      title: "More from Tech",
      items: [
        { label: "Newsletter", href: "/tech/newsletter" },
        { label: "Events", href: "/tech/events" },
      ],
    },
  },

  business: {
    root: { label: "Business", href: "/business" },
    explore: {
      title: "Explore Business",
      items: [
        { label: "Markets", href: "/business/markets" },
        { label: "Economy", href: "/business/economy" },
        { label: "Companies", href: "/business/companies" },
        { label: "Startups", href: "/business/startups" },
      ],
    },
    shop: {
      title: "Business Coverage",
      items: [
        { label: "Latest", href: "/business/latest" },
        { label: "Analysis", href: "/business/analysis" },
      ],
    },
    more: {
      title: "More from Business",
      items: [{ label: "Newsletter", href: "/business/newsletter" }],
    },
  },

  politics: {
    root: { label: "Politics", href: "/politics" },
    explore: {
      title: "Explore Politics",
      items: [
        { label: "Elections", href: "/politics/elections" },
        { label: "Policy", href: "/politics/policy" },
        { label: "Government", href: "/politics/government" },
      ],
    },
    shop: {
      title: "Political Coverage",
      items: [{ label: "Latest", href: "/politics/latest" }],
    },
    more: {
      title: "More from Politics",
      items: [{ label: "Opinion", href: "/politics/opinion" }],
    },
  },

  sports: {
    root: { label: "Sports", href: "/sports" },
    explore: {
      title: "Explore Sports",
      items: [
        { label: "Football", href: "/sports/football" },
        { label: "Basketball", href: "/sports/basketball" },
        { label: "International", href: "/sports/international" },
      ],
    },
    shop: { title: "Sports Coverage", items: [{ label: "Latest", href: "/sports/latest" }] },
    more: { title: "More from Sports", items: [{ label: "Live", href: "/sports/live" }] },
  },

  culture: {
    root: { label: "Culture", href: "/culture" },
    explore: {
      title: "Explore Culture",
      items: [
        { label: "Arts", href: "/culture/arts" },
        { label: "Movies", href: "/culture/movies" },
        { label: "Music", href: "/culture/music" },
      ],
    },
    shop: { title: "Culture Coverage", items: [{ label: "Latest", href: "/culture/latest" }] },
    more: { title: "More from Culture", items: [{ label: "Reviews", href: "/culture/reviews" }] },
  },
};
