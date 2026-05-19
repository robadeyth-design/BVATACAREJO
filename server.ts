import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS, INITIAL_TRANSACTIONS } from "./src/utils/initialData";

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// Middleware to parse incoming JSON bodies (with a high-capacity limit)
app.use(express.json({ limit: "50mb" }));

// Ensure database directory and file exist
function initializeDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const initialDb = {
      categories: INITIAL_CATEGORIES,
      products: INITIAL_PRODUCTS,
      transactions: INITIAL_TRANSACTIONS,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), "utf-8");
    console.log("Database initialized with initial datasets.");
  }
}

// Load database helper
function loadDatabase() {
  initializeDatabase();
  try {
    const rawData = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error reading database file, resetting to blank:", error);
    return { categories: [], products: [], transactions: [] };
  }
}

// Save database helper
function saveDatabase(data: { categories: any[]; products: any[]; transactions: any[] }) {
  initializeDatabase();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing to database:", error);
    return false;
  }
}

// API Route: Get all operational data
app.get("/api/data", (req, res) => {
  const db = loadDatabase();
  res.json(db);
});

// API Route: Save all operational data persistently
app.post("/api/save", (req, res) => {
  const { categories, products, transactions } = req.body;
  if (!categories || !products || !transactions) {
    return res.status(400).json({ error: "Missing required datasets: categories, products, or transactions." });
  }

  const success = saveDatabase({ categories, products, transactions });
  if (success) {
    res.json({ success: true, message: "Todos os dados foram sincronizados e armazenados no backend com sucesso." });
  } else {
    res.status(500).json({ error: "Ocorreu um erro ao salvar os dados no servidor de arquivos." });
  }
});

// Main async function to bootstrap Express server + Vite
async function bootstrap() {
  // Setup database setup
  initializeDatabase();

  // If in local/dev development mode, plug Vite middlewares. Else, serve static assets.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BV Logistics Server] Active and running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Server bootstrapping failed:", err);
});
