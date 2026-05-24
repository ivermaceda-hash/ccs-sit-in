# CCS Sit-In Monitoring System

A web-based sit-in monitoring system for the University of Cebu - College of Computer Studies.

## Features

### Student
- Register with ID Number, name, course, year level, email, and password
- Login / Logout
- Request and start a sit-in session (purpose + lab)
- Real-time session timer while sitting in
- End own session
- Edit profile (name, course, email, address, password)
- View full sit-in records/history

### Admin
- Login with `admin` / `admin123`
- Overview dashboard with stats
- **Search** — Find students by name or ID, edit info, reset sessions
- **Add Sit-In** — Manually start a sit-in for any student
- **Current Sit-In** — View all active sessions, end any session
- **Sit-In Records** — View complete history with search
- Sign out

## How to Open

Simply open `index.html` (or `login.html`) in any modern web browser.

> No server or installation needed — it runs entirely in the browser using `localStorage`.

## Default Admin Credentials

| Field     | Value     |
|-----------|-----------|
| ID Number | `admin`   |
| Password  | `admin123`|

## File Structure

```
ccs-sitin/
├── index.html          ← Landing page
├── login.html          ← Login page
├── register.html       ← Registration page
├── about.html          ← About page
├── css/
│   └── style.css       ← All styles
├── js/
│   └── app.js          ← App logic (Auth, SitIn, Users)
└── pages/
    ├── student-dashboard.html  ← Student portal
    └── admin-dashboard.html    ← Admin portal
```

## Tech Stack
- HTML5, CSS3, Vanilla JavaScript
- Google Fonts (Playfair Display + DM Sans)
- localStorage for data persistence
