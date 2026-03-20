"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGSTDetails = void 0;
const axios_1 = __importDefault(require("axios"));
const GST_API_KEY = process.env.GST_API_KEY;
const fetchGSTDetails = async (gstin) => {
    try {
        const response = await axios_1.default.get(`https://api.setu.co/data-sources/gstn/v2/taxpayers/${gstin}`, {
            headers: {
                "x-client-id": GST_API_KEY
            }
        });
        return response.data;
    }
    catch (error) {
        console.error("GST Fetch Error:", error);
        return null;
    }
};
exports.fetchGSTDetails = fetchGSTDetails;
