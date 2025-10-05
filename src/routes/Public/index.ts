import { Router } from "express";
import { getGoogleMapsConfig } from "../../handlers/User/googleMaps";

const publicRouter = Router();

// Google Maps configuration (public endpoint)
publicRouter.route("/google-maps-config").get(getGoogleMapsConfig);

export default publicRouter;
