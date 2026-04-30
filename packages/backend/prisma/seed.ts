import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

if (!connectionString || connectionString === "undefined") {
  console.error("❌ ERROR: DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const SEED_APIS = [
  {
    id: "openweathermap",
    name: "OpenWeatherMap",
    description:
      "Current weather, forecasts, and historical data for any location worldwide.",
    category: "Weather",
    authType: "apiKey",
    baseUrl: "https://api.openweathermap.org/data/2.5",
    docsUrl: "https://openweathermap.org/api",
    tags: ["weather", "forecast", "temperature"],
    endpoints: [
      {
        path: "/weather",
        method: "GET",
        summary: "Current weather by city",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "City name",
            example: "London",
          },
          {
            name: "appid",
            in: "query",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
        ],
      },
      {
        path: "/forecast",
        method: "GET",
        summary: "5-day forecast",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "City name",
            example: "Tokyo",
          },
        ],
      },
    ],
  },
  {
    id: "dog-api",
    name: "The Dog API",
    description:
      "Random dog images, breeds, and sub-breeds. No auth needed — great for testing.",
    category: "Animals",
    authType: "none",
    baseUrl: "https://dog.ceo/api",
    docsUrl: "https://dog.ceo/dog-api",
    tags: ["dogs", "images", "fun"],
    endpoints: [
      {
        path: "/breeds/image/random",
        method: "GET",
        summary: "Random dog image",
      },
      { path: "/breeds/list/all", method: "GET", summary: "List all breeds" },
    ],
  },
  {
    id: "coingecko",
    name: "CoinGecko",
    description:
      "Cryptocurrency prices, market caps, and trading volume. No auth needed.",
    category: "Finance",
    authType: "none",
    baseUrl: "https://api.coingecko.com/api/v3",
    docsUrl: "https://www.coingecko.com/api/documentation",
    tags: ["crypto", "bitcoin", "prices"],
    endpoints: [
      {
        path: "/simple/price",
        method: "GET",
        summary: "Get current crypto prices",
        params: [
          {
            name: "ids",
            in: "query",
            required: true,
            description: "Coin IDs",
            example: "bitcoin,ethereum",
          },
          {
            name: "vs_currencies",
            in: "query",
            required: true,
            description: "Target currency",
            example: "usd",
          },
        ],
      },
      {
        path: "/coins/markets",
        method: "GET",
        summary: "List coins with market data",
        params: [
          {
            name: "vs_currency",
            in: "query",
            required: true,
            description: "Target currency",
            example: "usd",
          },
        ],
      },
    ],
  },
  {
    id: "rawg",
    name: "RAWG",
    description: "The largest video game database with over 500,000 games.",
    category: "Gaming",
    authType: "apiKey",
    baseUrl: "https://api.rawg.io/api",
    docsUrl: "https://rawg.io/apidocs",
    tags: ["games", "gaming", "metacritic"],
    endpoints: [
      {
        path: "/games",
        method: "GET",
        summary: "List and search games",
        params: [
          {
            name: "key",
            in: "query",
            required: true,
            description: "API key",
            example: "your_key",
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Search term",
            example: "minecraft",
          },
        ],
      },
    ],
  },
  {
    id: "newsapi",
    name: "NewsAPI",
    description: "Search worldwide news articles from 150,000+ sources.",
    category: "News",
    authType: "apiKey",
    baseUrl: "https://newsapi.org/v2",
    docsUrl: "https://newsapi.org/docs",
    tags: ["news", "articles", "media"],
    endpoints: [
      {
        path: "/top-headlines",
        method: "GET",
        summary: "Top headlines by country",
        params: [
          {
            name: "apiKey",
            in: "query",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
          {
            name: "country",
            in: "query",
            required: false,
            description: "Country code",
            example: "us",
          },
        ],
      },
      {
        path: "/everything",
        method: "GET",
        summary: "Search all articles",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search term",
            example: "technology",
          },
        ],
      },
    ],
  },
  {
    id: "rest-countries",
    name: "REST Countries",
    description:
      "Info about countries — population, languages, currencies, borders.",
    category: "Geography",
    authType: "none",
    baseUrl: "https://restcountries.com/v3.1",
    docsUrl: "https://restcountries.com",
    tags: ["countries", "geography", "world"],
    endpoints: [
      { path: "/all", method: "GET", summary: "Get all countries" },
      {
        path: "/name/{name}",
        method: "GET",
        summary: "Search by country name",
        params: [
          {
            name: "name",
            in: "path",
            required: true,
            description: "Country name",
            example: "canada",
          },
        ],
      },
    ],
  },
  {
    id: "pokeapi",
    name: "PokeAPI",
    description:
      "All Pokémon data — moves, abilities, types, stats. No auth needed.",
    category: "Gaming",
    authType: "none",
    baseUrl: "https://pokeapi.co/api/v2",
    docsUrl: "https://pokeapi.co/docs/v2",
    tags: ["pokemon", "gaming", "anime"],
    endpoints: [
      {
        path: "/pokemon/{name}",
        method: "GET",
        summary: "Get Pokémon by name",
        params: [
          {
            name: "name",
            in: "path",
            required: true,
            description: "Pokémon name",
            example: "pikachu",
          },
        ],
      },
    ],
  },
  {
    id: "nasa",
    name: "NASA APIs",
    description:
      "Space data — Astronomy Picture of the Day, Mars rover photos, near-earth objects.",
    category: "Science",
    authType: "apiKey",
    baseUrl: "https://api.nasa.gov",
    docsUrl: "https://api.nasa.gov",
    tags: ["space", "nasa", "astronomy"],
    endpoints: [
      {
        path: "/planetary/apod",
        method: "GET",
        summary: "Astronomy Picture of the Day",
        params: [
          {
            name: "api_key",
            in: "query",
            required: true,
            description: "Use DEMO_KEY for testing",
            example: "DEMO_KEY",
          },
        ],
      },
    ],
  },
  {
    id: "github",
    name: "GitHub REST API",
    description: "Access GitHub repos, users, issues, and pull requests.",
    category: "Developer",
    authType: "bearer",
    baseUrl: "https://api.github.com",
    docsUrl: "https://docs.github.com/rest",
    tags: ["git", "code", "repos"],
    endpoints: [
      {
        path: "/users/{username}",
        method: "GET",
        summary: "Get user profile",
        params: [
          {
            name: "username",
            in: "path",
            required: true,
            description: "GitHub username",
            example: "torvalds",
          },
        ],
      },
      {
        path: "/search/repositories",
        method: "GET",
        summary: "Search repositories",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "next.js",
          },
        ],
      },
    ],
  },
  {
    id: "jsonplaceholder",
    name: "JSONPlaceholder",
    description:
      "Fake REST API for testing — posts, comments, users, todos. No auth needed.",
    category: "Tools",
    authType: "none",
    baseUrl: "https://jsonplaceholder.typicode.com",
    docsUrl: "https://jsonplaceholder.typicode.com/guide",
    tags: ["testing", "mock", "fake"],
    endpoints: [
      { path: "/posts", method: "GET", summary: "Get all posts" },
      { path: "/posts", method: "POST", summary: "Create a post" },
      {
        path: "/users/{id}",
        method: "GET",
        summary: "Get user by ID",
        params: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "User ID",
            example: "1",
          },
        ],
      },
    ],
  },
  {
    id: "open-library",
    name: "Open Library",
    description: "Books, authors, and editions from the Internet Archive.",
    category: "Books",
    authType: "none",
    baseUrl: "https://openlibrary.org",
    docsUrl: "https://openlibrary.org/developers/api",
    tags: ["books", "reading", "library"],
    endpoints: [
      {
        path: "/search.json",
        method: "GET",
        summary: "Search books",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "the lord of the rings",
          },
        ],
      },
    ],
  },
  {
    id: "ip-api",
    name: "IP Geolocation",
    description: "Geolocate any IP address — country, city, timezone, ISP.",
    category: "Tools",
    authType: "none",
    baseUrl: "https://ipapi.co",
    docsUrl: "https://ipapi.co/api",
    tags: ["ip", "geolocation", "network"],
    endpoints: [
      {
        path: "/{ip}/json",
        method: "GET",
        summary: "Get location for IP",
        params: [
          {
            name: "ip",
            in: "path",
            required: true,
            description: "IP address",
            example: "8.8.8.8",
          },
        ],
      },
    ],
  },
  {
    id: "quotable",
    name: "Quotable",
    description: "Random inspirational quotes filterable by author or tag.",
    category: "Fun",
    authType: "none",
    baseUrl: "https://api.quotable.io",
    docsUrl: "https://github.com/lukePeavey/quotable",
    tags: ["quotes", "inspiration", "text"],
    endpoints: [
      { path: "/random", method: "GET", summary: "Get a random quote" },
      {
        path: "/search/quotes",
        method: "GET",
        summary: "Search quotes",
        params: [
          {
            name: "query",
            in: "query",
            required: true,
            description: "Search term",
            example: "success",
          },
        ],
      },
    ],
  },
  {
    id: "exchangerate",
    name: "ExchangeRate-API",
    description: "Real-time exchange rates for 161 currencies.",
    category: "Finance",
    authType: "apiKey",
    baseUrl: "https://v6.exchangerate-api.com/v6",
    docsUrl: "https://www.exchangerate-api.com/docs",
    tags: ["currency", "forex", "exchange"],
    endpoints: [
      {
        path: "/{apikey}/latest/{base}",
        method: "GET",
        summary: "Latest exchange rates",
        params: [
          {
            name: "apikey",
            in: "path",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
          {
            name: "base",
            in: "path",
            required: true,
            description: "Base currency",
            example: "USD",
          },
        ],
      },
    ],
  },
  {
    id: "spotify",
    name: "Spotify Web API",
    description:
      "Music data — tracks, artists, albums, playlists, and audio features.",
    category: "Music",
    authType: "oauth2",
    baseUrl: "https://api.spotify.com/v1",
    docsUrl: "https://developer.spotify.com/documentation/web-api",
    tags: ["music", "streaming", "playlists"],
    endpoints: [
      {
        path: "/search",
        method: "GET",
        summary: "Search tracks, artists, albums",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "radiohead",
          },
          {
            name: "type",
            in: "query",
            required: true,
            description: "Result type",
            example: "artist",
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log("🚀 Starting seed with Driver Adapter...");

  for (const api of SEED_APIS) {
    await prisma.api.upsert({
      where: { id: api.id },
      update: {
        name: api.name,
        description: api.description,
        category: api.category,
        authType: api.authType,
        baseUrl: api.baseUrl,
        docsUrl: api.docsUrl,
        tags: api.tags,
        endpoints: api.endpoints as any, // Cast to any if using Json in schema
      },
      create: api as any,
    });
    console.log(`  ✓ ${api.name}`);
  }
}

main()
  .then(async () => {
    console.log("\n✅ Seeding successful.");
    await prisma.$disconnect();
    await pool.end(); // Important: Close the pool so the script exits
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
