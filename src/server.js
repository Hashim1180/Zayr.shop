const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── MIDDLEWARE ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10kb' }));

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const generalLimit = rateLimit({ windowMs: 60_000, max: 150, standardHeaders: true, legacyHeaders: false });
const chatLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/', generalLimit);
app.use('/api/chat', chatLimit);

// ── PRODUCTS ──
const products = [
  { id:1,  name:'Linen Dress Shirt',       category:'shirts',    price:4800,  tag:'New',       sizes:['S','M','L','XL'],         img:'IMG-20260322-WA0000.jpg',                       desc:'An airy linen shirt in ivory white. Structured collar, mother-of-pearl buttons, relaxed silhouette.' },
  { id:2,  name:'Oxford Casual Shirt',     category:'shirts',    price:4200,  tag:'',          sizes:['S','M','L','XL','XXL'],   img:'IMG-20260322-WA0001.jpg',                       desc:'A refined Oxford cloth shirt. Soft texture, clean lines, button-down collar.' },
  { id:3,  name:'Wool Blend Trouser',      category:'trousers',  price:6500,  tag:'New',       sizes:['30','32','34','36'],       img:'IMG-20260322-WA0003.jpg',                       desc:'High-waist wool-blend trousers with a straight, full leg. Deep pleats, side adjusters.' },
  { id:4,  name:'Tailored Slim Trouser',   category:'trousers',  price:5800,  tag:'',          sizes:['30','32','34','36'],       img:'IMG-20260322-WA0004.jpg',                       desc:'Clean-cut slim trousers in a mid-weight fabric. Flat front, subtle taper.' },
  { id:5,  name:'Heritage Overshirt',      category:'outerwear', price:9200,  tag:'',          sizes:['S','M','L','XL'],         img:'IMG-20260322-WA0005.jpg',                       desc:'A heavy cotton overshirt as a light jacket. Structured shoulders, chest pockets, tortoiseshell buttons.' },
  { id:6,  name:'Linen Co-ord Set',        category:'sets',      price:11500, tag:'Limited',   sizes:['S','M','L','XL'],         img:'6d8cfb9b297bf477a816646d4a3e4116.jpg',          desc:'Matching linen shirt and trouser co-ord in natural ecru. Relaxed proportions.' },
  { id:7,  name:'Knit Polo Shirt',         category:'shirts',    price:5200,  tag:'',          sizes:['S','M','L','XL'],         img:'e39f20be0b8ac7de67def140ffbd3c33.jpg',          desc:'A fine-knit polo in off-white. Ribbed collar, minimal branding, medium weight.' },
  { id:8,  name:'Merino Wool Blazer',      category:'outerwear', price:18500, tag:'Signature', sizes:['S','M','L','XL'],         img:'5a5bc46d98d917ddda11e0b623cec43c.jpg',          desc:'Single-breasted merino wool blazer. Notch lapel, welt pockets, half-canvassed construction.' },
  { id:9,  name:'Cotton Pleated Set',      category:'sets',      price:12800, tag:'New',       sizes:['S','M','L','XL'],         img:'673e097a6a4f408cb3bc187082081b00.jpg',          desc:'Pleated shirt and trouser co-ord in charcoal cotton. Generous fit, subtle texture.' },
  { id:10, name:'Trench Overcoat',         category:'outerwear', price:24000, tag:'Signature', sizes:['S','M','L','XL'],         img:'d25bdbcb174e7a2bd84f437afb28ad33.jpg',          desc:'Mid-length trench coat in sand-beige cotton gabardine. Storm flap, epaulettes, belt.' },
];

const SUPABASE_BASE = process.env.SUPABASE_URL || 'https://cbrbrucolmkdwrqljnte.supabase.co/storage/v1/object/public/Zayr.shop/';

const NOIR_SYSTEM = `You are Noir — ZAYR's personal style concierge. ZAYR is a refined menswear brand from Pakistan, specialising in old money aesthetic clothing for men.

Your persona: calm, authoritative, knowledgeable. You speak with quiet precision. Never casual, never verbose. Like a private members' club concierge who has seen everything and is impressed by nothing — yet always genuinely helpful.

ZAYR Products:
${products.map(p => `- ${p.name} (${p.category}): PKR ${p.price.toLocaleString()}, Sizes: ${p.sizes.join(', ')} — ${p.desc}`).join('\n')}

WhatsApp for orders: +92 325 785 4274

Your capabilities:
1. STYLE ADVISOR — recommend outfits, combinations, occasions, styling tips
2. PERSONAL SHOPPER — recommend specific ZAYR products based on needs/preferences
3. SIZING GUIDE — help customers find the right size
4. ORDER SUPPORT — guide customers through WhatsApp ordering process
5. FAQ — shipping, returns, care instructions, fabric details

Rules:
- Never use emojis
- Keep responses under 120 words
- Always recommend ZAYR products where relevant
- For orders, always direct to WhatsApp
- Speak in second person — address the customer directly
- Old money references are appropriate: heritage, lineage, investment pieces, restraint`;

// ── ROUTES ──
app.get('/api/health', (_, res) => res.json({ status: 'ok', brand: 'ZAYR' }));

