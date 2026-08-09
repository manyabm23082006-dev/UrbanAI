# UrbanAI
AI-powered smart city platform connecting citizens, traffic authorities, municipalities, and emergency teams through intelligent incident management, traffic analytics, geospatial insights, real-time response, and Google Maps-like navigation and directions for everyone.

# 🚦 UrbanGuard AI

### AI-Powered Smart City Intelligence & Emergency Response Platform

UrbanGuard AI is a full-stack smart city platform that connects **citizens, traffic authorities, municipalities, government administrators, and emergency services** through a unified intelligent system.

The platform combines **AI-powered incident prioritization, traffic analytics, geospatial intelligence, emergency response, infrastructure reporting, vehicle management, and dynamic navigation** to help cities make faster and more informed decisions.

> **One City. One Intelligence Layer. Smarter Decisions. Faster Response.**

---

## 🌆 Problem

Urban problems such as traffic congestion, road damage, infrastructure failures, accidents, and emergency situations are often handled through disconnected systems.

This can lead to:

* Delayed emergency response
* Difficulty prioritizing critical infrastructure issues
* Fragmented communication between departments
* Limited visibility into city-wide problems
* Inefficient traffic management
* Lack of actionable insights from citizen reports

UrbanGuard AI brings these functions together into a single platform.

---

## 💡 Solution

UrbanGuard AI creates a connected workflow:

```text
Detect → Report → Analyze → Prioritize → Respond → Track → Resolve
```

Citizens and connected systems provide information, while the platform's intelligence layer analyzes incidents and delivers relevant information to the appropriate authorities.

---

## ✨ Key Features

### 👤 Citizen Management

* Secure registration and authentication
* OTP verification
* UrbanGuard ID
* Emergency contacts
* Citizen profile management

### 🚗 Vehicle & Document Management

* Vehicle registration
* RC and insurance management
* Driving licence tracking
* PUC and other document management
* Document expiry notifications

### 📸 Civic Issue Reporting

* Report potholes and infrastructure problems
* Upload images
* GPS-based location reporting
* Map-based location selection
* Track incident status
* Identify recurring issues

### 🧠 Explainable AI

* Intelligent incident prioritization
* Severity-based analysis
* Location and traffic impact analysis
* Recurrence-based prioritization
* Explainable decision factors

### 🚦 Traffic Intelligence

* Traffic condition monitoring
* Congestion analysis
* Route scoring
* Diversion recommendations
* Traffic-aware navigation
* Turn-by-turn directions

### 🚨 Emergency Response

* Emergency incident reporting
* Response-unit assignment
* Emergency status tracking
* ETA monitoring
* Triage and first-aid guidance
* Incident resolution tracking

### 🏛️ Government & Municipality Intelligence

* City-wide analytics
* Ward-level analysis
* Infrastructure monitoring
* City Health Index
* Maintenance priority analysis
* Budget and workforce insights

### 🤖 AI Urban Assistant

Users and authorized personnel can query available city data and receive intelligent, data-driven insights.

### 🗺️ Geospatial Intelligence

* Interactive maps
* GPS positioning
* Reverse geocoding
* Location search
* Route visualization
* Incident-aware navigation

### 🔔 Real-Time Notifications

* Emergency alerts
* Incident updates
* Assignment notifications
* Document expiry alerts
* Operational notifications

### 📡 IoT & Dataset Integration

* Traffic dataset ingestion
* HTTP-based IoT data ingestion
* Sensor-ready backend architecture
* Real-time data processing support

---

## 🏗️ System Architecture

```text
                   ┌──────────────────────┐
                   │ Citizens / IoT / Data│
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │   FastAPI Backend    │
                   │                      │
                   │ Authentication       │
                   │ API Services         │
                   │ Business Logic       │
                   └──────────┬───────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          ┌──────────┐  ┌───────────┐  ┌──────────┐
          │ AI / ML  │  │ Database  │  │  Redis   │
          │ Engine   │  │           │  │ / Cache  │
          └────┬─────┘  └─────┬─────┘  └──────────┘
               │              │
               └──────────────┼──────────────┐
                              ▼              │
                   ┌──────────────────────┐  │
                   │ Role-Based Dashboards│◄─┘
                   └──────────────────────┘
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
       Citizen        Traffic        Municipality
                       │
                    Emergency
                       │
                    Government
```

