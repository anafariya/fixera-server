import { Router } from "express";
import { getProfessionalsByCategory, getAllProfessionals } from "../../handlers/Professional";
import { authMiddleware } from "../../middlewares/auth";
import {
  createSupportTicket,
  listMyTickets,
  replyToMyTicket,
  createMeetingRequest,
  listMyMeetingRequests,
} from "../../handlers/Professional/support";

const router = Router();

// Public route to get all approved professionals
router.route("/").get(getAllProfessionals);

// Public route to get professionals by category slug
router.route("/by-category/:categorySlug").get(getProfessionalsByCategory);

// Professional support — authenticated professional only
router.use("/support", authMiddleware(["professional"]));
router.route("/support/tickets").get(listMyTickets).post(createSupportTicket);
router.route("/support/tickets/:id/reply").post(replyToMyTicket);
router.route("/support/meeting-requests").get(listMyMeetingRequests).post(createMeetingRequest);

export default router;
