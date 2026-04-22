import { Request, Response } from "express";
import mongoose from "mongoose";
import SupportTicket, { SUPPORT_TICKET_STATUSES, SupportTicketStatus } from "../../models/supportTicket";
import MeetingRequest, {
  MEETING_REQUEST_STATUSES,
  MeetingRequestStatus,
} from "../../models/meetingRequest";
import connectDB from "../../config/db";
import { IUser } from "../../models/user";

const isValidObjectId = (id: string): boolean => mongoose.Types.ObjectId.isValid(id);

export const adminListTickets = async (req: Request, res: Response) => {
  try {
    const statusQuery = typeof req.query.status === "string" ? req.query.status : undefined;
    const filter: Record<string, unknown> = {};
    if (statusQuery && SUPPORT_TICKET_STATUSES.includes(statusQuery as SupportTicketStatus)) {
      filter.status = statusQuery;
    }

    await connectDB();
    const items = await SupportTicket.find(filter)
      .populate("userId", "name email role")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("Admin list tickets error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load tickets" });
  }
};

export const adminUpdateTicket = async (req: Request, res: Response) => {
  try {
    const admin = (req as Request & { admin?: IUser }).admin;
    if (!admin) return res.status(401).json({ success: false, msg: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, msg: "Invalid ticket ID" });

    await connectDB();
    const ticket = await SupportTicket.findById(id);
    if (!ticket) return res.status(404).json({ success: false, msg: "Ticket not found" });

    if (typeof req.body?.status === "string" && SUPPORT_TICKET_STATUSES.includes(req.body.status)) {
      ticket.status = req.body.status as SupportTicketStatus;
    }
    if (typeof req.body?.reply === "string" && req.body.reply.trim()) {
      const body = req.body.reply.trim().slice(0, 5000);
      ticket.replies.push({
        authorId: admin._id,
        authorRole: "admin",
        body,
        createdAt: new Date(),
      });
    }

    await ticket.save();
    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    console.error("Admin update ticket error:", error);
    return res.status(500).json({ success: false, msg: "Failed to update ticket" });
  }
};

export const adminListMeetingRequests = async (req: Request, res: Response) => {
  try {
    const statusQuery = typeof req.query.status === "string" ? req.query.status : undefined;
    const filter: Record<string, unknown> = {};
    if (statusQuery && MEETING_REQUEST_STATUSES.includes(statusQuery as MeetingRequestStatus)) {
      filter.status = statusQuery;
    }

    await connectDB();
    const items = await MeetingRequest.find(filter)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("Admin list meeting requests error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load meeting requests" });
  }
};

export const adminUpdateMeetingRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, msg: "Invalid request ID" });

    await connectDB();
    const doc = await MeetingRequest.findById(id);
    if (!doc) return res.status(404).json({ success: false, msg: "Request not found" });

    if (typeof req.body?.status === "string" && MEETING_REQUEST_STATUSES.includes(req.body.status)) {
      doc.status = req.body.status as MeetingRequestStatus;
    }
    if (typeof req.body?.adminResponse === "string") {
      doc.adminResponse = req.body.adminResponse.trim().slice(0, 2000);
    }
    if (req.body?.scheduledAt) {
      const when = new Date(req.body.scheduledAt);
      if (!Number.isNaN(when.getTime())) doc.scheduledAt = when;
    }

    await doc.save();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error("Admin update meeting request error:", error);
    return res.status(500).json({ success: false, msg: "Failed to update request" });
  }
};
