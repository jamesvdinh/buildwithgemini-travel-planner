# ✈️ Travel Planner AI - Live Itinerary & Observability Studio

> An AI-powered agentic travel companion built with **Google ADK (Agent Development Kit)**, **Gemini 3.6 Flash**, **Google Maps API**, **Open-Meteo Weather**, and an interactive **Multi-Marker Leaflet Map Studio**.

[![Deployed on Vertex AI](https://img.shields.io/badge/Deployed%20on-Vertex%20AI%20Agent%20Runtime-4285F4?logo=google-cloud&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20by-Gemini%203.6%20Flash-8E75B2?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Built with ADK](https://img.shields.io/badge/Framework-Google%20ADK%201.2.1-34A853?logo=python&logoColor=white)](https://github.com/google/agents-cli)

---

## 🌟 What This Project Is About

**Travel Planner AI** is a full-stack, autonomous ReAct agent application designed to streamline trip planning. It serves as your personal concierge to research attractions, fetch real-time weather, search restaurants, recommend spot details with live Google Maps data, and continuously maintain a **Live Master Itinerary (`itinerary.md`)**.

### Key Features

- **🗺️ Interactive Multi-Marker Map Studio**:
  - Live **Leaflet Map** tab right alongside the Markdown editor and preview.
  - Automatically parses `itinerary.md` schedule bullet points to plot pinpoint interactive markers for attractions, restaurants, and focus areas simultaneously.
  - Custom pin icons for ⛩️ Temples & Landmarks, 🍣/🍜 Dining, 🏙️ Observatories, and 🛍️ Focus Areas.
  - Interactive popups with ratings, reviews, and direct Google Maps navigation links.

- **📍 Real-Time Google Maps Details (`get_google_maps_place_details`)**:
  - Integrates with Google Places API & local knowledge bases to pull star ratings (e.g. `4.8 ⭐`), price levels, admission fees, operating hours, top guide reviews, and verified photo URLs for recommended spots.

- **⛅ Live Weather Engine (`get_live_weather_open_meteo`)**:
  - Fetches real-time temperature, condition descriptions, and high/low forecasts via Open-Meteo API for Tokyo, Kyoto, Paris, and any global destination.

- **🛡️ In-Chat Permission Approval Controls**:
  - Claude-Code inspired in-chat edit permissions.
  - Choose between **Manual Approval** (requires explicitly approving edits via in-chat cards) or **Auto-Edit Mode** for seamless session edits.

- **🔬 Observability & Live Tool Tracing**:
  - Built-in execution telemetry tracing tool calls, arguments, and responses in real-time.

- **🚀 Deployed to Vertex AI Agent Runtime**:
  - Fully containerized and deployed as a managed Reasoning Engine on Vertex AI.

---

## 🏗️ Project Architecture

```
travel-planner/
├── app/                        # Agent Core Logic
│   ├── agent.py               # Main Root ReAct Agent & Tool Definitions
│   ├── fast_api_app.py        # FastAPI Backend Proxy
│   └── app_utils/             # Helpers & utilities
├── frontend/                   # Web Application Studio UI
│   ├── server.py              # Full-stack Python Web Server (Port 3000)
│   └── static/
│       ├── index.html         # 3-Panel Responsive Layout
│       ├── app.js             # Real-time WebSockets / Fetch Chat & Map Engine
│       └── style.css          # Sleek Dark-Mode Styling
├── itinerary.md                # Source of Truth Master Itinerary
├── tests/                      # Unit, integration, and load test suites
├── GEMINI.md                   # AI Assistant project context
└── pyproject.toml              # Dependencies managed by uv
```

---

## ⚡ Setup & Quick Start Guide

### Prerequisites

Ensure you have the following installed:
1. **Python 3.11+**
2. **uv** (Fast Python package manager):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
3. **google-agents-cli**:
   ```bash
   uv tool install google-agents-cli
   ```
4. **Google Cloud SDK (`gcloud`)**:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

---

### 🚀 Running the Application Locally

#### 1. Install Dependencies
```bash
agents-cli install
```

#### 2. Launch the Full-Stack Travel Studio Web App
Run the full-stack server (FastAPI + Web UI + Live Map):
```bash
uv run python frontend/server.py
```
Open your browser and navigate to **`http://localhost:3000`**!

#### 3. Test Agent via ADK Playground
To test or debug the raw agent in the ADK CLI playground:
```bash
agents-cli playground
```

---

## ☁️ Deployment

### Deploy to Vertex AI Agent Runtime

To deploy the agent to Google Cloud Vertex AI Reasoning Engine:
```bash
gcloud config set project <your-gcp-project-id>
agents-cli deploy --project <your-gcp-project-id> --region us-central1
```

### Publish to GitHub
To publish your workspace to your personal GitHub account:
```bash
bash .agents/skills/publish-to-github/publish.sh prep
export PATH="$HOME/.local/bin:$PATH"
gh auth login --hostname github.com --git-protocol https --web
bash .agents/skills/publish-to-github/publish.sh commit
gh repo create buildwithgemini-travel-planner --public --source=. --remote=origin --push
```

---

## 🧪 Testing & Code Quality

Run tests and linting:
```bash
# Run unit & integration tests
uv run pytest tests/unit tests/integration

# Run linting checks
agents-cli lint

# Evaluate agent quality with LLM-as-a-judge
agents-cli eval
```

---

## 📜 License & Acknowledgments

Built for the **Build with Gemini** challenge powered by **Google Cloud**, **Google DeepMind**, and **Antigravity AI**.
