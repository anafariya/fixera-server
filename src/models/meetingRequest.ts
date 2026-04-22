import { Schema, model, Document, Types } from "mongoose";

export type MeetingRequestStatus = "pending" | "scheduled" | "declined" | "cancelled";
export const MEETING_REQUEST_STATUSES: MeetingRequestStatus[] = [
  "pending",
  "scheduled",
  "declined",
  "cancelled",
];

export interface IMeetingRequest extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  topic: string;
  preferredTimes: string;
  durationMinutes: number;
  status: MeetingRequestStatus;
  adminResponse?: string;
  scheduledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const meetingRequestSchema = new Schema<IMeetingRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topic: { type: String, required: true, trim: true, maxlength: 200 },
    preferredTimes: { type: String, required: true, trim: true, maxlength: 1000 },
    durationMinutes: { type: Number, required: true, min: 15, max: 240, default: 30 },
    status: { type: String, enum: MEETING_REQUEST_STATUSES, default: "pending", index: true },
    adminResponse: { type: String, trim: true, maxlength: 2000 },
    scheduledAt: { type: Date },
  },
  { timestamps: true }
);

meetingRequestSchema.index({ userId: 1, createdAt: -1 });
meetingRequestSchema.index({ status: 1, createdAt: -1 });

const MeetingRequest = model<IMeetingRequest>("MeetingRequest", meetingRequestSchema);
export default MeetingRequest;
