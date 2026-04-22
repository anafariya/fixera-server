import { Schema, model, Document, Types } from "mongoose";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export interface ISupportTicketReply {
  authorId: Types.ObjectId;
  authorRole: "professional" | "admin";
  body: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  replies: ISupportTicketReply[];
  createdAt: Date;
  updatedAt: Date;
}

const replySchema = new Schema<ISupportTicketReply>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["professional", "admin"], required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: SUPPORT_TICKET_STATUSES, default: "open", index: true },
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

const SupportTicket = model<ISupportTicket>("SupportTicket", supportTicketSchema);
export default SupportTicket;
