export const LANDING_PAGE_TEMPLATE = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <title>Cleaning Service App 🧹 — Backend Server</title>
  <style>
    :root{
      --redA:#FF000080;
      --maroonA:#3D0303DF;
      --blackA:#000000D9;
      --ink:#f3f5ff;
      --muted:#cdd3ea;
      --glassL:rgba(255,255,255,.12);
      --glassD:rgba(0,0,0,.25);
      --borderL:rgba(255,255,255,.25);
      --borderD:rgba(0,0,0,.35);
      --accent1:#ff5656;  /* for subtle highlights */
      --accent2:#b00000;
      --radius:24px;
      --shadow:0 12px 36px rgba(0,0,0,.55);
      --shadowCard:0 10px 26px rgba(0,0,0,.45);
    }

    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0;
      font:16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
      color:var(--ink);
      background-color:#0a0000;
      background:
        radial-gradient(900px 520px at 85% 6%, var(--redA) 0%, transparent 60%),
        radial-gradient(1000px 620px at 10% 95%, var(--maroonA) 0%, transparent 60%),
        linear-gradient(180deg, var(--blackA) 0%, #140000 100%);
    }

    .page{
      min-height:100svh;
      display:grid;
      grid-template-rows:auto auto 1fr;
      gap:14px;
    }
    .wrap{max-width:1120px;margin:0 auto;padding:18px 18px 28px;width:100%}

    header{display:flex;align-items:center;gap:12px}
    .badge{
      width:42px;height:42px;border-radius:12px;display:grid;place-items:center;
      font-weight:800;color:#1a0000;
      background:linear-gradient(135deg,#ff5656,#ff9a9a);
      box-shadow:0 8px 18px rgba(255,86,86,.35), inset 0 0 12px rgba(255,255,255,.35);
    }
    .brand h1{margin:0;font-size:18px}
    .brand small{display:block;margin-top:2px;color:var(--muted);font-weight:600}

    /* ===== Centered nav just above the main middle frame ===== */
    .navwrap{display:flex;justify-content:center}
    nav.nav{
      display:flex;gap:10px;align-items:center;flex-wrap:wrap;
      padding:10px 12px;border-radius:999px;
      background:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.08));
      border:1px solid var(--borderL);
      box-shadow:var(--shadowCard);
      backdrop-filter: blur(8px) saturate(130%);
    }
    nav.nav a{
      text-decoration:none;color:var(--ink);opacity:.95;
      padding:8px 12px;border-radius:10px;border:1px solid transparent;
    }
    nav.nav a:hover{
      border-color:rgba(255,255,255,.35);
      background:rgba(255,255,255,.06);
    }

    .stage{display:grid;place-items:center;padding-block:6px}
    .frame{
      width:min(1120px,95vw);
      border-radius:28px;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.18);
      box-shadow:var(--shadow);
      /* deep maroon panel */
      background:
        linear-gradient(180deg, rgba(102,8,8,.70), rgba(35,2,2,.55)),
        linear-gradient(180deg, #5a0a0a 0%, #2b0606 100%);
      position:relative;
    }
    .frame::before{
      content:""; position:absolute; inset:0; border-radius:28px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.25),
                  inset 0 -1px 0 rgba(0,0,0,.35);
      pointer-events:none;
    }

    .grid{
      display:grid;
      grid-template-columns:1.1fr .9fr;
      gap:22px;
      padding:28px;
    }
    @media (max-width: 900px){ .grid{grid-template-columns:1fr} }

    .card{
      border-radius:20px;
      padding:22px 24px;
      backdrop-filter: blur(8px) saturate(130%);
      box-shadow:var(--shadowCard);
      border:1px solid var(--borderL);
    }
    .card.light{ background:var(--glassL) }
    .card.dark{
      background:linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.18));
      border-color:var(--borderD);
    }

    h2{margin:0 0 10px;font-size:clamp(26px,3.2vw,40px);line-height:1.12;letter-spacing:.2px}
    p.lead{margin:0;color:var(--muted)}
    .gtext{
      background:linear-gradient(90deg, var(--accent1), #ff7a7a, var(--accent2));
      -webkit-background-clip:text;background-clip:text;color:transparent
    }
    .heavy{font-weight:800}
  </style>
</head>
<body>
  <div class="page" style="flex-grow:1; display:flex; flex-direction:column; justify-content:center; height:100%; width:100%; align-items:center;">
    <div class="wrap">
      <header>
        <div class="badge" aria-hidden="true">CS</div>
        <div class="brand">
          <h1>Cleaning Service App 🧹</h1>
          <small>Fast • Secure • Reliable</small>
        </div>
      </header>
    </div>
    <main class="stage">
      <section class="frame" role="region" aria-label="Welcome">
        <div class="grid">
          <article class="card light">
            <h2>Welcome to <span class="gtext">Cleaning Service App 🧹</span></h2>
            <p class="lead">A simple, Server Start page for backend.</p>
          </article>
          <article class="card light">
            <h2>This Is for <span class="gtext">Cleaning Service</span></h2>
            <p class="lead">A simple, Cleaning Service App.</p>
          </article>
          
          <article class="card dark">
            <h2>This Is <span class="gtext heavy">Backend</span><br>
                <span class="gtext heavy">Server Site</span></h2>
          </article>
          <article class="card dark">
            <h2>This Backend Server <span class="gtext heavy">Is Developed By</span><br>
                <span class="gtext heavy">Mehedi Hasan Alif</span></h2>
          </article>
        </div>
      </section>
    </main>
  </div>
</body>
</html>
`;

// Email Templates for Cleaning Service App
export const EMAIL_VERIFICATION_TEMPLATE = (otp: string, userName: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification - Cleaning Service</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15);
    }
    .header {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 20px;
      color: #333;
      margin-bottom: 20px;
      font-weight: 600;
    }
    .message {
      font-size: 16px;
      line-height: 1.6;
      color: #666;
      margin-bottom: 30px;
    }
    .otp-container {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 15px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-label {
      color: white;
      font-size: 16px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: white;
      background: rgba(255,255,255,0.2);
      padding: 15px 25px;
      border-radius: 10px;
      display: inline-block;
      border: 2px solid rgba(255,255,255,0.3);
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 10px;
      padding: 15px;
      margin: 20px 0;
      color: #856404;
      font-size: 14px;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer p {
      color: #6c757d;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .social-links {
      margin-top: 20px;
    }
    .social-links a {
      display: inline-block;
      margin: 0 10px;
      padding: 8px 16px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 20px;
      font-size: 12px;
      transition: transform 0.2s;
    }
    .social-links a:hover {
      transform: translateY(-2px);
    }
    .icon {
      width: 60px;
      height: 60px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 24px;
    }
    @media (max-width: 600px) {
      .container { margin: 10px; }
      .header, .content, .footer { padding: 20px; }
      .otp-code { font-size: 28px; letter-spacing: 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">🧹</div>
      <h1>Cleaning Service</h1>
      <p>provider Cleaning Solutions</p>
    </div>
    
    <div class="content">
      <div class="greeting">Hello ${userName}! 👋</div>
      
      <div class="message">
        Welcome to our Cleaning Service platform! We're excited to have you join our community of clean living enthusiasts.
        <br><br>
        To complete your registration and verify your email address, please use the OTP code below:
      </div>
      
      <div class="otp-container">
        <div class="otp-label">Your Verification Code</div>
        <div class="otp-code">${otp}</div>
      </div>
      
      <div class="warning">
        ⚠️ <strong>Important:</strong> This OTP will expire in 10 minutes for security purposes. 
        If you didn't request this verification, please ignore this email.
      </div>
      
      <div class="message">
        Once verified, you'll be able to:
        <ul style="margin: 15px 0; padding-left: 20px; color: #666;">
          <li>Book provider cleaning services</li>
          <li>Manage your cleaning schedule</li>
          <li>Connect with trusted cleaning providers</li>
          <li>Access exclusive deals and offers</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>Cleaning Service Team</strong></p>
      <p>Making your space sparkle, one clean at a time ✨</p>
      <p style="font-size: 12px; margin-top: 15px;">
        If you have any questions, please contact our support team.
      </p>
      <div class="social-links">
        <a href="#">📧 Support</a>
        <a href="#">🌐 Website</a>
        <a href="#">📱 Mobile App</a>
      </div>
    </div>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_TEMPLATE = (otp: string, userName: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - Cleaning Service</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15);
    }
    .header {
      background: linear-gradient(135deg, #fc466b 0%, #3f5efb 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 20px;
      color: #333;
      margin-bottom: 20px;
      font-weight: 600;
    }
    .message {
      font-size: 16px;
      line-height: 1.6;
      color: #666;
      margin-bottom: 30px;
    }
    .otp-container {
      background: linear-gradient(135deg, #fc466b 0%, #3f5efb 100%);
      border-radius: 15px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-label {
      color: white;
      font-size: 16px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: white;
      background: rgba(255,255,255,0.2);
      padding: 15px 25px;
      border-radius: 10px;
      display: inline-block;
      border: 2px solid rgba(255,255,255,0.3);
    }
    .security-notice {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 10px;
      padding: 15px;
      margin: 20px 0;
      color: #721c24;
      font-size: 14px;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer p {
      color: #6c757d;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .icon {
      width: 60px;
      height: 60px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 24px;
    }
    @media (max-width: 600px) {
      .container { margin: 10px; }
      .header, .content, .footer { padding: 20px; }
      .otp-code { font-size: 28px; letter-spacing: 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">🔐</div>
      <h1>Password Reset</h1>
      <p>Secure your account</p>
    </div>
    
    <div class="content">
      <div class="greeting">Hello ${userName}! 🔑</div>
      
      <div class="message">
        We received a request to reset your password for your Cleaning Service account. 
        <br><br>
        Use the security code below to reset your password:
      </div>
      
      <div class="otp-container">
        <div class="otp-label">Password Reset Code</div>
        <div class="otp-code">${otp}</div>
      </div>
      
      <div class="security-notice">
        🚨 <strong>Security Alert:</strong> This code will expire in 15 minutes. 
        If you didn't request this password reset, please ignore this email and contact our support team immediately.
      </div>
      
      <div class="message">
        <strong>Next Steps:</strong>
        <ol style="margin: 15px 0; padding-left: 20px; color: #666;">
          <li>Enter this OTP code in the password reset form</li>
          <li>Create a new strong password</li>
          <li>Confirm your new password</li>
          <li>Your account will be secured with the new password</li>
        </ol>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>Cleaning Service Security Team</strong></p>
      <p>Keeping your account safe and secure 🛡️</p>
      <p style="font-size: 12px; margin-top: 15px;">
        This is an automated security email. Please do not reply to this message.
      </p>
    </div>
  </div>
</body>
</html>
`;

export const WELCOME_COMPLETE_TEMPLATE = (
  userName: string,
  userRole: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Cleaning Service!</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15);
    }
    .header {
      background: linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .content {
      padding: 40px 30px;
    }
    .celebration {
      text-align: center;
      font-size: 48px;
      margin-bottom: 20px;
    }
    .greeting {
      font-size: 24px;
      color: #333;
      margin-bottom: 20px;
      font-weight: 600;
      text-align: center;
    }
    .message {
      font-size: 16px;
      line-height: 1.6;
      color: #666;
      margin-bottom: 30px;
      text-align: center;
    }
    .features-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 30px 0;
    }
    .feature {
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 15px;
      text-align: center;
      color: white;
    }
    .feature-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }
    .feature h3 {
      font-size: 16px;
      margin-bottom: 5px;
    }
    .feature p {
      font-size: 12px;
      opacity: 0.9;
    }
    .cta-button {
      display: block;
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 10px;
      text-align: center;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 36px;
    }
    @media (max-width: 600px) {
      .features-grid { grid-template-columns: 1fr; }
      .container { margin: 10px; }
      .header, .content, .footer { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">🎉</div>
      <h1>Welcome Aboard!</h1>
      <p>Your cleaning journey starts here</p>
    </div>
    
    <div class="content">
      <div class="celebration">🌟✨🧹✨🌟</div>
      
      <div class="greeting">Welcome ${userName}!</div>
      
      <div class="message">
        Congratulations! Your registration as a <strong>${userRole}</strong> has been completed successfully. 
        You're now part of our amazing cleaning community!
      </div>
      
      <div class="features-grid">
        <div class="feature">
          <div class="feature-icon">📅</div>
          <h3>Easy Booking</h3>
          <p>Schedule services with just a few taps</p>
        </div>
        <div class="feature">
          <div class="feature-icon">⭐</div>
          <h3>Quality Service</h3>
          <p>Trusted providers at your service</p>
        </div>
        <div class="feature">
          <div class="feature-icon">💰</div>
          <h3>Fair Pricing</h3>
          <p>Transparent and competitive rates</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🛡️</div>
          <h3>Secure & Safe</h3>
          <p>Your privacy and safety guaranteed</p>
        </div>
      </div>
      
      <a href="#" class="cta-button">
        🚀 Start Your Cleaning Journey
      </a>
      
      <div class="message">
        Ready to experience the cleanest service in town? 
        Your sparkling clean space is just one booking away! ✨
      </div>
    </div>
    
    <div class="footer">
      <p><strong>The Cleaning Service Team</strong></p>
      <p>Making your world sparkle, one space at a time! 🌟</p>
      <p style="font-size: 12px; margin-top: 15px;">
        Need help getting started? Our support team is here for you 24/7.
      </p>
    </div>
  </div>
</body>
</html>
`;
