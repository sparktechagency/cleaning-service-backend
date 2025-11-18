import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "../../models/Transaction.model";
import { User } from "../../models/User.model";
import {
  findMatchingUsers,
  sortByRelevance,
  paginateResults,
} from "../../../helpers/searchHelper";

// Create a transaction record for subscription purchase
const recordSubscriptionPurchase = async (data: {
  userId: string;
  subscriptionId: string;
  plan: string;
  amount: number;
  creditsUsed?: number;
  creditDollarValue?: number;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  redemptionId?: string;
  metadata?: Record<string, any>;
}) => {
  const user = await User.findById(data.userId).select("userName role");

  if (!user) {
    throw new Error("User not found for transaction recording");
  }

  const netAmount = data.amount - (data.creditDollarValue || 0);
  const paymentMethod = data.creditsUsed
    ? netAmount > 0
      ? PaymentMethod.MIXED
      : PaymentMethod.CREDITS
    : PaymentMethod.STRIPE_CARD;

  const transaction = await Transaction.create({
    transactionId: (Transaction as any).generateTransactionId(),
    transactionType: TransactionType.SUBSCRIPTION_PURCHASE,
    status: TransactionStatus.COMPLETED,

    // Payer (Provider buying subscription)
    payerId: data.userId,
    payerName: user.userName,
    payerRole: user.role,

    // Receiver (Platform/Admin)
    receiverName: "Platform",
    receiverRole: "ADMIN",

    // Amounts
    amount: data.amount,
    currency: "EUR",
    netAmount,
    paymentMethod,

    // Credits
    creditsUsed: data.creditsUsed || 0,
    creditDollarValue: data.creditDollarValue || 0,

    // Stripe
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeSubscriptionId: data.stripeSubscriptionId,
    stripeCustomerId: data.stripeCustomerId,

    // Related records
    subscriptionId: data.subscriptionId as any,
    redemptionId: data.redemptionId as any,

    // Details
    description: `${data.plan} subscription purchase${
      data.creditsUsed ? ` (${data.creditsUsed} credits used)` : ""
    }`,
    completedAt: new Date(),
    metadata: data.metadata,
  });

  return transaction;
};

// Create a transaction record for booking payment
const recordBookingPayment = async (data: {
  bookingId: string;
  ownerId: string;
  providerId: string;
  amount: number;
  stripePaymentIntentId: string;
  stripeCustomerId: string;
  stripeConnectAccountId: string;
  metadata?: Record<string, any>;
}) => {
  const [owner, provider] = await Promise.all([
    User.findById(data.ownerId).select("userName role"),
    User.findById(data.providerId).select("userName role"),
  ]);

  if (!owner || !provider) {
    throw new Error("Owner or Provider not found for transaction recording");
  }

  const transaction = await Transaction.create({
    transactionId: (Transaction as any).generateTransactionId(),
    transactionType: TransactionType.BOOKING_PAYMENT,
    status: TransactionStatus.COMPLETED,

    // Payer (Owner)
    payerId: data.ownerId,
    payerName: owner.userName,
    payerRole: owner.role,

    // Receiver (Provider)
    receiverId: data.providerId,
    receiverName: provider.userName,
    receiverRole: provider.role,

    // Amounts
    amount: data.amount,
    currency: "EUR",
    netAmount: data.amount,
    paymentMethod: PaymentMethod.STRIPE_CARD,

    // Stripe
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeCustomerId: data.stripeCustomerId,
    stripeConnectAccountId: data.stripeConnectAccountId,

    // Related records
    bookingId: data.bookingId as any,

    // Details
    description: `Booking payment from ${owner.userName} to ${provider.userName}`,
    completedAt: new Date(),
    metadata: data.metadata,
  });

  return transaction;
};

