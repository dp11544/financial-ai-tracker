 
📊 Finance AI Tracker

Finance AI Tracker is a full-stack application that helps users manage personal finances with AI-powered transaction parsing, Google OAuth 2.0 authentication, and beautiful data visualizations.

🚀 Features

🔐 Secure Google OAuth 2.0 Login

🤖 AI-powered transaction parsing from natural language or uploaded bills

📊 Interactive charts for spending insights

📱 Responsive UI (mobile + desktop)

🗄 MongoDB database for storing users & transactions

🎨 Modern UI designed with AI tools

🛠 Tech Stack

Frontend: React, TailwindCSS, Recharts

Backend: Node.js, Express

Database: MongoDB (Atlas or Local)

Authentication: Google OAuth 2.0

AI Tools: Tesseract.js (OCR), custom parsing logic

📂 Project Structure
finance-ai-tracker/
 ├── frontend/              # React application
 ├── backend/               # Express server
 ├── docs/                  # Screenshots & documentation
 ├── README.md              # Complete setup guide
 ├── .env.example           # Environment variable template
 └── package.json           # Dependencies

⚙️ Setup Instructions
1️⃣ Clone Repository
git clone https://github.com/<your-username>/finance-ai-tracker.git
cd finance-ai-tracker

2️⃣ Install Dependencies
Backend
cd backend
npm install

Frontend
cd ../frontend
npm install

3️⃣ Setup Environment Variables

Copy .env.example → .env inside backend/

cd backend
copy .env.example .env   # (Windows)
# or
cp .env.example .env     # (Mac/Linux)


Then fill in your values:

GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
MONGO_URI=your_mongo_connection_string_here
SESSION_SECRET=your_random_secret_here
PORT=5000

4️⃣ Setup Google OAuth 2.0

Go to Google Cloud Console

Create a new project

Enable OAuth consent screen

Create OAuth Client ID → Choose Web Application

Add authorized redirect URIs:

http://localhost:5000/auth/google/callback


Copy Client ID and Client Secret into .env

5️⃣ Setup MongoDB

Use MongoDB Atlas
 (recommended)

Create a new cluster & get the connection string

Replace MONGO_URI in .env

6️⃣ Run Application
Start Backend
cd backend
npm start

Start Frontend
cd ../frontend
npm start


Backend → http://localhost:5000

Frontend → http://localhost:3000

🧪 Demo Checklist

✅ Login with Google OAuth
✅ Add transactions (manually or via AI parsing)
✅ View spending analytics & charts
✅ Check responsive design (mobile + desktop)

📸 Screenshots

(Save screenshots in docs/ folder and paste them here)

🙌 Credits

Google OAuth 2.0

MongoDB Atlas

Tesseract.js (OCR for bills)

Recharts (data visualization)

AI tools used for design assistance