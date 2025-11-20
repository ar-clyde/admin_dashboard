// Vercel/Netlify serverless function
// Deploy this to: /api/send-email.js

const BREVO_API_KEY = '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';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toEmail, subject, message } = req.body;
    
    if (!toEmail || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'Smart Parking System',
          email: 'noreply@smartparking.com' // Update with your verified sender email
        },
        to: [
          {
            email: toEmail
          }
        ],
        subject: subject,
        htmlContent: message,
        textContent: message.replace(/<[^>]*>/g, '')
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brevo API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return res.status(200).json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: error.message });
  }
}

