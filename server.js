const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL || "gpt-4o-mini";
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

    const messages = (req.body.messages || [])
      .slice(-20)
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
    if (!messages.length) return res.status(400).json({ error: "Sem mensagens" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + API_KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: "system", content: SYS }, ...messages],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || "Erro na API" });
    const text = data.choices?.[0]?.message?.content || "";
    res.json({ text });
  } catch (e) {
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
