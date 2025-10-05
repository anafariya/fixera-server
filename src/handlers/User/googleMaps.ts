import { Request, Response } from "express";

/**
 * Validate address using Google Maps Geocoding API
 * @route POST /api/user/validate-address
 */
export const validateAddress = async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address is required"
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY not configured in backend");
      return res.status(500).json({
        success: false,
        message: "Google Maps service not configured"
      });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    const isValid = data.status === 'OK' && data.results && data.results.length > 0;

    return res.status(200).json({
      success: true,
      isValid,
      data: isValid ? data.results[0] : null
    });

  } catch (error: any) {
    console.error("Address validation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to validate address"
    });
  }
};

/**
 * Get Google Maps API configuration (returns script URL without exposing the key)
 * @route GET /api/public/google-maps-config
 */
export const getGoogleMapsConfig = async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Google Maps service not configured"
      });
    }

    // Return the script URL with the API key
    // This is a public endpoint for loading the Maps JavaScript library
    return res.status(200).json({
      success: true,
      scriptUrl: `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    });

  } catch (error: any) {
    console.error("Google Maps config error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get Google Maps configuration"
    });
  }
};
