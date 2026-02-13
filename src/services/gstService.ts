import axios from "axios";

const GST_API_KEY = process.env.GST_API_KEY;

export const fetchGSTDetails = async (gstin: string) => {

  try {

    const response = await axios.get(
      `https://api.setu.co/data-sources/gstn/v2/taxpayers/${gstin}`,
      {
        headers: {
          "x-client-id": GST_API_KEY
        }
      }
    );

    return response.data;

  } catch (error) {
    console.error("GST Fetch Error:", error);
    return null;
  }
};
