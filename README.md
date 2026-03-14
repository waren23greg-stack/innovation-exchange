# Innovation Exchange 🔐
### The Global Stock Market for Ideas

> The world's first cryptographically secured intellectual property marketplace — where ideas become legally tradeable assets.

[![CI/CD](https://github.com/waren23greg-stack/innovation-exchange/actions/workflows/deploy.yml/badge.svg)](https://github.com/waren23greg-stack/innovation-exchange/actions)

## 🌐 Live
- **App**: https://innovation-exchange.vercel.app
- **API**: https://innovation-exchange.onrender.com
- **Health**: https://innovation-exchange.onrender.com/health

## 🏗️ Architecture
- **Frontend**: HTML/CSS/JS — Vercel
- **Backend**: Node.js + Express 4 — Render
- **Database**: PostgreSQL 16 — Supabase
- **Blockchain**: Hyperledger Fabric (IOL)
- **AI**: Hugging Face sentence-transformers
- **Auth**: JWT + bcrypt + refresh tokens

## 🔐 Core Features
| Feature | Status |
|---|---|
| SHA-256 Idea Fingerprinting | ✅ Live |
| AES-256-GCM Layer Encryption | ✅ Live |
| 5-Layer CID Vault | ✅ Live |
| Idea Ownership Ledger | ✅ Live |
| DocuSign NDA Integration | ✅ Live |
| Escrow Payment Hold | ✅ Live |
| AI Similarity Detection | ✅ Live |
| Innovation Score Engine | ✅ Live |
| Legal PDF Certificate | ✅ Live |
| Secure Document Viewer | ✅ Live |
| GitHub Actions CI/CD | ✅ Live |

## 🚀 Quick Start
```bash
git clone https://github.com/waren23greg-stack/innovation-exchange.git
cd innovation-exchange/backend
npm install
cp .env.example .env  # fill in your values
node src/server.js
```

## 📡 API Endpoints
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh

GET  /api/ideas                          — browse published ideas
POST /api/ideas                          — create idea (auth required)
GET  /api/ideas/:id                      — get idea with layers
POST /api/ideas/:id/publish              — publish idea
POST /api/ideas/:id/layers               — add CID layer
POST /api/ideas/:id/layers/:n/unlock     — unlock layer
POST /api/ideas/:id/nda                  — send NDA for signing
POST /api/ideas/:id/escrow               — deposit escrow
POST /api/ideas/:id/transfer             — transfer ownership
POST /api/ideas/:id/score                — compute Innovation Score
GET  /api/ideas/:id/certificate          — get IP certificate (JSON)
GET  /api/ideas/:id/certificate/pdf      — download IP certificate (PDF)
```

## 🔒 Security
- Zero Trust architecture
- AES-256-GCM encryption at rest
- TLS 1.3 in transit
- JWT (15min) + refresh tokens (7d)
- INSERT-ONLY disclosure_events table
- SHA-256 watermarking per viewer session
- Screenshot detection in secure viewer

## 📄 License
MIT — © 2026 Innovation Exchange
