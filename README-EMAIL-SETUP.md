# Email Alert Setup Guide

## Overview
The system now supports email alerts for:
- Sensor disconnections
- ESP device offline
- MQTT broker connection issues

## Setup Instructions

### 1. Deploy Email API Endpoint

You need to deploy the email service to send alerts. Choose one of these options:

#### Option A: Vercel (Recommended)
1. Create a `vercel.json` file in your project root:
```json
{
  "functions": {
    "api/send-email.js": {
      "runtime": "nodejs18.x"
    }
  }
}
```

2. Deploy to Vercel:
```bash
npm install -g vercel
vercel
```

3. Update the API_URL in `admin.js` to your Vercel deployment URL.

#### Option B: Netlify
1. Create a `netlify.toml` file:
```toml
[build]
  functions = "api"
```

2. Deploy to Netlify and update API_URL in `admin.js`.

#### Option C: Local Node.js Server
1. Install dependencies:
```bash
npm install express cors
```

2. Create `server.js`:
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Copy the handler from api/send-email.js
app.post('/api/send-email', async (req, res) => {
  // ... handler code ...
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

3. Run: `node server.js`
4. Update API_URL in `admin.js` to `http://localhost:3000/api/send-email`

### 2. Configure Sender Email in Brevo

1. Go to Brevo dashboard: https://app.brevo.com
2. Navigate to Senders & IP
3. Add and verify your sender email address
4. Update the sender email in `api/send-email.js`:
```javascript
sender: {
  name: 'Smart Parking System',
  email: 'your-verified-email@yourdomain.com' // Update this
}
```

### 3. Set Alert Email in Admin Dashboard

1. Open the Admin Dashboard
2. Find the "Email Alert Settings" section
3. Enter your email address where you want to receive alerts
4. Click "Save Email"

The email will be saved to Firebase and used for all future alerts.

## Alert Types

### Sensor Disconnection
- Triggered when a sensor status is not "Working"
- Also triggered if no sensor data received for 2+ minutes
- Cooldown: 5 minutes between alerts for the same sensor

### MQTT Connection Lost
- Triggered when MQTT broker connection fails or closes
- Cooldown: 5 minutes between alerts

### ESP Offline
- Detected when sensors stop reporting (timeout-based)
- Cooldown: 5 minutes between alerts

## Testing

To test the email alerts:
1. Disconnect a sensor or stop the ESP device
2. Wait 2 minutes
3. Check your email for the alert

## Troubleshooting

### Emails not sending
- Check browser console for errors
- Verify API endpoint is accessible
- Check Brevo API key is correct
- Ensure sender email is verified in Brevo
- Check API_URL in admin.js matches your deployment

### Too many emails
- Alerts have a 5-minute cooldown per issue type
- This prevents spam if multiple sensors fail simultaneously

### API CORS errors
- Make sure your API endpoint allows CORS
- For local development, use a proxy or local server