// Create a transaction record for booking refund
const recordBookingRefund = async (data: {
  bookingId: string;
  ownerId: string;
  providerId: string;
  refundAmount: number;
  refundId: string;
  refundReason?: string;
  originalTransactionId?: string;
  metadata?: Record<string, any>;
}) => {
  const [owner, provider] = await Promise.all([
    User.findById(data.ownerId).select("userName role"),
    User.findById(data.providerId).select("userName role"),
  ]);

  if (!owner || !provider) {
    throw new Error("Owner or Provider not found for transaction recording");
  }

  const transaction = await Transaction.create({
    transactionId: (Transaction as any).generateTransactionId(),
    transactionType: TransactionType.BOOKING_REFUND,
    status: TransactionStatus.COMPLETED,

    // Payer (Provider - giving money back)
    payerId: data.providerId,
    payerName: provider.userName,
    payerRole: provider.role,

    // Receiver (Owner - getting refund)
    receiverId: data.ownerId,
    receiverName: owner.userName,
    receiverRole: owner.role,

    // Amounts
    amount: data.refundAmount,
    currency: "EUR",
    netAmount: data.refundAmount,
    paymentMethod: PaymentMethod.STRIPE_CARD,

    // Refund details
    refundId: data.refundId,
    refundAmount: data.refundAmount,
    refundDate: new Date(),
    refundReason: data.refundReason,
    originalTransactionId: data.originalTransactionId as any,

    // Related records
    bookingId: data.bookingId as any,

    // Details
    description: `Refund for booking from ${provider.userName} to ${owner.userName}`,
    completedAt: new Date(),
    metadata: data.metadata,
  });

  // Update original transaction status if provided
  if (data.originalTransactionId) {
    await Transaction.findByIdAndUpdate(data.originalTransactionId, {
      status: TransactionStatus.REFUNDED,
      refundId: data.refundId,
      refundAmount: data.refundAmount,
      refundDate: new Date(),
      refundReason: data.refundReason,
    });
  }

  return transaction;
};

// Create a transaction record for credit redemption (cash out)
const recordCreditRedemption = async (data: {
  userId: string;
  creditsRedeemed: number;
  dollarValue: number;
  stripePayoutId: string;
  redemptionId: string;
  bankAccountLast4: string;
  metadata?: Record<string, any>;
}) => {
  const user = await User.findById(data.userId).select("userName role");

  if (!user) {
    throw new Error("User not found for transaction recording");
  }

  const transaction = await Transaction.create({
    transactionId: (Transaction as any).generateTransactionId(),
    transactionType: TransactionType.CREDIT_REDEMPTION_CASH,
    status: TransactionStatus.COMPLETED,

    // Payer (User redeeming credits - initiator of transaction)
    payerId: data.userId,
    payerName: user.userName,
    payerRole: user.role,

    // Receiver (Same user receiving the cash)
    receiverId: data.userId,
    receiverName: user.userName,
    receiverRole: user.role,

    // Amounts
    amount: data.dollarValue,
    currency: "EUR",
    netAmount: data.dollarValue,
    paymentMethod: PaymentMethod.STRIPE_BANK_TRANSFER,

    // Credits
    creditsUsed: data.creditsRedeemed,
    creditDollarValue: data.dollarValue,

    // Stripe
    stripePayoutId: data.stripePayoutId,

    // Related records
    redemptionId: data.redemptionId as any,

    // Details
    description: `Credit redemption cash out: ${data.creditsRedeemed} credits (€${data.dollarValue}) to Stripe Connect account ending in ${data.bankAccountLast4}`,
    completedAt: new Date(),
    metadata: data.metadata,
  });

  return transaction;
};

// Create a transaction record for credit earned
const recordCreditEarned = async (data: {
  userId: string;
  creditsEarned: number;
  reason: string;
  referralId?: string;
  bookingId?: string;
  metadata?: Record<string, any>;
}) => {
  const user = await User.findById(data.userId).select("userName role");

  if (!user) {
    throw new Error("User not found for transaction recording");
  }

  const transaction = await Transaction.create({
    transactionId: (Transaction as any).generateTransactionId(),
    transactionType: TransactionType.CREDIT_EARNED,
    status: TransactionStatus.COMPLETED,

    // Receiver (User earning credits)
    receiverId: data.userId,
    receiverName: user.userName,
    receiverRole: user.role,

    // Payer (Platform giving credits)
    payerId: data.userId, // Required field - credits earned by user from platform
    payerName: "Platform",
    payerRole: "ADMIN",

    // Amounts (no actual money, just credits)
    amount: 0,
    currency: "EUR",
    netAmount: 0,
    paymentMethod: PaymentMethod.CREDITS,

    // Credits
    creditsUsed: data.creditsEarned,
    creditDollarValue: data.creditsEarned * 0.2, // For reference

    // Related records
    referralId: data.referralId as any,
    bookingId: data.bookingId as any,

    // Details
    description: `Earned ${data.creditsEarned} credits: ${data.reason}`,
    completedAt: new Date(),
    metadata: data.metadata,
  });

  return transaction;
};