app.get('/api/products', (req, res) => {
  const { category, tag } = req.query;
  let result = products;
  if (category) result = result.filter(p => p.category === category);
  if (tag) result = result.filter(p => p.tag.toLowerCase() === tag.toLowerCase());
  res.json(result.map(p => ({ ...p, image: SUPABASE_BASE + p.img })));
});

app.get('/api/products/:id', (req, res) => {
  const p = products.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json({ ...p, image: SUPABASE_BASE + p.img });
});

app.get('/api/categories', (_, res) => {
  const cats = [...new Set(products.map(p => p.category))];
  res.json(cats.map(c => ({
    name: c,
    count: products.filter(p => p.category === c).length
  })));
});

app.get('/api/featured', (_, res) => {
  const featured = products.filter(p => p.tag === 'Signature' || p.tag === 'New').slice(0, 4);
  res.json(featured.map(p => ({ ...p, image: SUPABASE_BASE + p.img })));
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  const results = products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    p.desc.toLowerCase().includes(q)
  );
  res.json(results.map(p => ({ ...p, image: SUPABASE_BASE + p.img })));
});

// ── NOIR AI CHAT ──
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  // Intent classification
  const intent = classifyIntent(message);

  // Build messages
  const messages = [
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 256,
      system: NOIR_SYSTEM + (intent ? `\n\nDetected intent: ${intent}. Prioritise this in your response.` : ''),
      messages
    });

    const reply = response.content[0]?.text || fallbackReply(intent);
    res.json({ reply, intent });
  } catch (err) {
    console.error('Noir error:', err.message);
    res.json({ reply: fallbackReply(intent), intent });
  }
});

// ── N8N WEBHOOK HANDLER ──
// This endpoint receives classified intents from n8n and returns AI responses
app.post('/api/noir/n8n', async (req, res) => {
  const { message, intent, history = [], context } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });

  const systemAddition = buildContextPrompt(intent, context);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 256,
      system: NOIR_SYSTEM + systemAddition,
      messages: [
        ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ]
    });
    res.json({ reply: response.content[0]?.text || fallbackReply(intent), intent });
  } catch (err) {
    res.json({ reply: fallbackReply(intent), intent });
  }
});

// ── ANALYTICS ──
app.post('/api/analytics', (req, res) => {
  const { event, data } = req.body;
  console.log(`[ZAYR Analytics] ${event}:`, data);
  res.json({ ok: true });
});

// ── WHATSAPP LINK ──
app.get('/api/whatsapp', (req, res) => {
  const { product, size, message } = req.query;
  const WA = process.env.WA_NUMBER || '923257854274';
  let text = message || 'Hello ZAYR, I would like to inquire about your collection.';
  if (product) text = `Hello ZAYR, I would like to order: ${product}${size ? ` (Size: ${size})` : ''}`;
  res.json({ url: `https://wa.me/${WA}?text=${encodeURIComponent(text)}` });
});

// ── HELPERS ──
function classifyIntent(msg) {
  const m = msg.toLowerCase();
  if (m.includes('size') || m.includes('fit') || m.includes('measurement')) return 'sizing';
  if (m.includes('order') || m.includes('buy') || m.includes('purchase') || m.includes('price')) return 'purchase';
  if (m.includes('outfit') || m.includes('wear') || m.includes('style') || m.includes('look') || m.includes('dinner') || m.includes('occasion')) return 'styling';
  if (m.includes('return') || m.includes('ship') || m.includes('delivery') || m.includes('care')) return 'support';
  if (m.includes('recommend') || m.includes('suggest') || m.includes('best')) return 'recommendation';
  return 'general';
}

function buildContextPrompt(intent, context) {
  const map = {
    sizing: '\n\nFocus on sizing guidance. Reference specific measurements from the size guide if helpful.',
    purchase: '\n\nFocus on purchase guidance. Always end with the WhatsApp number for ordering.',
    styling: '\n\nFocus on outfit curation and styling advice. Reference specific ZAYR pieces.',
    support: '\n\nFocus on customer support. For complex issues, direct to WhatsApp.',
    recommendation: '\n\nFocus on product recommendations. Match the customer\'s evident taste.',
    general: ''
  };
  return map[intent] || '';
}

function fallbackReply(intent) {
  const fallbacks = {
    sizing: 'For precise sizing, I\'d recommend visiting our Size Guide section — or reach our team directly on WhatsApp for a personalised fit consultation.',
    purchase: 'To place an order, please reach us on WhatsApp at +92 325 785 4274. We\'ll handle everything from there.',
    styling: 'ZAYR\'s Linen Co-ord and the Merino Blazer are consistently our most versatile pieces. A strong starting point for any old money wardrobe.',
    support: 'For any queries our team can\'t resolve here, WhatsApp is the fastest route: +92 325 785 4274.',
    recommendation: 'The Heritage Overshirt and Wool Blend Trousers are exceptional choices for a man building his foundational wardrobe.',
    general: 'I\'m briefly unavailable. Please reach the ZAYR team directly on WhatsApp at +92 325 785 4274.'
  };
  return fallbacks[intent] || fallbacks.general;
}

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZAYR server running on port ${PORT}`));
