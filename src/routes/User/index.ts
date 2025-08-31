import { Router } from "express";
import { VerifyPhone } from "../../handlers/User/verify/phone";
import { VerifyPhoneCheck } from "../../handlers/User/verify/phone";
import emailVerificationRoutes from "./verify/email";
import { protect } from "../../middlewares/auth";
import { GetCurrentUser } from "../../handlers";
import { validateVAT, updateUserVAT } from "../../handlers/User/validateVat";
import { uploadIdProof, updateProfessionalProfile } from "../../handlers/User/profileManagement";
import { upload } from "../../utils/s3Upload";
import { getLoyaltyStatus, addSpending, getLeaderboard } from "../../handlers/User/loyaltyManagement";

const userRouter = Router();

userRouter.use(protect)

userRouter.route('/me').get(GetCurrentUser)
userRouter.route("/verify-phone").post(VerifyPhone)
userRouter.route("/verify-phone-check").post(VerifyPhoneCheck)
userRouter.use("/verify-email", emailVerificationRoutes);
userRouter.route("/vat/validate").post(validateVAT)
userRouter.route("/vat").put(updateUserVAT)
userRouter.route("/id-proof").post(upload.single('idProof'), uploadIdProof)
userRouter.route("/professional-profile").put(updateProfessionalProfile)
userRouter.route("/loyalty/status").get(getLoyaltyStatus)
userRouter.route("/loyalty/add-spending").post(addSpending)
userRouter.route("/loyalty/leaderboard").get(getLeaderboard)



export default userRouter;