---

## 🔄 Platform Workflow

```text
Citizen / Sensor / Traffic Data
              ↓
       Data Collection
              ↓
       Data Validation
              ↓
        Data Storage
              ↓
      AI & Analytics Layer
              ↓
   ┌─────────────────────────┐
   │ Priority Analysis       │
   │ Traffic Intelligence    │
   │ Route Scoring            │
   │ City Health Analytics    │
   │ Budget Analysis          │
   └────────────┬────────────┘
                ↓
       Role-Based Decision
                ↓
        Action & Response
                ↓
       Tracking & Resolution
                ↓
          City Analytics
```

---

## 🛠️ Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript
* Interactive Maps
* REST API Integration
* WebSocket Communication

### Backend

* Python
* FastAPI
* Uvicorn
* SQLAlchemy
* Pydantic

### Database

* PostgreSQL
* SQLite
* SQLAlchemy ORM

### Authentication & Security

* JWT
* OAuth2
* Passlib
* Password Hashing
* Role-Based Access Control
* OTP Verification

### Real-Time & Infrastructure

* Redis
* WebSockets
* Docker
* Docker Compose
* Nginx

### Intelligence

* Explainable AI
* Traffic Analytics
* Geospatial Analysis
* Route Scoring
* City Health Analytics
* Predictive/Decision Support

---

## 📂 Project Structure

```text
urbanfinal/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

* Python 3.11+
* Git
* VS Code
* PostgreSQL *(if using PostgreSQL configuration)*
* Docker *(optional)*

### 1. Clone the repository

```bash
git clone <YOUR-GITHUB-REPOSITORY-URL>
cd urbanfinal
```

### 2. Create a virtual environment

```bash
cd backend
python -m venv venv
```

### 3. Activate the environment

**Windows PowerShell:**

```powershell
.\venv\Scripts\Activate.ps1
```

### 4. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 5. Configure environment variables

Create a `.env` file based on:

```text
.env.example
```

Add your local database and application configuration.

> Never commit `.env` or API keys to GitHub.

### 6. Start the backend

```bash
python -m uvicorn app.main:app --reload
```

### 7. Open the application

```text
http://127.0.0.1:8000
```

### API Documentation

FastAPI Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

---

## 🐳 Docker

If Docker is configured for your environment:

```bash
docker compose up --build
```

This allows the application infrastructure to be started using the project's container configuration.

---

## 🔐 Security

UrbanGuard AI is designed with security and access control in mind.

Key mechanisms include:

* JWT authentication
* Secure password hashing
* Role-based authorization
* Protected API endpoints
* OTP verification
* Environment-based configuration
* Separation of application secrets from source code

---

## 🌍 Impact

UrbanGuard AI aims to help cities become:

**Smarter • Safer • Faster • More Connected • Data-Driven**

By bringing citizens, infrastructure management, traffic intelligence, emergency response, and government analytics into one platform, UrbanGuard AI provides a foundation for more coordinated and responsive urban management.

---

## 🔮 Future Scope

Potential future enhancements include:

* Computer vision-based road damage detection
* Real-time traffic camera integration
* Advanced predictive maintenance
* Large-scale IoT sensor networks
* Public transportation integration
* Environmental monitoring
* Advanced GIS analytics
* Mobile applications
* Cloud-scale deployment
* Digital twin integration

---

## 📌 Project Highlights

| Capability               | Status |
| ------------------------ | ------ |
| Citizen Platform         | ✅      |
| Infrastructure Reporting | ✅      |
| Vehicle Management       | ✅      |
| Traffic Intelligence     | ✅      |
| Emergency Response       | ✅      |
| Explainable AI           | ✅      |
| Geospatial Intelligence  | ✅      |
| Dynamic Navigation       | ✅      |
| Government Analytics     | ✅      |
| Municipality Dashboard   | ✅      |
| AI Urban Assistant       | ✅      |
| IoT Integration          | ✅      |
| Real-Time Notifications  | ✅      |
| JWT Authentication       | ✅      |
| Docker Support           | ✅      |

---

## 👥 Project

**UrbanGuard AI**

An intelligent urban technology platform focused on improving **mobility, infrastructure management, emergency response, and citizen engagement** through AI and real-time data.

> **Building smarter cities through intelligent technology.**
