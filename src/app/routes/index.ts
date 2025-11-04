import express from "express";
import { authRoutes } from "../modules/auth/auth.routes";
import { adminRoutes } from "../modules/admin/admin.routes";
import { serviceRoutes } from "../modules/service/service.routes";
import { DistanceRoutes } from "../modules/distance/distance.routes";
import { profileRoutes } from "../modules/profile/profile.routes";
import { bookingRoutes } from "../modules/booking/booking.routes";
import { messageRoutes } from "../modules/message/message.routes";
import { notificationRoutes } from "../modules/notification/notification.routes";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/admin",
    route: adminRoutes,
  },
  {
    path: "/service",
    route: serviceRoutes,
  },
  {
    path: "/distance",
    route: DistanceRoutes,
  },
  {
    path: "/profile",
    route: profileRoutes,
  },
  {
    path: "/booking",
    route: bookingRoutes,
  },
  {
    path: "/messages",
    route: messageRoutes,
  },
  {
    path: "/notifications",
    route: notificationRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