// Get booking payment transaction history with owner and provider details
const getBookingPaymentHistory = async (
  options: {
    page?: number;
    limit?: number;
  } = {}
) => {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [
      { transactionType: TransactionType.BOOKING_PAYMENT },
      { transactionType: TransactionType.BOOKING_REFUND },
    ],
    $and: [
      { payerId: { $exists: true, $ne: null } },
      { receiverId: { $exists: true, $ne: null } },
    ],
  };

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("payerId", "userName email")
      .populate("receiverId", "userName email")
      .populate("bookingId", "bookingId serviceType")
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const formattedTransactions = transactions.map((transaction: any) => ({
    ownerName: transaction.payerId?.userName || transaction.payerName,
    providerName: transaction.receiverId?.userName || transaction.receiverName,
    createdAt: transaction.createdAt,
    ownerEmail: transaction.payerId?.email,
    providerEmail: transaction.receiverId?.email,
    transactionId: transaction.transactionId,
    amount: transaction.amount,
    transactionType: transaction.transactionType,
    status: transaction.status,
  }));

  return {
    transactions: formattedTransactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const searchForBookingPaymentHistory = async (
  searchTerm: string,
  options: { page?: number; limit?: number } = {}
) => {
  const { page = 1, limit = 20 } = options;

  if (!searchTerm || searchTerm.trim() === "") {
    return {
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      transactions: [],
    };
  }

  const trimmedSearch = searchTerm.trim();
  const regex = new RegExp(trimmedSearch, "i");

  // Use centralized search helper
  const userIds = await findMatchingUsers(trimmedSearch);

  const searchQuery: any = {
    $or: [
      { transactionType: TransactionType.BOOKING_PAYMENT },
      { transactionType: TransactionType.BOOKING_REFUND },
    ],
    $and: [
      { payerId: { $exists: true, $ne: null } },
      { receiverId: { $exists: true, $ne: null } },
    ],
  };

  // Add user search criteria
  if (userIds.length > 0) {
    searchQuery.$and.push({
      $or: [{ payerId: { $in: userIds } }, { receiverId: { $in: userIds } }],
    });
  } else {
    // If no matching users found, also check transaction ID
    searchQuery.$and.push({
      transactionId: regex,
    });
  }

  // Find transactions matching the search criteria
  const transactions = await Transaction.find(searchQuery)
    .populate("payerId", "userName email")
    .populate("receiverId", "userName email")
    .populate("bookingId", "bookingId serviceType")
    .sort({ createdAt: -1 })
    .lean();

  // Format the results
  const formattedTransactions = transactions.map((transaction: any) => ({
    ownerName: transaction.payerId?.userName || transaction.payerName,
    providerName: transaction.receiverId?.userName || transaction.receiverName,
    createdAt: transaction.createdAt,
    ownerEmail: transaction.payerId?.email,
    providerEmail: transaction.receiverId?.email,
    transactionId: transaction.transactionId,
    amount: transaction.amount,
    transactionType: transaction.transactionType,
    status: transaction.status,
  }));

  // Sort by relevance using centralized helper
  const sortedTransactions = formattedTransactions.sort(
    sortByRelevance(trimmedSearch, [
      "ownerName",
      "providerName",
      "ownerEmail",
      "providerEmail",
      "transactionId",
    ])
  );

  // Apply pagination using centralized helper
  const { results: paginatedTransactions, pagination } = paginateResults(
    sortedTransactions,
    page,
    limit
  );

  return {
    pagination,
    transactions: paginatedTransactions,
  };
};

const paymentTracking = async (
  options: {
    page?: number;
    limit?: number;
  } = {}
) => {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [
      { transactionType: TransactionType.SUBSCRIPTION_PURCHASE },
      { transactionType: TransactionType.SUBSCRIPTION_RENEWAL },
    ],
    status: TransactionStatus.COMPLETED,
  };

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("payerId", "userName email phoneNumber")
      .populate("subscriptionId")
      .lean(),
    Transaction.countDocuments(query),
  ]);

  // Format response with requested fields
  const formattedTransactions = transactions.map((transaction: any) => ({
    providerName: transaction.payerId?.userName || transaction.payerName,
    createdAt: transaction.createdAt,
    Package: transaction.subscriptionId?.plan || transaction.metadata?.plan,
    providerEmail: transaction.payerId?.email,
    providerPhoneNumber: transaction.payerId?.phoneNumber,
    transactionId: transaction.transactionId,
    amount: transaction.amount,
  }));

  return {
    transactions: formattedTransactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const transactionService = {
  recordSubscriptionPurchase,
  recordBookingPayment,
  recordBookingRefund,
  recordCreditRedemption,
  recordCreditEarned,
  getBookingPaymentHistory,
  searchForBookingPaymentHistory,
  paymentTracking,
};
