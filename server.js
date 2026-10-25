const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-2.5-flash";
const SYS =
  "Você é a Futuristy, uma IA amigável, esperta e divertida, criada para conversar em português do Brasil. Ajude com tarefas de casa (explicando passo a passo), responda perguntas, escreva textos e crie jogos. Quando pedirem um jogo ou página, entregue UM arquivo HTML completo e funcional (CSS e JS dentro dele) em um único bloco ```html, com controles de toque para celular. Responda sempre no idioma da pessoa e seja claro e curto.";

// Limite simples por IP: 20 mensagens por 10 minutos
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

app.post("/chat", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "Chave da API não configurada" });
    if (limited(req.ip)) return res.status(429).json({ error: "Limite atingido" });

    const contents = (req.body.messages || [])
      .slice(-20)
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content.slice(0, 20000) }],
      }));
    if (!contents.length) return res.status(400).json({ error: "Sem mensagens" });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(MODEL) +
      ":generateContent";
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYS }] },
        contents,
        generationConfig: { maxOutputTokens: 8000 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Erro Gemini:", JSON.stringify(data));
      return res.status(502).json({ error: data.error?.message || "Erro na API" });
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno" });
  }
});

// Acha o index.html na pasta public ou na raiz do projeto
function findIndex() {
  const options = [path.join(__dirname, "public", "index.html"), path.join(__dirname, "index.html")];
  return options.find((p) => fs.existsSync(p));
}

// Entrega o site já apontando para /chat (funciona com o arquivo original ou o ajustado)
app.get(["/", "/index.html"], (req, res) => {
  const file = findIndex();
  if (!file) return res.status(404).send("index.html não encontrado");
  let html = fs.readFileSync(file, "utf8");
  html = html.replace('var WORKER_URL="COLE_AQUI_O_LINK_DO_SEU_WORKER";', 'var WORKER_URL="/chat";');
  html = html.replace(
    /if\(WORKER_URL\.indexOf\("http"\)!==0\)\{add\("bot","<p>Falta colocar o link do servidor no site\.<\/p>"\);return;\}/,
    ""
  );
  res.type("html").send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Futuristy rodando na porta " + PORT));
