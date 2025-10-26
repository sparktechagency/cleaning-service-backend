# Cleaning Service App Backend

A comprehensive backend system for a cleaning service marketplace with real-time messaging capabilities.

## 🚀 Features

### Core Functionality
- **User Management**: Admin, Service Providers, and Customers (Owners)
- **Service Listing**: Providers can create and manage cleaning services
- **Booking System**: Complete booking lifecycle (PENDING → ONGOING → COMPLETED → CANCELLED)
- **Rating & Reviews**: Customers can rate and review completed services
- **Distance Calculation**: Haversine formula for location-based service matching
- **Payment Integration**: Stripe payment processing
- **Email Notifications**: Automated emails using Nodemailer

### Real-Time Features (Socket.IO)
- **Live Messaging**: Real-time chat between customers and providers
- **Online Status**: See who's online in real-time
- **Typing Indicators**: Know when someone is typing
- **Read Receipts**: Message delivery and read status
- **Instant Notifications**: Real-time updates for bookings and messages

## 🛠️ Technologies

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.IO for WebSocket connections
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Zod schema validation
- **File Upload**: Cloudinary/AWS S3 integration
- **Email**: Nodemailer
- **Payment**: Stripe

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/sparktechagency/cleaning-service-backend.git

# Navigate to project directory
cd cleaning-service-backend

# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env

# Run database seeder (optional)
npm run seed

# Start development server
npm run dev
```

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=8000
DATABASE_URL=mongodb://localhost:27017/cleaning-service

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
EXPIRES_IN=7d
RESET_PASS_TOKEN=your_reset_token_secret
RESET_PASS_TOKEN_EXPIRES_IN=10m

# Email Configuration
EMAIL=your_email@example.com
APP_PASS=your_email_app_password
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password

# Cloudinary (optional)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Stripe (optional)
STRIPE_SECRET_KEY=your_stripe_secret_key

# Other
WEBSITE_NAME=Cleaning Service
CONTACT_MAIL=contact@example.com
RESET_PASS_LINK=http://localhost:3000/reset-password
```

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/verify-email` - Verify email with OTP
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password

### Service Endpoints
- `GET /api/v1/service` - Get all services
- `POST /api/v1/service` - Create new service
- `GET /api/v1/service/:id` - Get service details
- `PATCH /api/v1/service/:id` - Update service
- `DELETE /api/v1/service/:id` - Delete service
- `GET /api/v1/service/ratings-reviews/:id` - Get service reviews

### Booking Endpoints
- `GET /api/v1/booking` - Get all bookings
- `POST /api/v1/booking` - Create new booking
- `GET /api/v1/booking/:id` - Get booking details
- `PATCH /api/v1/booking/:id` - Update booking
- `POST /api/v1/booking/rating-review/:id` - Add rating and review
- `GET /api/v1/booking/rating-review-page/:id` - Get rating page info

### Message Endpoints (REST API)
- `POST /api/v1/messages` - Send a message
- `GET /api/v1/messages/conversations` - Get all conversations
- `GET /api/v1/messages/:receiverId` - Get messages with a user
- `PATCH /api/v1/messages/read/:senderId` - Mark messages as read

## 🔌 Socket.IO Events

### Client → Server Events
- `send_message` - Send a message
- `typing` - Indicate typing status
- `mark_as_read` - Mark messages as read
- `users_list` - Request users list

### Server → Client Events
- `receive_message` - Receive new message
- `message_sent` - Message sent confirmation
- `online_users` - Updated list of online users
- `user_typing` - Someone is typing
- `messages_read` - Messages were read
- `users_list_response` - Users list response

**📖 Full Socket.IO Documentation**: See [SOCKET_MESSAGING_DOCUMENTATION.md](./SOCKET_MESSAGING_DOCUMENTATION.md)

## 🧪 Testing Socket.IO

1. Open `socket-test.html` in your browser
2. Login via API to get JWT token
3. Paste token in the test page
4. Connect and start sending messages

Alternatively, use the REST API endpoints with Thunder Client or Postman.

## 🗄️ Database Seeding

Generate test data with realistic images and users:

```bash
npm run seed
```

This creates:
- 1 Admin user
- 10 Customer accounts
- 5 Service Provider accounts
- 10 Services with real images
- 83 Bookings (59 with ratings/reviews)

**Default Password**: `12345678` for all accounts

**Test Accounts**:
- Admin: `admin@cleaningservice.com`
- Customers: `owner1@example.com` to `owner10@example.com`
- Providers: `provider1@example.com` to `provider5@example.com`

## 📁 Project Structure

```
src/
├── app/
│   ├── middlewares/         # Auth, validation, error handling
│   ├── models/              # Mongoose models
│   │   ├── User.model.ts
│   │   └── Message.model.ts
│   ├── modules/             # Feature modules
│   │   ├── auth/
│   │   ├── admin/
│   │   ├── service/
│   │   ├── booking/
│   │   ├── message/        # Real-time messaging
│   │   ├── profile/
│   │   └── distance/
│   └── routes/              # API routes
├── config/                  # Configuration files
├── errors/                  # Error handlers
├── helpers/                 # Utility functions
├── interfaces/              # TypeScript interfaces
├── shared/                  # Shared utilities
├── socket/                  # Socket.IO handler
│   └── socketHandler.ts
├── utils/                   # Helper utilities
├── app.ts                   # Express app setup
└── server.ts                # Server entry point
```

## 🔐 User Roles

### ADMIN
- Manage all users
- Create/manage categories
- View all bookings and services
- System configuration

### PROVIDER
- Create and manage services
- Accept/reject bookings
- Update booking status
- Receive messages from customers
- View earnings and ratings

### OWNER (Customer)
- Browse and book services
- Rate and review completed services
- Message service providers
- Track booking history
- Manage profile

## 🌟 Key Features Implementation

### Real-Time Messaging
- JWT-authenticated WebSocket connections
- Private chat rooms per user
- Message persistence in MongoDB
- Online/offline status tracking
- Typing indicators
- Message read receipts

### Rating System
- 1-5 star ratings on completed bookings
- Automatic service rating average calculation
- Review text with timestamps
- Only booking owner can rate
- One rating per booking

### Booking Lifecycle
1. **PENDING** - Initial state after booking
2. **ONGOING** - Provider accepted and service in progress
3. **COMPLETED** - Service finished, ready for rating
4. **CANCELLED** - Booking cancelled by either party

### Payment Flow
1. **UNPAID** - Initial state
2. **PAID** - Payment successful via Stripe
3. **REFUNDED** - Payment refunded after cancellation

## 🚦 Running the Application

```bash
# Development mode with auto-reload
npm run dev

# Production build
npm run build

# Start production server
npm start
```

The server will start on `http://localhost:8000` (or your configured PORT)

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run seed` - Seed database with test data
- `npm run generate` - Generate new module structure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👥 Contact

- **Repository**: [cleaning-service-backend](https://github.com/sparktechagency/cleaning-service-backend)
- **Organization**: Spark Tech Agency

## 🙏 Acknowledgments

- Socket.IO for real-time capabilities
- MongoDB for flexible data storage
- Express.js for robust API framework
- All contributors and testers
